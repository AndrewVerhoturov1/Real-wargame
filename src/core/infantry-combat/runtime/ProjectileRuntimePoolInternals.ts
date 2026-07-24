import type { AmmoDefinitionV1 } from '../catalogs/CombatCatalogTypes';
import {
  DEFAULT_PROJECTILE_EVENT_BUFFER_CAPACITY,
  MAX_STAGE6_IMPACT_BUFFER_ENTRIES,
  PROJECTILE_RUNTIME_SCHEMA_VERSION,
  PROJECTILE_STATE_SCHEMA_VERSION,
  type ProjectilePoolV3,
  type ProjectileRuntimeDiagnosticsV3,
  type ProjectileRuntimeStateV3,
  type ProjectileStateV1,
} from './ProjectileRuntimeTypes';

export const derivedByRuntime = new WeakMap<ProjectileRuntimeStateV3, { slotByProjectileId: Map<string, number> }>();

export function normalizeFreeList(pool: ProjectilePoolV3, lookup: Map<string, number>): void {
  let valid = pool.freeSlotCount >= 0 && pool.freeSlotCount <= pool.capacity;
  if (valid) {
    const seen = new Uint8Array(pool.capacity);
    for (let index = 0; index < pool.freeSlotCount; index += 1) {
      const slot = pool.freeSlots[index]!;
      if (!isSlot(slot, pool.capacity) || pool.active[slot] !== 0 || seen[slot] === 1) { valid = false; break; }
      seen[slot] = 1;
    }
  }
  if (valid && lookup.size === pool.activeCount) return;
  lookup.clear();
  pool.activeCount = 0;
  pool.freeSlotCount = 0;
  for (let slot = pool.capacity - 1; slot >= 0; slot -= 1) {
    if (pool.active[slot] === 1 && pool.projectileIds[slot] && !lookup.has(pool.projectileIds[slot]!)) {
      lookup.set(pool.projectileIds[slot]!, slot);
      pool.activeCount += 1;
    } else {
      pool.active[slot] = 0;
      clearSlotMetadata(pool, slot);
      pool.freeSlots[pool.freeSlotCount++] = slot;
    }
  }
  pool.highWaterMark = Math.max(pool.highWaterMark, pool.activeCount);
}

export function clearSlotMetadata(pool: ProjectilePoolV3, slot: number): void {
  pool.projectileIds[slot] = null;
  pool.shotIds[slot] = null;
  pool.shooterIds[slot] = null;
  pool.ammoSnapshots[slot] = null;
  pool.positionX[slot] = 0;
  pool.positionY[slot] = 0;
  pool.positionZ[slot] = 0;
  pool.velocityX[slot] = 0;
  pool.velocityY[slot] = 0;
  pool.velocityZ[slot] = 0;
  pool.ageSeconds[slot] = 0;
  pool.maximumLifetimeSeconds[slot] = 0;
  pool.bodyPenetrationBudget[slot] = 0;
  pool.bodyPenetrationCount[slot] = 0;
  pool.impactSequence[slot] = 0;
  pool.lastHitUnitIds[slot] = null;
}

export function writeProjectileRecord(pool: ProjectilePoolV3, slot: number, projectile: ProjectileStateV1): void {
  pool.projectileIds[slot] = projectile.projectileId;
  pool.shotIds[slot] = projectile.shotId;
  pool.shooterIds[slot] = projectile.shooterId;
  pool.ammoSnapshots[slot] = clone(projectile.ammoSnapshot);
  pool.positionX[slot] = projectile.position.xMetres;
  pool.positionY[slot] = projectile.position.yMetres;
  pool.positionZ[slot] = projectile.position.zMetres;
  pool.velocityX[slot] = projectile.velocityMetresPerSecond.x;
  pool.velocityY[slot] = projectile.velocityMetresPerSecond.y;
  pool.velocityZ[slot] = projectile.velocityMetresPerSecond.z;
  pool.ageSeconds[slot] = projectile.ageSeconds;
  pool.maximumLifetimeSeconds[slot] = projectile.maximumLifetimeSeconds;
  pool.bodyPenetrationBudget[slot] = projectile.bodyPenetrationBudget;
  pool.bodyPenetrationCount[slot] = projectile.bodyPenetrationCount ?? 0;
  pool.impactSequence[slot] = projectile.impactSequence;
  pool.lastHitUnitIds[slot] = projectile.lastHitUnitId ?? null;
}

