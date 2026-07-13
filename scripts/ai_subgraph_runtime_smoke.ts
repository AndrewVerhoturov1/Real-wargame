import assert from 'node:assert/strict';
import type { AiGraph } from '../src/core/ai/AiGraph';
import { runAiGraphRuntime } from '../src/core/ai/AiGraphRuntime';
import { DEFAULT_AI_SUBGRAPH_REGISTRY, AiSubgraphRegistry } from '../src/core/ai/contracts/AiSubgraphRegistry';
import { createAiRuntimeSession, normalizeAiRuntimeSession } from '../src/core/ai/runtime/AiRuntimeSession';
import { validateAiGraph } from '../src/core/ai/AiGraphValidation';

assert.equal(DEFAULT_AI_SUBGRAPH_REGISTRY.list().length, 4);
assert.ok(DEFAULT_AI_SUBGRAPH_REGISTRY.get('take_cover'));
assert.ok(DEFAULT_AI_SUBGRAPH_REGISTRY.get('reload_weapon'));
assert.ok(DEFAULT_AI_SUBGRAPH_REGISTRY.get('react_to_fire'));
assert.ok(DEFAULT_AI_SUBGRAPH_REGISTRY.get('move_and_observe'));

for (const definition of DEFAULT_AI_SUBGRAPH_REGISTRY.list()) {
  const validation = validateAiGraph(definition.graph, {
    subgraphs: new Map(DEFAULT_AI_SUBGRAPH_REGISTRY.list().map((item) => [item.id, item.graph])),
  });
  assert.equal(validation.valid, true, `${definition.id}: ${validation.issues.map((issue) => `${issue.code}:${issue.nodeId ?? ''}`).join(', ')}`);
}


const recursive = new AiSubgraphRegistry();
recursive.register({
  id: 'self_recursive', name: 'Recursive', nameRu: 'Рекурсивный', description: '', descriptionRu: '',
  inputs: [], outputs: [], localMemoryDefaults: {}, cancelPolicy: 'cancel_child',
  graph: {
    version: 2, id: 'self_recursive', name: 'Recursive', rootNodeId: 'root', blackboardSchema: [], blackboardDefaults: {}, subgraphRefs: ['self_recursive'],
    nodes: [{ id: 'root', type: 'Root', children: ['self'], parameters: {} }, { id: 'self', type: 'Subgraph', children: [], parameters: { subgraphId: 'self_recursive', cancelPolicy: 'cancel_child' } }],
  },
});
assert.ok(recursive.validateReferences().some((issue) => issue.code === 'RECURSIVE_SUBGRAPH_REFERENCE'));

const parentGraph: AiGraph = {
  version: 2,
  id: 'main_graph',
  name: 'Main graph',
  nameRu: 'Главный граф',
  rootNodeId: 'root',
  blackboardSchema: [],
  blackboardDefaults: { self_position: { x: 0, y: 0 }, best_cover_position: { x: 3, y: 0 }, local_secret: 'parent' },
  subgraphRefs: ['take_cover'],
  nodes: [
    { id: 'root', type: 'Root', children: ['take_cover_call'], parameters: {} },
    {
      id: 'take_cover_call', type: 'Subgraph', displayNameRu: 'Занять укрытие', children: [],
      parameters: { subgraphId: 'take_cover', cancelPolicy: 'cancel_child' },
      inputBindings: { cover_position: { source: 'blackboard', key: 'best_cover_position' } },
      outputBindings: { reached_position: { target: 'blackboard', key: 'last_cover_position' } },
    },
  ],
};
const started = runAiGraphRuntime({ graph: parentGraph, unitId: 'soldier_subgraph', blackboard: { ...parentGraph.blackboardDefaults }, cooldowns: {}, nowMs: 0 });
assert.equal(started.status, 'running');
assert.equal(started.activeNodeId, 'take_cover_call');
assert.equal(started.activeSubgraphId, 'take_cover');
assert.equal(started.effects.filter((effect) => effect.type === 'begin_move').length, 1);
assert.ok(started.trace.some((item) => item.path?.includes('main_graph / take_cover / move_to_cover')));
assert.ok(started.executionState);
const sessionWithSubgraph = createAiRuntimeSession({
  graphId: parentGraph.id,
  unitId: 'soldier_subgraph',
  executionState: started.executionState,
  blackboardMemory: started.blackboard,
});
const restoredSession = normalizeAiRuntimeSession(JSON.parse(JSON.stringify(sessionWithSubgraph)), {
  graphId: parentGraph.id,
  unitId: 'soldier_subgraph',
});
assert.equal(restoredSession.session.status, 'active');
assert.equal(restoredSession.session.executionState?.activeData?.kind, 'subgraph');
assert.equal(started.blackboard.local_secret, 'parent');
assert.equal(started.blackboard.subgraph_private, undefined, 'local subgraph memory must not leak to parent');

const actionToken = started.actionToken;
assert.ok(actionToken);
const serializedState = JSON.parse(JSON.stringify(started.executionState));
const resumed = runAiGraphRuntime({
  graph: parentGraph,
  unitId: 'soldier_subgraph',
  blackboard: {
    ...parentGraph.blackboardDefaults,
    self_position: { x: 1, y: 0 },
    active_move_source: 'ai',
    active_move_owner_token: actionToken,
  },
  cooldowns: {},
  nowMs: 500,
  executionState: serializedState,
});
assert.equal(resumed.status, 'running');
assert.equal(resumed.effects.filter((effect) => effect.type === 'begin_move').length, 0, 'restore must not repeat start');

const cancelled = runAiGraphRuntime({
  graph: parentGraph,
  unitId: 'soldier_subgraph',
  blackboard: {
    ...parentGraph.blackboardDefaults,
    self_position: { x: 1, y: 0 },
    active_move_source: 'ai',
    active_move_owner_token: actionToken,
  },
  cooldowns: {},
  nowMs: 600,
  executionState: resumed.executionState,
  cancel: { reason: 'Parent cancelled.', reasonRu: 'Родитель отменён.' },
});
assert.equal(cancelled.status, 'cancelled');
assert.equal(cancelled.effects.filter((effect) => effect.type === 'clear_move').length, 1, 'subgraph cancellation must cleanup once');

const completed = runAiGraphRuntime({
  graph: parentGraph,
  unitId: 'soldier_subgraph',
  blackboard: {
    ...parentGraph.blackboardDefaults,
    self_position: { x: 3, y: 0 },
    active_move_source: 'ai',
    active_move_owner_token: actionToken,
  },
  cooldowns: {},
  nowMs: 1000,
  executionState: resumed.executionState,
});
assert.equal(completed.status, 'success');
assert.deepEqual(completed.blackboard.last_cover_position, { x: 3, y: 0 });
assert.equal(completed.effects.filter((effect) => effect.type === 'clear_move').length, 1);

console.log('AI subgraph runtime smoke passed: registry, recursion, bindings, isolation, restore and cancellation.');
