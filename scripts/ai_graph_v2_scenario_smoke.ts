import assert from 'node:assert/strict';
import type { AiGraphV1 } from '../src/core/ai/AiGraph';
import { migrateAiGraphToV2 } from '../src/core/ai/contracts/AiGraphMigration';
import { validateAiGraph } from '../src/core/ai/AiGraphValidation';
import { runAiGraphRuntime, type AiGraphExecutionState } from '../src/core/ai/AiGraphRuntime';
import type { AiEvent } from '../src/core/ai/events/AiEvent';
import { createAiRuntimeSession, normalizeAiRuntimeSession } from '../src/core/ai/runtime/AiRuntimeSession';

const graphV1: AiGraphV1 = {
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
    observation_destination: { x: 7, y: 0 },
    active_move_source: null,
    active_move_owner_token: null,
    active_move_target: null,
  },
  nodes: [
    { id: 'root', type: 'Root', children: ['branch'] },
    { id: 'branch', type: 'ActionBranch', children: ['sequence'], displayNameRu: 'Исполнение приказа' },
    { id: 'sequence', type: 'SequenceWithMemory', children: ['response_selector', 'move_and_observe'] },
    { id: 'response_selector', type: 'Selector', children: ['normal_move', 'take_cover'] },
    {
      id: 'normal_move',
      type: 'ReactiveSequence',
      children: ['not_under_fire', 'move_order'],
      parameters: {
        observePrecedingConditions: true,
        abortPolicy: 'abort_self',
        abortReason: 'Nearby shot interrupted movement.',
        abortReasonRu: 'Близкий выстрел прервал движение.',
      },
    },
    { id: 'not_under_fire', type: 'FlagCheck', children: [], parameters: { flagKey: 'underFire', expected: false } },
    {
      id: 'move_order',
      type: 'MoveToBlackboardPosition',
      children: [],
      parameters: { targetKey: 'order_target_position', acceptanceRadiusCells: 0.2, timeoutSeconds: 20, stuckTimeoutSeconds: 2.5, minimumProgressCells: 0.05, abortOnTargetLost: true },
    },
    {
      id: 'take_cover',
      type: 'Subgraph',
      children: [],
      parameters: { subgraphId: 'take_cover', cancelPolicy: 'cancel_child' },
      inputBindings: { cover_position: { source: 'blackboard', key: 'best_cover_position' } },
      outputBindings: { reached_position: { target: 'blackboard', key: 'last_cover_position' } },
    },
    {
      id: 'move_and_observe',
      type: 'Subgraph',
      children: [],
      parameters: { subgraphId: 'move_and_observe', cancelPolicy: 'cancel_child' },
      inputBindings: { destination: { source: 'blackboard', key: 'observation_destination' } },
      outputBindings: { reached_position: { target: 'blackboard', key: 'last_observation_position' } },
    },
  ],
};

const migration = migrateAiGraphToV2(graphV1);
assert.equal(migration.ok, true);
if (!migration.ok) throw new Error('Graph v1 migration failed.');
assert.equal(migration.migrated, true);
assert.deepEqual(migration.graph.subgraphRefs.sort(), ['move_and_observe', 'take_cover']);
assert.equal(validateAiGraph(migration.graph).valid, true, JSON.stringify(validateAiGraph(migration.graph).issues));
const graph = migration.graph;
const unitId = 'scenario-soldier';
const initial = {
  ...graph.blackboardDefaults,
  underFire: false,
  self_position: { x: 0, y: 0 },
};

const movement = runAiGraphRuntime({ graph, unitId, blackboard: initial, cooldowns: {}, nowMs: 0 });
assert.equal(movement.status, 'running');
assert.equal(movement.activeNodeId, 'move_order');
assert.equal(movement.effects.filter((effect) => effect.type === 'begin_move').length, 1);
assert.ok(movement.executionState);
const oldOwnerToken = movement.actionToken;
assert.ok(oldOwnerToken);

