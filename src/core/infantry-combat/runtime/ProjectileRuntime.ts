import {
  DEFAULT_PROJECTILE_EVENT_BUFFER_CAPACITY,
  MAX_STAGE3_APPLIED_IMPACT_IDS,
  MAX_STAGE3_COMMIT_LEDGER_ENTRIES,
  MAX_STAGE3_IMPACT_ENTRIES,
  MAX_STAGE3_TERMINATION_ENTRIES,
  PRODUCTION_PROJECTILE_CAPACITY,
  PROJECTILE_RUNTIME_SCHEMA_VERSION,
  STAGE3_PROJECTILE_FIXED_STEP_SECONDS,
  type AnyProjectileRuntimeSnapshot,
  type ProjectileImpactV1,
  type ProjectilePoolV2,
  type ProjectileRuntimeDiagnosticsV2,
  type ProjectileRuntimeSnapshotV2,
  type ProjectileRuntimeStateV2,
  type ProjectileSlotHandleV2,
  type ProjectileSpawnResult,
  type ProjectileStateV1,
  type ProjectileTerminationV1,
  type ReferenceProjectileRuntimeStateV1,
  type ShotCommitRecordV1,
} from './ProjectileRuntimeTypes';

interface ProjectileRuntimeDerivedState {
  readonly slotByProjectileId: Map<string, number>;
}

const derivedByRuntime = new WeakMap<ProjectileRuntimeStateV2, ProjectileRuntimeDerivedState>();
const MAX_NORMALIZED_CAPACITY = 65_536;

export function createProjectileRuntimeState(
  capacity = PRODUCTION_PROJECTILE_CAPACITY,
): ProjectileRuntimeStateV2 {
  const safeCapacity = normalizeCapacity(capacity, PRODUCTION_PROJECTILE_CAPACITY, 0);
  const runtime = attachCompatibilityAccessor({
    schemaVersion: PROJECTILE_RUNTIME_SCHEMA_VERSION,
    fixedStepSeconds: STAGE3_PROJECTILE_FIXED_STEP_SECONDS,
    accumulatorSeconds: 0,
    pool: createProjectilePool(safeCapacity),
    committedShots: [],
    impacts: [],
    terminations: [],
    appliedImpactIds: [],
    diagnostics: createDiagnostics(safeCapacity),
  } as unknown as ProjectileRuntimeStateV2);
  derivedByRuntime.set(runtime, { slotByProjectileId: new Map() });
  return runtime;
}

export function createProjectilePool(capacity: number): ProjectilePoolV2 {
  const safeCapacity = normalizeCapacity(capacity, PRODUCTION_PROJECTILE_CAPACITY, 0);
  const freeSlots = new Int32Array(safeCapacity);
  for (let index = 0; index < safeCapacity; index += 1) {
    freeSlots[index] = safeCapacity - index - 1;
  }
  return {
    capacity: safeCapacity,
    activeCount: 0,
    highWaterMark: 0,
    active: new Uint8Array(safeCapacity),
    generation: new Uint32Array(safeCapacity),
    projectileIds: Array<string | null>(safeCapacity).fill(null),
    shotIds: Array<string | null>(safeCapacity).fill(null),
    shooterIds: Array<string | null>(safeCapacity).fill(null),
    ammoSnapshots: Array(safeCapacity).fill(null),
    positionX: new Float64Array(safeCapacity),
    positionY: new Float64Array(safeCapacity),
    positionZ: new Float64Array(safeCapacity),
    velocityX: new Float64Array(safeCapacity),
    velocityY: new Float64Array(safeCapacity),
    velocityZ: new Float64Array(safeCapacity),
    ageSeconds: new Float64Array(safeCapacity),
    maximumLifetimeSeconds: new Float64Array(safeCapacity),
    bodyPenetrationBudget: new Float64Array(safeCapacity),
    impactSequence: new Uint32Array(safeCapacity),
    freeSlots,
    freeSlotCount: safeCapacity,
  };
}

