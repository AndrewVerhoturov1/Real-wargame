import type { HitZone } from '../../combat/UnitHitShapes';
import { woundSeverityAt, type BodyImpactPhysicsV1, type WoundSeverity } from './InfantryBodyTypes';

export const WOUND_REFERENCE_ENERGY_JOULES = 3000;
export const WOUND_SEVERITY_DOWN_ROLL_THRESHOLD = 0.10;
export const WOUND_SEVERITY_UP_ROLL_THRESHOLD = 0.90;

export const WOUND_ZONE_TRAUMA_MULTIPLIER: Readonly<Record<HitZone, number>> = Object.freeze({
  head: 1.60,
  torso: 1.25,
  arms: 0.70,
  legs: 0.80,
});

export interface CalculateWoundSeverityInput {
  readonly impactId: string;
  readonly hitUnitId: string;
  readonly hitZone: HitZone;
  readonly impactEnergyJoules: number;
  readonly woundEffectMultiplier: number;
  readonly incidenceCosine: number;
}

export interface WoundSeverityCalculation {
  readonly traumaScore: number;
  readonly baseSeverity: WoundSeverity;
  readonly baseSeverityIndex: number;
  readonly severity: WoundSeverity;
  readonly severityIndex: number;
  readonly seededRoll: number;
  readonly seededShift: -1 | 0 | 1;
}

export function calculateWoundSeverity(input: CalculateWoundSeverityInput): WoundSeverityCalculation;
export function calculateWoundSeverity(
  physics: BodyImpactPhysicsV1,
  impactId: string,
  hitUnitId: string,
): WoundSeverityCalculation;
export function calculateWoundSeverity(
  inputOrPhysics: CalculateWoundSeverityInput | BodyImpactPhysicsV1,
  impactId?: string,
  hitUnitId?: string,
): WoundSeverityCalculation {
  const input: CalculateWoundSeverityInput = impactId === undefined
    ? inputOrPhysics as CalculateWoundSeverityInput
    : {
        impactId,
        hitUnitId: hitUnitId ?? inputOrPhysics.hitUnitId,
        hitZone: inputOrPhysics.hitZone,
        impactEnergyJoules: inputOrPhysics.impactEnergyJoules,
        woundEffectMultiplier: inputOrPhysics.woundEffectMultiplier,
        incidenceCosine: inputOrPhysics.incidenceCosine,
      };
  const impactEnergyJoules = Math.max(0, finite(input.impactEnergyJoules));
  const energyFactor = clamp(impactEnergyJoules / WOUND_REFERENCE_ENERGY_JOULES, 0, 2);
  const angleTraumaFactor = lerp(0.75, 1.10, clamp01(input.incidenceCosine));
  const traumaScore = energyFactor
    * Math.max(0, finite(input.woundEffectMultiplier))
    * WOUND_ZONE_TRAUMA_MULTIPLIER[input.hitZone]
    * angleTraumaFactor;
  const baseSeverityIndex = traumaScore < 0.45 ? 0 : traumaScore < 0.90 ? 1 : 2;
  const seededRoll = stableUnitFloat(
    `${input.impactId}${input.hitUnitId}${input.hitZone}wound-severity`,
  );
  let seededShift: -1 | 0 | 1 = 0;
  if (seededRoll < WOUND_SEVERITY_DOWN_ROLL_THRESHOLD && baseSeverityIndex > 0) seededShift = -1;
  else if (seededRoll > WOUND_SEVERITY_UP_ROLL_THRESHOLD && baseSeverityIndex < 2) seededShift = 1;
  const severityIndex = clampInteger(baseSeverityIndex + seededShift, 0, 2);
  return {
    traumaScore: canonical(traumaScore),
    baseSeverity: woundSeverityAt(baseSeverityIndex),
    baseSeverityIndex,
    severity: woundSeverityAt(severityIndex),
    severityIndex,
    seededRoll: canonical(seededRoll),
    seededShift,
  };
}

export function stableUnitFloat(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) / 0x1_0000_0000;
}

function finite(value: number): number { return Number.isFinite(value) ? value : 0; }
function clamp01(value: number): number { return clamp(value, 0, 1); }
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, finite(value)));
}
function clampInteger(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}
function lerp(from: number, to: number, progress: number): number { return from + (to - from) * progress; }
function canonical(value: number): number {
  return Math.round(value * 1_000_000_000_000) / 1_000_000_000_000;
}
