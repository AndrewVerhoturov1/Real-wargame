import type { WeaponDefinitionV1 } from '../catalogs/CombatCatalogTypes';

export const AUTOMATIC_FIRE_CADENCE_RUNTIME_SCHEMA_VERSION = 1 as const;
export const CONTINUOUS_FIRE_RESET_GAP_MULTIPLIER = 2.5;
export const CONTINUOUS_FIRE_SCORE_PER_SHOT = 0.15;
export const CONTINUOUS_FIRE_SCORE_DECAY_PER_SECOND = 0.75;

export interface AutomaticFireCadenceRuntimeV1 {
  readonly schemaVersion: typeof AUTOMATIC_FIRE_CADENCE_RUNTIME_SCHEMA_VERSION;
  nextShotAllowedSeconds: number;
  lastCommittedShotSeconds: number | null;
  continuousFireScore: number;
  continuousFireSequence: number;
}

export interface PreparedAutomaticFireCommitV1 {
  readonly shotIntervalSeconds: number;
  readonly next: AutomaticFireCadenceRuntimeV1;
}

export function createAutomaticFireCadenceRuntime(): AutomaticFireCadenceRuntimeV1 {
  return {
    schemaVersion: AUTOMATIC_FIRE_CADENCE_RUNTIME_SCHEMA_VERSION,
    nextShotAllowedSeconds: 0,
    lastCommittedShotSeconds: null,
    continuousFireScore: 0,
    continuousFireSequence: 0,
  };
}

export function normalizeAutomaticFireCadenceRuntime(value: unknown): AutomaticFireCadenceRuntimeV1 {
  if (!isRecord(value) || value.schemaVersion !== AUTOMATIC_FIRE_CADENCE_RUNTIME_SCHEMA_VERSION) {
    return createAutomaticFireCadenceRuntime();
  }
  const lastCommittedShotSeconds = nullableSeconds(value.lastCommittedShotSeconds);
  return {
    schemaVersion: AUTOMATIC_FIRE_CADENCE_RUNTIME_SCHEMA_VERSION,
    nextShotAllowedSeconds: canonicalSeconds(finiteNonNegative(value.nextShotAllowedSeconds, 0)),
    lastCommittedShotSeconds,
    continuousFireScore: clamp01(finite(value.continuousFireScore, 0)),
    continuousFireSequence: integer(value.continuousFireSequence, 0, 0, Number.MAX_SAFE_INTEGER),
  };
}

export function serializeAutomaticFireCadenceRuntime(
  value: AutomaticFireCadenceRuntimeV1,
): AutomaticFireCadenceRuntimeV1 {
  return normalizeAutomaticFireCadenceRuntime(structuredClone(value));
}

export function getWeaponShotIntervalSeconds(
  weapon: Pick<WeaponDefinitionV1, 'roundsPerMinute'>,
): number {
  const roundsPerMinute = finite(weapon.roundsPerMinute, 0);
  return roundsPerMinute > 0 ? 60 / roundsPerMinute : Number.POSITIVE_INFINITY;
}

export function advanceContinuousFireScore(
  runtime: AutomaticFireCadenceRuntimeV1,
  targetSeconds: number,
  shotIntervalSeconds: number,
): number {
  const target = canonicalSeconds(Math.max(0, finite(targetSeconds, 0)));
  const previous = runtime.lastCommittedShotSeconds;
  if (previous === null) return 0;
  const elapsed = Math.max(0, target - previous);
  const interval = finitePositive(shotIntervalSeconds, Number.POSITIVE_INFINITY);
  if (Number.isFinite(interval) && elapsed > interval * CONTINUOUS_FIRE_RESET_GAP_MULTIPLIER) return 0;
  return clamp01(runtime.continuousFireScore - elapsed * CONTINUOUS_FIRE_SCORE_DECAY_PER_SECOND);
}

export function prepareAutomaticFireCommit(
  runtime: AutomaticFireCadenceRuntimeV1,
  weapon: Pick<WeaponDefinitionV1, 'roundsPerMinute'>,
  committedSeconds: number,
): PreparedAutomaticFireCommitV1 | null {
  const shotIntervalSeconds = getWeaponShotIntervalSeconds(weapon);
  const committed = canonicalSeconds(Math.max(0, finite(committedSeconds, 0)));
  if (!Number.isFinite(shotIntervalSeconds) || shotIntervalSeconds <= 0) return null;
  const decayed = advanceContinuousFireScore(runtime, committed, shotIntervalSeconds);
  return {
    shotIntervalSeconds,
    next: {
      schemaVersion: AUTOMATIC_FIRE_CADENCE_RUNTIME_SCHEMA_VERSION,
      nextShotAllowedSeconds: canonicalSeconds(committed + shotIntervalSeconds),
      lastCommittedShotSeconds: committed,
      continuousFireScore: clamp01(decayed + CONTINUOUS_FIRE_SCORE_PER_SHOT),
      continuousFireSequence: Math.min(Number.MAX_SAFE_INTEGER, runtime.continuousFireSequence + 1),
    },
  };
}

export function automaticFireCadenceAllowsShot(
  runtime: AutomaticFireCadenceRuntimeV1,
  committedSeconds: number,
  epsilonSeconds = 1e-9,
): boolean {
  return finiteNonNegative(committedSeconds, 0) + Math.max(0, epsilonSeconds)
    >= finiteNonNegative(runtime.nextShotAllowedSeconds, 0);
}

function nullableSeconds(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value)
    ? canonicalSeconds(Math.max(0, value))
    : null;
}
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
function finiteNonNegative(value: unknown, fallback: number): number {
  return Math.max(0, finite(value, fallback));
}
function finitePositive(value: unknown, fallback: number): number {
  const numeric = finite(value, fallback);
  return numeric > 0 ? numeric : fallback;
}
function integer(value: unknown, fallback: number, minimum: number, maximum: number): number {
  const numeric = Math.round(finite(value, fallback));
  return Math.max(minimum, Math.min(maximum, numeric));
}
function clamp01(value: number): number { return Math.max(0, Math.min(1, value)); }
function canonicalSeconds(value: number): number {
  return Math.round(Math.max(0, value) * 1_000_000_000_000) / 1_000_000_000_000;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
