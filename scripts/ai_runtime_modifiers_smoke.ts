import assert from 'node:assert/strict';
import type { AiGraph } from '../src/core/ai/AiGraph';
import { runAiGraphRuntime } from '../src/core/ai/AiGraphRuntime';

const waitForEventGraph: AiGraph = {
  version: 2,
  id: 'wait_for_event_graph',
  name: 'Wait for event graph',
  rootNodeId: 'root',
  blackboardDefaults: {},
  blackboardSchema: [],
  subgraphRefs: [],
  nodes: [
    { id: 'root', type: 'Root', children: ['branch'] },
    { id: 'branch', type: 'ActionBranch', children: ['wait_event'] },
    { id: 'wait_event', type: 'WaitForEvent', children: [], parameters: { eventType: 'shot_nearby', timeoutSeconds: 5, consumeEvent: true } },
  ],
};

const waiting = runAiGraphRuntime({ graph: waitForEventGraph, unitId: 'soldier_event', blackboard: {}, cooldowns: {}, nowMs: 0, events: [] });
assert.equal(waiting.status, 'waiting');
assert.equal(waiting.activeNodeId, 'wait_event');
assert.equal(waiting.executionState?.activeData?.kind, 'wait_for_event');

const restoredWaiting = runAiGraphRuntime({
  graph: waitForEventGraph,
  unitId: 'soldier_event',
  blackboard: {},
  cooldowns: {},
  nowMs: 100,
  events: [],
  executionState: JSON.parse(JSON.stringify(waiting.executionState)),
});
assert.equal(restoredWaiting.status, 'waiting');

const eventResult = runAiGraphRuntime({
  graph: waitForEventGraph,
  unitId: 'soldier_event',
  blackboard: {},
  cooldowns: {},
  nowMs: 200,
  executionState: restoredWaiting.executionState,
  events: [{ version: 1, id: 'event-shot-1', sequence: 1, type: 'shot_nearby', timestampMs: 150, priority: 50, payload: { direction: 90 } }],
});
assert.equal(eventResult.status, 'success');
assert.deepEqual(eventResult.consumedEventIds, ['event-shot-1']);

const timeoutGraph: AiGraph = {
  version: 2,
  id: 'timeout_graph',
  name: 'Timeout graph',
  rootNodeId: 'root',
  blackboardSchema: [],
  blackboardDefaults: { best_cover_position: { x: 8, y: 0 }, self_position: { x: 0, y: 0 } },
  subgraphRefs: [],
  nodes: [
    { id: 'root', type: 'Root', children: ['branch'] },
    { id: 'branch', type: 'ActionBranch', children: ['timeout'] },
    { id: 'timeout', type: 'Timeout', children: ['move'], parameters: { timeoutSeconds: 1 } },
    { id: 'move', type: 'MoveToBlackboardPosition', children: [], parameters: { targetKey: 'best_cover_position', acceptanceRadiusCells: 0.2, timeoutSeconds: 0 } },
  ],
};

const timeoutStart = runAiGraphRuntime({ graph: timeoutGraph, unitId: 'soldier_timeout', blackboard: timeoutGraph.blackboardDefaults, cooldowns: {}, nowMs: 0 });
assert.equal(timeoutStart.status, 'running');
assert.equal(timeoutStart.effects.filter((effect) => effect.type === 'begin_move').length, 1);
const token = timeoutStart.actionToken;
assert.ok(token);

const timedOut = runAiGraphRuntime({
  graph: timeoutGraph,
  unitId: 'soldier_timeout',
  blackboard: {
    ...timeoutGraph.blackboardDefaults,
    active_move_source: 'ai',
    active_move_owner_token: token ?? null,
  },
  cooldowns: {},
  nowMs: 1100,
  executionState: timeoutStart.executionState,
});
assert.equal(timedOut.status, 'failure');
const clears = timedOut.effects.filter((effect) => effect.type === 'clear_move') as Array<{ type: string; ownerToken?: string }>;
assert.equal(clears.length, 1, 'Timeout must cleanup its active child exactly once.');
assert.equal(clears[0]?.ownerToken, token);

const retryGraph: AiGraph = {
  version: 2,
  id: 'retry_graph',
  name: 'Retry graph',
  rootNodeId: 'root',
  blackboardSchema: [],
  blackboardDefaults: { allow_action: false },
  subgraphRefs: [],
  nodes: [
    { id: 'root', type: 'Root', children: ['branch'] },
    { id: 'branch', type: 'ActionBranch', children: ['retry'] },
    { id: 'retry', type: 'Retry', children: ['condition'], parameters: { maxAttempts: 3 } },
    { id: 'condition', type: 'FlagCheck', children: [], parameters: { flagKey: 'allow_action', expected: true } },
  ],
};

const retried = runAiGraphRuntime({ graph: retryGraph, unitId: 'soldier_retry', blackboard: { allow_action: false }, cooldowns: {}, nowMs: 0 });
assert.equal(retried.status, 'failure');
assert.equal(retried.trace.filter((item) => item.nodeId === 'condition' && item.status === 'fail').length, 3, 'Retry must stop after maxAttempts.');
assert.equal(retried.executionState, undefined);

console.log('AI runtime modifiers smoke passed: WaitForEvent, Timeout cleanup, and bounded Retry.');
