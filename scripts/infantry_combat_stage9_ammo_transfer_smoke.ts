import assert from 'node:assert/strict';
import {
  cancelAmmoTransfer,
  getReserveEntry,
  getReserveRounds,
  requestAmmoTransfer,
  tickWeaponActions,
} from '../src/core/infantry-combat/runtime';
import { createStage9State, equipStage9Roles } from './infantry_combat_stage9_test_utils';

verifyExactAtomicTransfer();
verifyPartialTransferAtTargetLimit();
verifyCancellationHasNoMutation();
verifyRoleAndAmmoValidation();
verifyAlreadyAppliedTransferDoesNotDuplicate();

console.log('Stage 9 ammo transfer smoke passed.');

function verifyExactAtomicTransfer(): void {
  const state = createStage9State();
  const { gunner, helper } = equipStage9Roles(state);
  const ammoId = gunner.infantryCombatRuntime.primaryWeapon!.resolved.ammoDefinitionRef.definitionId;
  const sourceBefore = getReserveRounds(helper.infantryCombatRuntime.ammoInventory, ammoId);
  const targetBefore = getReserveRounds(gunner.infantryCombatRuntime.ammoInventory, ammoId);
  const request = requestAmmoTransfer(state, transfer(helper.id, gunner.id, ammoId, 50, 'exact'));
  assert.equal(request.status, 'started');
  const actionId = helper.infantryCombatRuntime.ammoInventory.activeTransfer!.actionId;
  tickWeaponActions(state, { intervalStartSeconds: 0, deltaSeconds: 2.4 });
  assert.equal(getReserveRounds(helper.infantryCombatRuntime.ammoInventory, ammoId), sourceBefore);
  assert.equal(getReserveRounds(gunner.infantryCombatRuntime.ammoInventory, ammoId), targetBefore);
  tickWeaponActions(state, { intervalStartSeconds: 2.4, deltaSeconds: 0.02 });
  assert.equal(getReserveRounds(helper.infantryCombatRuntime.ammoInventory, ammoId), sourceBefore - 50);
  assert.equal(getReserveRounds(gunner.infantryCombatRuntime.ammoInventory, ammoId), targetBefore + 50);
  assert.equal(helper.infantryCombatRuntime.ammoInventory.appliedTransferIds.includes(actionId), true);
  assert.equal(gunner.infantryCombatRuntime.ammoInventory.appliedTransferIds.includes(actionId), true);
  assert.equal(helper.infantryCombatRuntime.ammoInventory.activeTransfer, null);
  assert.equal(gunner.infantryCombatRuntime.ammoInventory.activeTransfer, null);
}

function verifyPartialTransferAtTargetLimit(): void {
  const state = createStage9State();
  const { gunner, helper } = equipStage9Roles(state);
  const ammoId = gunner.infantryCombatRuntime.primaryWeapon!.resolved.ammoDefinitionRef.definitionId;
  const targetEntry = getReserveEntry(gunner.infantryCombatRuntime.ammoInventory, ammoId)!;
  const sourceBefore = getReserveRounds(helper.infantryCombatRuntime.ammoInventory, ammoId);
  const capacity = targetEntry.maximumRounds - targetEntry.rounds;
  assert.equal(requestAmmoTransfer(state, transfer(helper.id, gunner.id, ammoId, 200, 'partial')).status, 'started');
  tickWeaponActions(state, { intervalStartSeconds: 0, deltaSeconds: 8 });
  assert.equal(getReserveRounds(gunner.infantryCombatRuntime.ammoInventory, ammoId), targetEntry.maximumRounds);
  assert.equal(getReserveRounds(helper.infantryCombatRuntime.ammoInventory, ammoId), sourceBefore - capacity);
  assert.equal(gunner.infantryCombatRuntime.ammoInventory.lastActionResult?.roundsChanged, capacity);
}

function verifyCancellationHasNoMutation(): void {
  const state = createStage9State();
  const { gunner, helper } = equipStage9Roles(state);
  const ammoId = gunner.infantryCombatRuntime.primaryWeapon!.resolved.ammoDefinitionRef.definitionId;
  const sourceBefore = getReserveRounds(helper.infantryCombatRuntime.ammoInventory, ammoId);
  const targetBefore = getReserveRounds(gunner.infantryCombatRuntime.ammoInventory, ammoId);
  assert.equal(requestAmmoTransfer(state, transfer(helper.id, gunner.id, ammoId, 30, 'cancel')).status, 'started');
  const actionId = helper.infantryCombatRuntime.ammoInventory.activeTransfer!.actionId;
  tickWeaponActions(state, { intervalStartSeconds: 0, deltaSeconds: 0.5 });
  assert.equal(cancelAmmoTransfer(state, actionId, 0.5).status, 'cancelled');
  assert.equal(getReserveRounds(helper.infantryCombatRuntime.ammoInventory, ammoId), sourceBefore);
  assert.equal(getReserveRounds(gunner.infantryCombatRuntime.ammoInventory, ammoId), targetBefore);
}

function verifyRoleAndAmmoValidation(): void {
  const state = createStage9State();
  const { gunner, helper, rifle } = equipStage9Roles(state);
  const ammoId = gunner.infantryCombatRuntime.primaryWeapon!.resolved.ammoDefinitionRef.definitionId;
  assert.equal(requestAmmoTransfer(state, transfer(rifle.id, gunner.id, ammoId, 10, 'wrong-role')).status, 'assistant_invalid');
  assert.equal(requestAmmoTransfer(state, transfer(helper.id, gunner.id, 'ammo_762x25_tokarev', 10, 'wrong-ammo')).status, 'invalid_request');
  const targetEntry = getReserveEntry(gunner.infantryCombatRuntime.ammoInventory, ammoId)!;
  targetEntry.rounds = targetEntry.maximumRounds;
  assert.equal(requestAmmoTransfer(state, transfer(helper.id, gunner.id, ammoId, 10, 'full')).status, 'target_full');
}

function verifyAlreadyAppliedTransferDoesNotDuplicate(): void {
  const state = createStage9State();
  const { gunner, helper } = equipStage9Roles(state);
  const ammoId = gunner.infantryCombatRuntime.primaryWeapon!.resolved.ammoDefinitionRef.definitionId;
  assert.equal(requestAmmoTransfer(state, transfer(helper.id, gunner.id, ammoId, 10, 'duplicate')).status, 'started');
  const action = helper.infantryCombatRuntime.ammoInventory.activeTransfer!;
  const sourceBefore = getReserveRounds(helper.infantryCombatRuntime.ammoInventory, ammoId);
  const targetBefore = getReserveRounds(gunner.infantryCombatRuntime.ammoInventory, ammoId);
  helper.infantryCombatRuntime.ammoInventory.appliedTransferIds.push(action.actionId);
  tickWeaponActions(state, { intervalStartSeconds: 0, deltaSeconds: 2 });
  assert.equal(getReserveRounds(helper.infantryCombatRuntime.ammoInventory, ammoId), sourceBefore);
  assert.equal(getReserveRounds(gunner.infantryCombatRuntime.ammoInventory, ammoId), targetBefore);
}

function transfer(sourceUnitId: string, targetUnitId: string, ammoDefinitionId: string, requestedRounds: number, id: string) {
  return {
    sourceUnitId,
    targetUnitId,
    ammoDefinitionId,
    requestedRounds,
    ownerToken: `${id}-token`,
    requestedSeconds: 0,
  };
}
