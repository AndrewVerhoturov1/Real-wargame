import { normalizeLegacyHitZone, type BallisticDirection3, type BallisticPoint3 } from '../../combat/UnitHitShapes';
import type { AmmoDefinitionV1 } from '../catalogs/CombatCatalogTypes';
import { isHitZone, type BodyImpactPhysicsV1 } from './InfantryBodyTypes';
import {
  DEFAULT_PROJECTILE_EVENT_BUFFER_CAPACITY,
  MAX_STAGE3_APPLIED_IMPACT_IDS,
  MAX_STAGE3_COMMIT_LEDGER_ENTRIES,
  MAX_STAGE3_IMPACT_ENTRIES,
  MAX_STAGE3_TERMINATION_ENTRIES,
  MAX_STAGE6_IMPACT_BUFFER_ENTRIES,
  PRODUCTION_PROJECTILE_CAPACITY,
  PROJECTILE_IMPACT_SCHEMA_VERSION,
  PROJECTILE_RUNTIME_SCHEMA_VERSION,
  PROJECTILE_STATE_SCHEMA_VERSION,
  PROJECTILE_TERMINATION_SCHEMA_VERSION,
  REFERENCE_PROJECTILE_RUNTIME_SCHEMA_VERSION,
  SHOT_COMMIT_RECORD_SCHEMA_VERSION,
  STAGE3_PROJECTILE_FIXED_STEP_SECONDS,
  type ProjectileImpactV1,
  type ProjectilePoolHandleV2,
  type ProjectilePoolV3,
  type ProjectileRuntimeDiagnosticsV3,
  type ProjectileRuntimeSnapshotV3,
  type ProjectileRuntimeStateV3,
  type ProjectileSpawnResultV2,
  type ProjectileStateV1,
  type ProjectileTerminationV1,
  type ReferenceProjectileRuntimeStateV1,
  type ShotCommitRecordV1,
} from './ProjectileRuntimeTypes';

import {
  createDiagnostics,
  derivedByRuntime,
  getDerived,
  isRuntimeStateV3,
  normalizeDiagnostics,
  normalizeFreeList,
  recordFromSlot,
  syncDiagnostics,
  writeProjectileRecord,
  clearSlotMetadata,
  finiteNonNegative,
} from './ProjectileRuntimePoolInternals';
import {
  canonicalStrings,
  clone,
  compareCommitRecords,
  compareProjectiles,
  increment,
  isPresent,
  isRecord,
  isSlot,
  nextGeneration,
  normalizeCapacity,
  normalizeCommitRecord,
  normalizeCommitRecords,
  normalizeImpacts,
  normalizeProjectile,
  normalizeTerminations,
  readArray,
  uniqueBy,
} from './ProjectileRuntimeSerialization';

const MAX_NORMALIZED_CAPACITY = 16_384;
export function createProjectilePool(capacity = PRODUCTION_PROJECTILE_CAPACITY): ProjectilePoolV3 {
  const normalized = normalizeCapacity(capacity, PRODUCTION_PROJECTILE_CAPACITY, 0);
  const freeSlots = new Uint32Array(normalized);
  for (let index = 0; index < normalized; index += 1) freeSlots[index] = normalized - index - 1;
  return {
    capacity: normalized,
    active: new Uint8Array(normalized),
    generation: new Uint32Array(normalized),
    projectileIds: Array<string | null>(normalized).fill(null),
    shotIds: Array<string | null>(normalized).fill(null),
    shooterIds: Array<string | null>(normalized).fill(null),
    ammoSnapshots: Array<AmmoDefinitionV1 | null>(normalized).fill(null),
    positionX: new Float64Array(normalized),
    positionY: new Float64Array(normalized),
    positionZ: new Float64Array(normalized),
    velocityX: new Float64Array(normalized),
    velocityY: new Float64Array(normalized),
    velocityZ: new Float64Array(normalized),
    ageSeconds: new Float64Array(normalized),
    maximumLifetimeSeconds: new Float64Array(normalized),
    bodyPenetrationBudget: new Float64Array(normalized),
    bodyPenetrationCount: new Uint8Array(normalized),
    impactSequence: new Uint32Array(normalized),
    lastHitUnitIds: Array<string | null>(normalized).fill(null),
    freeSlots,
    activeCount: 0,
    freeSlotCount: normalized,
    highWaterMark: 0,
  };
}

