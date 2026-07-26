import assert from 'node:assert/strict';
import {
  normalizePhysicalActionCoordinatorState,
  serializePhysicalActionCoordinatorState,
} from '../src/core/actions/PhysicalActionCoordinatorSerialization';
import {
  getReserveRounds,
  normalizeInfantryCombatUnitRuntime,
  reconcileInfantryCombatRuntimeAfterLoad,
  requestAmmoTransfer,
  requestDeployWeapon,
  requestReloadWeapon,
  serializeInfantryCombatUnitRuntime,
  tickWeaponActions,
} from '../src/core/infantry-combat/runtime';
import type { SimulationState } from '../src/core/simulation/SimulationState';
import { createStage9State, deploymentRequest, equipStage9Roles } from './infantry_combat_stage9_test_utils';

verifyMidDeploymentRestoresMissingLeases();
verifyReloadBeforeAndAfterLoadMutation();
verifyMidTransferExactlyOnce();
verifyRepeatedReconciliationIsIdempotent();

console.log('Stage 9 save/load smoke passed.');

function verifyMidDeploymentRestoresMissingLeases(): void {
  const source = createStage9State();
  const { gunner, helper } = equipStage9Roles(source);
  assert.equal(requestDeployWeapon(source, gunner, deploymentRequest('save-deploy', helper.id)).status, 'started');
  tickWeaponActions(source, { intervalStartSeconds: 0, deltaSeconds: 0.5 });
  const progress = gunner.infantryCombatRuntime.primaryWeapon!.deployment.activeAction!.completedBaseWorkSeconds;

  const restored = restoreCombatSnapshot(source, true);
  const restoredGunner = restored.units.find((unit) => unit.id === gunner.id)!;
  const restoredHelper = restored.units.find((unit) => unit.id === helper.id)!;
  assert.equal(restoredGunner.infantryCombatRuntime.primaryWeapon!.deployment.activeAction!.completedBaseWorkSeconds, progress);
  assert.equal(restoredGunner.behaviorRuntime.physicalActionCoordinator.activeLeases.length, 1);
  assert.equal(restoredHelper.behaviorRuntime.physicalActionCoordinator.activeLeases.length, 1);
  tickWeaponActions(restored, { intervalStartSeconds: 0.5, deltaSeconds: 1 });
  assert.equal(restoredGunner.infantryCombatRuntime.primaryWeapon!.deployment.mode, 'deployed');
}

function verifyReloadBeforeAndAfterLoadMutation(): void {
  const beforeLoad = createStage9State();
  const { ppsh } = equipStage9Roles(beforeLoad);
  const weapon = ppsh.infantryCombatRuntime.primaryWeapon!;
  weapon.roundsInWeapon = 0;
  const ammoId = weapon.resolved.ammoDefinitionRef.definitionId;
  const reserveInitial = getReserveRounds(ppsh.infantryCombatRuntime.ammoInventory, ammoId);
  assert.equal(requestReloadWeapon(beforeLoad, ppsh, reloadRequest('before-load')).status, 'started');
  tickWeaponActions(beforeLoad, { intervalStartSeconds: 0, deltaSeconds: 1 });
  const restoredBefore = restoreCombatSnapshot(beforeLoad, true);
  const restoredPpsh = restoredBefore.units.find((unit) => unit.id === ppsh.id)!;
  tickWeaponActions(restoredBefore, { intervalStartSeconds: 1, deltaSeconds: 2 });
  assert.equal(restoredPpsh.infantryCombatRuntime.primaryWeapon!.roundsInWeapon, 35);
  assert.equal(getReserveRounds(restoredPpsh.infantryCombatRuntime.ammoInventory, ammoId), reserveInitial - 35);
  assert.equal(restoredPpsh.infantryCombatRuntime.ammoInventory.appliedReloadLoadIds.length, 1);

  const afterLoad = createStage9State();
  const afterRoles = equipStage9Roles(afterLoad);
  const afterWeapon = afterRoles.ppsh.infantryCombatRuntime.primaryWeapon!;
  afterWeapon.roundsInWeapon = 0;
  assert.equal(requestReloadWeapon(afterLoad, afterRoles.ppsh, reloadRequest('after-load')).status, 'started');
  tickWeaponActions(afterLoad, { intervalStartSeconds: 0, deltaSeconds: 2.5 });
  const roundsAfterMutation = afterWeapon.roundsInWeapon;
  const reserveAfterMutation = getReserveRounds(afterRoles.ppsh.infantryCombatRuntime.ammoInventory, ammoId);
  const restoredAfter = restoreCombatSnapshot(afterLoad, true);
  const restoredAfterPpsh = restoredAfter.units.find((unit) => unit.id === afterRoles.ppsh.id)!;
  tickWeaponActions(restoredAfter, { intervalStartSeconds: 2.5, deltaSeconds: 0.5 });
  assert.equal(restoredAfterPpsh.infantryCombatRuntime.primaryWeapon!.roundsInWeapon, roundsAfterMutation);
  assert.equal(getReserveRounds(restoredAfterPpsh.infantryCombatRuntime.ammoInventory, ammoId), reserveAfterMutation);
  assert.equal(restoredAfterPpsh.infantryCombatRuntime.ammoInventory.appliedReloadLoadIds.length, 1);
}

