import assert from 'node:assert/strict';
import {
  cancelPhysicalAction,
  createPhysicalActionCoordinatorState,
  getPhysicalActionLease,
  requestPhysicalActionChannels,
  serializePhysicalActionCoordinatorState,
} from '../src/core/actions/PhysicalActionCoordinator';
import type { PhysicalActionOwner } from '../src/core/actions/PhysicalActionCoordinatorTypes';
import { createDefaultCombatCatalogRegistry } from '../src/core/infantry-combat/catalogs';
import {
  FIRE_TASK_ACTION_TYPE,
  cancelSingleFireTask,
  requestSingleFireTask,
  tickFireTaskWithTimeBudget,
  equipPrimaryWeaponFromLoadout,
  serializeInfantryCombatUnitRuntime,
} from '../src/core/infantry-combat/runtime';
import { normalizeUnits, type UnitModel } from '../src/core/units/UnitModel';

verifyWeaponOnlyLeaseAndIdempotency();
verifyForeignAndRetargetRequestsAreBlocked();
verifyExistingPhysicalActionsBlockFireTask();
verifyFireTaskBlocksLegacyWeaponAction();
verifyReadyAimAndLargeTimeBudget();
verifyCancelAndRecoveryReleaseExactLease();
verifyUnsupportedModeIsRejected();
verifyActiveTaskRoundTripRestoresExactLease();

console.log('Infantry combat FireTask smoke passed: ownership, conflicts, idempotency, exact time budgets, aiming gate, cancellation and recovery.');

function verifyWeaponOnlyLeaseAndIdempotency(): void {
  const unit = makeRifleman('fire-lease');
  const input = requestInput('token-a', { xMetres: 30, yMetres: 4, zMetres: 1.2 });
  const first = requestSingleFireTask(unit, input);
  assert.equal(first.accepted, true);
  assert.equal(first.status, 'started');
  assert.equal(first.task?.taskId, 'fire-lease:fire-task:1');
  assert.deepEqual(first.lease?.channels, ['weapon']);
  assert.equal(unit.infantryCombatRuntime.nextFireTaskSequence, 2);

  const repeated = requestSingleFireTask(unit, { ...input, owner: owner('test', 'other-owner-label') });
  assert.equal(repeated.accepted, true);
  assert.equal(repeated.status, 'already_running');
  assert.equal(repeated.task, first.task);
  assert.equal(unit.infantryCombatRuntime.nextFireTaskSequence, 2);
  assert.equal(unit.behaviorRuntime.physicalActionCoordinator.activeLeases.length, 1);
}

function verifyForeignAndRetargetRequestsAreBlocked(): void {
  const unit = makeRifleman('fire-conflict');
  const first = requestSingleFireTask(unit, requestInput('owner-a', { xMetres: 20, yMetres: 0, zMetres: 1 }));
  assert.equal(first.accepted, true);
  const foreign = requestSingleFireTask(unit, requestInput('owner-b', { xMetres: 20, yMetres: 0, zMetres: 1 }));
  assert.equal(foreign.accepted, false);
  assert.equal(foreign.status, 'active_task_owned_elsewhere');
  const retarget = requestSingleFireTask(unit, requestInput('owner-a', { xMetres: 21, yMetres: 0, zMetres: 1 }));
  assert.equal(retarget.accepted, false);
  assert.equal(retarget.status, 'explicit_cancel_required');
  assert.equal(unit.infantryCombatRuntime.nextFireTaskSequence, 2);
}

function verifyExistingPhysicalActionsBlockFireTask(): void {
  for (const [actionType, channels] of [
    ['posture_transition', ['locomotion', 'posture', 'weapon']],
    ['movement_weapon_preparation', ['locomotion', 'weapon']],
    ['legacy_fire_action', ['weapon']],
  ] as const) {
    const unit = makeRifleman(`blocked-${actionType}`);
    const occupied = requestPhysicalActionChannels(unit, {
      actionType,
      owner: owner('test', `${actionType}-owner`),
      ownerToken: `${actionType}-token`,
      channels,
      startedSeconds: 0,
      reasonCode: 'occupied_for_test',
      reasonRu: 'Канал занят тестом.',
    });
    assert.equal(occupied.accepted, true);
    const result = requestSingleFireTask(unit, requestInput('fire-owner', { xMetres: 25, yMetres: 0, zMetres: 1 }));
    assert.equal(result.accepted, false, actionType);
    assert.equal(result.status, 'channels_blocked', actionType);
    assert.equal(unit.infantryCombatRuntime.activeFireTask, null, actionType);
    assert.equal(unit.infantryCombatRuntime.nextFireTaskSequence, 1, actionType);
  }
}