export function recordFromSlot(pool: ProjectilePoolV3, slot: number): ProjectileStateV1 | null {
  const projectileId = pool.projectileIds[slot];
  const shotId = pool.shotIds[slot];
  const shooterId = pool.shooterIds[slot];
  const ammo = pool.ammoSnapshots[slot];
  if (!projectileId || !shotId || !shooterId || !ammo) return null;
  return {
    schemaVersion: PROJECTILE_STATE_SCHEMA_VERSION,
    projectileId,
    shotId,
    shooterId,
    ammoSnapshot: clone(ammo),
    position: { xMetres: pool.positionX[slot]!, yMetres: pool.positionY[slot]!, zMetres: pool.positionZ[slot]! },
    velocityMetresPerSecond: { x: pool.velocityX[slot]!, y: pool.velocityY[slot]!, z: pool.velocityZ[slot]! },
    ageSeconds: pool.ageSeconds[slot]!,
    maximumLifetimeSeconds: pool.maximumLifetimeSeconds[slot]!,
    bodyPenetrationBudget: pool.bodyPenetrationBudget[slot]!,
    bodyPenetrationCount: pool.bodyPenetrationCount[slot]!,
    impactSequence: pool.impactSequence[slot]!,
    lastHitUnitId: pool.lastHitUnitIds[slot],
  };
}

export function getDerived(runtime: ProjectileRuntimeStateV3): { slotByProjectileId: Map<string, number> } {
  let derived = derivedByRuntime.get(runtime);
  if (!derived) {
    derived = { slotByProjectileId: new Map() };
    derivedByRuntime.set(runtime, derived);
    normalizeFreeList(runtime.pool, derived.slotByProjectileId);
  }
  return derived;
}

export function createDiagnostics(capacity: number): ProjectileRuntimeDiagnosticsV3 {
  return {
    capacity,
    activeCount: 0,
    freeCount: capacity,
    highWaterMark: 0,
    spawnCount: 0,
    releaseCount: 0,
    capRejectionCount: 0,
    duplicateSpawnCount: 0,
    invalidSpawnCount: 0,
    fixedSubstepsExecuted: 0,
    catchUpLimitedCount: 0,
    accumulatorSeconds: 0,
    sweptTraceCount: 0,
    unitBroadPhaseQueryCount: 0,
    unitCandidateCount: 0,
    unitNarrowCheckCount: 0,
    objectBroadPhaseQueryCount: 0,
    objectCandidateCount: 0,
    terrainSampleCount: 0,
    impactBufferCapacity: Math.min(MAX_STAGE6_IMPACT_BUFFER_ENTRIES, capacity * 4),
    impactBufferHighWaterMark: 0,
    terminationBufferCapacity: Math.min(DEFAULT_PROJECTILE_EVENT_BUFFER_CAPACITY, capacity),
    terminationBufferHighWaterMark: 0,
    eventOverflowCount: 0,
    poolAllocationCount: 1,
    poolResizeCount: 0,
    scratchAllocationCount: 0,
    fullScanFallbackCount: 0,
    commitLedgerHighWaterMark: 0,
    impactLedgerHighWaterMark: 0,
    terminationLedgerHighWaterMark: 0,
    appliedImpactLedgerHighWaterMark: 0,
    lastImpactId: null,
    lastTerminationId: null,
    unitCheckCount: 0,
    bodyImpactCount: 0,
    bodyPenetrationCount: 0,
    penetratedBodyImpactCount: 0,
    bodyStopCount: 0,
    penetrationLimitCount: 0,
    woundAppliedCount: 0,
    woundDuplicateCount: 0,
    woundTargetMissingCount: 0,
    maximumImpactsInSingleSubstep: 0,
    lastBodyImpactId: null,
    lastBodyBudgetBefore: 0,
    lastBodyBudgetAfter: 0,
    lastBodyResistance: 0,
    lastBodySpeedBefore: 0,
    lastBodySpeedAfter: 0,
  };
}

