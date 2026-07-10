import { POSTURE_EXPOSURE_MULTIPLIER } from '../behavior/BehaviorModel';
import { evaluateCoverBetween } from '../cover/CoverEvaluation';
import { distance, type GridPosition } from '../geometry';
import type { TacticalMap } from '../map/MapModel';
import type { UnitModel } from '../units/UnitModel';
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
}

export interface ThreatEvaluationReport {
  danger: number;
  suppression: number;
  stressPerSecond: number;
  strongest: ThreatContribution | null;
  contributions: ThreatContribution[];
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

  const strongest = [...contributions].sort((a, b) => b.danger - a.danger || b.suppression - a.suppression)[0] ?? null;
  const danger = clampPercent(contributions.reduce((sum, item) => sum + item.danger, 0));
  const suppression = clampPercent(contributions.reduce((sum, item) => sum + item.suppression, 0));
  const stressPerSecond = contributions.reduce((sum, item) => sum + item.stressPerSecond, 0);

  return {
    danger,
    suppression,
    stressPerSecond,
    strongest,
    contributions,
    enemyVisible: contributions.some((item) => resolvePressureZoneSettings(item.zone).sourceVisible),
    enemyKnown: contributions.some((item) => {
      const settings = resolvePressureZoneSettings(item.zone);
      return settings.sourceKnown || settings.sourceVisible;
    }),
    targetPosition: strongest ? { x: strongest.zone.x, y: strongest.zone.y } : null,
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
  const cover = evaluateCoverBetween(map, source, unit.position, unit.behaviorRuntime.posture);
  const coverMultiplier = 1 - cover.protection / 100;
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
    coverProtection: cover.protection,
  };
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
