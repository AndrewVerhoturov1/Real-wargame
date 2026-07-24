import { normalizeLegacyHitZone, type BallisticDirection3, type BallisticPoint3 } from '../../combat/UnitHitShapes';
import type { AmmoDefinitionV1 } from '../catalogs/CombatCatalogTypes';
import { isHitZone, type BodyImpactPhysicsV1 } from './InfantryBodyTypes';
import { finiteNonNegative } from './ProjectileRuntimePoolInternals';
import {
  MAX_STAGE3_COMMIT_LEDGER_ENTRIES,
  MAX_STAGE3_IMPACT_ENTRIES,
  MAX_STAGE3_TERMINATION_ENTRIES,
  PROJECTILE_IMPACT_SCHEMA_VERSION,
  PROJECTILE_STATE_SCHEMA_VERSION,
  PROJECTILE_TERMINATION_SCHEMA_VERSION,
  SHOT_COMMIT_RECORD_SCHEMA_VERSION,
  type ProjectileImpactV1,
  type ProjectileStateV1,
  type ProjectileTerminationV1,
  type ShotCommitRecordV1,
} from './ProjectileRuntimeTypes';

const MAX_NORMALIZED_CAPACITY = 16_384;

export function normalizeProjectile(value: unknown): ProjectileStateV1 | null {
  if (!isRecord(value) || (value.schemaVersion !== 1 && value.schemaVersion !== PROJECTILE_STATE_SCHEMA_VERSION)) return null;
  const projectileId = cleanText(value.projectileId, '');
  const shotId = cleanText(value.shotId, '');
  const shooterId = cleanText(value.shooterId, '');
  const position = normalizePoint(value.position);
  const velocity = normalizeVector(value.velocityMetresPerSecond);
  const ammo = normalizeAmmo(value.ammoSnapshot);
  if (!projectileId || !shotId || !shooterId || !position || !velocity || !ammo) return null;
  const ageSeconds = finiteNonNegative(value.ageSeconds, Number.NaN);
  const maximumLifetimeSeconds = finitePositive(value.maximumLifetimeSeconds, ammo.maximumLifetimeSeconds);
  const bodyPenetrationBudget = finiteNonNegative(value.bodyPenetrationBudget, ammo.bodyPenetrationBudget);
  if (!Number.isFinite(ageSeconds) || !Number.isFinite(maximumLifetimeSeconds) || !Number.isFinite(bodyPenetrationBudget)) return null;
  return {
    schemaVersion: PROJECTILE_STATE_SCHEMA_VERSION,
    projectileId,
    shotId,
    shooterId,
    ammoSnapshot: ammo,
    position,
    velocityMetresPerSecond: velocity,
    ageSeconds,
    maximumLifetimeSeconds,
    bodyPenetrationBudget,
    bodyPenetrationCount: integer(value.bodyPenetrationCount, 0, 0, 255),
    impactSequence: integer(value.impactSequence, 0, 0, 0xffff_ffff),
    lastHitUnitId: nullableText(value.lastHitUnitId),
  };
}

export function normalizeCommitRecords(values: unknown): ShotCommitRecordV1[] {
  return uniqueBy(readArray(values).map(normalizeCommitRecord).filter(isPresent), (item) => item.shotId)
    .sort(compareCommitRecords).slice(-MAX_STAGE3_COMMIT_LEDGER_ENTRIES);
}