function verifyMidTransferExactlyOnce(): void {
  const source = createStage9State();
  const { gunner, helper } = equipStage9Roles(source);
  const ammoId = gunner.infantryCombatRuntime.primaryWeapon!.resolved.ammoDefinitionRef.definitionId;
  const helperBefore = getReserveRounds(helper.infantryCombatRuntime.ammoInventory, ammoId);
  const gunnerBefore = getReserveRounds(gunner.infantryCombatRuntime.ammoInventory, ammoId);
  assert.equal(requestAmmoTransfer(source, {
    sourceUnitId: helper.id,
    targetUnitId: gunner.id,
    ammoDefinitionId: ammoId,
    requestedRounds: 30,
    ownerToken: 'save-transfer-token',
    requestedSeconds: 0,
  }).status, 'started');
  tickWeaponActions(source, { intervalStartSeconds: 0, deltaSeconds: 1 });
  const restored = restoreCombatSnapshot(source, true);
  const restoredGunner = restored.units.find((unit) => unit.id === gunner.id)!;
  const restoredHelper = restored.units.find((unit) => unit.id === helper.id)!;
  assert.equal(restoredGunner.infantryCombatRuntime.ammoInventory.activeTransfer?.completedBaseWorkSeconds, 1);
  assert.equal(restoredHelper.infantryCombatRuntime.ammoInventory.activeTransfer?.completedBaseWorkSeconds, 1);
  tickWeaponActions(restored, { intervalStartSeconds: 1, deltaSeconds: 2 });
  assert.equal(getReserveRounds(restoredHelper.infantryCombatRuntime.ammoInventory, ammoId), helperBefore - 30);
  assert.equal(getReserveRounds(restoredGunner.infantryCombatRuntime.ammoInventory, ammoId), gunnerBefore + 30);
  reconcileInfantryCombatRuntimeAfterLoad(restored);
  assert.equal(getReserveRounds(restoredHelper.infantryCombatRuntime.ammoInventory, ammoId), helperBefore - 30);
  assert.equal(getReserveRounds(restoredGunner.infantryCombatRuntime.ammoInventory, ammoId), gunnerBefore + 30);
}

function verifyRepeatedReconciliationIsIdempotent(): void {
  const source = createStage9State();
  const { gunner } = equipStage9Roles(source);
  assert.equal(requestDeployWeapon(source, gunner, deploymentRequest('idempotent', null)).status, 'started');
  tickWeaponActions(source, { intervalStartSeconds: 0, deltaSeconds: 0.4 });
  const restored = restoreCombatSnapshot(source, true);
  const first = snapshotAuthoritativeCombat(restored);
  reconcileInfantryCombatRuntimeAfterLoad(restored);
  const second = snapshotAuthoritativeCombat(restored);
  assert.deepEqual(second, first);
}

function restoreCombatSnapshot(source: SimulationState, removeStage9Leases: boolean): SimulationState {
  const restored = createStage9State();
  equipStage9Roles(restored);
  restored.simulationTimeSeconds = source.simulationTimeSeconds;
  for (const sourceUnit of source.units) {
    const target = restored.units.find((unit) => unit.id === sourceUnit.id)!;
    target.position = { ...sourceUnit.position };
    target.facingRadians = sourceUnit.facingRadians;
    target.behaviorRuntime.posture = sourceUnit.behaviorRuntime.posture;
    target.infantryCombatRuntime = normalizeInfantryCombatUnitRuntime(JSON.parse(JSON.stringify(
      serializeInfantryCombatUnitRuntime(sourceUnit.infantryCombatRuntime),
    )));
    const coordinator = serializePhysicalActionCoordinatorState(sourceUnit.behaviorRuntime.physicalActionCoordinator);
    if (removeStage9Leases) coordinator.activeLeases = [];
    target.behaviorRuntime.physicalActionCoordinator = normalizePhysicalActionCoordinatorState(JSON.parse(JSON.stringify(coordinator)));
  }
  reconcileInfantryCombatRuntimeAfterLoad(restored);
  return restored;
}

function snapshotAuthoritativeCombat(state: SimulationState): unknown {
  return state.units.map((unit) => ({
    unitId: unit.id,
    combat: serializeInfantryCombatUnitRuntime(unit.infantryCombatRuntime),
    coordinator: serializePhysicalActionCoordinatorState(unit.behaviorRuntime.physicalActionCoordinator),
  }));
}

function reloadRequest(id: string) {
  return {
    owner: { source: 'test' as const, id },
    ownerToken: `${id}-token`,
    helperUnitId: null,
    requestedSeconds: 0,
  };
}
