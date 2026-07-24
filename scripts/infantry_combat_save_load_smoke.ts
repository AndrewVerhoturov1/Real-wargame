import assert from 'node:assert/strict';
import { serializePhysicalActionCoordinatorState } from '../src/core/actions/PhysicalActionCoordinatorSerialization';
import { createDefaultCombatCatalogRegistry } from '../src/core/infantry-combat/catalogs';
import {
  equipPrimaryWeaponFromLoadout,
  reconcileInfantryCombatRuntimeAfterLoad,
  requestSingleFireTask,
  serializeInfantryCombatUnitRuntime,
  serializeReferenceProjectileRuntimeState,
  tickInfantryCombatSimulation,
} from '../src/core/infantry-combat/runtime';
import { replaceSceneAtRuntimeResolution } from '../src/core/simulation/ResolutionAwareScene';
import { createInitialState, type SimulationState } from '../src/core/simulation/SimulationState';
import type { UnitModel } from '../src/core/units/UnitModel';
import {
  buildExportedScene,
  normalizeImportedScene,
  restoreImportedInfantryCombatState,
} from '../src/ui/SceneExport';

// Small enough to stop after commitment before the fixed projectile step can resolve a nearby impact.
const ACTIVE_PROJECTILE_PROBE_STEP_SECONDS = 0.001;
const ACTIVE_PROJECTILE_PROBE_LIMIT_SECONDS = 3;

verifyLegacySceneGetsEmptyRuntime();
verifyAllCriticalCheckpointsRoundTripExactly();
verifyMissingCommittedProjectileFailsWithoutRecreation();
verifyRepeatedReconciliationIsIdempotent();
verifyOrphanProjectileIsRemovedDeterministically();

console.log('Infantry combat save/load smoke passed: legacy defaults, exact critical checkpoints, lease restoration, no duplicate ammo/shot/projectile/impact and idempotent reconciliation.');

function verifyLegacySceneGetsEmptyRuntime(): void {
  const scene = normalizeImportedScene({
    map: baseMap(),
    units: [{ id: 'legacy', type: 'infantry_squad', side: 'blue', x: 2, y: 2 }],
    pressureZones: [],
  });
  const state = createInitialState(baseMap(), []);
  replaceSceneAtRuntimeResolution(state, scene.map, scene.units, scene.pressureZones);
  restoreImportedInfantryCombatState(state, scene);
  assert.equal(state.simulationTimeSeconds, 0);
  assert.equal(state.units[0]?.infantryCombatRuntime.primaryWeapon, null);
  assert.deepEqual(state.infantryCombatProjectiles.activeProjectiles, []);
  assert.deepEqual(state.infantryCombatProjectiles.committedShots, []);
}

function verifyAllCriticalCheckpointsRoundTripExactly(): void {
  const checkpoints = [
    ['accepted', 0],
    ['mid-ready', 0.3],
    ['mid-aim', 0.9],
    ['before-commit', 1.699],
    ['after-commit', 1.7],
    ['mid-flight', 1.72],
    ['before-impact', 1.732],
    ['after-impact', 1.734],
    ['mid-recovery', 1.8],
  ] as const;

  for (const [name, checkpointSeconds] of checkpoints) {
    const original = readyScenario(`save-${name}`);
    advance(original.state, checkpointSeconds);
    const loaded = roundTrip(original.state);
    assert.deepEqual(stage3Snapshot(loaded), stage3Snapshot(original.state), `${name}: checkpoint must restore exactly`);

    const continuationSeconds = 2.2 - checkpointSeconds;
    advance(original.state, continuationSeconds);
    advance(loaded, continuationSeconds);
    assert.deepEqual(stage3Snapshot(loaded), stage3Snapshot(original.state), `${name}: continuation must remain exact`);
    const shooter = loaded.units[0]!;
    assert.equal(shooter.infantryCombatRuntime.primaryWeapon?.roundsInWeapon, 4, `${name}: exactly one round`);
    assert.equal(loaded.infantryCombatProjectiles.committedShots.length, 1, `${name}: exactly one commitment`);
    assert.equal(loaded.infantryCombatProjectiles.impacts.length, 1, `${name}: exactly one impact`);
    assert.equal(loaded.infantryCombatProjectiles.activeProjectiles.length, 0, `${name}: projectile terminated`);
  }
}

function verifyMissingCommittedProjectileFailsWithoutRecreation(): void {
  const original = readyScenario('save-missing-projectile');
  advanceUntilCommittedProjectile(original.state);
  const exported = buildExportedScene(original.state);
  assert.equal(exported.infantryCombatRuntime.activeProjectiles.length, 1);
  assert.equal(exported.infantryCombatRuntime.impacts.length, 0);
  assert.equal(exported.infantryCombatRuntime.terminations.length, 0);
  exported.infantryCombatRuntime.activeProjectiles = [];
  const loaded = restoreExport(exported);
  assert.equal(loaded.infantryCombatProjectiles.committedShots.length, 1);
  assert.equal(loaded.infantryCombatProjectiles.activeProjectiles.length, 0);
  assert.equal(loaded.units[0]?.infantryCombatRuntime.primaryWeapon?.roundsInWeapon, 4);
  assert.equal(loaded.units[0]?.infantryCombatRuntime.activeFireTask, null);
  assert.equal(loaded.units[0]?.infantryCombatRuntime.lastFireResult?.phase, 'failed');
  assert.equal(loaded.units[0]?.infantryCombatRuntime.lastFireResult?.resultCode, 'infantry_fire_task_reconciliation_missing_projectile');
  const before = stage3Snapshot(loaded);
  reconcileInfantryCombatRuntimeAfterLoad(loaded);
  assert.deepEqual(stage3Snapshot(loaded), before);
}

