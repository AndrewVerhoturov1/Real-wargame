import type { UnitModel } from '../../units/UnitModel';
import {
  BLOOD_RUNTIME_SCHEMA_VERSION,
  type BloodCombatCapabilitiesV1,
  type BloodRuntimeV1,
  type BloodState,
} from './PhysiologyTypes';
import { totalWoundBleedingRatePerSecond } from './WoundRuntime';

export const BLOOD_UPDATE_INTERVAL_SECONDS = 1;
export const MAX_TOTAL_BLEEDING_RATE_PER_SECOND = 0.08;
export const BLOOD_WEAKENED_THRESHOLD = 0.20;
export const BLOOD_CRITICAL_THRESHOLD = 0.50;
export const BLOOD_UNCONSCIOUS_THRESHOLD = 0.75;
export const BLOOD_DEAD_THRESHOLD = 1;
const EPSILON = 1e-9;

export function createBloodRuntime(
  startedSeconds = 0,
  initialBleedingRatePerSecond = 0,
): BloodRuntimeV1 {
  const started = canonicalSeconds(startedSeconds);
  return {
    schemaVersion: BLOOD_RUNTIME_SCHEMA_VERSION,
    bloodLoss: 0,
    pendingBloodLoss: 0,
    currentBleedingRatePerSecond: clampRate(initialBleedingRatePerSecond),
    lastExposureSeconds: started,
    lastUpdateBoundarySeconds: null,
    nextUpdateBoundarySeconds: nextWholeSecondAfter(started),
    updateCount: 0,
    state: 'stable',
    lastAppliedDelta: 0,
    lastStateChangeSeconds: null,
  };
}

export function normalizeBloodRuntime(value: unknown, fallbackSeconds = 0): BloodRuntimeV1 {
  const fallback = createBloodRuntime(fallbackSeconds);
  if (!isRecord(value) || value.schemaVersion !== BLOOD_RUNTIME_SCHEMA_VERSION) return fallback;
  const bloodLoss = clamp01(value.bloodLoss);
  const lastExposureSeconds = canonicalSeconds(finiteNonNegative(value.lastExposureSeconds, fallbackSeconds));
  const savedNext = canonicalSeconds(finiteNonNegative(value.nextUpdateBoundarySeconds, nextWholeSecondAfter(lastExposureSeconds)));
  const nextUpdateBoundarySeconds = savedNext > lastExposureSeconds + EPSILON
    ? savedNext
    : nextWholeSecondAfter(lastExposureSeconds);
  return {
    schemaVersion: BLOOD_RUNTIME_SCHEMA_VERSION,
    bloodLoss,
    pendingBloodLoss: canonicalLoss(Math.max(0, finite(value.pendingBloodLoss, 0))),
    currentBleedingRatePerSecond: clampRate(value.currentBleedingRatePerSecond),
    lastExposureSeconds,
    lastUpdateBoundarySeconds: nullableSeconds(value.lastUpdateBoundarySeconds),
    nextUpdateBoundarySeconds,
    updateCount: integer(value.updateCount, 0, 0, Number.MAX_SAFE_INTEGER),
    state: deriveBloodState(bloodLoss),
    lastAppliedDelta: canonicalLoss(Math.max(0, finite(value.lastAppliedDelta, 0))),
    lastStateChangeSeconds: nullableSeconds(value.lastStateChangeSeconds),
  };
}

export function serializeBloodRuntime(value: BloodRuntimeV1): BloodRuntimeV1 {
  return normalizeBloodRuntime(structuredClone(value), value.lastExposureSeconds);
}

/** Advances exact exposure while committing blood loss only at global 1 Hz boundaries. */
export function advanceBloodRuntimeTo(runtime: BloodRuntimeV1, targetSeconds: number): void {
  const target = canonicalSeconds(targetSeconds);
  if (target <= runtime.lastExposureSeconds + EPSILON) return;
  let guard = 0;
  while (runtime.nextUpdateBoundarySeconds <= target + EPSILON) {
    accumulateExposure(runtime, runtime.nextUpdateBoundarySeconds);
    commitBloodBoundary(runtime, runtime.nextUpdateBoundarySeconds);
    runtime.nextUpdateBoundarySeconds = canonicalSeconds(
      runtime.nextUpdateBoundarySeconds + BLOOD_UPDATE_INTERVAL_SECONDS,
    );
    guard += 1;
    if (guard > 1_000_000) throw new Error('Blood boundary guard exceeded.');
  }
  accumulateExposure(runtime, target);
}

/** Advances the old rate to the exact event timestamp before replacing it. */
export function changeBloodRuntimeRateAt(
  runtime: BloodRuntimeV1,
  simulationSeconds: number,
  newRatePerSecond: number,
): void {
  advanceBloodRuntimeTo(runtime, simulationSeconds);
  runtime.currentBleedingRatePerSecond = clampRate(newRatePerSecond);
}

