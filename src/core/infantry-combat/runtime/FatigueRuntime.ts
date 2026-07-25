import type { UnitPosture } from '../../behavior/BehaviorModel';
import type { WoundSlotV1 } from './InfantryBodyTypes';
import {
  FATIGUE_RUNTIME_SCHEMA_VERSION,
  type BloodState,
  type FatigueFactorSampleV1,
  type FatigueRuntimeV1,
} from './PhysiologyTypes';

export const FATIGUE_UPDATE_INTERVAL_SECONDS = 0.25;
export const FATIGUE_RECOVERY_PER_SECOND = 0.020;
export const FATIGUE_MOVEMENT_PER_SECOND = 0.018;
export const FATIGUE_HIGH_INTENSITY_BONUS_PER_SECOND = 0.012;
export const FATIGUE_AIMING_PER_SECOND = 0.008;
export const FATIGUE_FIRST_AID_PER_SECOND = 0.012;
export const FATIGUE_HEAVY_WEAPON_PER_SECOND = 0.008;
export const FATIGUE_DEPLOY_PER_SECOND = 0.012;
export const FATIGUE_CROUCHED_MOVEMENT_MULTIPLIER = 1.25;
export const FATIGUE_PRONE_MOVEMENT_MULTIPLIER = 1.50;
export const FATIGUE_HIGH_INTENSITY_THRESHOLD = 0.75;
export const FATIGUE_WOUND_GROWTH_FACTOR = 0.75;
export const FATIGUE_REFERENCE_RUN_SPEED_METRES_PER_SECOND = 4;
const EPSILON = 1e-9;

export interface FatigueActivityInput {
  readonly actualMovementSpeedMetresPerSecond: number;
  readonly referenceRunSpeedMetresPerSecond: number;
  readonly posture: UnitPosture;
  readonly isAiming: boolean;
  readonly isApplyingFirstAid: boolean;
  readonly isHeavyWeaponActive: boolean;
  readonly isDeployActionActive: boolean;
  readonly woundBurden: number;
  readonly bloodState: BloodState;
}

export function createFatigueRuntime(startedSeconds = 0, initialFatigue = 0): FatigueRuntimeV1 {
  const started = canonicalSeconds(startedSeconds);
  return {
    schemaVersion: FATIGUE_RUNTIME_SCHEMA_VERSION,
    fatigue: clamp01(initialFatigue),
    lastUpdateBoundarySeconds: null,
    nextUpdateBoundarySeconds: nextQuarterSecondAfter(started),
    updateCount: 0,
    sampledNetRatePerSecond: 0,
    lastAppliedDelta: 0,
    lastSample: neutralFatigueSample(),
    initialized: false,
  };
}

export function normalizeFatigueRuntime(value: unknown, fallbackSeconds = 0): FatigueRuntimeV1 {
  const fallback = createFatigueRuntime(fallbackSeconds);
  if (!isRecord(value) || value.schemaVersion !== FATIGUE_RUNTIME_SCHEMA_VERSION) return fallback;
  const lastBoundary = nullableSeconds(value.lastUpdateBoundarySeconds);
  const savedNext = canonicalSeconds(finiteNonNegative(value.nextUpdateBoundarySeconds, nextQuarterSecondAfter(fallbackSeconds)));
  const minimumNext = lastBoundary === null ? 0 : lastBoundary + FATIGUE_UPDATE_INTERVAL_SECONDS;
  return {
    schemaVersion: FATIGUE_RUNTIME_SCHEMA_VERSION,
    fatigue: clamp01(value.fatigue),
    lastUpdateBoundarySeconds: lastBoundary,
    nextUpdateBoundarySeconds: savedNext + EPSILON >= minimumNext
      ? savedNext
      : canonicalSeconds(minimumNext),
    updateCount: integer(value.updateCount, 0, 0, Number.MAX_SAFE_INTEGER),
    sampledNetRatePerSecond: canonicalRate(finite(value.sampledNetRatePerSecond, 0)),
    lastAppliedDelta: canonicalRate(finite(value.lastAppliedDelta, 0)),
    lastSample: normalizeFatigueSample(value.lastSample),
    initialized: value.initialized === true,
  };
}

