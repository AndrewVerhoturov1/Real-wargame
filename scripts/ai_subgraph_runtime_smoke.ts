import assert from 'node:assert/strict';
import type { AiGraph } from '../src/core/ai/AiGraph';
import { runAiGraphRuntime } from '../src/core/ai/AiGraphRuntime';
import { AiSubgraphRegistry, DEFAULT_AI_SUBGRAPH_REGISTRY } from '../src/core/ai/contracts/AiSubgraphRegistry';
import { createAiRuntimeSession, normalizeAiRuntimeSession } from '../src/core/ai/runtime/AiRuntimeSession';

assert.deepEqual(
  DEFAULT_AI_SUBGRAPH_REGISTRY.list().map((item) => item.id).sort(),
  ['move_and_observe', 'react_to_fire', 'reload_weapon', 'take_cover'],
);

const recursiveRegistry = new AiSubgraphRegistry();
recursiveRegistry.register({
  id: 'a', label: 'A', labelRu: 'A', description: 'A', descriptionRu: 'A', inputs: [], outputs: [], localMemoryDefaults: {}, cancelPolicy: 'cancel_child',
  graph: { version: 2, id: 'a_graph', name: 'A', rootNodeId: 'root', blackboardSchema: [], blackboardDefaults: {}, subgraphRefs: ['b'], nodes: [{ id: 'root', type: 'Root', children: [] }] },
});
recursiveRegistry.register({
  id: 'b', label: 'B', labelRu: 'Б', description: 'B', descriptionRu: 'Б', inputs: [], outputs: [], localMemoryDefaults: {}, cancelPolicy: 'cancel_child',
  graph: { version: 2, id: 'b_graph', name: 'B', rootNodeId: 'root', blackboardSchema: [], blackboardDefaults: {}, subgraphRefs: ['a'], nodes: [{ id: 'root', type: 'Root', children: [] }] },
});
assert.throws(() => recursiveRegistry.assertNoRecursiveReferences(), /recursive/i);

const parentGraph: AiGraph = {
  version: 2,
  id: 'main_graph',
  name: 'Main graph',
  rootNodeId: 'root',
  blackboardSchema: [],
  blackboardDefaults: {},
  subgraphRefs: ['take_cover'],
  nodes: [
    { id: 'root', type: 'Root', children: ['branch'] },
    { id: 'branch', type: 'ActionBranch', children: ['take_cover_call'] },
    {
      id: 'take_cover_call',
      type: 'Subgraph',
      children: [],
      parameters: { subgraphId: 'take_cover', cancelPolicy: 'cancel_child' },
      inputBindings: { cover_position: { source: 'blackboard', key: 'best_cover_position' } },
      outputBindings: { reached_position: { target: 'blackboard', key: 'last_cover_position' } },
    },
  ],
};

const initialBlackboard = { self_position: { x: 0, y: 0 }, best_cover_position: { x: 5, y: 0 } };
const started = runAiGraphRuntime({ graph: parentGraph, unitId: 'soldier_subgraph', blackboard: initialBlackboard, cooldowns: {}, nowMs: 0 });
assert.equal(started.status, 'running');
assert.equal(started.activeNodeId, 'take_cover_call');
assert.equal(started.activeSubgraphId, 'take_cover');
assert.equal(started.effects.filter((effect) => effect.type === 'begin_move').length, 1);
assert.ok(started.trace.some((item) => item.path?.includes('main_graph / take_cover / move_to_cover')));
assert.equal(started.executionState?.activeData?.kind, 'subgraph');

const session = createAiRuntimeSession({ graphId: parentGraph.id, unitId: 'soldier_subgraph', executionState: started.executionState, blackboardMemory: initialBlackboard });
const restoredSession = normalizeAiRuntimeSession(JSON.parse(JSON.stringify(session)), { graphId: parentGraph.id, unitId: 'soldier_subgraph' }).session;
assert.equal(restoredSession.executionState?.activeData?.kind, 'subgraph');
const subgraphData = restoredSession.executionState?.activeData;
assert.ok(subgraphData && subgraphData.kind === 'subgraph');
assert.equal('best_cover_position' in subgraphData.localBlackboard, false, 'Parent memory must not leak into local subgraph memory without a binding.');
assert.deepEqual(subgraphData.localBlackboard.cover_position, { x: 5, y: 0 });

const ownerToken = started.actionToken;
assert.ok(ownerToken);
const resumed = runAiGraphRuntime({
  graph: parentGraph,
  unitId: 'soldier_subgraph',
  blackboard: { ...initialBlackboard, active_move_source: 'ai', active_move_owner_token: ownerToken ?? null },
  cooldowns: {},
  nowMs: 500,
  executionState: restoredSession.executionState,
});
assert.equal(resumed.status, 'running');
assert.equal(resumed.effects.filter((effect) => effect.type === 'begin_move').length, 0, 'Restore must not restart nested action.');

const cancelled = runAiGraphRuntime({
  graph: parentGraph,
  unitId: 'soldier_subgraph',
  blackboard: { ...initialBlackboard, active_move_source: 'ai', active_move_owner_token: ownerToken ?? null },
  cooldowns: {},
  nowMs: 600,
  executionState: resumed.executionState,
  cancel: { reason: 'Parent cancelled.', reasonRu: 'Родитель отменён.' },
});
assert.equal(cancelled.status, 'cancelled');
assert.equal(cancelled.effects.filter((effect) => effect.type === 'clear_move').length, 1, 'Nested cleanup must run exactly once.');

const completed = runAiGraphRuntime({
  graph: parentGraph,
  unitId: 'soldier_subgraph',
  blackboard: { ...initialBlackboard, self_position: { x: 5, y: 0 }, active_move_source: 'ai', active_move_owner_token: ownerToken ?? null },
  cooldowns: {},
  nowMs: 1000,
  executionState: resumed.executionState,
});
assert.equal(completed.status, 'success');
assert.deepEqual(completed.blackboard.last_cover_position, { x: 5, y: 0 });
assert.equal(completed.effects.filter((effect) => effect.type === 'clear_move').length, 1);
assert.equal('cover_position' in completed.blackboard, false, 'Subgraph-local key must not pollute parent blackboard.');

console.log('AI subgraph runtime smoke passed: registry, recursion guard, bindings, isolation, restore, cancellation and cleanup.');
