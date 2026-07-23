import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  cancelPhysicalAction,
  cancelPhysicalActionBySystem,
  completePhysicalAction,
  createPhysicalActionCoordinatorState,
  failPhysicalAction,
  getPhysicalActionCoordinatorDiagnostics,
  getPhysicalActionLease,
  isPhysicalActionChannelAvailable,
  normalizePhysicalActionCoordinatorState,
  requestPhysicalActionChannels,
  serializePhysicalActionCoordinatorState,
} from '../src/core/actions/PhysicalActionCoordinator';
import type {
  PhysicalActionCoordinatorStateV1,
  PhysicalActionOwner,
} from '../src/core/actions/PhysicalActionCoordinatorTypes';

interface TestUnit {
  id: string;
  behaviorRuntime: {
    physicalActionCoordinator: PhysicalActionCoordinatorStateV1;
  };
}

verifyAtomicCanonicalAcquisition();
verifyIdempotentRequest();
verifyBlockedRequestDoesNotMutateState();
verifyExactHandleAndLateCommandProtection();
verifyTerminalOperationsAreIdempotent();
verifyExplicitSystemCancellation();
verifyNormalizationAndSerialization();
verifyDiagnostics();
verifyDeterministicSourceContract();

console.log('Physical action coordinator smoke passed: atomic channels, ownership, idempotency, stale-handle protection, terminal results, serialization and diagnostics.');

function verifyAtomicCanonicalAcquisition(): void {
  const unit = makeUnit('coordinator-atomic');
  const result = request(unit, 'posture_transition', owner('player', 'player-a'), 'token-a', ['weapon', 'locomotion', 'posture']);
  assert.equal(result.accepted, true);
  assert.equal(result.status, 'started');
  assert.deepEqual(result.lease?.channels, ['locomotion', 'posture', 'weapon']);
  assert.equal(result.handle?.actionId, 'coordinator-atomic:physical-action:1');
  assert.equal(result.handle?.sequence, 1);
  assert.equal(unit.behaviorRuntime.physicalActionCoordinator.nextSequence, 2);
  assert.equal(unit.behaviorRuntime.physicalActionCoordinator.revision, 1);
  assert.equal(unit.behaviorRuntime.physicalActionCoordinator.activeLeases.length, 1);
  assert.equal(isPhysicalActionChannelAvailable(unit as never, 'locomotion'), false);
  assert.equal(isPhysicalActionChannelAvailable(unit as never, 'posture'), false);
  assert.equal(isPhysicalActionChannelAvailable(unit as never, 'weapon'), false);
}

function verifyIdempotentRequest(): void {
  const unit = makeUnit('coordinator-idempotent');
  const first = request(unit, 'movement_weapon_preparation', owner('movement', 'move-a'), 'same-token', ['weapon', 'locomotion']);
  const revision = unit.behaviorRuntime.physicalActionCoordinator.revision;
  const nextSequence = unit.behaviorRuntime.physicalActionCoordinator.nextSequence;
  const repeated = request(unit, 'movement_weapon_preparation', owner('movement', 'move-b'), 'same-token', ['locomotion', 'weapon', 'weapon']);
  assert.equal(repeated.accepted, true);
  assert.equal(repeated.status, 'already_running');
  assert.deepEqual(repeated.handle, first.handle);
  assert.equal(unit.behaviorRuntime.physicalActionCoordinator.revision, revision);
  assert.equal(unit.behaviorRuntime.physicalActionCoordinator.nextSequence, nextSequence);
  assert.equal(unit.behaviorRuntime.physicalActionCoordinator.activeLeases.length, 1);
}

function verifyBlockedRequestDoesNotMutateState(): void {
  const unit = makeUnit('coordinator-blocked');
  const first = request(unit, 'movement_weapon_preparation', owner('movement', 'move-a'), 'move-token', ['locomotion', 'weapon']);
  assert.equal(first.accepted, true);
  const before = serializePhysicalActionCoordinatorState(unit.behaviorRuntime.physicalActionCoordinator);
  const blocked = request(unit, 'posture_transition', owner('player', 'player-a'), 'posture-token', ['posture', 'locomotion', 'weapon']);
  assert.equal(blocked.accepted, false);
  assert.equal(blocked.status, 'blocked');
  assert.deepEqual(blocked.conflicts.map((conflict) => conflict.channel), ['locomotion', 'weapon']);
  assert.deepEqual(serializePhysicalActionCoordinatorState(unit.behaviorRuntime.physicalActionCoordinator), before);
  assert.equal(getPhysicalActionLease(unit as never, first.handle!), unit.behaviorRuntime.physicalActionCoordinator.activeLeases[0]);
}

function verifyExactHandleAndLateCommandProtection(): void {
  const unit = makeUnit('coordinator-stale');
  const first = request(unit, 'posture_transition', owner('test', 'test-a'), 'token-a', ['locomotion', 'posture', 'weapon']);
  assert.ok(first.handle);
  const completed = completePhysicalAction(unit as never, first.handle!, {
    endedSeconds: 1,
    resultCode: 'first_completed',
    resultRu: 'Первое действие завершено.',
  });
  assert.equal(completed.accepted, true);
  const second = request(unit, 'posture_transition', owner('test', 'test-a'), 'token-a', ['locomotion', 'posture', 'weapon']);
  assert.ok(second.handle);
  assert.notDeepEqual(second.handle, first.handle);
  const stale = cancelPhysicalAction(unit as never, first.handle!, {
    endedSeconds: 2,
    resultCode: 'late_cancel',
    resultRu: 'Поздняя отмена.',
  });
  assert.equal(stale.accepted, false);
  assert.equal(stale.status, 'stale_handle');
  assert.ok(getPhysicalActionLease(unit as never, second.handle!));
}

