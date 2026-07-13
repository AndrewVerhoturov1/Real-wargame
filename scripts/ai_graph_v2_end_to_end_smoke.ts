import assert from 'node:assert/strict';
import type { AiGraph } from '../src/core/ai/AiGraph';
import { runAiGraphRuntime } from '../src/core/ai/AiGraphRuntime';
import { migrateAiGraphToV2 } from '../src/core/ai/contracts/AiGraphMigration';
import type { AiEvent } from '../src/core/ai/events/AiEvent';
import { createAiRuntimeSession, normalizeAiRuntimeSession } from '../src/core/ai/runtime/AiRuntimeSession';

const legacyGraph: AiGraph = {
  version: 1,
  id: 'graph_v2_control_scenario',
  name: 'Graph v2 control scenario',
  nameRu: 'Контрольный сценарий Graph v2',
  rootNodeId: 'root',
  blackboardDefaults: {
    underFire: false,
    self_position: { x: 0, y: 0 },
    order_target_position: { x: 10, y: 0 },
    best_cover_position: { x: 3, y: 0 },
  },
  nodes: [
    { id: 'root', type: 'Root', children: ['utility'], parameters: {} },
    { id: 'utility', type: 'UtilitySelector', children: ['branch'], parameters: {} },
    { id: 'branch', type: 'ActionBranch', displayNameRu: 'Выполнение приказа', children: ['selector'], parameters: {} },
    { id: 'selector', type: 'Selector', children: ['reactive_move', 'take_cover'], parameters: {} },
    {
      id: 'reactive_move', type: 'ReactiveSequence', children: ['not_under_fire', 'move_order'],
      parameters: { observePrecedingConditions: true, abortPolicy: 'abort_self', abortReason: 'Shot nearby.', abortReasonRu: 'Рядом прошла пуля.' },
    },
    { id: 'not_under_fire', type: 'FlagCheck', children: [], parameters: { flagKey: 'underFire', expected: false } },
    { id: 'move_order', type: 'MoveToBlackboardPosition', children: [], parameters: { targetKey: 'order_target_position', acceptanceRadiusCells: 0.2, timeoutSeconds: 20, stuckTimeoutSeconds: 3, minimumProgressCells: 0.05, abortOnTargetLost: true } },
    {
      id: 'take_cover', type: 'Subgraph', displayNameRu: 'Занять укрытие', children: [],
      parameters: { subgraphId: 'take_cover', cancelPolicy: 'cancel_child' },
      inputBindings: { cover_position: { source: 'blackboard', key: 'best_cover_position' } },
      outputBindings: { reached_position: { target: 'blackboard', key: 'last_cover_position' } },
    },
  ],
};

const migration = migrateAiGraphToV2(legacyGraph);
assert.equal(migration.ok, true, 'Graph v1 must migrate automatically');
if (!migration.ok) throw new Error('Migration failed.');
const graph = migration.graph;

const started = runAiGraphRuntime({ graph, unitId: 'soldier_control', blackboard: { ...graph.blackboardDefaults }, cooldowns: {}, nowMs: 0 });
assert.equal(started.status, 'running');
assert.equal(started.activeNodeId, 'move_order');
assert.equal(started.effects.filter((effect) => effect.type === 'begin_move').length, 1);
assert.ok(started.executionState);
const oldToken = started.actionToken;
assert.ok(oldToken);