export function normalizeProjectileRuntimeState(value: unknown): ProjectileRuntimeStateV2 {
  if (isRuntimeStateV2(value)) {
    return createRuntimeFromSnapshot(serializeProjectileRuntimeState(value));
  }
  if (isRecord(value) && value.schemaVersion === PROJECTILE_RUNTIME_SCHEMA_VERSION) {
    return createRuntimeFromSnapshot(normalizeSnapshotV2(value));
  }
  if (isRecord(value) && value.schemaVersion === 1) {
    return migrateV1Snapshot(value as unknown as ReferenceProjectileRuntimeStateV1);
  }
  return createProjectileRuntimeState();
}

export function serializeProjectileRuntimeState(
  value: ProjectileRuntimeStateV2,
): ProjectileRuntimeSnapshotV2 {
  syncDiagnostics(value);
  return {
    schemaVersion: PROJECTILE_RUNTIME_SCHEMA_VERSION,
    fixedStepSeconds: STAGE3_PROJECTILE_FIXED_STEP_SECONDS,
    accumulatorSeconds: finiteNonNegative(value.accumulatorSeconds, 0),
    capacity: value.pool.capacity,
    activeProjectiles: collectActiveProjectileRecords(value),
    committedShots: value.committedShots.map(clone).sort(compareCommitRecords).slice(-MAX_STAGE3_COMMIT_LEDGER_ENTRIES),
    impacts: value.impacts.map(clone).sort(compareImpacts).slice(-MAX_STAGE3_IMPACT_ENTRIES),
    terminations: value.terminations.map(clone).sort(compareTerminations).slice(-MAX_STAGE3_TERMINATION_ENTRIES),
    appliedImpactIds: canonicalStrings(value.appliedImpactIds).slice(-MAX_STAGE3_APPLIED_IMPACT_IDS),
    diagnostics: clone(value.diagnostics),
  };
}

export function trySpawnProjectile(
  runtime: ProjectileRuntimeStateV2,
  candidate: ProjectileStateV1,
): ProjectileSpawnResult {
  const normalizedCandidate = normalizeProjectile(candidate);
  if (!normalizedCandidate) {
    runtime.diagnostics.invalidSpawnCount = increment(runtime.diagnostics.invalidSpawnCount);
    return { status: 'invalid_candidate', handle: null };
  }
  const derived = getDerived(runtime);
  if (derived.slotByProjectileId.has(normalizedCandidate.projectileId)) {
    runtime.diagnostics.duplicateSpawnCount = increment(runtime.diagnostics.duplicateSpawnCount);
    return { status: 'duplicate_projectile_id', handle: null };
  }
  const pool = runtime.pool;
  if (pool.freeSlotCount <= 0 || pool.activeCount >= pool.capacity) {
    runtime.diagnostics.capRejectionCount = increment(runtime.diagnostics.capRejectionCount);
    return { status: 'capacity_exceeded', handle: null };
  }

  let resolvedSlot = pool.freeSlots[pool.freeSlotCount - 1]!;
  if (!isSlot(resolvedSlot, pool.capacity) || pool.active[resolvedSlot] !== 0) {
    normalizeFreeList(pool, derived.slotByProjectileId);
    if (pool.freeSlotCount <= 0 || pool.activeCount >= pool.capacity) {
      runtime.diagnostics.capRejectionCount = increment(runtime.diagnostics.capRejectionCount);
      return { status: 'capacity_exceeded', handle: null };
    }
    resolvedSlot = pool.freeSlots[pool.freeSlotCount - 1]!;
  }
  pool.freeSlotCount -= 1;
  const nextGeneration = pool.generation[resolvedSlot] === 0xffff_ffff
    ? 1
    : pool.generation[resolvedSlot]! + 1;
  pool.generation[resolvedSlot] = nextGeneration;
  writeProjectileAtSlot(runtime, resolvedSlot, normalizedCandidate);
  pool.active[resolvedSlot] = 1;
  pool.activeCount += 1;
  pool.highWaterMark = Math.max(pool.highWaterMark, pool.activeCount);
  derived.slotByProjectileId.set(normalizedCandidate.projectileId, resolvedSlot);
  runtime.diagnostics.spawnCount = increment(runtime.diagnostics.spawnCount);
  syncDiagnostics(runtime);
  return {
    status: 'spawned',
    handle: { slot: resolvedSlot, generation: nextGeneration, projectileId: normalizedCandidate.projectileId },
  };
}

