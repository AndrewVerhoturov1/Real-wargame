import assert from 'node:assert/strict';
import {
  createPhysicalActionCoordinatorState,
  requestPhysicalActionChannels,
  serializePhysicalActionCoordinatorState,
} from '../src/core/actions/PhysicalActionCoordinator';
import {
  reconcilePhysicalActionCoordinatorState,
  type ReconciledPhysicalActionPayloadV1,
} from '../src/core/actions/PhysicalActionCoordinatorReconciliation';
import type { PhysicalActionCoordinatorStateV1 } from '../src/core/actions/PhysicalActionCoordinatorTypes';

interface TestUnit {
  id: string;
  behaviorRuntime: {
    physicalActionCoordinator: PhysicalActionCoordinatorStateV1;
  };
}

verifyMissingLeaseReconciliationIsIdempotent();
verifyOrphanRemovalIsIdempotent();

console.log('Physical action coordinator reconciliation smoke passed: restoration and orphan cleanup are deterministic and idempotent.');

function verifyMissingLeaseReconciliationIsIdempotent(): void {
  const unit = makeUnit('reconcile-restore');
  const payload: ReconciledPhysicalActionPayloadV1 = { actionHandle: null };
  const input = {
    actions: [{
      payload,
      actionId: 'legacy-posture-action:4',
      sequence: 4,
      actionType: 'posture_transition',
      owner: { source: 'player' as const, id: 'player-a' },
      ownerToken: 'legacy-owner-token',
      channels: ['locomotion', 'posture', 'weapon'] as const,
      startedSeconds: 1.5,
      reasonCode: 'legacy_posture_restored',
      reasonRu: 'Смена позы восстановлена.',
    }],
    knownActionTypes: ['posture_transition'],
    reconciledSeconds: 2,
  };

  const first = reconcilePhysicalActionCoordinatorState(unit as never, input);
  assert.equal(first.changed, true);
  assert.equal(first.restoredLeaseCount, 1);
  assert.equal(first.removedOrphanCount, 0);
  assert.deepEqual(first.blockedActionIds, []);
  assert.ok(payload.actionHandle);
  assert.equal(payload.actionHandle.actionId, 'legacy-posture-action:4');
  assert.equal(payload.actionHandle.sequence, 4);
  assert.ok(unit.behaviorRuntime.physicalActionCoordinator.nextSequence > 4);

  const beforeRepeat = serializePhysicalActionCoordinatorState(unit.behaviorRuntime.physicalActionCoordinator);
  const second = reconcilePhysicalActionCoordinatorState(unit as never, input);
  assert.equal(second.changed, false);
  assert.equal(second.restoredLeaseCount, 0);
  assert.equal(second.removedOrphanCount, 0);
  assert.deepEqual(second.blockedActionIds, []);
  assert.deepEqual(
    serializePhysicalActionCoordinatorState(unit.behaviorRuntime.physicalActionCoordinator),
    beforeRepeat,
  );
}

function verifyOrphanRemovalIsIdempotent(): void {
  const unit = makeUnit('reconcile-orphan');
  const started = requestPhysicalActionChannels(unit as never, {
    actionType: 'movement_weapon_preparation',
    owner: { source: 'movement', id: 'contact-a' },
    ownerToken: 'movement-token',
    channels: ['locomotion', 'weapon'],
    startedSeconds: 3,
    reasonCode: 'movement_preparation_started',
    reasonRu: 'Начата подготовка оружия.',
  });
  assert.equal(started.accepted, true);

  const input = {
    actions: [],
    knownActionTypes: ['movement_weapon_preparation'],
    reconciledSeconds: 4,
  };
  const first = reconcilePhysicalActionCoordinatorState(unit as never, input);
  assert.equal(first.changed, true);
  assert.equal(first.removedOrphanCount, 1);
  assert.equal(unit.behaviorRuntime.physicalActionCoordinator.activeLeases.length, 0);
  assert.equal(unit.behaviorRuntime.physicalActionCoordinator.lastResult?.status, 'failed');
  assert.equal(
    unit.behaviorRuntime.physicalActionCoordinator.lastResult?.resultCode,
    'physical_action_orphan_lease_removed',
  );

  const beforeRepeat = serializePhysicalActionCoordinatorState(unit.behaviorRuntime.physicalActionCoordinator);
  const second = reconcilePhysicalActionCoordinatorState(unit as never, input);
  assert.equal(second.changed, false);
  assert.equal(second.removedOrphanCount, 0);
  assert.deepEqual(
    serializePhysicalActionCoordinatorState(unit.behaviorRuntime.physicalActionCoordinator),
    beforeRepeat,
  );
}

function makeUnit(id: string): TestUnit {
  return {
    id,
    behaviorRuntime: {
      physicalActionCoordinator: createPhysicalActionCoordinatorState(),
    },
  };
}