const shotNearby: AiEvent = {
  version: 1,
  id: 'shot-nearby-1',
  sequence: 1,
  type: 'shot_nearby',
  timestampMs: 100,
  priority: 95,
  payload: { estimatedThreatPosition: { x: 12, y: 0 }, reasonRu: 'Рядом прошла пуля.' },
};
const switched = runAiGraphRuntime({
  graph,
  unitId: 'soldier_control',
  blackboard: {
    ...graph.blackboardDefaults,
    underFire: true,
    active_move_source: 'ai',
    active_move_owner_token: oldToken,
    active_move_target: { x: 10, y: 0 },
  },
  cooldowns: {},
  nowMs: 100,
  executionState: started.executionState,
  events: [shotNearby],
});
assert.equal(switched.status, 'running');
assert.equal(switched.activeNodeId, 'take_cover');
assert.equal(switched.activeSubgraphId, 'take_cover');
assert.equal(switched.reactiveAbort?.eventType, 'shot_nearby');
assert.deepEqual(switched.effects.map((effect) => effect.type), ['clear_move', 'begin_move']);
const clear = switched.effects.find((effect) => effect.type === 'clear_move');
assert.equal(clear && 'ownerToken' in clear ? clear.ownerToken : undefined, oldToken, 'cleanup must only target the old AI order token');
assert.ok(switched.trace.some((item) => item.path?.includes('graph_v2_control_scenario / take_cover / move_to_cover')));
assert.equal(switched.blackboard.subgraph_private, undefined, 'subgraph local memory must not leak to parent');
assert.ok(switched.executionState);

const session = createAiRuntimeSession({ graphId: graph.id, unitId: 'soldier_control', executionState: switched.executionState, blackboardMemory: switched.blackboard });
const restored = normalizeAiRuntimeSession(JSON.parse(JSON.stringify(session)), { graphId: graph.id, unitId: 'soldier_control' }).session;
assert.equal(restored.status, 'active');
const coverToken = switched.actionToken;
assert.ok(coverToken);
const resumed = runAiGraphRuntime({
  graph,
  unitId: 'soldier_control',
  blackboard: { ...switched.blackboard, self_position: { x: 2, y: 0 }, active_move_source: 'ai', active_move_owner_token: coverToken, active_move_target: { x: 3, y: 0 } },
  cooldowns: {},
  nowMs: 500,
  executionState: restored.executionState,
});
assert.equal(resumed.status, 'running');
assert.equal(resumed.effects.filter((effect) => effect.type === 'begin_move').length, 0, 'restored movement must not start twice');

const completed = runAiGraphRuntime({
  graph,
  unitId: 'soldier_control',
  blackboard: { ...resumed.blackboard, self_position: { x: 3, y: 0 }, active_move_source: 'ai', active_move_owner_token: coverToken, active_move_target: { x: 3, y: 0 } },
  cooldowns: {},
  nowMs: 900,
  executionState: resumed.executionState,
});
assert.equal(completed.status, 'success');
assert.equal(completed.executionState, undefined, 'completed scenario must leave no active runtime handle');
assert.deepEqual(completed.blackboard.last_cover_position, { x: 3, y: 0 });

const moveAndObserveGraph: AiGraph = {
  version: 2,
  id: 'after_cover_graph',
  name: 'After cover',
  rootNodeId: 'root',
  blackboardSchema: [],
  blackboardDefaults: { self_position: { x: 3, y: 0 }, destination_position: { x: 6, y: 0 } },
  subgraphRefs: ['move_and_observe'],
  nodes: [
    { id: 'root', type: 'Root', children: ['move_and_observe'], parameters: {} },
    { id: 'move_and_observe', type: 'Subgraph', children: [], parameters: { subgraphId: 'move_and_observe', cancelPolicy: 'cancel_child' }, inputBindings: { destination: { source: 'blackboard', key: 'destination_position' } } },
  ],
};
const afterCover = runAiGraphRuntime({ graph: moveAndObserveGraph, unitId: 'soldier_control', blackboard: { ...moveAndObserveGraph.blackboardDefaults }, cooldowns: {}, nowMs: 1000 });
assert.equal(afterCover.status, 'running');
assert.equal(afterCover.activeSubgraphId, 'move_and_observe');
assert.ok(afterCover.effects.some((effect) => effect.type === 'set_attention_mode'));
assert.ok(afterCover.effects.some((effect) => effect.type === 'begin_move'));

console.log('Graph v2 end-to-end smoke passed: order move, shot_nearby abort, take_cover restore and move_and_observe continuation.');