const shotEvent: AiEvent = {
  version: 1,
  id: 'shot-nearby-1',
  sequence: 1,
  type: 'shot_nearby',
  timestampMs: 100,
  priority: 100,
  payload: { estimatedThreatPosition: { x: 8, y: 0 }, reasonRu: 'Пуля прошла рядом.' },
};
const reacted = runAiGraphRuntime({
  graph,
  unitId,
  blackboard: {
    ...initial,
    underFire: true,
    active_move_source: 'ai',
    active_move_owner_token: oldOwnerToken ?? null,
    active_move_target: { x: 10, y: 0 },
  },
  cooldowns: movement.cooldowns,
  nowMs: 100,
  executionState: movement.executionState,
  events: [shotEvent],
});
assert.equal(reacted.status, 'running');
assert.equal(reacted.activeNodeId, 'take_cover');
assert.equal(reacted.activeSubgraphId, 'take_cover');
assert.equal(reacted.reactiveAbort?.eventType, 'shot_nearby');
assert.deepEqual(reacted.consumedEventIds, ['shot-nearby-1']);
assert.equal(reacted.effects.filter((effect) => effect.type === 'clear_move').length, 1);
assert.equal(reacted.effects.filter((effect) => effect.type === 'begin_move').length, 1);
const clearOld = reacted.effects.find((effect) => effect.type === 'clear_move');
assert.equal(clearOld?.type === 'clear_move' ? clearOld.ownerToken : null, oldOwnerToken, 'Cleanup must target only the old AI-owned movement.');
const coverOwnerToken = reacted.actionToken;
assert.ok(coverOwnerToken && coverOwnerToken !== oldOwnerToken);
assert.ok(reacted.trace.some((item) => item.path?.includes('graph_v2_control_scenario / take_cover / move_to_cover')));
assert.equal(reacted.executionState?.activeData?.kind, 'subgraph');

const saved = createAiRuntimeSession({
  graphId: graph.id,
  unitId,
  executionState: reacted.executionState,
  blackboardMemory: reacted.blackboard,
  cooldowns: reacted.cooldowns,
});
const restored = normalizeAiRuntimeSession(JSON.parse(JSON.stringify(saved)), { graphId: graph.id, unitId }).session;
assert.equal(restored.executionState?.activeData?.kind, 'subgraph');
const nestedData = restored.executionState?.activeData;
assert.ok(nestedData && nestedData.kind === 'subgraph');
assert.equal('best_cover_position' in nestedData.localBlackboard, false, 'Subgraph local memory must not inherit unbound parent keys.');
assert.deepEqual(nestedData.localBlackboard.cover_position, { x: 3, y: 0 });

const resumed = runAiGraphRuntime({
  graph,
  unitId,
  blackboard: {
    ...reacted.blackboard,
    self_position: { x: 1, y: 0 },
    active_move_source: 'ai',
    active_move_owner_token: coverOwnerToken ?? null,
    active_move_target: { x: 3, y: 0 },
  },
  cooldowns: restored.cooldowns,
  nowMs: 500,
  executionState: restored.executionState,
});
assert.equal(resumed.status, 'running');
assert.equal(resumed.activeSubgraphId, 'take_cover');
assert.equal(resumed.effects.filter((effect) => effect.type === 'begin_move').length, 0, 'Restored nested movement must continue without a second start.');

const coverReached = runAiGraphRuntime({
  graph,
  unitId,
  blackboard: {
    ...resumed.blackboard,
    underFire: true,
    self_position: { x: 3, y: 0 },
    active_move_source: 'ai',
    active_move_owner_token: coverOwnerToken ?? null,
    active_move_target: { x: 3, y: 0 },
  },
  cooldowns: resumed.cooldowns,
  nowMs: 1000,
  executionState: resumed.executionState,
});
assert.equal(coverReached.status, 'running');
assert.equal(coverReached.activeSubgraphId, 'move_and_observe');
assert.equal(coverReached.effects.filter((effect) => effect.type === 'clear_move').length, 1);
assert.equal(coverReached.effects.filter((effect) => effect.type === 'begin_move').length, 1);
assert.equal(coverReached.effects.some((effect) => effect.type === 'set_attention_mode' && effect.mode === 'observe'), true);
assert.deepEqual(coverReached.blackboard.last_cover_position, { x: 3, y: 0 });
assert.equal('cover_position' in coverReached.blackboard, false);
const observeOwnerToken = coverReached.actionToken;
assert.ok(observeOwnerToken);

const finished = runAiGraphRuntime({
  graph,
  unitId,
  blackboard: {
    ...coverReached.blackboard,
    self_position: { x: 7, y: 0 },
    active_move_source: 'ai',
    active_move_owner_token: observeOwnerToken ?? null,
    active_move_target: { x: 7, y: 0 },
  },
  cooldowns: coverReached.cooldowns,
  nowMs: 2000,
  executionState: coverReached.executionState as AiGraphExecutionState,
});
assert.equal(finished.status, 'success');
assert.equal(finished.executionState, undefined, 'Completed scenario must not leave a hanging runtime handle.');
assert.equal(finished.effects.filter((effect) => effect.type === 'clear_move').length, 1);
assert.deepEqual(finished.blackboard.last_observation_position, { x: 7, y: 0 });

console.log('Graph v2 control scenario passed: v1 migration, shot_nearby abort, owner-safe cleanup, take_cover restore, isolated memory and move_and_observe continuation.');
