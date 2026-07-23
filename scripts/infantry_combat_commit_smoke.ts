import assert from 'node:assert/strict';
import { cancelPhysicalActionBySystem } from '../src/core/actions/PhysicalActionCoordinator';
import { createDefaultCombatCatalogRegistry } from '../src/core/infantry-combat/catalogs';
import {
  MAX_STAGE3_ACTIVE_PROJECTILES,
  MAX_STAGE3_COMMIT_LEDGER_ENTRIES,
  commitShot,
  createReferenceProjectileRuntimeState,
  equipPrimaryWeaponFromLoadout,
  requestSingleFireTask,
  serializeReferenceProjectileRuntimeState,
  tickFireTaskWithTimeBudget,
  type ProjectileStateV1,
  type ShotCommitRecordV1,
} from '../src/core/infantry-combat/runtime';
import { createInitialState, type SimulationState } from '../src/core/simulation/SimulationState';
import type { UnitModel } from '../src/core/units/UnitModel';

verifySuccessfulCommitAndIdempotency();
verifyEmptyWeaponIsAtomic();
verifyOwnershipLossIsAtomic();
verifyInvalidTargetIsAtomic();
verifyProjectileCapacityIsAtomic();
verifyMuzzleBlockIsAtomic();
verifyFriendlyRiskIsAtomic();
verifyLedgerEvictionIsDeterministic();

console.log('Infantry combat commit smoke passed: candidate-first atomicity, stable IDs, one round/shot/projectile, idempotency and bounded ledger.');

function verifySuccessfulCommitAndIdempotency(): void {
  const { state, shooter, task, weapon } = readyShot('commit-success');
  const beforeRounds = weapon.roundsInWeapon;
  const result = commitShot({ state, shooter, task, weapon, committedSeconds: 1.7 });
  assert.equal(result.status, 'committed');
  assert.equal(result.shotId, 'commit-success:shot:1');
  assert.equal(result.projectileId, 'commit-success:shot:1:projectile');
  assert.equal(weapon.roundsInWeapon, beforeRounds - 1);
  assert.equal(weapon.shotSequence, 1);
  assert.equal(weapon.lastCommittedShotId, result.shotId);
  assert.equal(task.committedShotId, result.shotId);
  assert.equal(task.phase, 'recovery');
  assert.equal(state.infantryCombatProjectiles.committedShots.length, 1);
  assert.equal(state.infantryCombatProjectiles.activeProjectiles.length, 1);
  assert.equal(state.infantryCombatProjectiles.committedShots[0]?.roundsBefore, beforeRounds);
  assert.equal(state.infantryCombatProjectiles.committedShots[0]?.roundsAfter, beforeRounds - 1);
  assert.equal(state.infantryCombatProjectiles.activeProjectiles[0]?.position.xMetres, result.muzzlePosition?.xMetres);

  const beforeRepeat = snapshot(state, shooter);
  const repeated = commitShot({ state, shooter, task, weapon, committedSeconds: 1.8 });
  assert.equal(repeated.status, 'already_committed');
  assert.equal(repeated.shotId, result.shotId);
  assert.deepEqual(snapshot(state, shooter), beforeRepeat);
}

function verifyEmptyWeaponIsAtomic(): void {
  const ready = readyShot('commit-empty');
  ready.weapon.roundsInWeapon = 0;
  assertAtomicFailure(ready, 'empty_weapon');
}

function verifyOwnershipLossIsAtomic(): void {
  const ready = readyShot('commit-ownership');
  assert.ok(ready.task.actionHandle);
  cancelPhysicalActionBySystem(ready.shooter, ready.task.actionHandle.actionId, {
    endedSeconds: 1.6,
    resultCode: 'test_release',
    resultRu: 'Тест освободил канал.',
  });
  assertAtomicFailure(ready, 'ownership_lost');
}

function verifyInvalidTargetIsAtomic(): void {
  const ready = readyShot('commit-invalid-target');
  (ready.task.target as { xMetres: number }).xMetres = Number.NaN;
  assertAtomicFailure(ready, 'invalid_target');
}

function verifyProjectileCapacityIsAtomic(): void {
  const ready = readyShot('commit-capacity');
  ready.state.infantryCombatProjectiles.activeProjectiles = Array.from(
    { length: MAX_STAGE3_ACTIVE_PROJECTILES },
    (_, index) => dummyProjectile(`capacity-existing-${index + 1}`),
  );
  const before = snapshot(ready.state, ready.shooter);
  const result = commitShot({ ...ready, committedSeconds: 1.7 });
  assert.equal(result.status, 'projectile_capacity_exceeded');
  assert.equal(ready.state.infantryCombatProjectiles.diagnostics.capRejectionCount, 1);
  assert.deepEqual(snapshot(ready.state, ready.shooter, true), before);
}

function verifyMuzzleBlockIsAtomic(): void {
  const ready = readyShot('commit-wall', {
    objects: [{
      id: 'commit-thin-wall',
      kind: 'structure',
      x: 2.25,
      y: 2,
      widthCells: 0.2,
      heightCells: 0.2,
      losHeightMeters: 2,
    }],
  });
  assertAtomicFailure(ready, 'muzzle_blocked');
}

function verifyFriendlyRiskIsAtomic(): void {
  const ready = readyShot('commit-friendly', {
    extraUnits: [{ id: 'friendly-line', side: 'blue', x: 5, y: 2 }],
  });
  assertAtomicFailure(ready, 'friendly_risk_exceeded');
}