function verifyFireTaskBlocksLegacyWeaponAction(): void {
  const unit = makeRifleman('new-blocks-old');
  const task = requestSingleFireTask(unit, requestInput('new-fire', { xMetres: 25, yMetres: 0, zMetres: 1 }));
  assert.equal(task.accepted, true);
  const legacy = requestPhysicalActionChannels(unit, {
    actionType: 'legacy_fire_action',
    owner: owner('system', 'legacy-fire'),
    ownerToken: 'legacy-fire-token',
    channels: ['weapon'],
    startedSeconds: 0,
    reasonCode: 'legacy_fire_requested',
    reasonRu: 'Старая стрельба запрошена.',
  });
  assert.equal(legacy.accepted, false);
  assert.equal(legacy.status, 'blocked');
}

function verifyReadyAimAndLargeTimeBudget(): void {
  const coarse = makeRifleman('coarse');
  const fine = makeRifleman('fine');
  const request = requestInput('time-budget', { xMetres: 100, yMetres: 0, zMetres: 1 }, 0.55);
  assert.equal(requestSingleFireTask(coarse, request).accepted, true);
  assert.equal(requestSingleFireTask(fine, request).accepted, true);

  const coarseTick = tickFireTaskWithTimeBudget(coarse, {
    intervalStartSeconds: 0,
    deltaSeconds: 2,
  });
  assert.equal(coarseTick.commitRequested, true);
  assert.equal(coarse.infantryCombatRuntime.activeFireTask?.phase, 'firing');
  assert.ok(Math.abs(coarseTick.consumedSeconds - 1.7) < 1e-9);
  assert.ok(Math.abs(coarseTick.remainingSeconds - 0.3) < 1e-9);
  assert.equal(coarse.infantryCombatRuntime.activeFireTask?.aimQuality, 0.55);

  let fineRemaining = 0;
  for (let index = 0; index < 20; index += 1) {
    const result = tickFireTaskWithTimeBudget(fine, {
      intervalStartSeconds: index * 0.1,
      deltaSeconds: 0.1,
    });
    if (result.commitRequested) {
      fineRemaining = result.remainingSeconds;
      break;
    }
  }
  assert.equal(fine.infantryCombatRuntime.activeFireTask?.phase, 'firing');
  assert.equal(fine.infantryCombatRuntime.activeFireTask?.aimQuality, 0.55);
  assert.ok(fineRemaining < 1e-9);

  const readyOnly = makeRifleman('ready-only');
  requestSingleFireTask(readyOnly, requestInput('ready-owner', { xMetres: 30, yMetres: 0, zMetres: 1 }, 1));
  const readyTick = tickFireTaskWithTimeBudget(readyOnly, { intervalStartSeconds: 0, deltaSeconds: 0.7 });
  assert.equal(readyTick.commitRequested, false);
  assert.equal(readyOnly.infantryCombatRuntime.activeFireTask?.phase, 'aiming');
  assert.equal(readyOnly.infantryCombatRuntime.activeFireTask?.aimQuality, 0);
}

function verifyCancelAndRecoveryReleaseExactLease(): void {
  const unit = makeRifleman('terminal-release');
  const started = requestSingleFireTask(unit, requestInput('cancel-owner', { xMetres: 30, yMetres: 0, zMetres: 1 }));
  assert.ok(started.task?.actionHandle);
  const oldHandle = structuredClone(started.task.actionHandle);
  const cancelled = cancelSingleFireTask(unit, {
    ownerToken: 'cancel-owner',
    endedSeconds: 0.2,
    resultCode: 'test_cancelled',
    resultRu: 'Отменено тестом.',
  });
  assert.equal(cancelled.accepted, true);
  assert.equal(unit.infantryCombatRuntime.activeFireTask, null);
  assert.equal(unit.infantryCombatRuntime.lastFireResult?.phase, 'cancelled');
  assert.equal(getPhysicalActionLease(unit, oldHandle), null);

  const second = requestSingleFireTask(unit, requestInput('cancel-owner', { xMetres: 31, yMetres: 0, zMetres: 1 }, 0));
  assert.equal(second.accepted, true);
  assert.ok(second.task?.actionHandle);
  assert.notDeepEqual(second.task!.actionHandle, oldHandle);
  const stale = cancelPhysicalAction(unit, oldHandle, {
    endedSeconds: 0.3,
    resultCode: 'late_cancel',
    resultRu: 'Поздняя отмена.',
  });
  assert.equal(stale.accepted, false);
  assert.equal(stale.status, 'stale_handle');
  assert.ok(getPhysicalActionLease(unit, second.task!.actionHandle!));

  second.task!.phase = 'recovery';
  second.task!.recoveryRemainingSeconds = 0.35;
  second.task!.phaseStartedSeconds = 0.3;
  const recovery = tickFireTaskWithTimeBudget(unit, { intervalStartSeconds: 0.3, deltaSeconds: 0.5 });
  assert.equal(recovery.completed, true);
  assert.ok(Math.abs(recovery.remainingSeconds - 0.15) < 1e-9);
  assert.equal(unit.infantryCombatRuntime.activeFireTask, null);
  assert.equal(unit.infantryCombatRuntime.lastFireResult?.phase, 'completed');
  assert.equal(unit.behaviorRuntime.physicalActionCoordinator.activeLeases.length, 0);
}