export function releaseProjectileSlot(
  runtime: ProjectileRuntimeStateV2,
  handle: ProjectileSlotHandleV2,
): boolean {
  const pool = runtime.pool;
  const slot = handle.slot;
  if (
    !isSlot(slot, pool.capacity)
    || pool.active[slot] !== 1
    || pool.generation[slot] !== handle.generation
    || pool.projectileIds[slot] !== handle.projectileId
  ) {
    return false;
  }
  releaseSlotUnchecked(runtime, slot);
  return true;
}

export function releaseProjectileSlotByIndex(runtime: ProjectileRuntimeStateV2, slot: number): boolean {
  if (!isSlot(slot, runtime.pool.capacity) || runtime.pool.active[slot] !== 1) return false;
  releaseSlotUnchecked(runtime, slot);
  return true;
}

export function getProjectileAtSlot(
  runtime: ProjectileRuntimeStateV2,
  slot: number,
): ProjectileStateV1 | null {
  const pool = runtime.pool;
  if (!isSlot(slot, pool.capacity) || pool.active[slot] !== 1) return null;
  const projectileId = pool.projectileIds[slot];
  const shotId = pool.shotIds[slot];
  const shooterId = pool.shooterIds[slot];
  const ammoSnapshot = pool.ammoSnapshots[slot];
  if (!projectileId || !shotId || !shooterId || !ammoSnapshot) return null;
  return {
    schemaVersion: 1,
    projectileId,
    shotId,
    shooterId,
    ammoSnapshot: clone(ammoSnapshot),
    position: {
      xMetres: pool.positionX[slot]!,
      yMetres: pool.positionY[slot]!,
      zMetres: pool.positionZ[slot]!,
    },
    velocityMetresPerSecond: {
      x: pool.velocityX[slot]!,
      y: pool.velocityY[slot]!,
      z: pool.velocityZ[slot]!,
    },
    ageSeconds: pool.ageSeconds[slot]!,
    maximumLifetimeSeconds: pool.maximumLifetimeSeconds[slot]!,
    bodyPenetrationBudget: pool.bodyPenetrationBudget[slot]!,
    impactSequence: pool.impactSequence[slot]!,
  };
}

export function collectActiveProjectileRecords(runtime: ProjectileRuntimeStateV2): ProjectileStateV1[] {
  const result: ProjectileStateV1[] = [];
  for (let slot = 0; slot < runtime.pool.capacity; slot += 1) {
    const record = getProjectileAtSlot(runtime, slot);
    if (record) result.push(record);
  }
  return result.sort(compareProjectiles);
}

export function rebuildProjectilePool(
  runtime: ProjectileRuntimeStateV2,
  candidates: readonly ProjectileStateV1[],
): void {
  const retainedDiagnostics = { ...runtime.diagnostics };
  clearPool(runtime);
  const normalized = candidates
    .map(normalizeProjectile)
    .filter(isPresent)
    .sort(compareProjectiles);
  const seen = new Set<string>();
  for (const candidate of normalized) {
    if (seen.has(candidate.projectileId)) continue;
    seen.add(candidate.projectileId);
    if (runtime.pool.activeCount >= runtime.pool.capacity) break;
    trySpawnProjectile(runtime, candidate);
  }
  runtime.pool.highWaterMark = Math.max(retainedDiagnostics.highWaterMark, runtime.pool.activeCount);
  runtime.diagnostics = {
    ...retainedDiagnostics,
    capacity: runtime.pool.capacity,
    highWaterMark: runtime.pool.highWaterMark,
  };
  syncDiagnostics(runtime);
}

export function getProjectileRuntimeDiagnostics(
  runtime: ProjectileRuntimeStateV2,
): Readonly<ProjectileRuntimeDiagnosticsV2> {
  syncDiagnostics(runtime);
  return clone(runtime.diagnostics);
}