function verifyLedgerEvictionIsDeterministic(): void {
  const ready = readyShot('commit-ledger');
  ready.weapon.shotSequence = MAX_STAGE3_COMMIT_LEDGER_ENTRIES;
  ready.state.infantryCombatProjectiles.committedShots = Array.from(
    { length: MAX_STAGE3_COMMIT_LEDGER_ENTRIES },
    (_, index) => dummyRecord(`historic:shot:${index + 1}`, index + 1),
  ).reverse();
  const result = commitShot({ ...ready, committedSeconds: 100 });
  assert.equal(result.status, 'committed');
  assert.equal(result.shotId, `commit-ledger:shot:${MAX_STAGE3_COMMIT_LEDGER_ENTRIES + 1}`);
  assert.equal(ready.state.infantryCombatProjectiles.committedShots.length, MAX_STAGE3_COMMIT_LEDGER_ENTRIES);
  assert.equal(ready.state.infantryCombatProjectiles.committedShots.some((record) => record.shotId === 'historic:shot:1'), false);
  assert.equal(ready.state.infantryCombatProjectiles.committedShots.some((record) => record.shotId === result.shotId), true);
}

function assertAtomicFailure(
  ready: ReturnType<typeof readyShot>,
  expectedStatus: string,
): void {
  const before = snapshot(ready.state, ready.shooter);
  const result = commitShot({ ...ready, committedSeconds: 1.7 });
  assert.equal(result.status, expectedStatus);
  assert.deepEqual(snapshot(ready.state, ready.shooter), before);
}

function readyShot(
  id: string,
  options: {
    objects?: Array<Record<string, unknown>>;
    extraUnits?: Array<{ id: string; side: 'blue' | 'red'; x: number; y: number }>;
  } = {},
) {
  const state = makeState(
    [{ id, side: 'blue', x: 2, y: 2 }, ...(options.extraUnits ?? [])],
    options.objects ?? [],
  );
  const shooter = state.units.find((unit) => unit.id === id)!;
  equip(shooter);
  const requested = requestSingleFireTask(shooter, {
    owner: { source: 'test', id: `${id}-owner` },
    ownerToken: `${id}-token`,
    target: { xMetres: 30, yMetres: 5, zMetres: 1.35 },
    targetRadiusMetres: 0,
    contactId: null,
    sourceUnitId: null,
    mode: 'single',
    minimumSolutionQuality: 0.55,
    maximumFriendlyFireRisk: 0,
    requestedSeconds: 0,
  });
  assert.equal(requested.accepted, true);
  const ticked = tickFireTaskWithTimeBudget(shooter, { intervalStartSeconds: 0, deltaSeconds: 2 });
  assert.equal(ticked.commitRequested, true);
  const task = shooter.infantryCombatRuntime.activeFireTask!;
  const weapon = shooter.infantryCombatRuntime.primaryWeapon!;
  return { state, shooter, task, weapon };
}

function makeState(
  units: Array<{ id: string; side: 'blue' | 'red'; x: number; y: number }>,
  objects: Array<Record<string, unknown>> = [],
): SimulationState {
  const state = createInitialState({
    width: 30,
    height: 10,
    cellSize: 20,
    metersPerCell: 2,
    defaultTerrain: 'field',
    defaultHeight: 0,
    objects: objects as never,
  }, units.map((unit) => ({ ...unit, type: 'infantry_squad' })));
  state.infantryCombatProjectiles = createReferenceProjectileRuntimeState();
  return state;
}

function equip(unit: UnitModel): void {
  const result = equipPrimaryWeaponFromLoadout(unit, createDefaultCombatCatalogRegistry(), {
    definitionId: 'loadout_rifleman',
    revision: 1,
  });
  assert.equal(result.ok, true);
}

function snapshot(state: SimulationState, shooter: UnitModel, ignoreCapDiagnostics = false): unknown {
  const projectiles = serializeReferenceProjectileRuntimeState(state.infantryCombatProjectiles);
  if (ignoreCapDiagnostics) projectiles.diagnostics.capRejectionCount = 0;
  return {
    weapon: structuredClone(shooter.infantryCombatRuntime.primaryWeapon),
    task: structuredClone(shooter.infantryCombatRuntime.activeFireTask),
    projectiles,
  };
}

function dummyProjectile(shotId: string): ProjectileStateV1 {
  return {
    schemaVersion: 1,
    projectileId: `${shotId}:projectile`,
    shotId,
    shooterId: 'capacity-shooter',
    ammoSnapshot: createDefaultCombatCatalogRegistry().resolveAmmo({ definitionId: 'ammo_762x54r_ball', revision: 1 }),
    position: { xMetres: 0, yMetres: 0, zMetres: 10 },
    velocityMetresPerSecond: { x: 1, y: 0, z: 0 },
    ageSeconds: 0,
    maximumLifetimeSeconds: 6,
    bodyPenetrationBudget: 1,
    impactSequence: 0,
  };
}

function dummyRecord(shotId: string, order: number): ShotCommitRecordV1 {
  return {
    schemaVersion: 1,
    shotId,
    shooterId: 'historic-shooter',
    fireTaskId: `historic-task-${order}`,
    weaponInstanceId: 'historic-weapon',
    weaponDefinitionRef: { definitionId: 'weapon_mosin_m9130', revision: 1 },
    ammoDefinitionRef: { definitionId: 'ammo_762x54r_ball', revision: 1 },
    committedSimulationSeconds: order,
    muzzlePosition: { xMetres: order, yMetres: 0, zMetres: 1 },
    initialVelocityMetresPerSecond: { x: 865, y: 0, z: 0 },
    roundsBefore: 5,
    roundsAfter: 4,
  };
}