export function createProjectileRuntimeState(capacity = PRODUCTION_PROJECTILE_CAPACITY): ProjectileRuntimeStateV3 {
  const pool = createProjectilePool(capacity);
  const runtime = attachCompatibilityAccessor({
    schemaVersion: PROJECTILE_RUNTIME_SCHEMA_VERSION,
    fixedStepSeconds: STAGE3_PROJECTILE_FIXED_STEP_SECONDS,
    accumulatorSeconds: 0,
    pool,
    committedShots: [],
    impacts: [],
    terminations: [],
    appliedImpactIds: [],
    diagnostics: createDiagnostics(pool.capacity),
  } as unknown as ProjectileRuntimeStateV3);
  derivedByRuntime.set(runtime, { slotByProjectileId: new Map() });
  return runtime;
}

export function normalizeProjectileRuntimeState(value: unknown): ProjectileRuntimeStateV3 {
  if (isRuntimeStateV3(value)) {
    normalizeFreeList(value.pool, getDerived(value).slotByProjectileId);
    value.committedShots = normalizeCommitRecords(value.committedShots);
    value.impacts = normalizeImpacts(value.impacts);
    value.terminations = normalizeTerminations(value.terminations);
    value.appliedImpactIds = canonicalStrings(value.appliedImpactIds).slice(-MAX_STAGE3_APPLIED_IMPACT_IDS);
    value.diagnostics = normalizeDiagnostics(value.diagnostics as unknown as Record<string, unknown>, value.pool.capacity);
    syncDiagnostics(value);
    return attachCompatibilityAccessor(value);
  }
  if (isRecord(value) && value.schemaVersion === REFERENCE_PROJECTILE_RUNTIME_SCHEMA_VERSION) {
    return migrateReferenceSnapshot(value as unknown as ReferenceProjectileRuntimeStateV1);
  }
  if (isRecord(value) && (value.schemaVersion === 2 || value.schemaVersion === PROJECTILE_RUNTIME_SCHEMA_VERSION)) {
    return createRuntimeFromSnapshot(normalizeSnapshot(value));
  }
  return createProjectileRuntimeState();
}

export function serializeProjectileRuntimeState(runtime: ProjectileRuntimeStateV3): ProjectileRuntimeSnapshotV3 {
  normalizeFreeList(runtime.pool, getDerived(runtime).slotByProjectileId);
  syncDiagnostics(runtime);
  return {
    schemaVersion: PROJECTILE_RUNTIME_SCHEMA_VERSION,
    fixedStepSeconds: STAGE3_PROJECTILE_FIXED_STEP_SECONDS,
    accumulatorSeconds: finiteNonNegative(runtime.accumulatorSeconds, 0),
    capacity: runtime.pool.capacity,
    activeProjectiles: collectActiveProjectileRecords(runtime).sort(compareProjectiles),
    committedShots: normalizeCommitRecords(runtime.committedShots),
    impacts: normalizeImpacts(runtime.impacts),
    terminations: normalizeTerminations(runtime.terminations),
    appliedImpactIds: canonicalStrings(runtime.appliedImpactIds).slice(-MAX_STAGE3_APPLIED_IMPACT_IDS),
    diagnostics: clone(runtime.diagnostics),
  };
}

