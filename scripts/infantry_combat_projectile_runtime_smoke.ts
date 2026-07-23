import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  createBallisticTraceContext,
  createBallisticTraceScratch,
  createEmptyBallisticRayResult,
  traceBallisticRay,
  traceBallisticRayPrepared,
} from '../src/core/combat/BallisticTrace';
import {
  createCombatUnitSpatialQueryScratch,
  queryUnitsNearBallisticSegment,
  queryUnitsNearBallisticSegmentInto,
} from '../src/core/combat/CombatUnitSpatialIndex';
import { createDefaultCombatCatalogRegistry } from '../src/core/infantry-combat/catalogs';
import {
  PROJECTILE_RUNTIME_SCHEMA_VERSION,
  REFERENCE_PROJECTILE_RUNTIME_SCHEMA_VERSION,
  STAGE3_PROJECTILE_FIXED_STEP_SECONDS,
  createProjectileRuntimeState,
  getProjectileAtSlot,
  getProjectileRuntimeDiagnostics,
  normalizeProjectileRuntimeState,
  reconcileInfantryCombatRuntimeAfterLoad,
  releaseProjectileSlot,
  serializeProjectileRuntimeState,
  tickProjectileRuntime,
  trySpawnProjectile,
  type ProjectileRuntimeSnapshotV2,
  type ProjectileStateV1,
  type ReferenceProjectileRuntimeStateV1,
} from '../src/core/infantry-combat/runtime';
import { markMapObjectsDirty } from '../src/core/map/MapRuntimeState';
import {
  createMapObjectSpatialQueryScratch,
  getMapObjectSpatialIndex,
} from '../src/core/spatial/MapObjectSpatialIndex';
import { createInitialState, type SimulationState } from '../src/core/simulation/SimulationState';
import {
  createStage3ReferenceHarnessRuntime,
  tickStage3ReferenceHarness,
} from './infantry_combat_projectile_reference_harness';

const ammo = createDefaultCombatCatalogRegistry().resolveAmmo({ definitionId: 'ammo_762x54r_ball', revision: 1 });

verifyPoolContract();
verifyV1MigrationAndCanonicalV2();
verifyPreparedSpatialAndTraceParity();
verifyPhysicsEquivalence();
verifySlotAndInsertionOrderDeterminism();
verifyOuterDeltaAndSaveLoadDeterminism();
verifyEventPipelineAndExactlyOnce();
verifySpatialInvalidationAndCandidateBounds();
verifyStressAndIdleFastPath();
verifyReconciliationIsIdempotent();
verifyHotPathSourceContract();

console.log('Infantry combat projectile runtime smoke passed: pooled SoA, V1 migration, canonical V2, physics parity, deterministic batching, reusable spatial scratch, exactly-once events, save/load and 2000-projectile stress.');