export function resetProjectileRuntimeDiagnostics(runtime: ProjectileRuntimeStateV2): void {
  const retained = createDiagnostics(runtime.pool.capacity);
  retained.poolAllocationCount = runtime.diagnostics.poolAllocationCount;
  retained.scratchAllocationCount = runtime.diagnostics.scratchAllocationCount;
  retained.highWaterMark = runtime.pool.highWaterMark;
  retained.commitLedgerHighWaterMark = runtime.committedShots.length;
  retained.impactLedgerHighWaterMark = runtime.impacts.length;
  retained.terminationLedgerHighWaterMark = runtime.terminations.length;
  retained.appliedImpactLedgerHighWaterMark = runtime.appliedImpactIds.length;
  retained.lastImpactId = runtime.diagnostics.lastImpactId;
  retained.lastTerminationId = runtime.diagnostics.lastTerminationId;
  runtime.diagnostics = retained;
  syncDiagnostics(runtime);
}

export function appendBoundedCommitRecord(
  state: ProjectileRuntimeStateV2,
  record: ShotCommitRecordV1,
  activeShotIds: ReadonlySet<string>,
): ShotCommitRecordV1[] {
  const next = [...state.committedShots.map(clone), clone(record)].sort(compareCommitRecords);
  while (next.length > MAX_STAGE3_COMMIT_LEDGER_ENTRIES) {
    const removableIndex = next.findIndex((item) => !activeShotIds.has(item.shotId));
    next.splice(removableIndex >= 0 ? removableIndex : 0, 1);
  }
  return next;
}

export function hasActiveProjectileId(runtime: ProjectileRuntimeStateV2, projectileId: string): boolean {
  return getDerived(runtime).slotByProjectileId.has(projectileId);
}

export function findProjectileSlot(runtime: ProjectileRuntimeStateV2, projectileId: string): number {
  return getDerived(runtime).slotByProjectileId.get(projectileId) ?? -1;
}

export function writeProjectileAtSlot(
  runtime: ProjectileRuntimeStateV2,
  slot: number,
  projectile: ProjectileStateV1,
): void {
  const pool = runtime.pool;
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
  pool.impactSequence[slot] = projectile.impactSequence;
}

export function getActiveShotIds(runtime: ProjectileRuntimeStateV2, output = new Set<string>()): Set<string> {
  output.clear();
  const pool = runtime.pool;
  for (let slot = 0; slot < pool.capacity; slot += 1) {
    if (pool.active[slot] === 1 && pool.shotIds[slot]) output.add(pool.shotIds[slot]!);
  }
  return output;
}

export function syncProjectileRuntimeDiagnostics(runtime: ProjectileRuntimeStateV2): void {
  syncDiagnostics(runtime);
}