export function trySpawnProjectile(runtime: ProjectileRuntimeStateV3, candidate: ProjectileStateV1): ProjectileSpawnResultV2 {
  const normalized = normalizeProjectile(candidate);
  if (!normalized) {
    runtime.diagnostics.invalidSpawnCount = increment(runtime.diagnostics.invalidSpawnCount);
    return { status: 'invalid_candidate', handle: null };
  }
  const derived = getDerived(runtime);
  normalizeFreeList(runtime.pool, derived.slotByProjectileId);
  if (derived.slotByProjectileId.has(normalized.projectileId)) {
    runtime.diagnostics.duplicateSpawnCount = increment(runtime.diagnostics.duplicateSpawnCount);
    return { status: 'duplicate_projectile_id', handle: null };
  }
  if (runtime.pool.freeSlotCount <= 0) {
    runtime.diagnostics.capRejectionCount = increment(runtime.diagnostics.capRejectionCount);
    return { status: 'capacity_exceeded', handle: null };
  }
  const slot = runtime.pool.freeSlots[--runtime.pool.freeSlotCount]!;
  if (!isSlot(slot, runtime.pool.capacity) || runtime.pool.active[slot] === 1) {
    normalizeFreeList(runtime.pool, derived.slotByProjectileId);
    if (runtime.pool.freeSlotCount <= 0) {
      runtime.diagnostics.capRejectionCount = increment(runtime.diagnostics.capRejectionCount);
      return { status: 'capacity_exceeded', handle: null };
    }
    return trySpawnProjectile(runtime, normalized);
  }
  runtime.pool.generation[slot] = nextGeneration(runtime.pool.generation[slot]!);
  writeProjectileRecord(runtime.pool, slot, normalized);
  runtime.pool.active[slot] = 1;
  runtime.pool.activeCount += 1;
  runtime.pool.highWaterMark = Math.max(runtime.pool.highWaterMark, runtime.pool.activeCount);
  derived.slotByProjectileId.set(normalized.projectileId, slot);
  runtime.diagnostics.spawnCount = increment(runtime.diagnostics.spawnCount);
  syncDiagnostics(runtime);
  return {
    status: 'spawned',
    handle: { slot, generation: runtime.pool.generation[slot]!, projectileId: normalized.projectileId },
  };
}

export function releaseProjectileSlot(runtime: ProjectileRuntimeStateV3, handle: ProjectilePoolHandleV2): boolean {
  if (!isSlot(handle.slot, runtime.pool.capacity)) return false;
  if (runtime.pool.active[handle.slot] !== 1) return false;
  if (runtime.pool.generation[handle.slot] !== handle.generation) return false;
  if (runtime.pool.projectileIds[handle.slot] !== handle.projectileId) return false;
  releaseSlotUnchecked(runtime, handle.slot);
  return true;
}

export function releaseProjectileSlotByIndex(runtime: ProjectileRuntimeStateV3, slot: number): boolean {
  if (!isSlot(slot, runtime.pool.capacity) || runtime.pool.active[slot] !== 1) return false;
  releaseSlotUnchecked(runtime, slot);
  return true;
}

export function getProjectileAtSlot(runtime: ProjectileRuntimeStateV3, slot: number): ProjectileStateV1 | null {
  if (!isSlot(slot, runtime.pool.capacity) || runtime.pool.active[slot] !== 1) return null;
  return recordFromSlot(runtime.pool, slot);
}

export function writeProjectileAtSlot(runtime: ProjectileRuntimeStateV3, slot: number, projectile: ProjectileStateV1): void {
  const normalized = normalizeProjectile(projectile);
  if (!normalized || !isSlot(slot, runtime.pool.capacity) || runtime.pool.active[slot] !== 1) return;
  const previousId = runtime.pool.projectileIds[slot];
  const derived = getDerived(runtime);
  if (previousId !== normalized.projectileId) {
    const occupied = derived.slotByProjectileId.get(normalized.projectileId);
    if (occupied !== undefined && occupied !== slot) return;
    if (previousId) derived.slotByProjectileId.delete(previousId);
    derived.slotByProjectileId.set(normalized.projectileId, slot);
  }
  writeProjectileRecord(runtime.pool, slot, normalized);
}

export function collectActiveProjectileRecords(runtime: ProjectileRuntimeStateV3): ProjectileStateV1[] {
  const output: ProjectileStateV1[] = [];
  for (let slot = 0; slot < runtime.pool.capacity; slot += 1) {
    if (runtime.pool.active[slot] !== 1) continue;
    const record = recordFromSlot(runtime.pool, slot);
    if (record) output.push(record);
  }
  return output;
}