function verifyPoolContract(): void {
  const runtime = createProjectileRuntimeState(2);
  assert.equal(runtime.pool.activeCount, 0);
  assert.equal(runtime.pool.freeSlotCount, 2);
  assert.equal(runtime.pool.positionX instanceof Float64Array, true);
  assert.equal(runtime.pool.active instanceof Uint8Array, true);

  const first = trySpawnProjectile(runtime, projectile('pool-a'));
  assert.equal(first.status, 'spawned');
  assert.ok(first.handle);
  assert.equal(runtime.pool.activeCount, 1);
  assert.equal(getProjectileAtSlot(runtime, first.handle.slot)?.projectileId, 'pool-a:projectile');
  assert.equal(trySpawnProjectile(runtime, projectile('pool-a')).status, 'duplicate_projectile_id');

  const stale = first.handle;
  assert.equal(releaseProjectileSlot(runtime, stale), true);
  assert.equal(runtime.pool.activeCount, 0);
  assert.equal(getProjectileAtSlot(runtime, stale.slot), null);
  const reused = trySpawnProjectile(runtime, projectile('pool-b'));
  assert.equal(reused.status, 'spawned');
  assert.ok(reused.handle);
  assert.equal(reused.handle.slot, stale.slot);
  assert.notEqual(reused.handle.generation, stale.generation);
  assert.equal(releaseProjectileSlot(runtime, stale), false);
  assert.equal(runtime.pool.activeCount, 1);
  assert.equal(trySpawnProjectile(runtime, projectile('pool-c')).status, 'spawned');

  const beforeFull = physicalSnapshot(runtime);
  assert.equal(trySpawnProjectile(runtime, projectile('pool-d')).status, 'capacity_exceeded');
  assert.deepEqual(physicalSnapshot(runtime), beforeFull);
  assert.equal(trySpawnProjectile(runtime, { ...projectile('invalid'), ageSeconds: Number.NaN }).status, 'invalid_candidate');
  assert.equal(runtime.pool.highWaterMark, 2);
  assert.equal(runtime.pool.capacity, 2);
  assert.equal(runtime.pool.freeSlotCount, 0);

  runtime.pool.freeSlotCount = 2;
  runtime.pool.freeSlots[0] = reused.handle.slot;
  runtime.pool.freeSlots[1] = reused.handle.slot;
  const corruptBefore = serializeProjectileRuntimeState(runtime).activeProjectiles;
  assert.equal(trySpawnProjectile(runtime, projectile('pool-corrupt')).status, 'capacity_exceeded');
  assert.deepEqual(serializeProjectileRuntimeState(runtime).activeProjectiles, corruptBefore);

  const recoverable = createProjectileRuntimeState(3);
  const occupied = trySpawnProjectile(recoverable, projectile('pool-recover-a'));
  assert.equal(occupied.status, 'spawned');
  assert.ok(occupied.handle);
  recoverable.pool.freeSlotCount = 2;
  recoverable.pool.freeSlots[0] = occupied.handle.slot;
  recoverable.pool.freeSlots[1] = occupied.handle.slot;
  const recoveredSpawn = trySpawnProjectile(recoverable, projectile('pool-recover-b'));
  assert.equal(recoveredSpawn.status, 'spawned');
  assert.equal(recoverable.pool.activeCount, 2);
  assert.equal(recoverable.pool.freeSlotCount, 1);
  assert.deepEqual(
    serializeProjectileRuntimeState(recoverable).activeProjectiles.map((entry) => entry.projectileId),
    ['pool-recover-a:projectile', 'pool-recover-b:projectile'],
  );
}

function verifyV1MigrationAndCanonicalV2(): void {
  const legacy: ReferenceProjectileRuntimeStateV1 = {
    schemaVersion: REFERENCE_PROJECTILE_RUNTIME_SCHEMA_VERSION,
    fixedStepSeconds: STAGE3_PROJECTILE_FIXED_STEP_SECONDS,
    accumulatorSeconds: 0.017,
    activeProjectiles: [projectile('legacy-b'), projectile('legacy-a', { ageSeconds: 0.5 })],
    committedShots: [],
    impacts: [],
    terminations: [],
    appliedImpactIds: [],
    diagnostics: {
      fixedSubstepsExecuted: 7,
      sweptTraceCount: 9,
      unitCheckCount: 3,
      objectCandidateCount: 4,
      capRejectionCount: 0,
      lastImpactId: null,
      lastTerminationId: null,
    },
  };
  const migrated = normalizeProjectileRuntimeState(legacy);
  const snapshot = serializeProjectileRuntimeState(migrated);
  assert.equal(snapshot.schemaVersion, PROJECTILE_RUNTIME_SCHEMA_VERSION);
  assert.equal(snapshot.accumulatorSeconds, legacy.accumulatorSeconds);
  assert.deepEqual(snapshot.activeProjectiles, [...legacy.activeProjectiles].sort(compareProjectiles));
  assert.equal(snapshot.diagnostics.fixedSubstepsExecuted, 7);
  assert.equal(snapshot.diagnostics.unitNarrowCheckCount, 3);

  const first = createProjectileRuntimeState(8);
  const second = createProjectileRuntimeState(8);
  for (const item of [projectile('layout-a'), projectile('layout-b'), projectile('layout-c')]) {
    assert.equal(trySpawnProjectile(first, item).status, 'spawned');
  }
  const filler = trySpawnProjectile(second, projectile('layout-filler'));
  assert.equal(filler.status, 'spawned');
  assert.ok(filler.handle);
  assert.equal(releaseProjectileSlot(second, filler.handle), true);
  for (const item of [projectile('layout-c'), projectile('layout-a'), projectile('layout-b')]) {
    assert.equal(trySpawnProjectile(second, item).status, 'spawned');
  }
  assert.deepEqual(physicalSnapshot(second), physicalSnapshot(first));
  const roundTrip = normalizeProjectileRuntimeState(serializeProjectileRuntimeState(first));
  assert.deepEqual(physicalSnapshot(roundTrip), physicalSnapshot(first));
  assert.equal(roundTrip.pool.activeCount, 3);
  assert.equal(roundTrip.pool.freeSlotCount, 5);
}

