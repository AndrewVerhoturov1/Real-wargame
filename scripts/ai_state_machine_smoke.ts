import assert from 'node:assert/strict';
import {
  DEFAULT_AI_STATE_MACHINE,
  getAiStatePath,
  type AiStateMachineDefinition,
} from '../src/core/ai/state/AiStateMachine';
import {
  createAiStateRuntime,
  normalizeAiStateRuntime,
  updateAiStateRuntime,
} from '../src/core/ai/state/AiStateRuntime';

const initial = createAiStateRuntime({ enteredAtMs: 0 });
assert.equal(initial.activeStateId, 'Idle');
assert.deepEqual(initial.activePath, ['Normal', 'Idle']);

const tooEarlyOrder = updateAiStateRuntime(initial, {
  nowMs: 50,
  triggers: ['move_order_received'],
});
assert.equal(tooEarlyOrder.runtime.activeStateId, 'Idle', 'Minimum state duration must prevent early transition.');

const following = updateAiStateRuntime(initial, {
  nowMs: 100,
  triggers: ['move_order_received'],
});
assert.equal(following.runtime.activeStateId, 'FollowingOrder');
assert.deepEqual(following.transition?.exitedStateIds, ['Idle']);
assert.deepEqual(following.transition?.enteredStateIds, ['FollowingOrder']);
assert.equal(following.runtime.lastTransition?.reasonRu, 'Получен приказ движения.');

const contact = updateAiStateRuntime(following.runtime, {
  nowMs: 300,
  triggers: ['enemy_spotted'],
});
assert.equal(contact.runtime.activeStateId, 'Contact');
assert.deepEqual(contact.transition?.exitedStateIds, ['FollowingOrder', 'Normal']);
assert.deepEqual(contact.transition?.enteredStateIds, ['Combat', 'Contact']);

const suppressedEmergency = updateAiStateRuntime(contact.runtime, {
  nowMs: 310,
  suppression: 90,
});
assert.equal(suppressedEmergency.runtime.activeStateId, 'Suppressed', 'Wildcard emergency transition must ignore normal minimum duration.');
assert.equal(suppressedEmergency.transition?.transitionId, 'any_to_suppressed');
assert.deepEqual(suppressedEmergency.transition?.exitedStateIds, ['Contact']);
assert.deepEqual(suppressedEmergency.transition?.enteredStateIds, ['Suppressed']);
assert.deepEqual(getAiStatePath(DEFAULT_AI_STATE_MACHINE, 'Suppressed'), ['Combat', 'Suppressed']);

const stillSuppressed = updateAiStateRuntime(suppressedEmergency.runtime, {
  nowMs: 1000,
  suppression: 20,
  suppressionExitStableMs: 1200,
});
assert.equal(stillSuppressed.runtime.activeStateId, 'Suppressed');
assert.equal(stillSuppressed.runtime.suppressionBelowSinceMs, 1000);

const unstableAgain = updateAiStateRuntime(stillSuppressed.runtime, {
  nowMs: 1700,
  suppression: 45,
  suppressionExitStableMs: 1200,
});
assert.equal(unstableAgain.runtime.activeStateId, 'Suppressed');
assert.equal(unstableAgain.runtime.suppressionBelowSinceMs, undefined, 'Rising above exit threshold must reset stability timer.');

const belowAgain = updateAiStateRuntime(unstableAgain.runtime, {
  nowMs: 1800,
  suppression: 20,
  suppressionExitStableMs: 1200,
});
assert.equal(belowAgain.runtime.activeStateId, 'Suppressed');

const stableExit = updateAiStateRuntime(belowAgain.runtime, {
  nowMs: 3000,
  suppression: 20,
  suppressionExitStableMs: 1200,
});
assert.equal(stableExit.runtime.activeStateId, 'Contact');
assert.deepEqual(stableExit.transition?.exitedStateIds, ['Suppressed']);
assert.deepEqual(stableExit.transition?.enteredStateIds, ['Contact']);
assert.equal(stableExit.transition?.reasonRu, 'Подавление устойчиво снизилось ниже порога выхода.');

const deterministicMachine: AiStateMachineDefinition = {
  ...DEFAULT_AI_STATE_MACHINE,
  transitions: [
    {
      id: 'z_transition',
      from: 'Idle',
      to: 'FollowingOrder',
      priority: 100,
      trigger: 'manual',
      guards: [],
      reason: 'Z',
      reasonRu: 'Z',
    },
    {
      id: 'a_transition',
      from: 'Idle',
      to: 'Contact',
      priority: 100,
      trigger: 'manual',
      guards: [],
      reason: 'A',
      reasonRu: 'A',
    },
  ],
};
const deterministic = updateAiStateRuntime(createAiStateRuntime({ enteredAtMs: 0, machine: deterministicMachine }), {
  nowMs: 100,
  triggers: ['manual'],
  machine: deterministicMachine,
});
assert.equal(deterministic.transition?.transitionId, 'a_transition', 'Equal priorities must use deterministic transition id ordering.');
assert.equal(deterministic.runtime.activeStateId, 'Contact');

const restored = normalizeAiStateRuntime(JSON.parse(JSON.stringify(stableExit.runtime)));
assert.equal(restored.activeStateId, 'Contact');
assert.equal(restored.enteredAtMs, 3000);
assert.equal(restored.trace.at(-1)?.transitionId, 'suppressed_to_contact');

console.log('AI state machine smoke passed: hierarchy, priority, wildcard emergency, minimum duration, hysteresis, trace and restore.');