export function serializeFatigueRuntime(value: FatigueRuntimeV1): FatigueRuntimeV1 {
  return normalizeFatigueRuntime(structuredClone(value), value.nextUpdateBoundarySeconds - FATIGUE_UPDATE_INTERVAL_SECONDS);
}

export function calculateFatigueFactorSample(input: FatigueActivityInput): FatigueFactorSampleV1 {
  const referenceSpeed = Math.max(EPSILON, finiteNonNegative(
    input.referenceRunSpeedMetresPerSecond,
    FATIGUE_REFERENCE_RUN_SPEED_METRES_PER_SECOND,
  ));
  const movementIntensity = clamp01(finiteNonNegative(input.actualMovementSpeedMetresPerSecond, 0) / referenceSpeed);
  const postureMultiplier = input.posture === 'prone'
    ? FATIGUE_PRONE_MOVEMENT_MULTIPLIER
    : input.posture === 'crouched'
      ? FATIGUE_CROUCHED_MOVEMENT_MULTIPLIER
      : 1;
  const woundBurden = clamp01(input.woundBurden);
  const woundGrowthMultiplier = canonicalFactor(1 + FATIGUE_WOUND_GROWTH_FACTOR * woundBurden);
  const bloodGrowthMultiplier = bloodFatigueGrowthMultiplier(input.bloodState);
  const movementRate = FATIGUE_MOVEMENT_PER_SECOND * movementIntensity * postureMultiplier;
  const highIntensityRate = movementIntensity >= FATIGUE_HIGH_INTENSITY_THRESHOLD
    ? FATIGUE_HIGH_INTENSITY_BONUS_PER_SECOND
    : 0;
  const aimingRate = input.isAiming ? FATIGUE_AIMING_PER_SECOND : 0;
  const firstAidRate = input.isApplyingFirstAid ? FATIGUE_FIRST_AID_PER_SECOND : 0;
  const heavyWeaponRate = input.isHeavyWeaponActive ? FATIGUE_HEAVY_WEAPON_PER_SECOND : 0;
  const deployRate = input.isDeployActionActive ? FATIGUE_DEPLOY_PER_SECOND : 0;
  const positiveRate = movementRate + highIntensityRate + aimingRate + firstAidRate + heavyWeaponRate + deployRate;
  const netRatePerSecond = bloodGrowthMultiplier === 0
    ? 0
    : positiveRate > 0
      ? positiveRate * woundGrowthMultiplier * bloodGrowthMultiplier
      : -FATIGUE_RECOVERY_PER_SECOND;
  return {
    movementIntensity: canonicalFactor(movementIntensity),
    postureMultiplier: canonicalFactor(postureMultiplier),
    aimingActive: input.isAiming,
    firstAidActive: input.isApplyingFirstAid,
    heavyWeaponActive: input.isHeavyWeaponActive,
    deployActive: input.isDeployActionActive,
    woundBurden,
    woundGrowthMultiplier,
    bloodGrowthMultiplier,
    netRatePerSecond: canonicalRate(netRatePerSecond),
  };
}

/** Applies exactly one sampled 0.25 second interval. */
export function applyFatigueBoundary(runtime: FatigueRuntimeV1, boundarySeconds: number): boolean {
  const boundary = canonicalSeconds(boundarySeconds);
  if (Math.abs(boundary - runtime.nextUpdateBoundarySeconds) > EPSILON) return false;
  const before = runtime.fatigue;
  runtime.fatigue = clamp01(canonicalRate(
    before + runtime.sampledNetRatePerSecond * FATIGUE_UPDATE_INTERVAL_SECONDS,
  ));
  runtime.lastAppliedDelta = canonicalRate(runtime.fatigue - before);
  runtime.lastUpdateBoundarySeconds = boundary;
  runtime.nextUpdateBoundarySeconds = canonicalSeconds(boundary + FATIGUE_UPDATE_INTERVAL_SECONDS);
  runtime.updateCount = Math.min(Number.MAX_SAFE_INTEGER, runtime.updateCount + 1);
  return true;
}

