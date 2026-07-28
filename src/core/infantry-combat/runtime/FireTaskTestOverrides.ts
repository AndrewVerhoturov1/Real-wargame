import type { WeaponProficiency } from '../catalogs/CombatCatalogTypes';
import type { AimFactorBreakdownV1, FireTaskRuntimeV1 } from './InfantryCombatRuntimeTypes';

export const FIRE_TASK_TEST_OVERRIDES_SCHEMA_VERSION = 1 as const;

/**
 * Session-local laboratory controls. They are deliberately not serialized and
 * can be attached only by test infrastructure such as Combat Lab.
 */
export interface FireTaskTestOverridesV1 {
  readonly schemaVersion: typeof FIRE_TASK_TEST_OVERRIDES_SCHEMA_VERSION;
  readonly dispersionMultiplier: number;
  readonly aimTimeSeconds: number;
  readonly physicalAimThreshold: number;
  readonly shootingSkill: number;
  readonly weaponProficiency: WeaponProficiency;
  readonly randomnessMultiplier: number;
  readonly randomSeed: number;
  readonly usePhysicalAimThreshold: boolean;
}

export type FireTaskTestOverridesInputV1 = Omit<FireTaskTestOverridesV1, 'physicalAimThreshold'> & {
  readonly physicalAimThreshold?: number;
};

interface ShotRandomnessContextV1 {
  readonly randomnessMultiplier: number;
  readonly randomSeed: number;
}

const overridesByTask = new WeakMap<FireTaskRuntimeV1, FireTaskTestOverridesV1>();
const shotRandomnessByKey = new Map<string, ShotRandomnessContextV1>();

export function setFireTaskTestOverrides(
  task: FireTaskRuntimeV1,
  value: FireTaskTestOverridesInputV1,
): FireTaskTestOverridesV1 {
  if (task.owner.source !== 'test') {
    throw new Error('FireTask test overrides are allowed only for test-owned actions.');
  }
  const normalized = normalizeFireTaskTestOverrides(value, task.minimumSolutionQuality);
  overridesByTask.set(task, normalized);
  return normalized;
}

export function getFireTaskTestOverrides(
  task: FireTaskRuntimeV1 | null | undefined,
): FireTaskTestOverridesV1 | null {
  return task ? overridesByTask.get(task) ?? null : null;
}

export function resolveFireTaskTestOperatorProfile(
  task: FireTaskRuntimeV1 | null | undefined,
  fallbackShootingSkill: number,
  fallbackProficiency: WeaponProficiency,
): { readonly shootingSkill: number; readonly proficiency: WeaponProficiency } {
  const overrides = getFireTaskTestOverrides(task);
  return {
    shootingSkill: overrides?.shootingSkill ?? fallbackShootingSkill,
    proficiency: overrides?.weaponProficiency ?? fallbackProficiency,
  };
}

export function applyFireTaskTestAimFactorOverrides(
  task: FireTaskRuntimeV1 | null | undefined,
  factors: AimFactorBreakdownV1,
): AimFactorBreakdownV1 {
  const overrides = getFireTaskTestOverrides(task);
  if (!overrides) return factors;
  return {
    ...factors,
    effectiveDispersionRadians: factors.effectiveDispersionRadians * overrides.dispersionMultiplier,
    aimQualityPerSecond: 1 / overrides.aimTimeSeconds,
  };
}

export function getFireTaskPhysicalAimThreshold(
  task: FireTaskRuntimeV1 | null | undefined,
): number | null {
  const overrides = getFireTaskTestOverrides(task);
  return overrides?.usePhysicalAimThreshold === true ? overrides.physicalAimThreshold : null;
}

export function withFireTaskTestShotRandomness<T>(
  task: FireTaskRuntimeV1,
  shooterId: string,
  weaponInstanceId: string,
  shotId: string,
  callback: () => T,
): T {
  const overrides = getFireTaskTestOverrides(task);
  if (!overrides) return callback();
  const key = shotRandomnessKey(shooterId, weaponInstanceId, shotId);
  const previous = shotRandomnessByKey.get(key);
  shotRandomnessByKey.set(key, {
    randomnessMultiplier: overrides.randomnessMultiplier,
    randomSeed: overrides.randomSeed,
  });
  try {
    return callback();
  } finally {
    if (previous) shotRandomnessByKey.set(key, previous);
    else shotRandomnessByKey.delete(key);
  }
}

export function resolveFireTaskTestShotRandomness(
  shooterId: string,
  weaponInstanceId: string,
  shotId: string,
): ShotRandomnessContextV1 | null {
  return shotRandomnessByKey.get(shotRandomnessKey(shooterId, weaponInstanceId, shotId)) ?? null;
}

function normalizeFireTaskTestOverrides(
  value: FireTaskTestOverridesInputV1,
  fallbackPhysicalAimThreshold: number,
): FireTaskTestOverridesV1 {
  return {
    schemaVersion: FIRE_TASK_TEST_OVERRIDES_SCHEMA_VERSION,
    dispersionMultiplier: clamp(finite(value.dispersionMultiplier, 1), 0.05, 10),
    aimTimeSeconds: clamp(finite(value.aimTimeSeconds, 1), 0.05, 60),
    physicalAimThreshold: clamp(
      finite(value.physicalAimThreshold, fallbackPhysicalAimThreshold),
      0,
      1,
    ),
    shootingSkill: clamp(finite(value.shootingSkill, 0.5), 0, 1),
    weaponProficiency: normalizeProficiency(value.weaponProficiency),
    randomnessMultiplier: clamp(finite(value.randomnessMultiplier, 1), 0, 4),
    randomSeed: integer(value.randomSeed, 1, 1, 0xffff_ffff),
    usePhysicalAimThreshold: value.usePhysicalAimThreshold === true,
  };
}

function shotRandomnessKey(shooterId: string, weaponInstanceId: string, shotId: string): string {
  return `${shooterId}\u0000${weaponInstanceId}\u0000${shotId}`;
}

function normalizeProficiency(value: unknown): WeaponProficiency {
  return value === 'untrained' || value === 'specialist' ? value : 'trained';
}

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function integer(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Math.trunc(finite(value, fallback));
  return Math.min(max, Math.max(min, parsed));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