function verifyPreparedSpatialAndTraceParity(): void {
  const state = makeState([
    unit('trace-shooter', 'blue', 2, 2),
    unit('trace-z', 'red', 8, 2),
    unit('trace-a', 'red', 6, 2),
  ], [wall('trace-wall', 10, 2)]);
  const oldUnits = queryUnitsNearBallisticSegment(state, { x: 2, y: 2 }, { x: 12, y: 2 }, 2);
  const output = [] as SimulationState['units'];
  const scratch = createCombatUnitSpatialQueryScratch();
  const firstCount = queryUnitsNearBallisticSegmentInto(state, { x: 2, y: 2 }, { x: 12, y: 2 }, 2, output, scratch);
  const firstIdentity = output;
  const secondCount = queryUnitsNearBallisticSegmentInto(state, { x: 2, y: 2 }, { x: 12, y: 2 }, 2, output, scratch);
  assert.equal(firstCount, secondCount);
  assert.equal(output, firstIdentity);
  assert.deepEqual(output.map((candidate) => candidate.id), oldUnits.map((candidate) => candidate.id));
  assert.deepEqual(output.map((candidate) => candidate.id), [...output.map((candidate) => candidate.id)].sort());

  const objectIndex = getMapObjectSpatialIndex(state.map);
  const objectOutput: SimulationState['map']['objects'] = [];
  const objectScratch = createMapObjectSpatialQueryScratch();
  objectIndex.querySegmentInto({ x: 0, y: 2 }, { x: 15, y: 2 }, 0, objectOutput, objectScratch);
  assert.deepEqual(objectOutput.map((object) => object.id), ['trace-wall']);

  const context = createBallisticTraceContext(state.map, oldUnits);
  const input = {
    shotId: 'trace-shot',
    shooterId: 'trace-shooter',
    origin: { xMetres: 4, yMetres: 5, zMetres: 1.2 },
    direction: { x: 1, y: 0, z: 0 },
    maximumDistanceMetres: 30,
    muzzleVelocityMetresPerSecond: 100,
  };
  const legacy = traceBallisticRay(context, input);
  const prepared = traceBallisticRayPrepared(
    context,
    input,
    createBallisticTraceScratch(),
    createEmptyBallisticRayResult(),
    oldUnits,
  );
  assert.deepEqual(prepared, legacy);
}

function verifyPhysicsEquivalence(): void {
  const cases: Array<{ name: string; state: SimulationState; source: ProjectileStateV1 }> = [
    { name: 'clear-gravity', state: makeState([], []), source: projectile('equiv-clear', { velocityMetresPerSecond: { x: 30, y: 0, z: 3 } }) },
    { name: 'terrain', state: makeState([], []), source: projectile('equiv-terrain', { position: { xMetres: 4, yMetres: 4, zMetres: 0.2 }, velocityMetresPerSecond: { x: 15, y: 0, z: -10 } }) },
    { name: 'object', state: makeState([], [wall('equiv-wall', 4, 2)]), source: projectile('equiv-object', { position: { xMetres: 4, yMetres: 5, zMetres: 1.2 }, velocityMetresPerSecond: { x: 100, y: 0, z: 0 } }) },
    { name: 'unit', state: makeState([unit('equiv-shooter', 'blue', 2, 2), unit('equiv-target', 'red', 5, 2)], []), source: projectile('equiv-unit', { shooterId: 'equiv-shooter', position: { xMetres: 5.8, yMetres: 5, zMetres: 1.2 }, velocityMetresPerSecond: { x: 100, y: 0, z: 0 } }) },
    { name: 'lifetime', state: makeState([], []), source: projectile('equiv-life', { ageSeconds: 0.99, maximumLifetimeSeconds: 1 }) },
    { name: 'bounds', state: makeState([], []), source: projectile('equiv-bounds', { position: { xMetres: 79.5, yMetres: 5, zMetres: 2 }, velocityMetresPerSecond: { x: 100, y: 0, z: 0 } }) },
  ];
  for (const fixture of cases) {
    const reference = createStage3ReferenceHarnessRuntime([fixture.source]);
    const production = createProjectileRuntimeState(8);
    fixture.state.infantryCombatProjectiles = production;
    assert.equal(trySpawnProjectile(production, fixture.source).status, 'spawned');
    tickStage3ReferenceHarness(fixture.state, reference, 0, STAGE3_PROJECTILE_FIXED_STEP_SECONDS);
    tickProjectileRuntime(fixture.state, { intervalStartSeconds: 0, deltaSeconds: STAGE3_PROJECTILE_FIXED_STEP_SECONDS });
    assert.deepEqual(productionPhysics(production), referencePhysics(reference), `${fixture.name}: Stage 3/4 physical result`);
  }
}

