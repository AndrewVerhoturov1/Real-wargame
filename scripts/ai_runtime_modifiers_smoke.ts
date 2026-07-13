import assert from 'node:assert/strict';
import type { AiGraph } from '../src/core/ai/AiGraph';
import { runAiGraphRuntime } from '../src/core/ai/AiGraphRuntime';

const waitForEventGraph: AiGraph = {
  version: 1,
  id: 'wait_for_event_graph',
  name: 'Wait for event',
  rootNodeId: 'root',
  blackboardDefaults: {},
  nodes: [
    { id: 'root', type: 'Root', children: ['sequence'] },
    { id: 'sequence', type: 'SequenceWithMemory', children: ['wait_event'] },
    { id: 'wait_event', type: 'WaitForEvent', children: [], parameters: { eventType: 'shot_nearby', timeoutSeconds: 5, consumeEvent: true } },
  ],
};
const eventStart = runAiGraphRuntime({ graph: waitForEventGraph, unitId: 'soldier_event', blackboard: {}, cooldowns: {}, nowMs: 0, events: [] });
assert.equal(eventStart.status, 'waiting');
assert.equal(eventStart.activeNodeId, 'wait_event');
const eventDone = runAiGraphRuntime({
  graph: waitForEventGraph,
  unitId: 'soldier_event',
  blackboard: {},
  cooldowns: {},
  nowMs: 100,
  executionState: eventStart.executionState,
  events: [{ version: 1, id: 'event-shot-1', sequence: 0, type: 'shot_nearby', timestampMs: 100, priority: 100, payload: { direction: 90 } }],
});
assert.equal(eventDone.status, 'success');
assert.deepEqual(eventDone.consumedEventIds, ['event-shot-1']);

const timeoutGraph: AiGraph = {
  version: 1,
  id: 'timeout_graph',
  name: 'Timeout graph',
  rootNodeId: 'root',
  blackboardDefaults: {},
  nodes: [
    { id: 'root', type: 'Root', children: ['timeout'] },
    { id: 'timeout', type: 'Timeout', children: ['long_wait'], parameters: { timeoutSeconds: 1 } },
    { id: 'long_wait', type: 'Wait', children: [], parameters: { durationSeconds: 10, timeoutSeconds: 0 } },
  ],
};
const timeoutStart = runAiGraphRuntime({ graph: timeoutGraph, unitId: 'soldier_timeout', blackboard: {}, cooldowns: {}, nowMs: 0 });
assert.equal(timeoutStart.status, 'waiting');
const timeoutDone = runAiGraphRuntime({ graph: timeoutGraph, unitId: 'soldier_timeout', blackboard: {}, cooldowns: {}, nowMs: 1500, executionState: timeoutStart.executionState });
assert.equal(timeoutDone.status, 'failure');
assert.ok(timeoutDone.trace.some((item) => item.nodeId === 'timeout' && item.status === 'fail'));
assert.equal(timeoutDone.lifecycle.filter((item) => item.phase === 'cancel' && item.nodeId === 'long_wait').length, 1, 'timeout must cancel child once');

const retryGraph: AiGraph = {
  version: 1,
  id: 'retry_graph',
  name: 'Retry graph',
  rootNodeId: 'root',
  blackboardDefaults: {},
  nodes: [
    { id: 'root', type: 'Root', children: ['retry'] },
    { id: 'retry', type: 'Retry', children: ['failing_wait'], parameters: { maxAttempts: 2 } },
    { id: 'failing_wait', type: 'Wait', children: [], parameters: { durationSeconds: 10, timeoutSeconds: 1 } },
  ],
};
const retryStart = runAiGraphRuntime({ graph: retryGraph, unitId: 'soldier_retry', blackboard: {}, cooldowns: {}, nowMs: 0 });
assert.equal(retryStart.status, 'waiting');
const retrySecondAttempt = runAiGraphRuntime({ graph: retryGraph, unitId: 'soldier_retry', blackboard: {}, cooldowns: {}, nowMs: 1500, executionState: retryStart.executionState });
assert.equal(retrySecondAttempt.status, 'waiting');
const retryFrame = retrySecondAttempt.executionState?.frames?.find((frame) => frame.nodeId === 'retry');
assert.equal(retryFrame?.kind, 'retry');
assert.equal(retryFrame && 'attempt' in retryFrame ? retryFrame.attempt : 0, 2);
const retryFailed = runAiGraphRuntime({ graph: retryGraph, unitId: 'soldier_retry', blackboard: {}, cooldowns: {}, nowMs: 3000, executionState: retrySecondAttempt.executionState });
assert.equal(retryFailed.status, 'failure');
assert.ok(retryFailed.trace.some((item) => item.nodeId === 'retry' && item.status === 'fail'));

console.log('AI runtime modifiers smoke passed: WaitForEvent, Timeout cancellation and bounded Retry.');
