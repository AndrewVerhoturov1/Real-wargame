import assert from 'node:assert/strict';
import { getPhysicalActionCoordinatorDiagnostics } from '../src/core/actions/PhysicalActionCoordinator';
import {
  requestDeployWeapon,
  requestReloadWeapon,
  tickWeaponActions,
} from '../src/core/infantry-combat/runtime';
import { createStage9State, deploymentRequest, equipStage9Roles } from './infantry_combat_stage9_test_utils';

verifyAssistantIsExplicitAndValidated();
verifyDeploymentContinuesAfterAssistantLoss();
verifyReloadContinuesAfterAssistantLoss();

console.log('Stage 9 assistant smoke passed.');

function verifyAssistantIsExplicitAndValidated(): void {
  const noAutomatic = createStage9State();
  const roles = equipStage9Roles(noAutomatic);
  assert.equal(requestDeployWeapon(noAutomatic, roles.gunner, deploymentRequest('no-auto', null)).status, 'started');
  assert.equal(getPhysicalActionCoordinatorDiagnostics(roles.helper).activeLeases.length, 0);

  const missingState = createStage9State();
  const missing = equipStage9Roles(missingState);
  assert.equal(requestDeployWeapon(missingState, missing.gunner, deploymentRequest('missing-helper', 'missing')).status, 'started');
  assert.equal(missing.gunner.infantryCombatRuntime.primaryWeapon!.deployment.activeAction?.helperUnitId, null);
  assert.equal(missing.gunner.infantryCombatRuntime.primaryWeapon!.deployment.activeAction?.helperValidationCode, 'assistant_missing');

  const wrongRoleState = createStage9State();
  const wrongRole = equipStage9Roles(wrongRoleState);
  assert.equal(requestDeployWeapon(wrongRoleState, wrongRole.gunner, deploymentRequest('wrong-role', wrongRole.rifle.id)).status, 'started');
  assert.equal(wrongRole.gunner.infantryCombatRuntime.primaryWeapon!.deployment.activeAction?.helperUnitId, null);
  assert.equal(wrongRole.gunner.infantryCombatRuntime.primaryWeapon!.deployment.activeAction?.helperValidationCode, 'assistant_role_invalid');

  const enemyState = createStage9State();
  const enemyRoles = equipStage9Roles(enemyState);
  enemyRoles.enemy.position = { ...enemyRoles.helper.position };
  assert.equal(requestDeployWeapon(enemyState, enemyRoles.gunner, deploymentRequest('enemy-helper', enemyRoles.enemy.id)).status, 'started');
  assert.equal(enemyRoles.gunner.infantryCombatRuntime.primaryWeapon!.deployment.activeAction?.helperValidationCode, 'assistant_side_invalid');

  const farState = createStage9State();
  const farRoles = equipStage9Roles(farState);
  farRoles.helper.position.x += 10;
  assert.equal(requestDeployWeapon(farState, farRoles.gunner, deploymentRequest('far-helper', farRoles.helper.id)).status, 'started');
  assert.equal(farRoles.gunner.infantryCombatRuntime.primaryWeapon!.deployment.activeAction?.helperValidationCode, 'assistant_out_of_range');

  const incapableState = createStage9State();
  const incapable = equipStage9Roles(incapableState);
  incapable.helper.infantryCombatRuntime.wounds.capabilities = {
    ...incapable.helper.infantryCombatRuntime.wounds.capabilities,
    canUseHands: false,
    canUseWeapon: false,
  };
  assert.equal(requestDeployWeapon(incapableState, incapable.gunner, deploymentRequest('incapable-helper', incapable.helper.id)).status, 'started');
  assert.equal(incapable.gunner.infantryCombatRuntime.primaryWeapon!.deployment.activeAction?.helperUnitId, null);
  assert.equal(incapable.gunner.infantryCombatRuntime.primaryWeapon!.deployment.activeAction?.helperValidationCode, 'assistant_capability_lost');
}

function verifyDeploymentContinuesAfterAssistantLoss(): void {
  const state = createStage9State();
  const { gunner, helper } = equipStage9Roles(state);
  assert.equal(requestDeployWeapon(state, gunner, deploymentRequest('loss-deploy', helper.id)).status, 'started');
  tickWeaponActions(state, { intervalStartSeconds: 0, deltaSeconds: 0.5 });
  const progress = gunner.infantryCombatRuntime.primaryWeapon!.deployment.activeAction!.completedBaseWorkSeconds;
  assert.ok(progress > 0.69 && progress < 0.70);
  helper.position.x += 10;
  tickWeaponActions(state, { intervalStartSeconds: 0.5, deltaSeconds: 1.2 });
  assert.equal(gunner.infantryCombatRuntime.primaryWeapon!.deployment.mode, 'deployed');
  assert.equal(gunner.infantryCombatRuntime.primaryWeapon!.deployment.deployedAtSeconds, 1.405555555556);
  assert.equal(getPhysicalActionCoordinatorDiagnostics(helper).activeLeases.length, 0);
}

function verifyReloadContinuesAfterAssistantLoss(): void {
  const state = createStage9State();
  const { gunner, helper } = equipStage9Roles(state);
  gunner.infantryCombatRuntime.primaryWeapon!.roundsInWeapon = 0;
  assert.equal(requestReloadWeapon(state, gunner, {
    owner: { source: 'test', id: 'loss-reload' },
    ownerToken: 'loss-reload-token',
    helperUnitId: helper.id,
    requestedSeconds: 0,
  }).status, 'started');
  tickWeaponActions(state, { intervalStartSeconds: 0, deltaSeconds: 0.5 });
  const progress = gunner.infantryCombatRuntime.ammoInventory.activeReload!.completedBaseWorkSeconds;
  assert.ok(progress > 0);
  helper.position.x += 10;
  tickWeaponActions(state, { intervalStartSeconds: 0.5, deltaSeconds: 4 });
  assert.equal(gunner.infantryCombatRuntime.ammoInventory.activeReload, null);
  assert.equal(gunner.infantryCombatRuntime.primaryWeapon!.roundsInWeapon, 47);
  assert.equal(getPhysicalActionCoordinatorDiagnostics(helper).activeLeases.length, 0);
}