function createRuntimeFromSnapshot(snapshot: ProjectileRuntimeSnapshotV2): ProjectileRuntimeStateV2 {
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

function migrateV1Snapshot(value: ReferenceProjectileRuntimeStateV1): ProjectileRuntimeStateV2 {
  const diagnostics: Record<string, unknown> = isRecord(value.diagnostics) ? value.diagnostics : {};
  return createRuntimeFromSnapshot({
    schemaVersion: PROJECTILE_RUNTIME_SCHEMA_VERSION,
    fixedStepSeconds: STAGE3_PROJECTILE_FIXED_STEP_SECONDS,
    accumulatorSeconds: finiteNonNegative(value.accumulatorSeconds, 0),
    capacity: PRODUCTION_PROJECTILE_CAPACITY,
    activeProjectiles: readArray(value.activeProjectiles).map(normalizeProjectile).filter(isPresent).sort(compareProjectiles),
    committedShots: readArray(value.committedShots).map(normalizeCommitRecord).filter(isPresent).sort(compareCommitRecords).slice(-MAX_STAGE3_COMMIT_LEDGER_ENTRIES),
    impacts: readArray(value.impacts).map(normalizeImpact).filter(isPresent).sort(compareImpacts).slice(-MAX_STAGE3_IMPACT_ENTRIES),
    terminations: readArray(value.terminations).map(normalizeTermination).filter(isPresent).sort(compareTerminations).slice(-MAX_STAGE3_TERMINATION_ENTRIES),
    appliedImpactIds: canonicalStrings(readArray(value.appliedImpactIds)).slice(-MAX_STAGE3_APPLIED_IMPACT_IDS),
    diagnostics: {
      ...createDiagnostics(PRODUCTION_PROJECTILE_CAPACITY),
      fixedSubstepsExecuted: integer(diagnostics.fixedSubstepsExecuted, 0, 0, Number.MAX_SAFE_INTEGER),
      sweptTraceCount: integer(diagnostics.sweptTraceCount, 0, 0, Number.MAX_SAFE_INTEGER),
      unitNarrowCheckCount: integer(diagnostics.unitCheckCount, 0, 0, Number.MAX_SAFE_INTEGER),
      unitCheckCount: integer(diagnostics.unitCheckCount, 0, 0, Number.MAX_SAFE_INTEGER),
      objectCandidateCount: integer(diagnostics.objectCandidateCount, 0, 0, Number.MAX_SAFE_INTEGER),
      capRejectionCount: integer(diagnostics.capRejectionCount, 0, 0, Number.MAX_SAFE_INTEGER),
      lastImpactId: nullableText(diagnostics.lastImpactId),
      lastTerminationId: nullableText(diagnostics.lastTerminationId),
    },
  });
}

function normalizeSnapshotV2(value: Record<string, unknown>): ProjectileRuntimeSnapshotV2 {
  const rawProjectiles = readArray(value.activeProjectiles).map(normalizeProjectile).filter(isPresent);
  const capacity = normalizeCapacity(value.capacity, PRODUCTION_PROJECTILE_CAPACITY, rawProjectiles.length);
  const diagnostics: Record<string, unknown> = isRecord(value.diagnostics) ? value.diagnostics : {};
  return {
    schemaVersion: PROJECTILE_RUNTIME_SCHEMA_VERSION,
    fixedStepSeconds: STAGE3_PROJECTILE_FIXED_STEP_SECONDS,
    accumulatorSeconds: finiteNonNegative(value.accumulatorSeconds, 0),
    capacity,
    activeProjectiles: uniqueBy(rawProjectiles, (item) => item.projectileId).sort(compareProjectiles).slice(0, capacity),
    committedShots: uniqueBy(readArray(value.committedShots).map(normalizeCommitRecord).filter(isPresent), (item) => item.shotId)
      .sort(compareCommitRecords).slice(-MAX_STAGE3_COMMIT_LEDGER_ENTRIES),
    impacts: uniqueBy(readArray(value.impacts).map(normalizeImpact).filter(isPresent), (item) => item.impactId)
      .sort(compareImpacts).slice(-MAX_STAGE3_IMPACT_ENTRIES),
    terminations: uniqueBy(readArray(value.terminations).map(normalizeTermination).filter(isPresent), (item) => item.terminationId)
      .sort(compareTerminations).slice(-MAX_STAGE3_TERMINATION_ENTRIES),
    appliedImpactIds: canonicalStrings(readArray(value.appliedImpactIds)).slice(-MAX_STAGE3_APPLIED_IMPACT_IDS),
    diagnostics: normalizeDiagnostics(diagnostics, capacity),
  };
}

function attachCompatibilityAccessor(runtime: ProjectileRuntimeStateV2): ProjectileRuntimeStateV2 {
  Object.defineProperty(runtime, 'activeProjectiles', {
    configurable: false,
    enumerable: false,
    get: () => collectActiveProjectileRecords(runtime),
    set: (value: ProjectileStateV1[]) => rebuildProjectilePool(runtime, Array.isArray(value) ? value : []),
  });
  return runtime;
}

function releaseSlotUnchecked(runtime: ProjectileRuntimeStateV2, slot: number): void {
  const pool = runtime.pool;
  const projectileId = pool.projectileIds[slot];
  if (projectileId) getDerived(runtime).slotByProjectileId.delete(projectileId);
  pool.active[slot] = 0;
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
  pool.impactSequence[slot] = 0;
  pool.freeSlots[pool.freeSlotCount] = slot;
  pool.freeSlotCount += 1;
  pool.activeCount -= 1;
  runtime.diagnostics.releaseCount = increment(runtime.diagnostics.releaseCount);
  syncDiagnostics(runtime);
}

function clearPool(runtime: ProjectileRuntimeStateV2): void {
  const capacity = runtime.pool.capacity;
  const fresh = createProjectilePool(capacity);
  Object.assign(runtime.pool, fresh);
  derivedByRuntime.set(runtime, { slotByProjectileId: new Map() });
}

function normalizeFreeList(pool: ProjectilePoolV2, lookup: Map<string, number>): void {
  let valid = pool.freeSlotCount >= 0 && pool.freeSlotCount <= pool.capacity;
  if (valid) {
    const seen = new Uint8Array(pool.capacity);
    for (let index = 0; index < pool.freeSlotCount; index += 1) {
      const slot = pool.freeSlots[index]!;
      if (!isSlot(slot, pool.capacity) || pool.active[slot] !== 0 || seen[slot] === 1) {
        valid = false;
        break;
      }
      seen[slot] = 1;
    }
  }
  if (valid && lookup.size === pool.activeCount) return;

  lookup.clear();
  pool.activeCount = 0;
  pool.freeSlotCount = 0;
  for (let slot = pool.capacity - 1; slot >= 0; slot -= 1) {
    if (pool.active[slot] === 1 && pool.projectileIds[slot]) {
      const id = pool.projectileIds[slot]!;
      if (lookup.has(id)) {
        pool.active[slot] = 0;
        clearSlotMetadata(pool, slot);
        pool.freeSlots[pool.freeSlotCount++] = slot;
      } else {
        lookup.set(id, slot);
        pool.activeCount += 1;
      }
    } else {
      pool.active[slot] = 0;
      clearSlotMetadata(pool, slot);
      pool.freeSlots[pool.freeSlotCount++] = slot;
    }
  }
  pool.highWaterMark = Math.max(pool.highWaterMark, pool.activeCount);
}

function clearSlotMetadata(pool: ProjectilePoolV2, slot: number): void {
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
  pool.impactSequence[slot] = 0;
}

function getDerived(runtime: ProjectileRuntimeStateV2): ProjectileRuntimeDerivedState {
  let derived = derivedByRuntime.get(runtime);
  if (!derived) {
    derived = { slotByProjectileId: new Map() };
    derivedByRuntime.set(runtime, derived);
    normalizeFreeList(runtime.pool, derived.slotByProjectileId);
  }
  return derived;
}

function createDiagnostics(capacity: number): ProjectileRuntimeDiagnosticsV2 {
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
    impactBufferCapacity: Math.min(DEFAULT_PROJECTILE_EVENT_BUFFER_CAPACITY, capacity),
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
  };
}