function verifySlotAndInsertionOrderDeterminism(): void {
  const stateA = makeState([], []);
  const stateB = makeState([], []);
  const a = createProjectileRuntimeState(16);
  const b = createProjectileRuntimeState(16);
  stateA.infantryCombatProjectiles = a;
  stateB.infantryCombatProjectiles = b;
  const values = Array.from({ length: 8 }, (_, index) => projectile(`order-${index}`, {
    position: { xMetres: 4 + index, yMetres: 8 + index * 0.1, zMetres: 4 },
    velocityMetresPerSecond: { x: 20 + index, y: 0, z: index * 0.1 },
  }));
  for (const value of values) assert.equal(trySpawnProjectile(a, value).status, 'spawned');
  const filler = trySpawnProjectile(b, projectile('order-filler'));
  assert.equal(filler.status, 'spawned');
  assert.ok(filler.handle);
  assert.equal(releaseProjectileSlot(b, filler.handle), true);
  for (const value of [...values].reverse()) assert.equal(trySpawnProjectile(b, value).status, 'spawned');
  tickProjectileRuntime(stateA, { intervalStartSeconds: 0, deltaSeconds: STAGE3_PROJECTILE_FIXED_STEP_SECONDS });
  tickProjectileRuntime(stateB, { intervalStartSeconds: 0, deltaSeconds: STAGE3_PROJECTILE_FIXED_STEP_SECONDS });
  assert.deepEqual(productionPhysics(b), productionPhysics(a));
}

function verifyOuterDeltaAndSaveLoadDeterminism(): void {
  const coarseState = makeState([], []);
  const fineState = makeState([], []);
  coarseState.infantryCombatProjectiles = createProjectileRuntimeState(16);
  fineState.infantryCombatProjectiles = createProjectileRuntimeState(16);
  const source = projectile('partition', { position: { xMetres: 4, yMetres: 4, zMetres: 10 }, velocityMetresPerSecond: { x: 15, y: 1, z: 2 } });
  trySpawnProjectile(coarseState.infantryCombatProjectiles, source);
  trySpawnProjectile(fineState.infantryCombatProjectiles, source);
  tickProjectileRuntime(coarseState, { intervalStartSeconds: 0, deltaSeconds: 3 * STAGE3_PROJECTILE_FIXED_STEP_SECONDS });
  for (let index = 0; index < 3; index += 1) {
    tickProjectileRuntime(fineState, { intervalStartSeconds: index * STAGE3_PROJECTILE_FIXED_STEP_SECONDS, deltaSeconds: STAGE3_PROJECTILE_FIXED_STEP_SECONDS });
  }
  assert.deepEqual(productionPhysics(fineState.infantryCombatProjectiles), productionPhysics(coarseState.infantryCombatProjectiles));

  const savedState = makeState([], []);
  savedState.infantryCombatProjectiles = createProjectileRuntimeState(16);
  trySpawnProjectile(savedState.infantryCombatProjectiles, projectile('save-mid', { velocityMetresPerSecond: { x: 20, y: 0, z: 1 } }));
  tickProjectileRuntime(savedState, { intervalStartSeconds: 0, deltaSeconds: STAGE3_PROJECTILE_FIXED_STEP_SECONDS * 1.5 });
  const restored = normalizeProjectileRuntimeState(serializeProjectileRuntimeState(savedState.infantryCombatProjectiles));
  const restoredState = makeState([], []);
  restoredState.infantryCombatProjectiles = restored;
  tickProjectileRuntime(savedState, { intervalStartSeconds: STAGE3_PROJECTILE_FIXED_STEP_SECONDS * 1.5, deltaSeconds: STAGE3_PROJECTILE_FIXED_STEP_SECONDS * 1.5 });
  tickProjectileRuntime(restoredState, { intervalStartSeconds: STAGE3_PROJECTILE_FIXED_STEP_SECONDS * 1.5, deltaSeconds: STAGE3_PROJECTILE_FIXED_STEP_SECONDS * 1.5 });
  assert.deepEqual(productionPhysics(restored), productionPhysics(savedState.infantryCombatProjectiles));
}

