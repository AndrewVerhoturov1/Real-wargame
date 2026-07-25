import assert from 'node:assert/strict';
import { createDefaultCombatCatalogRegistry } from '../src/core/infantry-combat/catalogs';
import {
  FIRE_TASK_RUNTIME_SCHEMA_VERSION,
  MAX_FIRE_TASK_ROUNDS,
  equipPrimaryWeaponFromLoadout,
  getWeaponShotIntervalSeconds,
  normalizeInfantryCombatUnitRuntime,
  requestFireTask,
  requestSingleFireTask,
  serializeInfantryCombatUnitRuntime,
  tickInfantryCombatSimulation,
} from '../src/core/infantry-combat/runtime';
import { createInitialState } from '../src/core/simulation/SimulationState';

verifyFireTaskV1Migration();
verifyPublishedPpshModesAndCadence();
verifySingleCompatibility();
verifyCrossTaskCadence();

console.log('Infantry combat Stage 8 automatic-fire smoke passed: FireTask V2 migration, PPSh modes, exact per-shot cadence, single compatibility and cross-task cadence.');

function verifyFireTaskV1Migration(): void {
  const migrated = normalizeInfantryCombatUnitRuntime({
    schemaVersion: 2,
    nextFireTaskSequence: 2,
    primaryWeapon: null,
    activeFireTask: {
      schemaVersion: 1,
      taskId: 'legacy:fire-task:1',
      sequence: 1,
      actionHandle: null,
      owner: { source: 'test', id: 'legacy' },
      ownerToken: 'legacy-token',
      target: { xMetres: 10, yMetres: 2, zMetres: 1 },
      targetRadiusMetres: 0,
      contactId: null,
      sourceUnitId: null,
      mode: 'single',
      phase: 'recovery',
      requestedSeconds: 0,
      phaseStartedSeconds: 1,
      readyRemainingSeconds: 0,
      aimQuality: 1,
      aimTracking: null,
      minimumSolutionQuality: 0,
      maximumFriendlyFireRisk: 0,
      recoveryRemainingSeconds: 0.2,
      committedShotId: 'legacy:shot:1',
      resultCode: null,
      resultRu: null,
    },
    lastFireResult: null,
    lastShotCommit: null,
    wounds: null,
    physiology: null,
    medical: null,
  });
  const task = migrated.activeFireTask!;
  assert.equal(task.schemaVersion, FIRE_TASK_RUNTIME_SCHEMA_VERSION);
  assert.equal(task.mode, 'single');
  assert.equal(task.plannedRoundCount, 1);
  assert.equal(task.nextShotOrdinal, 1);
  assert.equal(task.committedShots.length, 1);
  assert.equal(task.committedShots[0]?.shotId, 'legacy:shot:1');
  assert.equal(task.committedShots[0]?.projectileId, 'legacy:shot:1:projectile');
  assert.equal(task.targetRadiusMetres, 0);
}

function verifyPublishedPpshModesAndCadence(): void {
  const state = createState('stage8-ppsh');
  const shooter = state.units[0]!;
  const registry = createDefaultCombatCatalogRegistry();
  const equip = equipPrimaryWeaponFromLoadout(
    shooter,
    registry,
    { definitionId: 'loadout_submachine_gunner', revision: 1 },
  );
  assert.equal(equip.status, 'equipped');
  const weapon = shooter.infantryCombatRuntime.primaryWeapon!;
  assert.equal(weapon.resolved.weapon.weaponDefinitionId, 'weapon_ppsh41');
  assert.deepEqual(weapon.resolved.weapon.availableFireModes, ['single', 'short_burst', 'long_burst', 'suppress']);
  assert.equal(getWeaponShotIntervalSeconds(weapon.resolved.weapon), 60 / 900);

  const roundsBefore = weapon.roundsInWeapon;
  const requested = requestFireTask(shooter, {
    owner: { source: 'test', id: 'automatic' },
    ownerToken: 'automatic-token',
    target: { xMetres: 80, yMetres: 10, zMetres: 1.2 },
    targetRadiusMetres: 0,
    contactId: null,
    sourceUnitId: null,
    mode: 'short_burst',
    minimumSolutionQuality: 0,
    maximumFriendlyFireRisk: 0,
    requestedSeconds: 0,
  });
  assert.equal(requested.status, 'started');
  assert.equal(requested.task?.plannedRoundCount, 4);
  assert.ok((requested.task?.plannedRoundCount ?? 0) <= MAX_FIRE_TASK_ROUNDS);

  const result = tickInfantryCombatSimulation(state, { intervalStartSeconds: 0, deltaSeconds: 1.5 });
  const committed = result.commitResults.filter((entry) => entry.status === 'committed');
  assert.equal(committed.length, 4);
  assert.equal(weapon.roundsInWeapon, roundsBefore - 4);
  assert.equal(new Set(committed.map((entry) => entry.shotId)).size, 4);
  assert.equal(new Set(committed.map((entry) => entry.projectileId)).size, 4);
  const records = state.infantryCombatProjectiles.committedShots.filter((entry) => entry.fireTaskId === requested.task?.taskId);
  assert.equal(records.length, 4);
  const interval = getWeaponShotIntervalSeconds(weapon.resolved.weapon);
  for (let index = 1; index < records.length; index += 1) {
    assert.ok(Math.abs(records[index]!.committedSimulationSeconds - records[index - 1]!.committedSimulationSeconds - interval) < 1e-9);
  }
  assert.equal(shooter.infantryCombatRuntime.lastFireResult?.phase, 'completed');
  assert.equal(shooter.infantryCombatRuntime.lastFireResult?.plannedRoundCount, 4);
  assert.equal(shooter.infantryCombatRuntime.lastFireResult?.committedRoundCount, 4);
}