export function changeUnitBleedingRateAt(
  unit: UnitModel,
  simulationSeconds: number,
  newRatePerSecond: number,
): void {
  changeBloodRuntimeRateAt(
    unit.infantryCombatRuntime.physiology.blood,
    simulationSeconds,
    newRatePerSecond,
  );
}

export function refreshUnitBleedingRateAt(unit: UnitModel, simulationSeconds: number): number {
  const rate = Math.min(
    MAX_TOTAL_BLEEDING_RATE_PER_SECOND,
    totalWoundBleedingRatePerSecond(unit.infantryCombatRuntime.wounds),
  );
  changeUnitBleedingRateAt(unit, simulationSeconds, rate);
  return rate;
}

export function deriveBloodState(bloodLoss: number): BloodState {
  const loss = clamp01(bloodLoss);
  if (loss >= BLOOD_DEAD_THRESHOLD) return 'dead';
  if (loss >= BLOOD_UNCONSCIOUS_THRESHOLD) return 'unconscious';
  if (loss >= BLOOD_CRITICAL_THRESHOLD) return 'critical';
  if (loss >= BLOOD_WEAKENED_THRESHOLD) return 'weakened';
  return 'stable';
}

export function deriveBloodCombatCapabilities(state: BloodState): BloodCombatCapabilitiesV1 {
  if (state === 'dead') return disabledCapabilities(false);
  if (state === 'unconscious') return disabledCapabilities(true);
  if (state === 'critical') return capableWithMultipliers(0.60, 0.50, 0.55);
  if (state === 'weakened') return capableWithMultipliers(0.90, 0.85, 0.85);
  return capableWithMultipliers(1, 1, 1);
}

export function isBloodRuntimeRelevant(runtime: BloodRuntimeV1): boolean {
  return runtime.currentBleedingRatePerSecond > 0
    || runtime.pendingBloodLoss > 0
    || runtime.bloodLoss > 0
    || runtime.state !== 'stable';
}

function accumulateExposure(runtime: BloodRuntimeV1, targetSeconds: number): void {
  const target = canonicalSeconds(targetSeconds);
  const elapsed = Math.max(0, target - runtime.lastExposureSeconds);
  if (elapsed > 0 && runtime.currentBleedingRatePerSecond > 0 && runtime.bloodLoss < 1) {
    runtime.pendingBloodLoss = canonicalLoss(
      runtime.pendingBloodLoss + runtime.currentBleedingRatePerSecond * elapsed,
    );
  }
  runtime.lastExposureSeconds = target;
}

function commitBloodBoundary(runtime: BloodRuntimeV1, boundarySeconds: number): void {
  const previousState = runtime.state;
  const previousLoss = runtime.bloodLoss;
  runtime.bloodLoss = clamp01(canonicalLoss(previousLoss + runtime.pendingBloodLoss));
  runtime.lastAppliedDelta = canonicalLoss(runtime.bloodLoss - previousLoss);
  runtime.pendingBloodLoss = 0;
  runtime.lastUpdateBoundarySeconds = canonicalSeconds(boundarySeconds);
  runtime.updateCount = Math.min(Number.MAX_SAFE_INTEGER, runtime.updateCount + 1);
  runtime.state = deriveBloodState(runtime.bloodLoss);
  if (runtime.state !== previousState) runtime.lastStateChangeSeconds = canonicalSeconds(boundarySeconds);
}

function capableWithMultipliers(
  movementSpeedMultiplier: number,
  stabilityMultiplier: number,
  accuracyMultiplier: number,
): BloodCombatCapabilitiesV1 {
  return {
    alive: true,
    conscious: true,
    canStand: true,
    canMove: true,
    canUseHands: true,
    canUseWeapon: true,
    movementSpeedMultiplier,
    stabilityMultiplier,
    accuracyMultiplier,
  };
}

function disabledCapabilities(alive: boolean): BloodCombatCapabilitiesV1 {
  return {
    alive,
    conscious: false,
    canStand: false,
    canMove: false,
    canUseHands: false,
    canUseWeapon: false,
    movementSpeedMultiplier: 0,
    stabilityMultiplier: 0,
    accuracyMultiplier: 0,
  };
}

function nextWholeSecondAfter(seconds: number): number {
  return canonicalSeconds(Math.floor(Math.max(0, seconds) + EPSILON) + BLOOD_UPDATE_INTERVAL_SECONDS);
}
function clampRate(value: unknown): number {
  return canonicalLoss(Math.min(MAX_TOTAL_BLEEDING_RATE_PER_SECOND, Math.max(0, finite(value, 0))));
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
function canonicalLoss(value: number): number { return Math.round(Math.max(0, value) * 1_000_000_000_000) / 1_000_000_000_000; }
function canonicalSeconds(value: number): number { return Math.round(Math.max(0, value) * 1_000_000_000_000) / 1_000_000_000_000; }
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