export function normalizeDiagnostics(value: Record<string, unknown>, capacity: number): ProjectileRuntimeDiagnosticsV3 {
  const defaults = createDiagnostics(capacity);
  for (const key of Object.keys(defaults) as Array<keyof ProjectileRuntimeDiagnosticsV3>) {
    if (key === 'lastImpactId' || key === 'lastTerminationId' || key === 'lastBodyImpactId') continue;
    if (typeof defaults[key] === 'number') (defaults[key] as number) = finiteNonNegative(value[key], defaults[key] as number);
  }
  if (!isFiniteNumber(value.unitNarrowCheckCount) && isFiniteNumber(value.unitCheckCount)) {
    defaults.unitNarrowCheckCount = finiteNonNegative(value.unitCheckCount, 0);
  }
  defaults.unitCheckCount = defaults.unitNarrowCheckCount;
  defaults.capacity = capacity;
  defaults.impactBufferCapacity = Math.min(MAX_STAGE6_IMPACT_BUFFER_ENTRIES, capacity * 4);
  defaults.terminationBufferCapacity = Math.min(DEFAULT_PROJECTILE_EVENT_BUFFER_CAPACITY, capacity);
  defaults.lastImpactId = nullableText(value.lastImpactId);
  defaults.lastTerminationId = nullableText(value.lastTerminationId);
  defaults.lastBodyImpactId = nullableText(value.lastBodyImpactId);
  return defaults;
}

export function syncDiagnostics(runtime: ProjectileRuntimeStateV3): void {
  const diagnostics = runtime.diagnostics;
  diagnostics.capacity = runtime.pool.capacity;
  diagnostics.activeCount = runtime.pool.activeCount;
  diagnostics.freeCount = runtime.pool.freeSlotCount;
  diagnostics.highWaterMark = runtime.pool.highWaterMark;
  diagnostics.accumulatorSeconds = runtime.accumulatorSeconds;
  diagnostics.unitCheckCount = diagnostics.unitNarrowCheckCount;
  diagnostics.commitLedgerHighWaterMark = Math.max(diagnostics.commitLedgerHighWaterMark, runtime.committedShots.length);
  diagnostics.impactLedgerHighWaterMark = Math.max(diagnostics.impactLedgerHighWaterMark, runtime.impacts.length);
  diagnostics.terminationLedgerHighWaterMark = Math.max(diagnostics.terminationLedgerHighWaterMark, runtime.terminations.length);
  diagnostics.appliedImpactLedgerHighWaterMark = Math.max(diagnostics.appliedImpactLedgerHighWaterMark, runtime.appliedImpactIds.length);
}

export function isRuntimeStateV3(value: unknown): value is ProjectileRuntimeStateV3 {
  return isRecord(value)
    && value.schemaVersion === PROJECTILE_RUNTIME_SCHEMA_VERSION
    && isRecord(value.pool)
    && value.pool.active instanceof Uint8Array
    && value.pool.positionX instanceof Float64Array
    && value.pool.bodyPenetrationCount instanceof Uint8Array;
}

export function finiteNonNegative(value: unknown, fallback: number): number { const numeric = isFiniteNumber(value) ? value : fallback; return Number.isFinite(numeric) ? Math.max(0, numeric) : numeric; }
export function integer(value: unknown, fallback: number, minimum: number, maximum: number): number { const numeric = isFiniteNumber(value) ? Math.round(value) : fallback; return Math.max(minimum, Math.min(maximum, numeric)); }
export function cleanText(value: unknown, fallback: string): string { return typeof value === 'string' && value.trim() ? value.trim() : fallback; }
export function nullableText(value: unknown): string | null { return typeof value === 'string' && value.trim() ? value.trim() : null; }
export function isFiniteNumber(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value); }
export function isSlot(slot: number, capacity: number): boolean { return Number.isInteger(slot) && slot >= 0 && slot < capacity; }
export function increment(value: number): number { return Math.min(Number.MAX_SAFE_INTEGER, value + 1); }
export function nextGeneration(value: number): number { return value >= 0xffff_ffff ? 1 : value + 1; }
export function clamp01(value: number): number { return Math.max(0, Math.min(1, value)); }
export function clone<T>(value: T): T { return structuredClone(value); }
export function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
