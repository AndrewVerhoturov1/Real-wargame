import assert from 'node:assert/strict';
import { getPhysicalActionCoordinatorDiagnostics } from '../src/core/actions/PhysicalActionCoordinator';
import { requestPlayerPostureTransition } from '../src/core/actions/PostureTransition';
import {
  cancelWeaponDeploymentAction,
  reconcileWeaponDeploymentAnchors,
  requestDeployWeapon,
  requestUndeployWeapon,
  tickWeaponActions,
} from '../src/core/infantry-combat/runtime';
import { setMovementRequest } from '../src/core/movement/MovementRuntime';
import { setSearchSector } from '../src/core/perception/AttentionController';
import { createStage9State, deploymentRequest, equipStage9Roles } from './infantry_combat_stage9_test_utils';

verifyUnsupportedWeaponAndExactBaseDuration();
verifyAssistantAccelerationAndLeaseRelease();
verifyBodyLocksAndExplicitUndeploy();
verifyAnchorInvalidation();

console.log('Stage 9 deployment smoke passed.');

function verifyUnsupportedWeaponAndExactBaseDuration(): void {
  const state = createStage9State();
  const { gunner, rifle } = equipStage9Roles(state);
  assert.equal(requestDeployWeapon(state, rifle, deploymentRequest('rifle-deploy', null)).status, 'unsupported_weapon');

  const started = requestDeployWeapon(state, gunner, deploymentRequest('base-deploy', null));
  assert.equal(started.status, 'started');
  assert.deepEqual(started.gunnerLease?.channels, ['locomotion', 'posture', 'weapon']);
  tickWeaponActions(state, { intervalStartSeconds: 0, deltaSeconds: 1.59 });
  assert.equal(gunner.infantryCombatRuntime.primaryWeapon!.deployment.mode, 'deploying');
  tickWeaponActions(state, { intervalStartSeconds: 1.59, deltaSeconds: 0.02 });
  const deployment = gunner.infantryCombatRuntime.primaryWeapon!.deployment;
  assert.equal(deployment.mode, 'deployed');
  assert.equal(deployment.deployedAtSeconds, 1.6);
  assert.equal(deployment.actionResults.length, 1);
  assert.equal(deployment.lastActionResult?.status, 'completed');
}

function verifyAssistantAccelerationAndLeaseRelease(): void {
  const state = createStage9State();
  const { gunner, helper } = equipStage9Roles(state);
  const started = requestDeployWeapon(state, gunner, deploymentRequest('assisted-deploy', helper.id));
  assert.equal(started.status, 'started');
  assert.deepEqual(started.helperLease?.channels, ['locomotion', 'weapon']);
  tickWeaponActions(state, { intervalStartSeconds: 0, deltaSeconds: 1.152 });
  assert.equal(gunner.infantryCombatRuntime.primaryWeapon!.deployment.mode, 'deployed');
  assert.equal(gunner.infantryCombatRuntime.primaryWeapon!.deployment.deployedAtSeconds, 1.152);
  assert.equal(getPhysicalActionCoordinatorDiagnostics(helper).activeLeases.length, 0);

  assert.equal(requestUndeployWeapon(state, gunner, deploymentRequest('assisted-undeploy', helper.id, 2)).status, 'started');
  tickWeaponActions(state, { intervalStartSeconds: 2, deltaSeconds: 0.2 });
  const action = gunner.infantryCombatRuntime.primaryWeapon!.deployment.activeAction!;
  const completedBeforeCancel = action.completedBaseWorkSeconds;
  assert.ok(completedBeforeCancel > 0);
  assert.equal(cancelWeaponDeploymentAction(state, gunner, 'assisted-undeploy-token', 2.2).status, 'cancelled');
  assert.equal(gunner.infantryCombatRuntime.primaryWeapon!.deployment.mode, 'deployed');
  assert.equal(getPhysicalActionCoordinatorDiagnostics(helper).activeLeases.length, 0);
}

function verifyBodyLocksAndExplicitUndeploy(): void {
  const state = createStage9State();
  const { gunner } = equipStage9Roles(state);
  assert.equal(requestDeployWeapon(state, gunner, deploymentRequest('locks-deploy', null)).status, 'started');
  tickWeaponActions(state, { intervalStartSeconds: 0, deltaSeconds: 2 });
  const positionBefore = { ...gunner.position };
  const postureBefore = gunner.behaviorRuntime.posture;
  const facingBefore = gunner.facingRadians;

  setMovementRequest(gunner, 'run', 'player', 'sprint');
  assert.deepEqual(gunner.position, positionBefore);
  assert.equal(gunner.movementRuntime.isMoving, false);
  const posture = requestPlayerPostureTransition(gunner, postureBefore === 'prone' ? 'standing' : 'prone', 2);
  assert.equal(posture.accepted, false);
  assert.equal(posture.reasonCode, 'weapon_deployed_posture_blocked');
  setSearchSector(gunner, Math.PI / 2, Math.PI / 2, 'ai');
  assert.equal(gunner.facingRadians, facingBefore);
  assert.equal(gunner.behaviorRuntime.lastEvent, 'weapon_deployed_facing_locked');

  assert.equal(requestUndeployWeapon(state, gunner, deploymentRequest('locks-undeploy', null, 3)).status, 'started');
  tickWeaponActions(state, { intervalStartSeconds: 3, deltaSeconds: 1.1 });
  assert.equal(gunner.infantryCombatRuntime.primaryWeapon!.deployment.mode, 'portable');
  assert.equal(gunner.infantryCombatRuntime.primaryWeapon!.deployment.anchor, null);
}

function verifyAnchorInvalidation(): void {
  const state = createStage9State();
  const { gunner } = equipStage9Roles(state);
  assert.equal(requestDeployWeapon(state, gunner, deploymentRequest('anchor-deploy', null)).status, 'started');
  tickWeaponActions(state, { intervalStartSeconds: 0, deltaSeconds: 1.6 });
  gunner.position.x += 0.02;
  reconcileWeaponDeploymentAnchors(state, 1.7);
  assert.equal(gunner.infantryCombatRuntime.primaryWeapon!.deployment.mode, 'portable');
  assert.equal(gunner.infantryCombatRuntime.primaryWeapon!.deployment.invalidationReason, 'deployment_anchor_invalidated');
}
