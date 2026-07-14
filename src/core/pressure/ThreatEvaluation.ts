import { POSTURE_EXPOSURE_MULTIPLIER } from '../behavior/BehaviorModel';
import { evaluateSmallArmsCover } from '../cover/SmallArmsCoverEvaluation';
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
  const contributions = zones
    .map((zone) => evaluateZone(map, unit, zone))
    .filter((item): item is ThreatContribution => item !== null);
  const scenarioIds = new Set(zones.map((zone) => zone.id));
  const knownContributions = unit.tacticalKnowledge.threats
    .filter((threat) => !scenarioIds.has(threat.id))
    .map((threat) => evaluateKnownThreat(map, unit, threat))
    .filter((item): item is KnownThreatContribution => item !== null);

  const strongest = [...contributions].sort((a, b) => b.danger - a.danger || b.suppression - a.suppression)[0] ?? null;
  const strongestKnown = [...knownContributions].sort((a, b) => b.danger - a.danger || b.suppression - a.suppression)[0] ?? null;
  const danger = clampPercent(
    contributions.reduce((sum, item) => sum + item.danger, 0)
      + knownContributions.reduce((sum, item) => sum + item.danger, 0),
  );
  const suppression = clampPercent(
    contributions.reduce((sum, item) => sum + item.suppression, 0)
      + knownContributions.reduce((sum, item) => sum + item.suppression, 0),
  );
  const stressPerSecond = contributions.reduce((sum, item) => sum + item.stressPerSecond, 0)
    + knownContributions.reduce((sum, item) => sum + item.stressPerSecond, 0);
  const bestContact = getBestPerceptionContact(unit);
  const rememberedThreat = unit.tacticalKnowledge.threats[0];
  const targetPosition = bestContact
    ? { ...bestContact.lastKnownPosition }
    : rememberedThreat
      ? { x: rememberedThreat.x, y: rememberedThreat.y }
      : null;

  return {
    danger,
    suppression,
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
  const settings = resolvePressureZoneSettings(zone);
  if (!settings.enabled) return null;

  const source = { x: zone.x, y: zone.y };
  const distanceCells = distance(source, unit.position);
  const active = settings.mode === 'directional_fire'
    ? isInsideDirectionalThreat(unit.position, zone)
    : isPositionInsidePressureZone(unit.position, zone);

  if (!active) return null;

  const rangeFactor = settings.mode === 'directional_fire'
    ? directionalRangeFactor(distanceCells, settings)
    : 1;
  const exposure = POSTURE_EXPOSURE_MULTIPLIER[unit.behaviorRuntime.posture];
  const cover = evaluateSmallArmsCover(map, source, unit.position, unit.behaviorRuntime.posture);
  const coverMultiplier = 1 - cover.expectedProtection / 100;
  const danger = clampPercent(zone.strength * rangeFactor * exposure * coverMultiplier);
  const suppression = clampPercent(settings.suppression * rangeFactor * Math.max(0.35, exposure) * coverMultiplier);
  const stressPerSecond = Math.max(0, zone.stressPerSecond * rangeFactor * coverMultiplier);
  const directionFromUnitDegrees = normalizeDegrees((Math.atan2(zone.y - unit.position.y, zone.x - unit.position.x) * 180) / Math.PI);

  return {
    zone,
    danger,
    suppression,
    stressPerSecond,
    distanceCells,
    directionFromUnitDegrees,
    coverProtection: cover.expectedProtection,
    expectedProtection: cover.expectedProtection,
  };
}

function evaluateKnownThreat(
  map: TacticalMap,
  unit: UnitModel,
  threat: KnownThreatMemory,
): KnownThreatContribution | null {
  if (threat.confidence <= 0 || Math.max(threat.strength, threat.suppression) <= 0) return null;
  const source = { x: threat.x, y: threat.y };
  const dx = unit.position.x - source.x;
  const dy = unit.position.y - source.y;
  const distanceCells = Math.hypot(dx, dy);
  const factor = knownThreatFactor(threat, dx, dy, distanceCells);
  if (factor <= 0) return null;

  const confidenceFactor = threat.confidence / 100;
  const exposure = POSTURE_EXPOSURE_MULTIPLIER[unit.behaviorRuntime.posture];
  const cover = evaluateSmallArmsCover(map, source, unit.position, unit.behaviorRuntime.posture);
  const coverMultiplier = 1 - cover.expectedProtection / 100;
  const danger = clampPercent(threat.strength * factor * confidenceFactor * exposure * coverMultiplier);
  const suppression = clampPercent(threat.suppression * factor * confidenceFactor * Math.max(0.35, exposure) * coverMultiplier);
  const stressPerSecond = Math.max(0, threat.stressPerSecond * factor * confidenceFactor * coverMultiplier);
  return {
    threat,
    danger,
    suppression,
    stressPerSecond,
    distanceCells,
    directionFromUnitDegrees: normalizeDegrees(Math.atan2(threat.y - unit.position.y, threat.x - unit.position.x) * 180 / Math.PI),
    coverProtection: cover.expectedProtection,
    expectedProtection: cover.expectedProtection,
  };
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