function verifyEventPipelineAndExactlyOnce(): void {
  const state = makeState([], [wall('events-wall', 4, 2)]);
  const runtime = createProjectileRuntimeState(8);
  state.infantryCombatProjectiles = runtime;
  for (const id of ['event-z', 'event-a', 'event-m']) {
    trySpawnProjectile(runtime, projectile(id, { position: { xMetres: 4, yMetres: 5, zMetres: 1.2 }, velocityMetresPerSecond: { x: 300, y: 0, z: 0 } }));
  }
  const result = tickProjectileRuntime(state, { intervalStartSeconds: 0, deltaSeconds: STAGE3_PROJECTILE_FIXED_STEP_SECONDS });
  assert.deepEqual(result.createdImpactIds, [...result.createdImpactIds].sort());
  assert.deepEqual(result.createdTerminationIds, [...result.createdTerminationIds].sort());
  assert.equal(runtime.impacts.length, 3);
  assert.equal(runtime.terminations.length, 3);
  assert.equal(runtime.pool.activeCount, 0);
  assert.equal(runtime.diagnostics.impactBufferHighWaterMark, 3);
  assert.equal(runtime.diagnostics.terminationBufferHighWaterMark, 3);
  assert.equal(runtime.diagnostics.eventOverflowCount, 0);
  const after = physicalSnapshot(runtime);
  tickProjectileRuntime(state, { intervalStartSeconds: STAGE3_PROJECTILE_FIXED_STEP_SECONDS, deltaSeconds: STAGE3_PROJECTILE_FIXED_STEP_SECONDS });
  assert.deepEqual(physicalSnapshot(runtime), after);
}

function verifySpatialInvalidationAndCandidateBounds(): void {
  const extra = Array.from({ length: 198 }, (_, index) => unit(
    `spatial-${String(index).padStart(3, '0')}`,
    index % 2 ? 'blue' : 'red',
    20 + (index % 20),
    20 + Math.floor(index / 20),
  ));
  const state = makeState([unit('spatial-shooter', 'blue', 2, 2), unit('spatial-target', 'red', 5, 2), ...extra], [wall('spatial-object', 5, 2)]);
  const output: SimulationState['units'] = [];
  const scratch = createCombatUnitSpatialQueryScratch();
  queryUnitsNearBallisticSegmentInto(state, { x: 2, y: 2 }, { x: 8, y: 2 }, 2, output, scratch);
  assert.ok(output.length < state.units.length / 4);
  const target = state.units.find((candidate) => candidate.id === 'spatial-target')!;
  target.position.x = 35;
  target.position.y = 35;
  queryUnitsNearBallisticSegmentInto(state, { x: 2, y: 2 }, { x: 8, y: 2 }, 2, output, scratch);
  assert.equal(output.some((candidate) => candidate.id === target.id), false);

  const objectIndexBefore = getMapObjectSpatialIndex(state.map);
  state.map.objects[0]!.x = 30;
  markMapObjectsDirty(state.map);
  const objectIndexAfter = getMapObjectSpatialIndex(state.map);
  assert.notEqual(objectIndexAfter, objectIndexBefore);
}

