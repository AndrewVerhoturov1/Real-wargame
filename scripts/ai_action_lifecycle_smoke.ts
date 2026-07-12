import assert from 'node:assert/strict';
import type { AiNode } from '../src/core/ai/AiGraph';
import { AiActionRegistry } from '../src/core/ai/runtime/AiActionRegistry';
import {
  runAiActionLifecycle,
  type AiActionRuntimeContext,
  type AiNodeLifecycle,
} from '../src/core/ai/runtime/AiNodeLifecycle';

interface CounterState {
  readonly updates: number;
}

const counters = { start: 0, update: 0, cancel: 0, cleanup: 0 };
const lifecycle: AiNodeLifecycle<CounterState> = {
  start: () => {
    counters.start += 1;
    return { status: 'running', state: { updates: 0 }, reason: 'Started.', reasonRu: 'Запущено.' };
  },
  update: (_context, state) => {
    counters.update += 1;
    const updates = state.updates + 1;
    return updates >= 2
      ? { status: 'success', state: { updates }, reason: 'Done.', reasonRu: 'Готово.' }
      : { status: 'running', state: { updates }, reason: 'Running.', reasonRu: 'Выполняется.' };
  },
  cancel: (_context, state, cancellation) => {
    counters.cancel += 1;
    return { status: 'cancelled', state, reason: cancellation.reason, reasonRu: cancellation.reasonRu };
  },
  cleanup: () => {
    counters.cleanup += 1;
    return [];
  },
  validateState: (value): value is CounterState => (
    typeof value === 'object' && value !== null && 'updates' in value && typeof value.updates === 'number'
  ),
};

const registry = new AiActionRegistry().register('CounterAction', lifecycle);
assert.equal(registry.has('CounterAction'), true);
assert.deepEqual(registry.listTypes(), ['CounterAction']);
assert.throws(() => registry.register('CounterAction', lifecycle), /already registered/i);

const context = makeContext();
const started = runAiActionLifecycle({ lifecycle, context, phase: 'start' });
assert.equal(started.status, 'running');
assert.equal(started.cleanupCompleted, false);
assert.deepEqual(counters, { start: 1, update: 0, cancel: 0, cleanup: 0 });

const firstUpdate = runAiActionLifecycle({ lifecycle, context, phase: 'update', state: started.state });
assert.equal(firstUpdate.status, 'running');
assert.equal(firstUpdate.cleanupCompleted, false);
assert.deepEqual(counters, { start: 1, update: 1, cancel: 0, cleanup: 0 });

const completed = runAiActionLifecycle({ lifecycle, context, phase: 'update', state: firstUpdate.state });
assert.equal(completed.status, 'success');
assert.equal(completed.state, undefined);
assert.equal(completed.cleanupCompleted, true);
assert.deepEqual(counters, { start: 1, update: 2, cancel: 0, cleanup: 1 });

const cancelCounters = { cleanup: 0 };
const cancelLifecycle: AiNodeLifecycle<CounterState> = {
  ...lifecycle,
  cleanup: () => {
    cancelCounters.cleanup += 1;
    return [];
  },
};
const cancelled = runAiActionLifecycle({
  lifecycle: cancelLifecycle,
  context,
  phase: 'cancel',
  state: { updates: 1 },
  cancellation: { reason: 'Cancelled.', reasonRu: 'Отменено.' },
});
assert.equal(cancelled.status, 'cancelled');
assert.equal(cancelled.cleanupCompleted, true);
assert.equal(cancelCounters.cleanup, 1);

let exceptionCleanup = 0;
const exceptionLifecycle: AiNodeLifecycle<CounterState> = {
  ...lifecycle,
  update: () => {
    throw new Error('synthetic update failure');
  },
  cleanup: () => {
    exceptionCleanup += 1;
    return [];
  },
};
const failed = runAiActionLifecycle({
  lifecycle: exceptionLifecycle,
  context,
  phase: 'update',
  state: { updates: 0 },
});
assert.equal(failed.status, 'failure');
assert.equal(failed.cleanupCompleted, true);
assert.equal(exceptionCleanup, 1);
assert.match(failed.reasonRu ?? '', /synthetic update failure/i);

console.log('AI action lifecycle smoke passed: registry, start/update, terminal cleanup, cancel and controlled exception cleanup.');

function makeContext(): AiActionRuntimeContext {
  return {
    node: {
      id: 'counter',
      type: 'CounterAction',
      children: [],
      parameters: {},
    } as AiNode,
    unitId: 'soldier_1',
    nowMs: 1200,
    startedAtMs: 0,
    blackboard: {},
  };
}
