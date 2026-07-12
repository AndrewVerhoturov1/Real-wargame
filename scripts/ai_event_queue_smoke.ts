import assert from 'node:assert/strict';
import {
  createAiEventQueue,
  drainAiEventQueue,
  normalizeAiEventQueueSnapshot,
  pruneExpiredAiEvents,
  pushAiEvent,
  takeNextAiEvent,
  type AiEventQueueSnapshotV1,
} from '../src/core/ai/events/AiEventQueue';

verifyEqualPriorityFifo();
verifyPriorityOrdering();
verifyExpiryUsesSimulationTime();
verifyCoalescingAndCloneSafety();
verifyBoundedOverflowPolicy();
verifySnapshotRoundTrip();

console.log('AI event queue smoke passed: FIFO, priority, expiry, coalescing, bounded overflow, critical reporting and snapshot round-trip.');

function verifyEqualPriorityFifo(): void {
  let queue = createAiEventQueue(8);
  queue = push(queue, event('first', 'signal', 100, 5)).queue;
  queue = push(queue, event('second', 'signal', 100, 5)).queue;
  queue = push(queue, event('third', 'signal', 100, 5)).queue;
  const drained = drainAiEventQueue(queue, 100);
  assert.deepEqual(drained.events.map((item) => item.id), ['first', 'second', 'third']);
  assert.equal(drained.queue.events.length, 0);
}

function verifyPriorityOrdering(): void {
  let queue = createAiEventQueue(8);
  queue = push(queue, event('low-old', 'signal', 10, 1)).queue;
  queue = push(queue, event('high-new', 'signal', 20, 50)).queue;
  queue = push(queue, event('high-old', 'signal', 15, 50)).queue;
  queue = push(queue, event('medium', 'signal', 5, 10)).queue;
  const drained = drainAiEventQueue(queue, 20);
  assert.deepEqual(drained.events.map((item) => item.id), ['high-old', 'high-new', 'medium', 'low-old']);

  const next = takeNextAiEvent(queue, 20);
  assert.equal(next.event?.id, 'high-old');
  assert.equal(next.queue.events.length, 3);
}

function verifyExpiryUsesSimulationTime(): void {
  let queue = createAiEventQueue(8);
  queue = push(queue, { ...event('short', 'signal', 0, 1), expiresAtMs: 100 }).queue;
  queue = push(queue, { ...event('long', 'signal', 0, 1), expiresAtMs: 1000 }).queue;

  const paused = pruneExpiredAiEvents(queue, 99);
  assert.equal(paused.events.length, 2, 'unchanged simulation time must not expire events');
  assert.equal(paused.expiredCount, 0);

  const advanced = pruneExpiredAiEvents(queue, 100);
  assert.deepEqual(advanced.events.map((item) => item.id), ['long']);
  assert.equal(advanced.expiredCount, 1);
}

function verifyCoalescingAndCloneSafety(): void {
  let queue = createAiEventQueue(8);
  const payload = { position: { x: 1, y: 2 }, samples: [1, 2] };
  queue = push(queue, {
    ...event('danger-1', 'danger_changed', 10, 5),
    targetId: 'soldier',
    coalesceKey: 'danger',
    payload,
  }).queue;
  payload.position.x = 99;
  payload.samples.push(3);
  assert.deepEqual(queue.events[0]?.payload, { position: { x: 1, y: 2 }, samples: [1, 2] });

  const replacement = push(queue, {
    ...event('danger-2', 'danger_changed', 20, 7),
    targetId: 'soldier',
    coalesceKey: 'danger',
    payload: { position: { x: 3, y: 4 }, samples: [9] },
  });
  assert.equal(replacement.accepted, true);
  assert.equal(replacement.coalesced, true);
  assert.equal(replacement.queue.events.length, 1);
  assert.equal(replacement.queue.coalescedCount, 1);
  assert.equal(replacement.queue.events[0]?.id, 'danger-2');
  assert.deepEqual(replacement.queue.events[0]?.payload, { position: { x: 3, y: 4 }, samples: [9] });

  const differentTarget = push(replacement.queue, {
    ...event('danger-other', 'danger_changed', 21, 7),
    targetId: 'other',
    coalesceKey: 'danger',
  });
  assert.equal(differentTarget.queue.events.length, 2, 'coalesce must include target identity');
}

function verifyBoundedOverflowPolicy(): void {
  let queue = createAiEventQueue(2);
  queue = push(queue, { ...event('coalescable-low', 'noise', 1, 1), coalesceKey: 'noise' }).queue;
  queue = push(queue, event('stable-medium', 'signal', 2, 10)).queue;

  const higher = push(queue, event('higher', 'signal', 3, 20));
  assert.equal(higher.accepted, true);
  assert.equal(higher.evictedEvent?.id, 'coalescable-low');
  assert.equal(higher.queue.events.length, 2);
  assert.equal(higher.queue.droppedCount, 1);

  const tooLow = push(higher.queue, event('too-low', 'signal', 4, 0));
  assert.equal(tooLow.accepted, false);
  assert.equal(tooLow.criticalOverflow, false);
  assert.equal(tooLow.queue.events.length, 2);
  assert.equal(tooLow.queue.droppedCount, 2);

  const critical = push(tooLow.queue, event('order', 'order_received', 5, 100));
  assert.equal(critical.accepted, true);
  assert.equal(critical.criticalOverflow, false);
  assert.equal(critical.queue.events.some((item) => item.id === 'order'), true);

  let criticalOnly = createAiEventQueue(2);
  criticalOnly = push(criticalOnly, event('order-a', 'order_received', 1, 100)).queue;
  criticalOnly = push(criticalOnly, event('order-b', 'order_cancelled', 2, 100)).queue;
  const rejectedCritical = push(criticalOnly, event('order-c', 'order_received', 3, 100));
  assert.equal(rejectedCritical.accepted, false);
  assert.equal(rejectedCritical.criticalOverflow, true, 'critical overflow must be explicit, never silent');
  assert.equal(rejectedCritical.queue.droppedCount, 1);
  assert.deepEqual(rejectedCritical.queue.events.map((item) => item.id), ['order-a', 'order-b']);
}

function verifySnapshotRoundTrip(): void {
  let queue = createAiEventQueue(4);
  queue = push(queue, event('a', 'signal', 1, 2)).queue;
  queue = push(queue, { ...event('b', 'signal', 2, 3), expiresAtMs: 500 }).queue;
  const serialized = JSON.parse(JSON.stringify(queue)) as unknown;
  const restored = normalizeAiEventQueueSnapshot(serialized);
  assert.deepEqual(restored, queue);

  const source = serialized as { events: Array<{ payload: { marker?: string } }> };
  source.events[0].payload.marker = 'mutated';
  assert.equal((restored.events[0]?.payload as { marker?: string }).marker, undefined);

  const legacy = normalizeAiEventQueueSnapshot(undefined, 7);
  assert.equal(legacy.maxSize, 7);
  assert.equal(legacy.events.length, 0);
  assert.equal(legacy.nextSequence, 0);
}

function push(queue: AiEventQueueSnapshotV1, draft: ReturnType<typeof event> & Record<string, unknown>) {
  return pushAiEvent(queue, draft, draft.timestampMs);
}

function event(id: string, type: string, timestampMs: number, priority: number) {
  return {
    id,
    type,
    timestampMs,
    priority,
    payload: { id },
  };
}