function verifyStressAndIdleFastPath(): void {
  const idle = makeState(Array.from({ length: 200 }, (_, index) => unit(`idle-${index}`, index < 100 ? 'blue' : 'red', index % 20, Math.floor(index / 20))), []);
  idle.infantryCombatProjectiles = createProjectileRuntimeState(4096);
  const idleBefore = getProjectileRuntimeDiagnostics(idle.infantryCombatProjectiles);
  for (let index = 0; index < 300; index += 1) {
    tickProjectileRuntime(idle, { intervalStartSeconds: index * STAGE3_PROJECTILE_FIXED_STEP_SECONDS, deltaSeconds: STAGE3_PROJECTILE_FIXED_STEP_SECONDS });
  }
  const idleAfter = getProjectileRuntimeDiagnostics(idle.infantryCombatProjectiles);
  assert.equal(idleAfter.scratchAllocationCount, idleBefore.scratchAllocationCount);
  assert.equal(idleAfter.unitBroadPhaseQueryCount, 0);
  assert.equal(idleAfter.objectBroadPhaseQueryCount, 0);

  for (const activeCount of [200, 1000, 2000]) {
    const state = makeState([], []);
    const runtime = createProjectileRuntimeState(4096);
    state.infantryCombatProjectiles = runtime;
    for (let index = 0; index < activeCount; index += 1) {
      const result = trySpawnProjectile(runtime, projectile(`stress-${activeCount}-${index}`, {
        position: { xMetres: 4 + (index % 100) * 0.2, yMetres: 20 + Math.floor(index / 100) * 0.2, zMetres: 30 },
        velocityMetresPerSecond: { x: 10 + (index % 7), y: 0, z: 0 },
        maximumLifetimeSeconds: 20,
      }));
      assert.equal(result.status, 'spawned');
    }
    tickProjectileRuntime(state, { intervalStartSeconds: 0, deltaSeconds: STAGE3_PROJECTILE_FIXED_STEP_SECONDS });
    const diagnostics = getProjectileRuntimeDiagnostics(runtime);
    assert.equal(diagnostics.highWaterMark, activeCount);
    assert.equal(diagnostics.capRejectionCount, 0);
    assert.equal(diagnostics.poolResizeCount, 0);
    assert.equal(diagnostics.eventOverflowCount, 0);
    assert.equal(diagnostics.fullScanFallbackCount, 0);
    assert.equal(runtime.pool.activeCount, activeCount);

    if (activeCount === 2000) {
      let sequence = activeCount;
      for (let step = 1; step < 300; step += 1) {
        tickProjectileRuntime(state, {
          intervalStartSeconds: step * STAGE3_PROJECTILE_FIXED_STEP_SECONDS,
          deltaSeconds: STAGE3_PROJECTILE_FIXED_STEP_SECONDS,
        });
        while (runtime.pool.activeCount < activeCount) {
          const index = sequence;
          sequence += 1;
          const result = trySpawnProjectile(runtime, projectile(`stress-replenish-${index}`, {
            position: { xMetres: 4 + (index % 100) * 0.2, yMetres: 20 + Math.floor(index / 100 % 20) * 0.2, zMetres: 30 },
            velocityMetresPerSecond: { x: 10 + (index % 7), y: 0, z: 0 },
            maximumLifetimeSeconds: 20,
          }));
          assert.equal(result.status, 'spawned');
        }
      }
      const sustained = getProjectileRuntimeDiagnostics(runtime);
      assert.equal(runtime.pool.activeCount, activeCount);
      assert.ok(sustained.spawnCount > activeCount);
      assert.ok(sustained.releaseCount > 0);
      assert.equal(sustained.spawnCount - sustained.releaseCount, activeCount);
      assert.equal(sustained.releaseCount, runtime.terminations.length);
      assert.equal(sustained.capRejectionCount, 0);
      assert.equal(sustained.poolResizeCount, 0);
      assert.equal(sustained.eventOverflowCount, 0);
      assert.equal(sustained.fullScanFallbackCount, 0);
    }
  }
}