function normalizeDiagnostics(value: Record<string, unknown>, capacity: number): ProjectileRuntimeDiagnosticsV2 {
  const defaults = createDiagnostics(capacity);
  for (const key of Object.keys(defaults) as Array<keyof ProjectileRuntimeDiagnosticsV2>) {
    if (key === 'lastImpactId' || key === 'lastTerminationId') continue;
    const current = value[key];
    if (typeof defaults[key] === 'number') {
      (defaults[key] as number) = finiteNonNegative(current, defaults[key] as number);
    }
  }
  defaults.capacity = capacity;
  defaults.lastImpactId = nullableText(value.lastImpactId);
  defaults.lastTerminationId = nullableText(value.lastTerminationId);
  return defaults;
}

function syncDiagnostics(runtime: ProjectileRuntimeStateV2): void {
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

function isRuntimeStateV2(value: unknown): value is ProjectileRuntimeStateV2 {
  return isRecord(value)
    && value.schemaVersion === PROJECTILE_RUNTIME_SCHEMA_VERSION
    && isRecord(value.pool)
    && value.pool.active instanceof Uint8Array
    && value.pool.positionX instanceof Float64Array;
}

function normalizeProjectile(value: unknown): ProjectileStateV1 | null {
  if (!isRecord(value) || value.schemaVersion !== 1) return null;
  const projectileId = cleanText(value.projectileId, '');
  const shotId = cleanText(value.shotId, '');
  const shooterId = cleanText(value.shooterId, '');
  const position = normalizePoint(value.position);
  const velocity = normalizeDirection(value.velocityMetresPerSecond);
  const ammo = normalizeAmmo(value.ammoSnapshot);
  if (!projectileId || !shotId || !shooterId || !position || !velocity || !ammo) return null;
  const ageSeconds = finiteNonNegative(value.ageSeconds, Number.NaN);
  const maximumLifetimeSeconds = finitePositive(value.maximumLifetimeSeconds, ammo.maximumLifetimeSeconds);
  const bodyPenetrationBudget = finiteNonNegative(value.bodyPenetrationBudget, ammo.bodyPenetrationBudget);
  if (!Number.isFinite(ageSeconds) || !Number.isFinite(maximumLifetimeSeconds) || !Number.isFinite(bodyPenetrationBudget)) return null;
  return {
    schemaVersion: 1,
    projectileId,
    shotId,
    shooterId,
    ammoSnapshot: ammo,
    position,
    velocityMetresPerSecond: velocity,
    ageSeconds,
    maximumLifetimeSeconds,
    bodyPenetrationBudget,
    impactSequence: integer(value.impactSequence, 0, 0, 0xffff_ffff),
  };
}

function normalizeCommitRecord(value: unknown): ShotCommitRecordV1 | null {
  if (!isRecord(value) || value.schemaVersion !== 1) return null;
  const weaponDefinitionRef = normalizeRef(value.weaponDefinitionRef);
  const ammoDefinitionRef = normalizeRef(value.ammoDefinitionRef);
  const muzzlePosition = normalizePoint(value.muzzlePosition);
  const initialVelocity = normalizeDirection(value.initialVelocityMetresPerSecond);
  const shotId = cleanText(value.shotId, '');
  const shooterId = cleanText(value.shooterId, '');
  const fireTaskId = cleanText(value.fireTaskId, '');
  const weaponInstanceId = cleanText(value.weaponInstanceId, '');
  if (!weaponDefinitionRef || !ammoDefinitionRef || !muzzlePosition || !initialVelocity || !shotId || !shooterId || !fireTaskId || !weaponInstanceId) return null;
  return {
    schemaVersion: 1,
    shotId,
    shooterId,
    fireTaskId,
    weaponInstanceId,
    weaponDefinitionRef,
    ammoDefinitionRef,
    committedSimulationSeconds: finiteNonNegative(value.committedSimulationSeconds, 0),
    muzzlePosition,
    initialVelocityMetresPerSecond: initialVelocity,
    roundsBefore: integer(value.roundsBefore, 0, 0, Number.MAX_SAFE_INTEGER),
    roundsAfter: integer(value.roundsAfter, 0, 0, Number.MAX_SAFE_INTEGER),
  };
}

function normalizeImpact(value: unknown): ProjectileImpactV1 | null {
  if (!isRecord(value) || value.schemaVersion !== 1) return null;
  const point = normalizePoint(value.point);
  const hitType = value.hitType ?? value.impactType;
  const impactId = cleanText(value.impactId, '');
  const projectileId = cleanText(value.projectileId, '');
  const shotId = cleanText(value.shotId, '');
  const shooterId = cleanText(value.shooterId, '');
  if (!point || !impactId || !projectileId || !shotId || !shooterId || (hitType !== 'terrain' && hitType !== 'object' && hitType !== 'unit')) return null;
  return {
    schemaVersion: 1,
    impactId,
    projectileId,
    shotId,
    shooterId,
    hitType,
    impactSeconds: finiteNonNegative(value.impactSeconds ?? value.simulationSeconds, 0),
    projectileAgeSeconds: finiteNonNegative(value.projectileAgeSeconds, 0),
    point,
    hitObjectId: nullableText(value.hitObjectId),
    hitUnitId: nullableText(value.hitUnitId),
    hitZone: value.hitZone === 'head' || value.hitZone === 'torso' || value.hitZone === 'limbs' ? value.hitZone : null,
    materialId: nullableText(value.materialId),
    normal: normalizeDirection(value.normal),
    velocityBeforeImpact: normalizeDirection(value.velocityBeforeImpact) ?? { x: 0, y: 0, z: 0 },
  };
}

function normalizeTermination(value: unknown): ProjectileTerminationV1 | null {
  if (!isRecord(value) || value.schemaVersion !== 1) return null;
  const terminationId = cleanText(value.terminationId, '');
  const projectileId = cleanText(value.projectileId, '');
  const shotId = cleanText(value.shotId, '');
  const point = normalizePoint(value.point);
  const reason = value.reason;
  if (!terminationId || !projectileId || !shotId || !point || (reason !== 'impact' && reason !== 'lifetime' && reason !== 'out_of_bounds' && reason !== 'reconciled_orphan')) return null;
  return {
    schemaVersion: 1,
    terminationId,
    projectileId,
    shotId,
    reason,
    simulationSeconds: finiteNonNegative(value.simulationSeconds, 0),
    point,
  };
}

function normalizeAmmo(value: unknown): ProjectileStateV1['ammoSnapshot'] | null {
  if (!isRecord(value) || value.schemaVersion !== 1) return null;
  if (!cleanText(value.ammoDefinitionId, '') || integer(value.revision, 0, 1, Number.MAX_SAFE_INTEGER) <= 0) return null;
  if (value.status !== 'published' && value.status !== 'archived') return null;
  if (finitePositive(value.muzzleVelocityMetersPerSecond, 0) <= 0 || finitePositive(value.maximumLifetimeSeconds, 0) <= 0) return null;
  return clone(value as unknown as ProjectileStateV1['ammoSnapshot']);
}

function normalizeRef(value: unknown): ShotCommitRecordV1['weaponDefinitionRef'] | null {
  if (!isRecord(value)) return null;
  const definitionId = cleanText(value.definitionId, '');
  const revision = integer(value.revision, 0, 1, Number.MAX_SAFE_INTEGER);
  return definitionId && revision > 0 ? { definitionId, revision } : null;
}

function normalizePoint(value: unknown): ProjectileStateV1['position'] | null {
  if (!isRecord(value) || !isFiniteNumber(value.xMetres) || !isFiniteNumber(value.yMetres) || !isFiniteNumber(value.zMetres)) return null;
  return { xMetres: value.xMetres, yMetres: value.yMetres, zMetres: value.zMetres };
}

function normalizeDirection(value: unknown): ProjectileStateV1['velocityMetresPerSecond'] | null {
  if (!isRecord(value) || !isFiniteNumber(value.x) || !isFiniteNumber(value.y) || !isFiniteNumber(value.z)) return null;
  return { x: value.x, y: value.y, z: value.z };
}

function normalizeCapacity(value: unknown, fallback: number, minimumRequired: number): number {
  const numeric = integer(value, fallback, 1, MAX_NORMALIZED_CAPACITY);
  return Math.max(numeric, minimumRequired, 1);
}

function compareProjectiles(left: ProjectileStateV1, right: ProjectileStateV1): number {
  return compareText(left.projectileId, right.projectileId);
}

function compareCommitRecords(left: ShotCommitRecordV1, right: ShotCommitRecordV1): number {
  return left.committedSimulationSeconds - right.committedSimulationSeconds || compareText(left.shotId, right.shotId);
}

function compareImpacts(left: ProjectileImpactV1, right: ProjectileImpactV1): number {
  return left.impactSeconds - right.impactSeconds || compareText(left.impactId, right.impactId);
}

function compareTerminations(left: ProjectileTerminationV1, right: ProjectileTerminationV1): number {
  return left.simulationSeconds - right.simulationSeconds || compareText(left.terminationId, right.terminationId);
}

function uniqueBy<T>(values: readonly T[], key: (value: T) => string): T[] {
  const result: T[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const identity = key(value);
    if (seen.has(identity)) continue;
    seen.add(identity);
    result.push(clone(value));
  }
  return result;
}

function canonicalStrings(values: unknown[]): string[] {
  return [...new Set(values.map((value) => cleanText(value, '')).filter(Boolean))].sort(compareText);
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function isPresent<T>(value: T | null): value is T {
  return value !== null;
}

function finitePositive(value: unknown, fallback: number): number {
  const numeric = isFiniteNumber(value) ? value : fallback;
  return numeric > 0 ? numeric : fallback;
}

function finiteNonNegative(value: unknown, fallback: number): number {
  const numeric = isFiniteNumber(value) ? value : fallback;
  return Number.isFinite(numeric) ? Math.max(0, numeric) : numeric;
}

function integer(value: unknown, fallback: number, minimum: number, maximum: number): number {
  const numeric = isFiniteNumber(value) ? Math.round(value) : fallback;
  return Math.max(minimum, Math.min(maximum, numeric));
}

function cleanText(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function nullableText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isSlot(slot: number, capacity: number): boolean {
  return Number.isInteger(slot) && slot >= 0 && slot < capacity;
}

function increment(value: number): number {
  return Math.min(Number.MAX_SAFE_INTEGER, value + 1);
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