function verifyUnsupportedModeIsRejected(): void {
  const unit = makeRifleman('unsupported');
  const result = requestSingleFireTask(unit, {
    ...requestInput('burst-owner', { xMetres: 20, yMetres: 0, zMetres: 1 }),
    mode: 'short_burst' as never,
  });
  assert.equal(result.accepted, false);
  assert.equal(result.status, 'unsupported_mode');
  assert.equal(unit.infantryCombatRuntime.activeFireTask, null);
  assert.equal(unit.behaviorRuntime.physicalActionCoordinator.activeLeases.length, 0);
}

function verifyActiveTaskRoundTripRestoresExactLease(): void {
  const unit = makeRifleman('fire-restore');
  const started = requestSingleFireTask(unit, requestInput('restore-owner', { xMetres: 40, yMetres: 2, zMetres: 1.1 }, 0.8));
  assert.equal(started.accepted, true);
  tickFireTaskWithTimeBudget(unit, { intervalStartSeconds: 0, deltaSeconds: 0.25 });
  const restored = normalizeUnits([{
    id: unit.id,
    type: unit.type,
    side: unit.side,
    x: unit.position.x - 0.5,
    y: unit.position.y - 0.5,
    runtime: {
      infantryCombat: serializeInfantryCombatUnitRuntime(unit.infantryCombatRuntime),
      physicalActionCoordinator: serializePhysicalActionCoordinatorState(unit.behaviorRuntime.physicalActionCoordinator),
    },
  }])[0]!;
  const restoredTask = restored.infantryCombatRuntime.activeFireTask;
  assert.ok(restoredTask);
  assert.equal(restoredTask.phase, 'weapon_ready');
  assert.ok(Math.abs(restoredTask.readyRemainingSeconds - 0.45) < 1e-9);
  assert.ok(restoredTask.actionHandle);
  assert.ok(getPhysicalActionLease(restored, restoredTask.actionHandle));
  assert.deepEqual(getPhysicalActionLease(restored, restoredTask.actionHandle)?.channels, ['weapon']);
}

function makeRifleman(id: string): UnitModel {
  const unit = normalizeUnits([{
    id,
    type: 'infantry_squad',
    side: 'blue',
    x: 2,
    y: 2,
  }])[0]!;
  unit.behaviorRuntime.physicalActionCoordinator = createPhysicalActionCoordinatorState();
  const equipped = equipPrimaryWeaponFromLoadout(
    unit,
    createDefaultCombatCatalogRegistry(),
    { definitionId: 'loadout_rifleman', revision: 1 },
  );
  assert.equal(equipped.ok, true);
  return unit;
}

function requestInput(
  ownerToken: string,
  target: { xMetres: number; yMetres: number; zMetres: number },
  minimumSolutionQuality = 0.5,
) {
  return {
    owner: owner('test', ownerToken),
    ownerToken,
    target,
    targetRadiusMetres: 0 as const,
    contactId: null,
    sourceUnitId: null,
    mode: 'single' as const,
    minimumSolutionQuality,
    maximumFriendlyFireRisk: 0,
    requestedSeconds: 0,
  };
}

function owner(source: PhysicalActionOwner['source'], id: string): PhysicalActionOwner {
  return { source, id };
}

assert.equal(FIRE_TASK_ACTION_TYPE, 'infantry_fire_task');