export function rebuildProjectilePool(runtime: ProjectileRuntimeStateV3, projectiles: readonly ProjectileStateV1[]): void {
  const historicalHighWaterMark = runtime.pool.highWaterMark;
  clearPool(runtime);
  const values = uniqueBy(
    projectiles.map(normalizeProjectile).filter(isPresent),
    (projectile) => projectile.projectileId,
  ).sort(compareProjectiles).slice(0, runtime.pool.capacity);
  const derived = getDerived(runtime);
  for (const value of values) {
    const slot = runtime.pool.freeSlots[--runtime.pool.freeSlotCount]!;
    runtime.pool.generation[slot] = nextGeneration(runtime.pool.generation[slot]!);
    writeProjectileRecord(runtime.pool, slot, value);
    runtime.pool.active[slot] = 1;
    runtime.pool.activeCount += 1;
    derived.slotByProjectileId.set(value.projectileId, slot);
  }
  runtime.pool.highWaterMark = Math.max(historicalHighWaterMark, runtime.pool.activeCount);
  syncDiagnostics(runtime);
}

export function hasActiveProjectileId(runtime: ProjectileRuntimeStateV3, projectileId: string): boolean {
  return getDerived(runtime).slotByProjectileId.has(projectileId);
}

export function findProjectileSlot(runtime: ProjectileRuntimeStateV3, projectileId: string): number {
  return getDerived(runtime).slotByProjectileId.get(projectileId) ?? -1;
}

export function appendBoundedCommitRecord(
  runtime: ProjectileRuntimeStateV3,
  record: ShotCommitRecordV1,
  activeShotIds: ReadonlySet<string>,
): ShotCommitRecordV1[] {
  const normalized = normalizeCommitRecord(record);
  if (!normalized) return runtime.committedShots.map(clone);
  const next = uniqueBy([...runtime.committedShots, normalized], (entry) => entry.shotId).sort(compareCommitRecords);
  while (next.length > MAX_STAGE3_COMMIT_LEDGER_ENTRIES) {
    const removableIndex = next.findIndex((entry) => !activeShotIds.has(entry.shotId));
    next.splice(removableIndex >= 0 ? removableIndex : 0, 1);
  }
  return next;
}

export function getProjectileRuntimeDiagnostics(runtime: ProjectileRuntimeStateV3): Readonly<ProjectileRuntimeDiagnosticsV3> {
  syncDiagnostics(runtime);
  return clone(runtime.diagnostics);
}

export function resetProjectileRuntimeDiagnostics(runtime: ProjectileRuntimeStateV3): void {
  const capacity = runtime.pool.capacity;
  const active = runtime.pool.activeCount;
  const highWater = runtime.pool.highWaterMark;
  runtime.diagnostics = createDiagnostics(capacity);
  runtime.diagnostics.activeCount = active;
  runtime.diagnostics.freeCount = runtime.pool.freeSlotCount;
  runtime.diagnostics.highWaterMark = highWater;
  runtime.diagnostics.accumulatorSeconds = runtime.accumulatorSeconds;
}

export function getActiveShotIds(runtime: ProjectileRuntimeStateV3, output = new Set<string>()): Set<string> {
  output.clear();
  for (let slot = 0; slot < runtime.pool.capacity; slot += 1) {
    if (runtime.pool.active[slot] === 1 && runtime.pool.shotIds[slot]) output.add(runtime.pool.shotIds[slot]!);
  }
  return output;
}

export function syncProjectileRuntimeDiagnostics(runtime: ProjectileRuntimeStateV3): void {
  syncDiagnostics(runtime);
}

function createRuntimeFromSnapshot(snapshot: ProjectileRuntimeSnapshotV3): ProjectileRuntimeStateV3 {
  const runtime = createProjectileRuntimeState(snapshot.capacity);
  runtime.accumulatorSeconds = snapshot.accumulatorSeconds;
  rebuildProjectilePool(runtime, snapshot.activeProjectiles);
  runtime.committedShots = snapshot.committedShots.map(clone);
  runtime.impacts = snapshot.impacts.map(clone);
  runtime.terminations = snapshot.terminations.map(clone);
  runtime.appliedImpactIds = [...snapshot.appliedImpactIds];
  runtime.diagnostics = { ...createDiagnostics(runtime.pool.capacity), ...clone(snapshot.diagnostics) };
  runtime.diagnostics.capacity = runtime.pool.capacity;
  runtime.pool.highWaterMark = Math.max(runtime.diagnostics.highWaterMark, runtime.pool.activeCount);
  syncDiagnostics(runtime);
  return runtime;
}