function verifySingleCompatibility(): void {
  const state = createState('stage8-single');
  const shooter = state.units[0]!;
  assert.equal(equipPrimaryWeaponFromLoadout(
    shooter,
    createDefaultCombatCatalogRegistry(),
    { definitionId: 'loadout_rifleman', revision: 1 },
  ).status, 'equipped');
  const requested = requestSingleFireTask(shooter, {
    owner: { source: 'test', id: 'single' },
    ownerToken: 'single-token',
    target: { xMetres: 50, yMetres: 10, zMetres: 1.2 },
    targetRadiusMetres: 0,
    contactId: null,
    sourceUnitId: null,
    mode: 'single',
    minimumSolutionQuality: 0,
    maximumFriendlyFireRisk: 0,
    requestedSeconds: 0,
  });
  assert.equal(requested.status, 'started');
  assert.equal(requested.task?.mode, 'single');
  assert.equal(requested.task?.plannedRoundCount, 1);
  const before = shooter.infantryCombatRuntime.primaryWeapon!.roundsInWeapon;
  const result = tickInfantryCombatSimulation(state, { intervalStartSeconds: 0, deltaSeconds: 1.5 });
  assert.equal(result.commitResults.filter((entry) => entry.status === 'committed').length, 1);
  assert.equal(shooter.infantryCombatRuntime.primaryWeapon!.roundsInWeapon, before - 1);
}

function verifyCrossTaskCadence(): void {
  const state = createState('stage8-cross-task');
  const shooter = state.units[0]!;
  assert.equal(equipPrimaryWeaponFromLoadout(
    shooter,
    createDefaultCombatCatalogRegistry(),
    { definitionId: 'loadout_submachine_gunner', revision: 1 },
  ).status, 'equipped');
  const weapon = shooter.infantryCombatRuntime.primaryWeapon!;
  const first = requestFireTask(shooter, request('cross-a', 0, 'single'));
  assert.equal(first.status, 'started');
  tickInfantryCombatSimulation(state, { intervalStartSeconds: 0, deltaSeconds: 0.8 });
  const firstTime = weapon.automaticFire.lastCommittedShotSeconds!;
  const earliest = weapon.automaticFire.nextShotAllowedSeconds;
  const saved = serializeInfantryCombatUnitRuntime(shooter.infantryCombatRuntime);
  shooter.infantryCombatRuntime = normalizeInfantryCombatUnitRuntime(JSON.parse(JSON.stringify(saved)));
  const second = requestFireTask(shooter, request('cross-b', 0.8, 'single'));
  assert.equal(second.status, 'started');
  tickInfantryCombatSimulation(state, { intervalStartSeconds: 0.8, deltaSeconds: 1 });
  const secondTime = shooter.infantryCombatRuntime.primaryWeapon!.automaticFire.lastCommittedShotSeconds!;
  assert.ok(secondTime >= earliest - 1e-9);
  assert.ok(secondTime > firstTime);
}

function request(id: string, requestedSeconds: number, mode: 'single' | 'short_burst' | 'long_burst' | 'suppress') {
  return {
    owner: { source: 'test' as const, id },
    ownerToken: `${id}-token`,
    target: { xMetres: 70, yMetres: 10, zMetres: 1.2 },
    targetRadiusMetres: mode === 'suppress' ? 5 : 0,
    contactId: null,
    sourceUnitId: null,
    mode,
    minimumSolutionQuality: 0,
    maximumFriendlyFireRisk: 0,
    requestedSeconds,
  };
}

function createState(id: string) {
  return createInitialState({
    width: 160,
    height: 40,
    cellSize: 20,
    metersPerCell: 1,
    defaultTerrain: 'field',
    defaultHeight: 0,
    objects: [],
  }, [
    { id, side: 'blue', x: 5, y: 10, type: 'infantry_squad', facingDegrees: 0 },
  ]);
}
