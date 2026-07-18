import { POSTURE_EXPOSURE_MULTIPLIER } from '../behavior/BehaviorModel';
import { evaluateSmallArmsCover, evaluateSmallArmsExpectedProtection } from '../cover/SmallArmsCoverEvaluation';
import { distance, type GridPosition } from '../geometry';
import type { TacticalMap } from '../map/MapModel';
import { getBestPerceptionContact } from '../perception/PerceptionSystem';
import type { KnownThreatMemory, UnitModel } from '../units/UnitModel';
import {
  isPositionInsidePressureZone,
  normalizeDegrees,
  resolvePressureZoneSettings,
  type DirectionalThreatSettings,
  type PressureZone,
} from './PressureZone';

export interface ThreatContribution {
  zone: PressureZone;
  danger: number;
  suppression: number;
  stressPerSecond: number;
  distanceCells: number;
  directionFromUnitDegrees: number;
  coverProtection: number;
  expectedProtection: number;
}

export interface KnownThreatContribution {
  threat: KnownThreatMemory;
  danger: number;
  suppression: number;
  stressPerSecond: number;
  distanceCells: number;
  directionFromUnitDegrees: number;
  coverProtection: number;
  expectedProtection: number;
}


export interface ThreatRuntimeEvaluation {
  danger: number;
  suppression: number;
  stressPerSecond: number;
  strongestScenarioId: string | null;
  strongestKnownId: string | null;
}

interface ThreatScalarScratch {
  danger: number;
  suppression: number;
  stressPerSecond: number;
  distanceCells: number;
  directionFromUnitDegrees: number;
  coverProtection: number;
}

const runtimeThreatScalarScratch: ThreatScalarScratch = {
  danger: 0,
  suppression: 0,
  stressPerSecond: 0,
  distanceCells: 0,
  directionFromUnitDegrees: 0,
  coverProtection: 0,
};

export function createThreatRuntimeEvaluation(): ThreatRuntimeEvaluation {
  return {
    danger: 0,
    suppression: 0,
    stressPerSecond: 0,
    strongestScenarioId: null,
    strongestKnownId: null,
  };
}

/**
 * Allocation-bounded threat summary for the per-step simulation hot path.
 * Detailed contribution arrays remain available through evaluateThreatsAtPosition
 * for UI and diagnostics, but gameplay metrics only need scalar aggregates and
 * the strongest source identity.
 */
export function evaluateThreatRuntimeAtPosition(
  map: TacticalMap,
  unit: UnitModel,
  zones: readonly PressureZone[],
  output: ThreatRuntimeEvaluation,
): ThreatRuntimeEvaluation {
  let totalDanger = 0;
  let totalSuppression = 0;
  let stressPerSecond = 0;
  let strongestScenarioId: string | null = null;
  let strongestScenarioDanger = -1;
  let strongestScenarioSuppression = -1;
  let strongestKnownId: string | null = null;
  let strongestKnownDanger = -1;
  let strongestKnownSuppression = -1;
  const scratch = runtimeThreatScalarScratch;

  for (const zone of zones) {
    if (!evaluateZoneScalars(map, unit, zone, scratch)) continue;
    totalDanger += scratch.danger;
    totalSuppression += scratch.suppression;
    stressPerSecond += scratch.stressPerSecond;
    if (
      scratch.danger > strongestScenarioDanger
      || (scratch.danger === strongestScenarioDanger && scratch.suppression > strongestScenarioSuppression)
    ) {
      strongestScenarioId = zone.id;
      strongestScenarioDanger = scratch.danger;
      strongestScenarioSuppression = scratch.suppression;
    }
  }

  for (const threat of unit.tacticalKnowledge.threats) {
    if (zones.some((zone) => zone.id === threat.id)) continue;
    if (!evaluateKnownThreatScalars(map, unit, threat, scratch)) continue;
    totalDanger += scratch.danger;
    totalSuppression += scratch.suppression;
    stressPerSecond += scratch.stressPerSecond;
    if (
      scratch.danger > strongestKnownDanger
      || (scratch.danger === strongestKnownDanger && scratch.suppression > strongestKnownSuppression)
    ) {
      strongestKnownId = threat.id;
      strongestKnownDanger = scratch.danger;
      strongestKnownSuppression = scratch.suppression;
    }
  }

  output.danger = clampPercent(totalDanger);
  output.suppression = clampPercent(totalSuppression);
  output.stressPerSecond = stressPerSecond;
  output.strongestScenarioId = strongestScenarioId;
  output.strongestKnownId = strongestKnownId;
  return output;
}

export interface ThreatEvaluationReport {
  danger: number;
  suppression: number;
  stressPerSecond: number;
  strongest: ThreatContribution | null;
  strongestKnown: KnownThreatContribution | null;
  contributions: ThreatContribution[];
  knownContributions: KnownThreatContribution[];
  enemyVisible: boolean;
  enemyKnown: boolean;
  targetPosition: GridPosition | null;
}