function verifyReconciliationIsIdempotent(): void {
  const state = makeState([], []);
  state.infantryCombatProjectiles = createProjectileRuntimeState(16);
  trySpawnProjectile(state.infantryCombatProjectiles, projectile('orphan'));
  reconcileInfantryCombatRuntimeAfterLoad(state);
  const first = serializeProjectileRuntimeState(state.infantryCombatProjectiles);
  reconcileInfantryCombatRuntimeAfterLoad(state);
  const second = serializeProjectileRuntimeState(state.infantryCombatProjectiles);
  assert.deepEqual(second, first);
  assert.equal(second.activeProjectiles.length, 0);
  assert.equal(second.terminations[0]?.reason, 'reconciled_orphan');
}

function verifyHotPathSourceContract(): void {
  const source = readFileSync(path.join(process.cwd(), 'src/core/infantry-combat/runtime/ProjectileStepper.ts'), 'utf8');
  for (const forbidden of [
    'structuredClone(projectile)',
    '[...activeProjectiles]',
    'survivors = []',
    'new Set()',
    'activeProjectiles.sort(',
    'JSON.stringify(',
    ['Date', 'now'].join('.'),
    ['performance', 'now'].join('.'),
    ['Math', 'random'].join('.'),
    ['random', 'UUID'].join(''),
  ]) {
    assert.equal(source.includes(forbidden), false, `production projectile stepper must not contain ${forbidden}`);
  }
  assert.equal(source.includes('queryUnitsNearBallisticSegmentInto'), true);
  assert.equal(source.includes('traceBallisticRayPrepared'), true);
  assert.equal(source.includes('getMapObjectSpatialIndex'), true);
}

function makeState(
  units: Array<Record<string, unknown>>,
  objects: Array<Record<string, unknown>>,
): SimulationState {
  return createInitialState({
    width: 40,
    height: 40,
    cellSize: 20,
    metersPerCell: 2,
    defaultTerrain: 'field',
    defaultHeight: 0,
    objects: objects as never,
  }, units.map((value) => ({ type: 'infantry_squad', ...value })) as never);
}

function unit(id: string, side: 'blue' | 'red', x: number, y: number): Record<string, unknown> {
  return { id, side, x, y };
}

function wall(id: string, x: number, y: number): Record<string, unknown> {
  return { id, kind: 'structure', x, y, widthCells: 0.4, heightCells: 1, losHeightMeters: 3 };
}

function projectile(shotId: string, overrides: Partial<ProjectileStateV1> = {}): ProjectileStateV1 {
  return {
    schemaVersion: 1,
    projectileId: `${shotId}:projectile`,
    shotId,
    shooterId: 'test-shooter',
    ammoSnapshot: structuredClone(ammo),
    position: { xMetres: 2, yMetres: 2, zMetres: 10 },
    velocityMetresPerSecond: { x: 30, y: 0, z: 0 },
    ageSeconds: 0,
    maximumLifetimeSeconds: 6,
    bodyPenetrationBudget: 1,
    impactSequence: 0,
    ...overrides,
  };
}

function physicalSnapshot(runtime: ReturnType<typeof createProjectileRuntimeState>): Omit<ProjectileRuntimeSnapshotV2, 'diagnostics'> {
  const { diagnostics: _diagnostics, ...snapshot } = serializeProjectileRuntimeState(runtime);
  return snapshot;
}

function productionPhysics(runtime: ReturnType<typeof createProjectileRuntimeState>): unknown {
  const snapshot = serializeProjectileRuntimeState(runtime);
  return {
    accumulatorSeconds: snapshot.accumulatorSeconds,
    activeProjectiles: snapshot.activeProjectiles,
    impacts: snapshot.impacts,
    terminations: snapshot.terminations,
    appliedImpactIds: snapshot.appliedImpactIds,
  };
}

function referencePhysics(runtime: ReturnType<typeof createStage3ReferenceHarnessRuntime>): unknown {
  return {
    accumulatorSeconds: runtime.accumulatorSeconds,
    activeProjectiles: runtime.activeProjectiles,
    impacts: runtime.impacts,
    terminations: runtime.terminations,
    appliedImpactIds: runtime.appliedImpactIds,
  };
}

function compareProjectiles(left: ProjectileStateV1, right: ProjectileStateV1): number {
  return left.projectileId < right.projectileId ? -1 : left.projectileId > right.projectileId ? 1 : 0;
}