export function normalizeCommitRecord(value: unknown): ShotCommitRecordV1 | null {
  if (!isRecord(value) || value.schemaVersion !== SHOT_COMMIT_RECORD_SCHEMA_VERSION) return null;
  const weaponDefinitionRef = normalizeRef(value.weaponDefinitionRef);
  const ammoDefinitionRef = normalizeRef(value.ammoDefinitionRef);
  const muzzlePosition = normalizePoint(value.muzzlePosition);
  const initialVelocity = normalizeVector(value.initialVelocityMetresPerSecond);
  const shotId = cleanText(value.shotId, '');
  const shooterId = cleanText(value.shooterId, '');
  const fireTaskId = cleanText(value.fireTaskId, '');
  const weaponInstanceId = cleanText(value.weaponInstanceId, '');
  if (!weaponDefinitionRef || !ammoDefinitionRef || !muzzlePosition || !initialVelocity || !shotId || !shooterId || !fireTaskId || !weaponInstanceId) return null;
  const aim = normalizeVector(value.aimDirectionBeforeDispersion);
  const final = normalizeVector(value.finalProjectileDirection);
  return {
    schemaVersion: SHOT_COMMIT_RECORD_SCHEMA_VERSION,
    shotId, shooterId, fireTaskId, weaponInstanceId, weaponDefinitionRef, ammoDefinitionRef,
    committedSimulationSeconds: finiteNonNegative(value.committedSimulationSeconds, 0),
    muzzlePosition,
    ...(aim ? { aimDirectionBeforeDispersion: aim } : {}),
    ...(isFiniteNumber(value.dispersionPitchRadians) ? { dispersionPitchRadians: value.dispersionPitchRadians } : {}),
    ...(isFiniteNumber(value.dispersionYawRadians) ? { dispersionYawRadians: value.dispersionYawRadians } : {}),
    ...(isFiniteNumber(value.recoilPitchRadians) ? { recoilPitchRadians: value.recoilPitchRadians } : {}),
    ...(isFiniteNumber(value.recoilYawRadians) ? { recoilYawRadians: value.recoilYawRadians } : {}),
    ...(final ? { finalProjectileDirection: final } : {}),
    initialVelocityMetresPerSecond: initialVelocity,
    ...(isFiniteNumber(value.predictedHitProbability) ? { predictedHitProbability: clamp01(value.predictedHitProbability) } : {}),
    ...(isFiniteNumber(value.effectiveDispersionRadians) ? { effectiveDispersionRadians: Math.max(0, value.effectiveDispersionRadians) } : {}),
    roundsBefore: integer(value.roundsBefore, 0, 0, Number.MAX_SAFE_INTEGER),
    roundsAfter: integer(value.roundsAfter, 0, 0, Number.MAX_SAFE_INTEGER),
  };
}

export function normalizeImpacts(values: unknown): ProjectileImpactV1[] {
  return uniqueBy(readArray(values).map(normalizeImpact).filter(isPresent), (item) => item.impactId)
    .sort(compareImpacts).slice(-MAX_STAGE3_IMPACT_ENTRIES);
}

export function normalizeImpact(value: unknown): ProjectileImpactV1 | null {
  if (!isRecord(value) || (value.schemaVersion !== 1 && value.schemaVersion !== PROJECTILE_IMPACT_SCHEMA_VERSION)) return null;
  const point = normalizePoint(value.point);
  const hitType = value.hitType ?? value.impactType;
  const impactId = cleanText(value.impactId, '');
  const projectileId = cleanText(value.projectileId, '');
  const shotId = cleanText(value.shotId, '');
  const shooterId = cleanText(value.shooterId, '');
  if (!point || !impactId || !projectileId || !shotId || !shooterId || (hitType !== 'terrain' && hitType !== 'object' && hitType !== 'unit')) return null;
  const currentZone = isHitZone(value.hitZone) ? value.hitZone : null;
  const legacyZone = value.schemaVersion === 1 ? normalizeLegacyHitZone(value.hitZone) : currentZone;
  const bodyPhysics = value.schemaVersion === PROJECTILE_IMPACT_SCHEMA_VERSION ? normalizeBodyPhysics(value.bodyPhysics) : null;
  return {
    schemaVersion: PROJECTILE_IMPACT_SCHEMA_VERSION,
    impactId,
    impactSequence: integer(value.impactSequence, parseImpactSequence(impactId), 0, 0xffff_ffff),
    projectileId,
    shotId,
    shooterId,
    hitType,
    impactSeconds: finiteNonNegative(value.impactSeconds ?? value.simulationSeconds, 0),
    projectileAgeSeconds: finiteNonNegative(value.projectileAgeSeconds, 0),
    point,
    hitObjectId: nullableText(value.hitObjectId),
    hitUnitId: nullableText(value.hitUnitId),
    hitZone: bodyPhysics?.hitZone ?? legacyZone,
    materialId: nullableText(value.materialId),
    normal: normalizeVector(value.normal),
    velocityBeforeImpact: normalizeVector(value.velocityBeforeImpact) ?? { x: 0, y: 0, z: 0 },
    bodyPhysics,
  };
}