export function evaluateThreatsAtPosition(
  map: TacticalMap,
  unit: UnitModel,
  zones: PressureZone[],
): ThreatEvaluationReport {
  const contributions: ThreatContribution[] = [];
  const knownContributions: KnownThreatContribution[] = [];
  const scenarioIds = zones.length > 0 ? new Set<string>() : null;
  let strongest: ThreatContribution | null = null;
  let strongestKnown: KnownThreatContribution | null = null;
  let totalDanger = 0;
  let totalSuppression = 0;
  let stressPerSecond = 0;

  for (const zone of zones) {
    scenarioIds?.add(zone.id);
    const contribution = evaluateZone(map, unit, zone);
    if (!contribution) continue;
    contributions.push(contribution);
    totalDanger += contribution.danger;
    totalSuppression += contribution.suppression;
    stressPerSecond += contribution.stressPerSecond;
    if (isStrongerContribution(contribution, strongest)) strongest = contribution;
  }

  for (const threat of unit.tacticalKnowledge.threats) {
    if (scenarioIds?.has(threat.id)) continue;
    const contribution = evaluateKnownThreat(map, unit, threat);
    if (!contribution) continue;
    knownContributions.push(contribution);
    totalDanger += contribution.danger;
    totalSuppression += contribution.suppression;
    stressPerSecond += contribution.stressPerSecond;
    if (isStrongerContribution(contribution, strongestKnown)) strongestKnown = contribution;
  }

  const bestContact = getBestPerceptionContact(unit);
  const rememberedThreat = unit.tacticalKnowledge.threats[0];
  const targetPosition = bestContact
    ? { ...bestContact.lastKnownPosition }
    : rememberedThreat
      ? { x: rememberedThreat.x, y: rememberedThreat.y }
      : null;

  return {
    danger: clampPercent(totalDanger),
    suppression: clampPercent(totalSuppression),
    stressPerSecond,
    strongest,
    strongestKnown,
    contributions,
    knownContributions,
    enemyVisible: Boolean(bestContact?.visibleNow),
    enemyKnown: Boolean(bestContact || rememberedThreat),
    targetPosition,
  };
}

function isStrongerContribution<T extends { danger: number; suppression: number }>(
  candidate: T,
  current: T | null,
): boolean {
  return current === null
    || candidate.danger > current.danger
    || (candidate.danger === current.danger && candidate.suppression > current.suppression);
}

export function isInsideDirectionalThreat(position: GridPosition, zone: PressureZone): boolean {
  const settings = resolvePressureZoneSettings(zone);
  if (settings.mode !== 'directional_fire') return false;

  const dx = position.x - zone.x;
  const dy = position.y - zone.y;
  const distanceCells = Math.hypot(dx, dy);
  if (distanceCells < settings.minRangeCells || distanceCells > settings.rangeCells) return false;

  const bearing = normalizeDegrees((Math.atan2(dy, dx) * 180) / Math.PI);
  const difference = angularDifferenceDegrees(bearing, settings.directionDegrees);
  return difference <= settings.arcDegrees / 2;
}

function evaluateZone(map: TacticalMap, unit: UnitModel, zone: PressureZone): ThreatContribution | null {
  const scratch: ThreatScalarScratch = {
    danger: 0,
    suppression: 0,
    stressPerSecond: 0,
    distanceCells: 0,
    directionFromUnitDegrees: 0,
    coverProtection: 0,
  };
  if (!evaluateZoneScalars(map, unit, zone, scratch)) return null;
  return {
    zone,
    danger: scratch.danger,
    suppression: scratch.suppression,
    stressPerSecond: scratch.stressPerSecond,
    distanceCells: scratch.distanceCells,
    directionFromUnitDegrees: scratch.directionFromUnitDegrees,
    coverProtection: scratch.coverProtection,
    expectedProtection: scratch.coverProtection,
  };
}

function evaluateZoneScalars(
  map: TacticalMap,
  unit: UnitModel,
  zone: PressureZone,
  output: ThreatScalarScratch,
): boolean {
  const settings = resolvePressureZoneSettings(zone);
  if (!settings.enabled) return false;

  const distanceCells = distance(zone, unit.position);
  const active = settings.mode === 'directional_fire'
    ? isInsideDirectionalThreat(unit.position, zone)
    : isPositionInsidePressureZone(unit.position, zone);
  if (!active) return false;

  const rangeFactor = settings.mode === 'directional_fire'
    ? directionalRangeFactor(distanceCells, settings)
    : 1;
  const exposure = POSTURE_EXPOSURE_MULTIPLIER[unit.behaviorRuntime.posture];
  const expectedProtection = evaluateSmallArmsExpectedProtection(
    map,
    zone,
    unit.position,
    unit.behaviorRuntime.posture,
  );
  const coverMultiplier = 1 - expectedProtection / 100;
  output.danger = clampPercent(zone.strength * rangeFactor * exposure * coverMultiplier);
  output.suppression = clampPercent(settings.suppression * rangeFactor * Math.max(0.35, exposure) * coverMultiplier);
  output.stressPerSecond = Math.max(0, zone.stressPerSecond * rangeFactor * coverMultiplier);
  output.distanceCells = distanceCells;
  output.directionFromUnitDegrees = normalizeDegrees((Math.atan2(zone.y - unit.position.y, zone.x - unit.position.x) * 180) / Math.PI);
  output.coverProtection = expectedProtection;
  return true;
}

