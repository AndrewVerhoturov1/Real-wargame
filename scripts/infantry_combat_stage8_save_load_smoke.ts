import assert from 'node:assert/strict';
import { createDefaultCombatCatalogRegistry } from '../src/core/infantry-combat/catalogs';
import {
  addSuppressionEvent,
  equipPrimaryWeaponFromLoadout,
  normalizeInfantryCombatUnitRuntime,
  normalizeProjectileRuntimeState,
  reconcileInfantryCombatRuntimeAfterLoad,
  requestFireTask,
  serializeInfantryCombatUnitRuntime,
  serializeProjectileRuntimeState,
  tickInfantryCombatSimulation,
  type SuppressionEventV1,
} from '../src/core/infantry-combat/runtime';
import { createInitialState, type SimulationState } from '../src/core/simulation/SimulationState';

const continuous = createScenario();
const split = createScenario();

runToSaveBoundary(continuous);
runToSaveBoundary(split);
injectPendingSuppression(continuous);
injectPendingSuppression(split);

assert.equal(split.units[0]!.infantryCombatRuntime.activeFireTask?.phase, 'firing');
assert.ok((split.units[0]!.infantryCombatRuntime.activeFireTask?.committedShots.length ?? 0) > 0);
assert.ok((split.units[0]!.infantryCombatRuntime.activeFireTask?.committedShots.length ?? 0) < 4);
assert.ok(split.infantryCombatProjectiles.pool.activeCount > 0);
assert.ok(split.units[0]!.infantryCombatRuntime.suppression.pendingSources.length > 0);

split.simulationTimeSeconds = 0.55;
const restored = roundTrip(split);
reconcileInfantryCombatRuntimeAfterLoad(restored);
const afterFirstReconciliation = canonicalSnapshot(restored);
reconcileInfantryCombatRuntimeAfterLoad(restored);
assert.deepEqual(canonicalSnapshot(restored), afterFirstReconciliation, 'reconciliation must be idempotent');

continueFromSaveBoundary(continuous);
continueFromSaveBoundary(restored);

assert.deepEqual(canonicalSnapshot(restored), canonicalSnapshot(continuous));

console.log('Infantry combat Stage 8 save/load smoke passed: partial burst, cadence, recoil, active projectiles and pending suppression window resume exactly once.');

function runToSaveBoundary(state: SimulationState): void {
  tickInfantryCombatSimulation(state, { intervalStartSeconds: 0, deltaSeconds: 0.55 });
  state.simulationTimeSeconds = 0.55;
}

function continueFromSaveBoundary(state: SimulationState): void {
  tickInfantryCombatSimulation(state, { intervalStartSeconds: 0.55, deltaSeconds: 1.45 });
  state.simulationTimeSeconds = 2;
}

function injectPendingSuppression(state: SimulationState): void {
  const event: SuppressionEventV1 = Object.freeze({
    schemaVersion: 1,
    eventId: 'save-window-event',
    sourceUnitId: 'external-source',
    affectedUnitId: 'shooter',
    shotId: 'external-shot',
    projectileId: 'external-projectile',
    kind: 'near_miss',
    eventSeconds: 0.53,
    distanceMetres: 0.8,
    incomingDirection: { x: -1, y: 0, z: 0 },
    continuousFireScore: 0.7,
    baseImpulse: 0.1,
  });
  assert.equal(addSuppressionEvent(state.units[0]!.infantryCombatRuntime.suppression, event), true);
}

function createScenario(): SimulationState {
  const state = createInitialState({
    width: 1000,
    height: 30,
    cellSize: 20,
    metersPerCell: 1,
    defaultTerrain: 'field',
    defaultHeight: 0,
    objects: [],
  }, [
    { id: 'shooter', side: 'blue', x: 5, y: 10, type: 'infantry_squad', facingDegrees: 0 },
  ]);
  const shooter = state.units[0]!;
  assert.equal(equipPrimaryWeaponFromLoadout(
    shooter,
    createDefaultCombatCatalogRegistry(),
    { definitionId: 'loadout_submachine_gunner', revision: 1 },
  ).status, 'equipped');
  assert.equal(requestFireTask(shooter, {
    owner: { source: 'test', id: 'save-load' },
    ownerToken: 'save-load-token',
    target: { xMetres: 700, yMetres: 10, zMetres: 1.2 },
    targetRadiusMetres: 0,
    contactId: null,
    sourceUnitId: null,
    mode: 'short_burst',
    minimumSolutionQuality: 0,
    maximumFriendlyFireRisk: 0,
    requestedSeconds: 0,
  }).status, 'started');
  return state;
}

function roundTrip(state: SimulationState): SimulationState {
  const plain = structuredClone({
    ...state,
    infantryCombatProjectiles: serializeProjectileRuntimeState(state.infantryCombatProjectiles),
    units: state.units.map((unit) => ({
      ...structuredClone(unit),
      infantryCombatRuntime: serializeInfantryCombatUnitRuntime(unit.infantryCombatRuntime),
    })),
  });
  const parsed = JSON.parse(JSON.stringify(plain)) as SimulationState;
  parsed.infantryCombatProjectiles = normalizeProjectileRuntimeState(parsed.infantryCombatProjectiles);
  for (const unit of parsed.units) {
    unit.infantryCombatRuntime = normalizeInfantryCombatUnitRuntime(unit.infantryCombatRuntime);
  }
  return parsed;
}

function canonicalSnapshot(state: SimulationState) {
  const shooter = state.units[0]!;
  const weapon = shooter.infantryCombatRuntime.primaryWeapon!;
  const projectile = serializeProjectileRuntimeState(state.infantryCombatProjectiles);
  return {
    simulationTimeSeconds: state.simulationTimeSeconds,
    activeFireTask: shooter.infantryCombatRuntime.activeFireTask
      ? serializeInfantryCombatUnitRuntime(shooter.infantryCombatRuntime).activeFireTask
      : null,
    lastFireResult: shooter.infantryCombatRuntime.lastFireResult,
    roundsInWeapon: weapon.roundsInWeapon,
    shotSequence: weapon.shotSequence,
    lastCommittedShotId: weapon.lastCommittedShotId,
    recoil: structuredClone(weapon.recoil),
    automaticFire: structuredClone(weapon.automaticFire),
    suppression: structuredClone(shooter.infantryCombatRuntime.suppression),
    committedShots: projectile.committedShots,
    activeProjectiles: projectile.activeProjectiles,
    impacts: projectile.impacts,
    terminations: projectile.terminations,
    appliedImpactIds: projectile.appliedImpactIds,
  };
}