export function normalizeBodyPhysics(value: unknown): BodyImpactPhysicsV1 | null {
  if (!isRecord(value) || value.schemaVersion !== 1 || !isHitZone(value.hitZone)) return null;
  const entryPoint = normalizePoint(value.entryPoint);
  const exitPoint = value.exitPoint === null ? null : normalizePoint(value.exitPoint);
  const entryNormal = normalizeVector(value.entryNormal);
  const hitUnitId = cleanText(value.hitUnitId, '');
  const hitShapeId = cleanText(value.hitShapeId, '');
  const status = value.status;
  if (!entryPoint || !entryNormal || !hitUnitId || !hitShapeId || (status !== 'penetrated' && status !== 'stopped' && status !== 'penetration_limit')) return null;
  return {
    schemaVersion: 1,
    hitUnitId,
    hitZone: value.hitZone,
    hitShapeId,
    entryPoint,
    exitPoint,
    entryNormal,
    pathLengthMetres: finiteNonNegative(value.pathLengthMetres, 0),
    projectileMassKilograms: finiteNonNegative(value.projectileMassKilograms, 0),
    woundEffectMultiplier: finiteNonNegative(value.woundEffectMultiplier, 0),
    speedBeforeMetresPerSecond: finiteNonNegative(value.speedBeforeMetresPerSecond, 0),
    speedAfterMetresPerSecond: finiteNonNegative(value.speedAfterMetresPerSecond, 0),
    impactEnergyJoules: finiteNonNegative(value.impactEnergyJoules, 0),
    incidenceCosine: clamp01(finiteNonNegative(value.incidenceCosine, 0)),
    penetrationBudgetBefore: finiteNonNegative(value.penetrationBudgetBefore, 0),
    penetrationResistance: finiteNonNegative(value.penetrationResistance, 0),
    penetrationBudgetAfter: finiteNonNegative(value.penetrationBudgetAfter, 0),
    penetrationCountBefore: integer(value.penetrationCountBefore, 0, 0, 255),
    penetrationCountAfter: integer(value.penetrationCountAfter, 0, 0, 255),
    status,
  };
}

export function normalizeTerminations(values: unknown): ProjectileTerminationV1[] {
  return uniqueBy(readArray(values).map(normalizeTermination).filter(isPresent), (item) => item.terminationId)
    .sort(compareTerminations).slice(-MAX_STAGE3_TERMINATION_ENTRIES);
}

export function normalizeTermination(value: unknown): ProjectileTerminationV1 | null {
  if (!isRecord(value) || value.schemaVersion !== PROJECTILE_TERMINATION_SCHEMA_VERSION) return null;
  const terminationId = cleanText(value.terminationId, '');
  const projectileId = cleanText(value.projectileId, '');
  const shotId = cleanText(value.shotId, '');
  const point = normalizePoint(value.point);
  const reason = value.reason;
  if (!terminationId || !projectileId || !shotId || !point || !(
    reason === 'impact' || reason === 'body_penetration_limit' || reason === 'lifetime'
    || reason === 'out_of_bounds' || reason === 'reconciled_orphan'
  )) return null;
  return {
    schemaVersion: PROJECTILE_TERMINATION_SCHEMA_VERSION,
    terminationId,
    projectileId,
    shotId,
    reason,
    simulationSeconds: finiteNonNegative(value.simulationSeconds, 0),
    point,
  };
}

export function normalizeAmmo(value: unknown): AmmoDefinitionV1 | null {
  if (!isRecord(value) || value.schemaVersion !== 1) return null;
  if (!cleanText(value.ammoDefinitionId, '') || integer(value.revision, 0, 1, Number.MAX_SAFE_INTEGER) <= 0) return null;
  if (value.status !== 'published' && value.status !== 'archived') return null;
  if (finitePositive(value.muzzleVelocityMetersPerSecond, 0) <= 0 || finitePositive(value.maximumLifetimeSeconds, 0) <= 0) return null;
  return clone(value as unknown as AmmoDefinitionV1);
}

export function normalizeRef(value: unknown): ShotCommitRecordV1['weaponDefinitionRef'] | null {
  if (!isRecord(value)) return null;
  const definitionId = cleanText(value.definitionId, '');
  const revision = integer(value.revision, 0, 1, Number.MAX_SAFE_INTEGER);
  return definitionId && revision > 0 ? { definitionId, revision } : null;
}