export function sampleFatigueRateForNextInterval(
  runtime: FatigueRuntimeV1,
  sample: FatigueFactorSampleV1,
): void {
  runtime.lastSample = normalizeFatigueSample(sample);
  runtime.sampledNetRatePerSecond = runtime.lastSample.netRatePerSecond;
  runtime.initialized = true;
}

export function calculateWoundBurden(slots: readonly WoundSlotV1[]): number {
  let burden = 0;
  for (const slot of slots) {
    burden += slot.severity === 'critical' ? 0.70 : slot.severity === 'severe' ? 0.35 : 0.10;
  }
  return clamp01(burden);
}

export function isFatigueRuntimeRelevant(runtime: FatigueRuntimeV1): boolean {
  return runtime.fatigue > 0 || Math.abs(runtime.sampledNetRatePerSecond) > EPSILON;
}

export function neutralFatigueSample(): FatigueFactorSampleV1 {
  return {
    movementIntensity: 0,
    postureMultiplier: 1,
    aimingActive: false,
    firstAidActive: false,
    heavyWeaponActive: false,
    deployActive: false,
    woundBurden: 0,
    woundGrowthMultiplier: 1,
    bloodGrowthMultiplier: 1,
    netRatePerSecond: 0,
  };
}

function bloodFatigueGrowthMultiplier(state: BloodState): number {
  if (state === 'dead' || state === 'unconscious') return 0;
  if (state === 'critical') return 1.35;
  if (state === 'weakened') return 1.15;
  return 1;
}

function normalizeFatigueSample(value: unknown): FatigueFactorSampleV1 {
  if (!isRecord(value)) return neutralFatigueSample();
  return {
    movementIntensity: clamp01(value.movementIntensity),
    postureMultiplier: canonicalFactor(Math.max(1, finite(value.postureMultiplier, 1))),
    aimingActive: value.aimingActive === true,
    firstAidActive: value.firstAidActive === true,
    heavyWeaponActive: value.heavyWeaponActive === true,
    deployActive: value.deployActive === true,
    woundBurden: clamp01(value.woundBurden),
    woundGrowthMultiplier: canonicalFactor(Math.max(1, finite(value.woundGrowthMultiplier, 1))),
    bloodGrowthMultiplier: canonicalFactor(Math.max(0, finite(value.bloodGrowthMultiplier, 1))),
    netRatePerSecond: canonicalRate(finite(value.netRatePerSecond, 0)),
  };
}
function nextQuarterSecondAfter(seconds: number): number {
  const steps = Math.floor(Math.max(0, seconds) / FATIGUE_UPDATE_INTERVAL_SECONDS + EPSILON) + 1;
  return canonicalSeconds(steps * FATIGUE_UPDATE_INTERVAL_SECONDS);
}
function clamp01(value: unknown): number { return Math.max(0, Math.min(1, finite(value, 0))); }
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
function finiteNonNegative(value: unknown, fallback: number): number { return Math.max(0, finite(value, fallback)); }
function nullableSeconds(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? canonicalSeconds(value) : null;
}
function integer(value: unknown, fallback: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, Math.round(finite(value, fallback))));
}
function canonicalRate(value: number): number { return Math.round(value * 1_000_000_000_000) / 1_000_000_000_000; }
function canonicalFactor(value: number): number { return Math.round(Math.max(0, value) * 1_000_000_000_000) / 1_000_000_000_000; }
function canonicalSeconds(value: number): number { return Math.round(Math.max(0, value) * 1_000_000_000_000) / 1_000_000_000_000; }
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
