import assert from 'node:assert/strict';
import type { AiGraph } from '../src/core/ai/AiGraph';
import { runAiGraphRuntime } from '../src/core/ai/AiGraphRuntime';

const nestedGraph: AiGraph = {
  version: 1,
  id: 'nested_composite_graph',
  name: 'Nested composite graph',
  nameRu: 'Граф вложенных композиций',
  rootNodeId: 'root',
  blackboardDefaults: {},
  nodes: [
    { id: 'root', type: 'Root', children: ['utility'] },
    { id: 'utility', type: 'UtilitySelector', children: ['branch'] },
    { id: 'branch', type: 'ActionBranch', displayName: 'Nested branch', displayNameRu: 'Вложенная ветвь', children: ['outer'] },
    { id: 'outer', type: 'SequenceWithMemory', children: ['wait_outer', 'inner'] },
    { id: 'wait_outer', type: 'Wait', children: [], parameters: { durationSeconds: 1, timeoutSeconds: 0 } },
    { id: 'inner', type: 'SequenceWithMemory', children: ['wait_inner', 'prone'] },
    { id: 'wait_inner', type: 'Wait', children: [], parameters: { durationSeconds: 1, timeoutSeconds: 0 } },
    { id: 'prone', type: 'SetPosture', children: [], parameters: { posture: 'prone' } },
  ],
};

const base = { graph: nestedGraph, unitId: 'soldier_nested', blackboard: {}, cooldowns: {} };
const first = runAiGraphRuntime({ ...base, nowMs: 0 });
assert.equal(first.status, 'waiting');
assert.equal(first.activeNodeId, 'wait_outer');
assert.ok(first.executionState);
assert.ok((first.executionState.frames?.length ?? 0) >= 1, 'runtime must serialize composite frames');

const second = runAiGraphRuntime({ ...base, nowMs: 1000, executionState: first.executionState });
assert.equal(second.status, 'waiting');
assert.equal(second.activeNodeId, 'wait_inner');
assert.ok(second.executionState);
assert.ok((second.executionState.frames?.length ?? 0) >= 2, 'nested sequence must keep both frames');

const third = runAiGraphRuntime({ ...base, nowMs: 2000, executionState: second.executionState });
assert.equal(third.status, 'success');
assert.equal(third.executionState, undefined);
assert.deepEqual(third.effects.map((effect) => effect.type), ['set_posture']);

const selectorGraph: AiGraph = {
  version: 1,
  id: 'selector_holds_running',
  name: 'Selector holds running child',
  rootNodeId: 'root',
  blackboardDefaults: { allow_first: false },
  nodes: [
    { id: 'root', type: 'Root', children: ['branch'] },
    { id: 'branch', type: 'ActionBranch', children: ['selector'] },
    { id: 'selector', type: 'Selector', children: ['first', 'wait'] },
    { id: 'first', type: 'FlagCheck', children: [], parameters: { flagKey: 'allow_first', expected: true } },
    { id: 'wait', type: 'Wait', children: [], parameters: { durationSeconds: 2 } },
  ],
};
const selectorStart = runAiGraphRuntime({
  graph: selectorGraph,
  unitId: 'soldier_selector',
  blackboard: { allow_first: false },
  cooldowns: {},
  nowMs: 0,
});
assert.equal(selectorStart.status, 'waiting');
assert.equal(selectorStart.activeNodeId, 'wait');
const selectorFrame = selectorStart.executionState?.frames?.find((frame) => frame.nodeId === 'selector');
assert.equal(selectorFrame?.kind, 'selector');
assert.equal(selectorFrame && 'childIndex' in selectorFrame ? selectorFrame.childIndex : -1, 1);

const selectorResume = runAiGraphRuntime({
  graph: selectorGraph,
  unitId: 'soldier_selector',
  blackboard: { allow_first: true },
  cooldowns: {},
  nowMs: 1000,
  executionState: selectorStart.executionState,
});
assert.equal(selectorResume.status, 'waiting');
assert.equal(selectorResume.activeNodeId, 'wait', 'selector must hold its running child without restarting choice');

console.log('AI composite runtime smoke passed: nested sequences and selector running-child retention.');