function evaluateKnownThreat(
  map: TacticalMap,
  unit: UnitModel,
  threat: KnownThreatMemory,
): KnownThreatContribution | null {
  const scratch: ThreatScalarScratch = {
    danger: 0,
    suppression: 0,
    stressPerSecond: 0,
    distanceCells: 0,
    directionFromUnitDegrees: 0,
    coverProtection: 0,
  };
  if (!evaluateKnownThreatScalars(map, unit, threat, scratch)) return null;
  return {
    threat,
    danger: scratch.danger,
    suppression: scratch.suppression,
    stressPerSecond: scratch.stressPerSecond,
    distanceCells: scratch.distanceCells,
    directionFromUnitDegrees: scratch.directionFromUnitDegrees,
    coverProtection: scratch.coverProtection,
    expectedProtection: scratch.coverProtection,
  };
}

function evaluateKnownThreatScalars(
  map: TacticalMap,
  unit: UnitModel,
  threat: KnownThreatMemory,
  output: ThreatScalarScratch,
): boolean {
  if (threat.confidence <= 0 || Math.max(threat.strength, threat.suppression) <= 0) return false;
  const dx = unit.position.x - threat.x;
  const dy = unit.position.y - threat.y;
  const distanceCells = Math.hypot(dx, dy);
  const factor = knownThreatFactor(threat, dx, dy, distanceCells);
  if (factor <= 0) return false;

  const confidenceFactor = threat.confidence / 100;
  const exposure = POSTURE_EXPOSURE_MULTIPLIER[unit.behaviorRuntime.posture];
  const expectedProtection = evaluateSmallArmsExpectedProtection(
    map,
    threat,
    unit.position,
    unit.behaviorRuntime.posture,
  );
  const coverMultiplier = 1 - expectedProtection / 100;
  output.danger = clampPercent(threat.strength * factor * confidenceFactor * exposure * coverMultiplier);
  output.suppression = clampPercent(threat.suppression * factor * confidenceFactor * Math.max(0.35, exposure) * coverMultiplier);
  output.stressPerSecond = Math.max(0, threat.stressPerSecond * factor * confidenceFactor * coverMultiplier);
  output.distanceCells = distanceCells;
  output.directionFromUnitDegrees = normalizeDegrees(Math.atan2(threat.y - unit.position.y, threat.x - unit.position.x) * 180 / Math.PI);
  output.coverProtection = expectedProtection;
  return true;
}

function knownThreatFactor(threat: KnownThreatMemory, dx: number, dy: number, distanceCells: number): number {
  const uncertainty = Math.max(0, threat.uncertaintyCells);
  if (threat.mode === 'directional_fire') {
    if (distanceCells < Math.max(0, threat.minRangeCells - uncertainty)) return 0;
    if (distanceCells > threat.rangeCells + uncertainty) return 0;
    const bearing = normalizeDegrees(Math.atan2(dy, dx) * 180 / Math.PI);
    const arc = Math.min(360, threat.arcDegrees + uncertainty * 2);
    if (angularDifferenceDegrees(bearing, threat.directionDegrees) > arc / 2) return 0;
    const progress = Math.max(0, Math.min(1, (distanceCells - threat.minRangeCells) / Math.max(0.001, threat.rangeCells - threat.minRangeCells)));
    return Math.max(0.08, 1 - progress * threat.falloffPercent / 100);
  }

  if (threat.radiusCells > 0) {
    const radius = threat.radiusCells + uncertainty;
    return distanceCells <= radius ? Math.max(0.15, 1 - distanceCells / Math.max(1, radius)) : 0;
  }

  const rotation = -threat.rotationDegrees * Math.PI / 180;
  const localX = dx * Math.cos(rotation) - dy * Math.sin(rotation);
  const localY = dx * Math.sin(rotation) + dy * Math.cos(rotation);
  return Math.abs(localX) <= threat.widthCells / 2 + uncertainty
    && Math.abs(localY) <= threat.heightCells / 2 + uncertainty
    ? 1
    : 0;
}

function directionalRangeFactor(distanceCells: number, settings: DirectionalThreatSettings): number {
  const usableRange = Math.max(0.001, settings.rangeCells - settings.minRangeCells);
  const progress = Math.max(0, Math.min(1, (distanceCells - settings.minRangeCells) / usableRange));
  return Math.max(0, 1 - progress * (settings.falloffPercent / 100));
}

function angularDifferenceDegrees(left: number, right: number): number {
  const difference = Math.abs(normalizeDegrees(left) - normalizeDegrees(right));
  return Math.min(difference, 360 - difference);
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}