function verifyTerminalOperationsAreIdempotent(): void {
  const unit = makeUnit('coordinator-terminal');
  const started = request(unit, 'action-a', owner('test', 'test-a'), 'token-a', ['weapon']);
  const failed = failPhysicalAction(unit as never, started.handle!, {
    endedSeconds: 3,
    resultCode: 'test_failed',
    resultRu: 'Тестовая ошибка.',
  });
  assert.equal(failed.accepted, true);
  const revision = unit.behaviorRuntime.physicalActionCoordinator.revision;
  const repeated = failPhysicalAction(unit as never, started.handle!, {
    endedSeconds: 4,
    resultCode: 'test_failed_again',
    resultRu: 'Повторная ошибка.',
  });
  assert.equal(repeated.accepted, true);
  assert.equal(repeated.status, 'already_finished');
  assert.equal(unit.behaviorRuntime.physicalActionCoordinator.revision, revision);
  assert.equal(unit.behaviorRuntime.physicalActionCoordinator.lastResult?.resultCode, 'test_failed');
}

function verifyExplicitSystemCancellation(): void {
  const unit = makeUnit('coordinator-system');
  const started = request(unit, 'action-a', owner('future_ai', 'future-a'), 'secret-token', ['weapon']);
  const cancelled = cancelPhysicalActionBySystem(unit as never, started.handle!.actionId, {
    endedSeconds: 5,
    resultCode: 'system_reset',
    resultRu: 'Системный сброс.',
  });
  assert.equal(cancelled.accepted, true);
  assert.equal(unit.behaviorRuntime.physicalActionCoordinator.activeLeases.length, 0);
  assert.equal(unit.behaviorRuntime.physicalActionCoordinator.lastResult?.status, 'cancelled');
}

function verifyNormalizationAndSerialization(): void {
  const normalized = normalizePhysicalActionCoordinatorState({
    schemaVersion: 1,
    revision: 4,
    nextSequence: 1,
    activeLeases: [
      {
        schemaVersion: 1,
        handle: {
          actionId: 'legacy-unit:physical-action:7',
          sequence: 7,
          revision: 3,
          ownerToken: 'legacy-token',
        },
        actionType: 'posture_transition',
        owner: { source: 'player', id: 'legacy-player' },
        channels: ['weapon', 'locomotion', 'weapon', 'posture'],
        startedSeconds: 1.25,
        reasonCode: 'legacy_restore',
        reasonRu: 'Восстановление.',
      },
    ],
    lastResult: null,
  });
  assert.equal(normalized.nextSequence, 8);
  assert.deepEqual(normalized.activeLeases[0]?.channels, ['locomotion', 'posture', 'weapon']);
  const serialized = serializePhysicalActionCoordinatorState(normalized);
  assert.deepEqual(serialized, normalized);
  assert.notEqual(serialized, normalized);
  assert.notEqual(serialized.activeLeases, normalized.activeLeases);
  assert.notEqual(serialized.activeLeases[0]?.handle, normalized.activeLeases[0]?.handle);
}

function verifyDiagnostics(): void {
  const unit = makeUnit('coordinator-diagnostics');
  const started = request(unit, 'action-a', owner('graph_v2', 'graph-a'), 'graph-token', ['weapon']);
  assert.ok(started.handle);
  const diagnostics = getPhysicalActionCoordinatorDiagnostics(unit as never);
  assert.equal(diagnostics.schemaVersion, 1);
  assert.equal(diagnostics.channels.locomotion, null);
  assert.equal(diagnostics.channels.posture, null);
  assert.equal(diagnostics.channels.weapon?.actionType, 'action-a');
  assert.equal(diagnostics.channels.weapon?.ownerToken, 'graph-token');
}

function verifyDeterministicSourceContract(): void {
  const root = process.cwd();
  const files = [
    'src/core/actions/PhysicalActionCoordinatorTypes.ts',
    'src/core/actions/PhysicalActionCoordinator.ts',
    'src/core/actions/PhysicalActionCoordinatorSerialization.ts',
    'src/core/actions/PhysicalActionCoordinatorReconciliation.ts',
  ];
  const forbidden = ['Date.now', 'performance.now', 'new Date', 'Math.random', 'crypto.randomUUID'];
  for (const relative of files) {
    const source = readFileSync(path.join(root, relative), 'utf8');
    for (const token of forbidden) assert.equal(source.includes(token), false, `${relative} contains forbidden token ${token}`);
  }
}

function request(
  unit: TestUnit,
  actionType: string,
  actionOwner: PhysicalActionOwner,
  ownerToken: string,
  channels: Array<'locomotion' | 'posture' | 'weapon'>,
) {
  return requestPhysicalActionChannels(unit as never, {
    actionType,
    owner: actionOwner,
    ownerToken,
    channels,
    startedSeconds: 0.5,
    reasonCode: `${actionType}_requested`,
    reasonRu: 'Запрошено тестовое физическое действие.',
  });
}

function makeUnit(id: string): TestUnit {
  return {
    id,
    behaviorRuntime: {
      physicalActionCoordinator: createPhysicalActionCoordinatorState(),
    },
  };
}

function owner(source: PhysicalActionOwner['source'], id: string): PhysicalActionOwner {
  return { source, id };
}
