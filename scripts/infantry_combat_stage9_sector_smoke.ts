import assert from 'node:assert/strict';
import {
  commitShot,
  getPortableMachineGunSustainedFireFactor,
  requestDeployWeapon,
  requestFireTask,
  tickFireTaskWithTimeBudget,
  tickWeaponActions,
} from '../src/core/infantry-combat/runtime';
import { createStage9State, deploymentRequest, equipStage9Roles, fireRequest, targetPoint } from './infantry_combat_stage9_test_utils';

verifyPortableAndDeployedFactors();
verifyTraverseRequestAndSuppressArea();
verifyCommitTimeTraverseRecheck();

console.log('Stage 9 sector smoke passed.');

function verifyPortableAndDeployedFactors(): void {
  const state = createStage9State();
  const { gunner } = equipStage9Roles(state);
  const weapon = gunner.infantryCombatRuntime.primaryWeapon!;
  assert.equal(getPortableMachineGunSustainedFireFactor(weapon, 'single'), 1);
  assert.equal(getPortableMachineGunSustainedFireFactor(weapon, 'short_burst'), 1);
  assert.equal(getPortableMachineGunSustainedFireFactor(weapon, 'long_burst'), 0.55);
  assert.equal(getPortableMachineGunSustainedFireFactor(weapon, 'suppress'), 0.55);
  assert.equal(requestDeployWeapon(state, gunner, deploymentRequest('factor-deploy', null)).status, 'started');
  tickWeaponActions(state, { intervalStartSeconds: 0, deltaSeconds: 1.6 });
  assert.equal(getPortableMachineGunSustainedFireFactor(weapon, 'long_burst'), 1);
  assert.equal(getPortableMachineGunSustainedFireFactor(weapon, 'suppress'), 1);
}

function verifyTraverseRequestAndSuppressArea(): void {
  const state = createStage9State();
  const { gunner } = equipStage9Roles(state);
  assert.equal(requestDeployWeapon(state, gunner, deploymentRequest('sector-deploy', null)).status, 'started');
  tickWeaponActions(state, { intervalStartSeconds: 0, deltaSeconds: 1.6 });

  const inside = requestFireTask(gunner, fireRequest('inside', targetPoint(gunner, 50, 0), 'single'));
  assert.equal(inside.status, 'started');
  gunner.infantryCombatRuntime.activeFireTask = null;
  gunner.behaviorRuntime.physicalActionCoordinator.activeLeases = [];

  const outside = requestFireTask(gunner, fireRequest('outside', targetPoint(gunner, -50, 0), 'single'));
  assert.equal(outside.status, 'deployed_traverse_exceeded');

  const areaCrossesSector = requestFireTask(
    gunner,
    fireRequest('area-crosses', targetPoint(gunner, 5, 0), 'suppress', 20),
  );
  assert.equal(areaCrossesSector.status, 'deployed_traverse_exceeded');

  const areaInside = requestFireTask(
    gunner,
    fireRequest('area-inside', targetPoint(gunner, 60, 0), 'suppress', 2),
  );
  assert.equal(areaInside.status, 'started');
}

function verifyCommitTimeTraverseRecheck(): void {
  const state = createStage9State();
  const { gunner } = equipStage9Roles(state);
  assert.equal(requestDeployWeapon(state, gunner, deploymentRequest('commit-deploy', null)).status, 'started');
  tickWeaponActions(state, { intervalStartSeconds: 0, deltaSeconds: 1.6 });
  const requested = requestFireTask(gunner, fireRequest('commit-recheck', targetPoint(gunner, 50, 0), 'single'));
  assert.equal(requested.status, 'started');

  let clock = 2;
  let commitRequested = false;
  for (let guard = 0; guard < 20 && !commitRequested; guard += 1) {
    const tick = tickFireTaskWithTimeBudget(gunner, { intervalStartSeconds: clock, deltaSeconds: 0.25, state });
    clock += tick.consumedSeconds;
    commitRequested = tick.commitRequested;
    if (tick.consumedSeconds <= 1e-9 && !commitRequested) clock += 0.25;
  }
  assert.equal(commitRequested, true);
  const task = gunner.infantryCombatRuntime.activeFireTask!;
  const outside = targetPoint(gunner, -40, 0);
  task.aimTracking.solution.predictedAimPoint = outside;
  task.aimTracking.solution.currentDirection = { x: -1, y: 0, z: 0 };
  const roundsBefore = gunner.infantryCombatRuntime.primaryWeapon!.roundsInWeapon;
  const result = commitShot({
    state,
    shooter: gunner,
    task,
    weapon: gunner.infantryCombatRuntime.primaryWeapon!,
    committedSeconds: clock,
    shotOrdinal: task.nextShotOrdinal,
  });
  assert.equal(result.status, 'deployed_traverse_exceeded');
  assert.equal(gunner.infantryCombatRuntime.primaryWeapon!.roundsInWeapon, roundsBefore);
}