export function normalizePoint(value: unknown): BallisticPoint3 | null {
  if (!isRecord(value) || !isFiniteNumber(value.xMetres) || !isFiniteNumber(value.yMetres) || !isFiniteNumber(value.zMetres)) return null;
  return { xMetres: value.xMetres, yMetres: value.yMetres, zMetres: value.zMetres };
}

export function normalizeVector(value: unknown): BallisticDirection3 | null {
  if (!isRecord(value) || !isFiniteNumber(value.x) || !isFiniteNumber(value.y) || !isFiniteNumber(value.z)) return null;
  return { x: value.x, y: value.y, z: value.z };
}

export function parseImpactSequence(impactId: string): number {
  const match = /:impact:(\d+)$/.exec(impactId);
  return match ? integer(Number(match[1]), 0, 0, 0xffff_ffff) : 0;
}

export function normalizeCapacity(value: unknown, fallback: number, minimumRequired: number): number {
  return Math.max(integer(value, fallback, 1, MAX_NORMALIZED_CAPACITY), minimumRequired, 1);
}

export function compareProjectiles(left: ProjectileStateV1, right: ProjectileStateV1): number { return compareText(left.projectileId, right.projectileId); }
export function compareCommitRecords(left: ShotCommitRecordV1, right: ShotCommitRecordV1): number { return left.committedSimulationSeconds - right.committedSimulationSeconds || compareText(left.shotId, right.shotId); }
export function compareImpacts(left: ProjectileImpactV1, right: ProjectileImpactV1): number { return left.impactSeconds - right.impactSeconds || compareText(left.shotId, right.shotId) || (left.impactSequence ?? 0) - (right.impactSequence ?? 0) || compareText(left.impactId, right.impactId); }
export function compareTerminations(left: ProjectileTerminationV1, right: ProjectileTerminationV1): number { return left.simulationSeconds - right.simulationSeconds || compareText(left.terminationId, right.terminationId); }

export function insertSortedBounded<T>(target: T[], value: T, capacity: number, compare: (left: T, right: T) => number): void {
  let low = 0; let high = target.length;
  while (low < high) { const middle = (low + high) >>> 1; if (compare(target[middle]!, value) <= 0) low = middle + 1; else high = middle; }
  target.splice(low, 0, value);
  if (target.length > capacity) target.splice(0, target.length - capacity);
}

export function uniqueBy<T>(values: readonly T[], key: (value: T) => string): T[] { const result: T[] = []; const seen = new Set<string>(); for (const value of values) { const identity = key(value); if (seen.has(identity)) continue; seen.add(identity); result.push(clone(value)); } return result; }
export function canonicalStrings(values: unknown[]): string[] { return [...new Set(values.map((value) => cleanText(value, '')).filter(Boolean))].sort(compareText); }
export function readArray(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
export function isPresent<T>(value: T | null): value is T { return value !== null; }
export function finitePositive(value: unknown, fallback: number): number { const numeric = isFiniteNumber(value) ? value : fallback; return numeric > 0 ? numeric : fallback; }
export function integer(value: unknown, fallback: number, minimum: number, maximum: number): number { const numeric = isFiniteNumber(value) ? Math.round(value) : fallback; return Math.max(minimum, Math.min(maximum, numeric)); }
export function cleanText(value: unknown, fallback: string): string { return typeof value === 'string' && value.trim() ? value.trim() : fallback; }
export function nullableText(value: unknown): string | null { return typeof value === 'string' && value.trim() ? value.trim() : null; }
export function compareText(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
export function isFiniteNumber(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value); }
export function isSlot(slot: number, capacity: number): boolean { return Number.isInteger(slot) && slot >= 0 && slot < capacity; }
export function increment(value: number): number { return Math.min(Number.MAX_SAFE_INTEGER, value + 1); }
export function nextGeneration(value: number): number { return value >= 0xffff_ffff ? 1 : value + 1; }
export function clamp01(value: number): number { return Math.max(0, Math.min(1, value)); }
export function clone<T>(value: T): T { return structuredClone(value); }
export function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