function verifyRepeatedReconciliationIsIdempotent(): void {
  const scenario = readyScenario('save-reconcile');
  advanceUntilCommittedProjectile(scenario.state);
  const loaded = roundTrip(scenario.state);
  const before = stage3Snapshot(loaded);
  reconcileInfantryCombatRuntimeAfterLoad(loaded);
  reconcileInfantryCombatRuntimeAfterLoad(loaded);
  assert.deepEqual(stage3Snapshot(loaded), before);
}

function verifyOrphanProjectileIsRemovedDeterministically(): void {
  const scenario = readyScenario('save-orphan');
  advanceUntilCommittedProjectile(scenario.state);
  scenario.state.units[0]!.infantryCombatRuntime.activeFireTask = null;
  scenario.state.infantryCombatProjectiles.committedShots = [];
  const loaded = roundTrip(scenario.state);
  assert.equal(loaded.infantryCombatProjectiles.activeProjectiles.length, 0);
  assert.equal(loaded.infantryCombatProjectiles.terminations[0]?.reason, 'reconciled_orphan');
  const before = stage3Snapshot(loaded);
  reconcileInfantryCombatRuntimeAfterLoad(loaded);
  assert.deepEqual(stage3Snapshot(loaded), before);
}

function roundTrip(state: SimulationState): SimulationState {
  return restoreExport(buildExportedScene(state));
}

function restoreExport(exported: ReturnType<typeof buildExportedScene>): SimulationState {
  const scene = normalizeImportedScene(structuredClone(exported));
  const loaded = createInitialState(baseMap(), []);
  replaceSceneAtRuntimeResolution(loaded, scene.map, scene.units, scene.pressureZones);
  restoreImportedInfantryCombatState(loaded, scene);
  return loaded;
}

function advance(state: SimulationState, deltaSeconds: number): void {
  if (deltaSeconds <= 0) return;
  const intervalStartSeconds = state.simulationTimeSeconds;
  state.simulationTimeSeconds = canonicalSeconds(intervalStartSeconds + deltaSeconds);
  tickInfantryCombatSimulation(state, { intervalStartSeconds, deltaSeconds });
}

function advanceUntilCommittedProjectile(state: SimulationState): void {
  const maximumSteps = Math.ceil(ACTIVE_PROJECTILE_PROBE_LIMIT_SECONDS / ACTIVE_PROJECTILE_PROBE_STEP_SECONDS);
  for (let step = 0; step < maximumSteps; step += 1) {
    advance(state, ACTIVE_PROJECTILE_PROBE_STEP_SECONDS);
    if (
      state.infantryCombatProjectiles.committedShots.length === 1
      && state.infantryCombatProjectiles.activeProjectiles.length === 1
    ) {
      assert.equal(state.infantryCombatProjectiles.impacts.length, 0);
      assert.equal(state.infantryCombatProjectiles.terminations.length, 0);
      return;
    }
  }
  assert.fail(`active committed projectile was not observed within ${ACTIVE_PROJECTILE_PROBE_LIMIT_SECONDS} seconds`);
}

function stage3Snapshot(state: SimulationState): unknown {
  return {
    simulationTimeSeconds: state.simulationTimeSeconds,
    units: [...state.units].sort((a, b) => a.id.localeCompare(b.id)).map((unit) => ({
      id: unit.id,
      runtime: serializeInfantryCombatUnitRuntime(unit.infantryCombatRuntime),
      coordinator: serializePhysicalActionCoordinatorState(unit.behaviorRuntime.physicalActionCoordinator),
    })),
    projectiles: serializeReferenceProjectileRuntimeState(state.infantryCombatProjectiles),
  };
}

function readyScenario(id: string): { state: SimulationState; shooter: UnitModel } {
  const state = createInitialState({
    ...baseMap(),
    objects: [{
      id: 'save-wall',
      kind: 'structure',
      x: 4,
      y: 2,
      widthCells: 0.25,
      heightCells: 1,
      losHeightMeters: 3,
    }],
  }, [{ id, side: 'blue', x: 2, y: 2, type: 'infantry_squad' }]);
  const shooter = state.units[0]!;
  assert.equal(equipPrimaryWeaponFromLoadout(
    shooter,
    createDefaultCombatCatalogRegistry(),
    { definitionId: 'loadout_rifleman', revision: 1 },
  ).status, 'equipped');
  assert.equal(requestSingleFireTask(shooter, {
    owner: { source: 'test', id: `${id}-owner` },
    ownerToken: `${id}-token`,
    target: { xMetres: 30, yMetres: 4, zMetres: 1.35 },
    mode: 'single',
    minimumSolutionQuality: 0.55,
    maximumFriendlyFireRisk: 0,
    requestedSeconds: 0,
  }).status, 'started');
  return { state, shooter };
}

function baseMap() {
  return {
    width: 30,
    height: 10,
    cellSize: 20,
    metersPerCell: 2,
    defaultTerrain: 'field' as const,
    defaultHeight: 0,
  };
}

function canonicalSeconds(value: number): number {
  return Math.round(value * 1_000_000_000_000) / 1_000_000_000_000;
}