function migrateReferenceSnapshot(value: ReferenceProjectileRuntimeStateV1): ProjectileRuntimeStateV3 {
  const diagnostics = isRecord(value.diagnostics) ? value.diagnostics : {};
  const active = readArray(value.activeProjectiles).map(normalizeProjectile).filter(isPresent).sort(compareProjectiles);
  return createRuntimeFromSnapshot({
    schemaVersion: PROJECTILE_RUNTIME_SCHEMA_VERSION,
    fixedStepSeconds: STAGE3_PROJECTILE_FIXED_STEP_SECONDS,
    accumulatorSeconds: finiteNonNegative(value.accumulatorSeconds, 0),
    capacity: Math.max(PRODUCTION_PROJECTILE_CAPACITY, active.length),
    activeProjectiles: active,
    committedShots: normalizeCommitRecords(value.committedShots),
    impacts: normalizeImpacts(value.impacts),
    terminations: normalizeTerminations(value.terminations),
    appliedImpactIds: canonicalStrings(readArray(value.appliedImpactIds)).slice(-MAX_STAGE3_APPLIED_IMPACT_IDS),
    diagnostics: normalizeDiagnostics(diagnostics, Math.max(PRODUCTION_PROJECTILE_CAPACITY, active.length)),
  });
}

function normalizeSnapshot(value: Record<string, unknown>): ProjectileRuntimeSnapshotV3 {
  const active = readArray(value.activeProjectiles).map(normalizeProjectile).filter(isPresent);
  const capacity = normalizeCapacity(value.capacity, PRODUCTION_PROJECTILE_CAPACITY, active.length);
  const diagnostics = isRecord(value.diagnostics) ? value.diagnostics : {};
  return {
    schemaVersion: PROJECTILE_RUNTIME_SCHEMA_VERSION,
    fixedStepSeconds: STAGE3_PROJECTILE_FIXED_STEP_SECONDS,
    accumulatorSeconds: finiteNonNegative(value.accumulatorSeconds, 0),
    capacity,
    activeProjectiles: uniqueBy(active, (item) => item.projectileId).sort(compareProjectiles).slice(0, capacity),
    committedShots: normalizeCommitRecords(readArray(value.committedShots)),
    impacts: normalizeImpacts(readArray(value.impacts)),
    terminations: normalizeTerminations(readArray(value.terminations)),
    appliedImpactIds: canonicalStrings(readArray(value.appliedImpactIds)).slice(-MAX_STAGE3_APPLIED_IMPACT_IDS),
    diagnostics: normalizeDiagnostics(diagnostics, capacity),
  };
}

function attachCompatibilityAccessor(runtime: ProjectileRuntimeStateV3): ProjectileRuntimeStateV3 {
  const descriptor = Object.getOwnPropertyDescriptor(runtime, 'activeProjectiles');
  if (descriptor?.get) return runtime;
  Object.defineProperty(runtime, 'activeProjectiles', {
    configurable: false,
    enumerable: false,
    get: () => collectActiveProjectileRecords(runtime),
    set: (value: ProjectileStateV1[]) => rebuildProjectilePool(runtime, Array.isArray(value) ? value : []),
  });
  return runtime;
}

function releaseSlotUnchecked(runtime: ProjectileRuntimeStateV3, slot: number): void {
  const projectileId = runtime.pool.projectileIds[slot];
  if (projectileId) getDerived(runtime).slotByProjectileId.delete(projectileId);
  runtime.pool.active[slot] = 0;
  clearSlotMetadata(runtime.pool, slot);
  runtime.pool.freeSlots[runtime.pool.freeSlotCount++] = slot;
  runtime.pool.activeCount -= 1;
  runtime.diagnostics.releaseCount = increment(runtime.diagnostics.releaseCount);
  syncDiagnostics(runtime);
}

function clearPool(runtime: ProjectileRuntimeStateV3): void {
  const fresh = createProjectilePool(runtime.pool.capacity);
  Object.assign(runtime.pool, fresh);
  derivedByRuntime.set(runtime, { slotByProjectileId: new Map() });
}
