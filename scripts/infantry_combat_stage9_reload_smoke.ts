import assert from 'node:assert/strict';
import { getPhysicalActionCoordinatorDiagnostics } from '../src/core/actions/PhysicalActionCoordinator';
import {
  cancelReloadWeapon,
  getReserveRounds,
  requestReloadWeapon,
  tickWeaponActions,
} from '../src/core/infantry-combat/runtime';
import { createStage9State, equipStage9Roles } from './infantry_combat_stage9_test_utils';

verifyPpshStageChannelsAndCancellation();
verifyLoadBoundaryPersistsAfterInterruption();
verifyMachineGunAssistantReloadAcceleration();
verifyCoarseAndFineReloadEquivalence();
verifyRifleUsesSameGenericAction();

console.log('Stage 9 reload smoke passed.');

function verifyPpshStageChannelsAndCancellation(): void {
  const state = createStage9State();
  const { ppsh } = equipStage9Roles(state);
  const weapon = ppsh.infantryCombatRuntime.primaryWeapon!;
  weapon.roundsInWeapon = 5;
  const ammoId = weapon.resolved.ammoDefinitionRef.definitionId;
  const reserveBefore = getReserveRounds(ppsh.infantryCombatRuntime.ammoInventory, ammoId);
  const started = requestReloadWeapon(state, ppsh, request('ppsh-cancel', null));
  assert.equal(started.status, 'started');
  assert.equal(getPhysicalActionCoordinatorDiagnostics(ppsh).channels.weapon?.actionType, 'infantry_reload_primary_weapon');
  assert.equal(getPhysicalActionCoordinatorDiagnostics(ppsh).channels.locomotion, null);

  tickWeaponActions(state, { intervalStartSeconds: 0, deltaSeconds: 0.2 });
  tickWeaponActions(state, { intervalStartSeconds: 0.2, deltaSeconds: 0.01 });
  assert.equal(ppsh.infantryCombatRuntime.ammoInventory.activeReload?.stageId, 'load');
  assert.equal(getPhysicalActionCoordinatorDiagnostics(ppsh).channels.locomotion?.actionType, 'infantry_reload_locomotion_lock');
  assert.equal(cancelReloadWeapon(state, ppsh, 'ppsh-cancel-token', 0.21).status, 'cancelled');
  assert.equal(weapon.roundsInWeapon, 5);
  assert.equal(getReserveRounds(ppsh.infantryCombatRuntime.ammoInventory, ammoId), reserveBefore);
}

function verifyLoadBoundaryPersistsAfterInterruption(): void {
  const state = createStage9State();
  const { ppsh } = equipStage9Roles(state);
  const weapon = ppsh.infantryCombatRuntime.primaryWeapon!;
  weapon.roundsInWeapon = 0;
  const ammoId = weapon.resolved.ammoDefinitionRef.definitionId;
  const reserveBefore = getReserveRounds(ppsh.infantryCombatRuntime.ammoInventory, ammoId);
  assert.equal(requestReloadWeapon(state, ppsh, request('ppsh-loaded', null)).status, 'started');
  tickWeaponActions(state, { intervalStartSeconds: 0, deltaSeconds: 2.5 });
  assert.equal(weapon.roundsInWeapon, weapon.resolved.weapon.capacityRounds);
  assert.equal(getReserveRounds(ppsh.infantryCombatRuntime.ammoInventory, ammoId), reserveBefore - weapon.resolved.weapon.capacityRounds);
  assert.equal(ppsh.infantryCombatRuntime.ammoInventory.appliedReloadLoadIds.length, 1);
  assert.equal(cancelReloadWeapon(state, ppsh, 'ppsh-loaded-token', 2.5).status, 'cancelled');
  assert.equal(weapon.roundsInWeapon, weapon.resolved.weapon.capacityRounds);
  assert.equal(ppsh.infantryCombatRuntime.ammoInventory.appliedReloadLoadIds.length, 1);
}

function verifyMachineGunAssistantReloadAcceleration(): void {
  const state = createStage9State();
  const { gunner, helper } = equipStage9Roles(state);
  const weapon = gunner.infantryCombatRuntime.primaryWeapon!;
  weapon.roundsInWeapon = 0;
  assert.equal(requestReloadWeapon(state, gunner, request('dp-assisted', helper.id)).status, 'started');
  tickWeaponActions(state, { intervalStartSeconds: 0, deltaSeconds: 4.05 * 0.68 });
  assert.equal(gunner.infantryCombatRuntime.ammoInventory.activeReload, null);
  assert.equal(weapon.roundsInWeapon, 47);
  assert.equal(getPhysicalActionCoordinatorDiagnostics(helper).activeLeases.length, 0);
}

function verifyCoarseAndFineReloadEquivalence(): void {
  const coarse = createStage9State();
  const fine = createStage9State();
  const coarseGunner = equipStage9Roles(coarse).gunner;
  const fineGunner = equipStage9Roles(fine).gunner;
  coarseGunner.infantryCombatRuntime.primaryWeapon!.roundsInWeapon = 0;
  fineGunner.infantryCombatRuntime.primaryWeapon!.roundsInWeapon = 0;
  assert.equal(requestReloadWeapon(coarse, coarseGunner, request('coarse', null)).status, 'started');
  assert.equal(requestReloadWeapon(fine, fineGunner, request('fine', null)).status, 'started');
  tickWeaponActions(coarse, { intervalStartSeconds: 0, deltaSeconds: 4.05 });
  for (let index = 0; index < 81; index += 1) {
    tickWeaponActions(fine, { intervalStartSeconds: index * 0.05, deltaSeconds: 0.05 });
  }
  assert.equal(coarseGunner.infantryCombatRuntime.primaryWeapon!.roundsInWeapon, fineGunner.infantryCombatRuntime.primaryWeapon!.roundsInWeapon);
  assert.deepEqual(coarseGunner.infantryCombatRuntime.ammoInventory.reserves, fineGunner.infantryCombatRuntime.ammoInventory.reserves);
  assert.deepEqual(coarseGunner.infantryCombatRuntime.ammoInventory.appliedReloadLoadIds, fineGunner.infantryCombatRuntime.ammoInventory.appliedReloadLoadIds);
}

function verifyRifleUsesSameGenericAction(): void {
  const state = createStage9State();
  const { rifle } = equipStage9Roles(state);
  rifle.infantryCombatRuntime.primaryWeapon!.roundsInWeapon = 0;
  assert.equal(requestReloadWeapon(state, rifle, request('rifle-reload', null)).status, 'started');
  tickWeaponActions(state, { intervalStartSeconds: 0, deltaSeconds: 3.05 });
  assert.equal(rifle.infantryCombatRuntime.primaryWeapon!.roundsInWeapon, 5);
  assert.equal(rifle.infantryCombatRuntime.ammoInventory.activeReload, null);
}

function request(id: string, helperUnitId: string | null) {
  return {
    owner: { source: 'test' as const, id },
    ownerToken: `${id}-token`,
    helperUnitId,
    requestedSeconds: 0,
  };
}
