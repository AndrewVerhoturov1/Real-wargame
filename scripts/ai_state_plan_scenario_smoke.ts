import assert from 'node:assert/strict';
import { runAiGraphRuntime } from '../src/core/ai/AiGraphRuntime';
import {
  applyRuntimeResultToSession,
  createAiRuntimeSession,
  normalizeAiRuntimeSession,
} from '../src/core/ai/runtime/AiRuntimeSession';
import {
  createFollowMoveOrderPlan,
  createTakeCoverPlan,
  type AiPlan,
} from '../src/core/ai/state/AiPlan';
import {
  applyAiPlanStepExecution,
  cancelAiPlan,
  startCurrentAiPlanStep,
} from '../src/core/ai/state/AiPlanRuntime';
import {
  buildAiPlanStepGraph,
  isAiPlanAllowedInState,
  readAiExecutionOwnerToken,
} from '../src/core/ai/state/AiStatePlanPipeline';
import {
  createAiStateRuntime,
  updateAiStateRuntime,
} from '../src/core/ai/state/AiStateRuntime';

const graphId = 'scenario_state_plan_graph';
const unitId = 'scenario_soldier';
let session = createAiRuntimeSession({
  graphId,
  unitId,
  simulationTimeMs: 0,
  stateRuntime: createAiStateRuntime({ enteredAtMs: 0 }),
});
assert.equal(session.stateRuntime.activeStateId, 'Idle');
assert.equal(session.activePlan, undefined);

const orderBlackboard = {
  self_position: { x: 0, y: 0 },
  order_target_position: { x: 8, y: 0 },
  player_command_target_position: { x: 8, y: 0 },
  player_command_active: true,
  player_command_status: 'active',
  player_command_revision: 1,
  enemyVisible: false,
  enemyKnown: false,
  suppression: 0,
  best_cover_position: { x: 2, y: 2 },
};

const following = updateAiStateRuntime(session.stateRuntime, {
  nowMs: 600,
  triggers: ['move_order_received'],
  suppression: 0,
});
assert.equal(following.runtime.activeStateId, 'FollowingOrder');
let followPlan = createFollowMoveOrderPlan({
  id: 'plan_follow_1',
  nowMs: 600,
  createdForState: 'FollowingOrder',
  context: { orderRevision: 1, orderTarget: { x: 8, y: 0 } },
});
followPlan = startCurrentAiPlanStep(followPlan).plan;
const followGraph = buildAiPlanStepGraph(followPlan);
assert.ok(followGraph);
const followStarted = runAiGraphRuntime({
  graph: { ...followGraph!, id: graphId },
  unitId,
  blackboard: orderBlackboard,
  cooldowns: {},
  nowMs: 600,
});
assert.equal(followStarted.status, 'running');
assert.equal(followStarted.activeSubgraphId, 'move_and_observe');
assert.equal(followStarted.effects.filter((effect) => effect.type === 'begin_move').length, 1);
session = {
  ...applyRuntimeResultToSession(session, followStarted, 600),
  stateRuntime: following.runtime,
  activePlan: followPlan,
  planSequence: 1,
};

const contact = updateAiStateRuntime(session.stateRuntime, {
  nowMs: 1200,
  triggers: ['enemy_spotted'],
  suppression: 20,
});
assert.equal(contact.runtime.activeStateId, 'Contact');
assert.equal(isAiPlanAllowedInState(followPlan, 'Contact'), false);
const cancelledRuntime = runAiGraphRuntime({
  graph: { ...followGraph!, id: graphId },
  unitId,
  blackboard: {
    ...orderBlackboard,
    enemyVisible: true,
    enemyKnown: true,
    active_move_source: 'ai',
    active_move_owner_token: readAiExecutionOwnerToken(session.executionState) ?? null,
  },
  cooldowns: session.cooldowns,
  nowMs: 1200,
  executionState: session.executionState,
  cancel: { reason: 'Combat contact.', reasonRu: 'Замечен противник.' },
});
assert.equal(cancelledRuntime.status, 'cancelled');
assert.equal(cancelledRuntime.effects.filter((effect) => effect.type === 'clear_move').length, 1, 'Old order must receive exactly one cleanup.');
const cancelledPlan = cancelAiPlan(followPlan, 'Combat contact.', 'Замечен противник.').plan;
assert.equal(cancelledPlan.status, 'cancelled');

let coverPlan = createTakeCoverPlan({
  id: 'plan_cover_2',
  nowMs: 1200,
  createdForState: 'Contact',
  replacesPlanId: cancelledPlan.id,
  context: { coverPosition: { x: 2, y: 2 }, contactId: 'enemy_1' },
});
assert.equal(coverPlan.replacesPlanId, followPlan.id);
coverPlan = startCurrentAiPlanStep(coverPlan).plan;
const coverGraph = buildAiPlanStepGraph(coverPlan);
assert.ok(coverGraph);
const coverStarted = runAiGraphRuntime({
  graph: { ...coverGraph!, id: graphId },
  unitId,
  blackboard: {
    ...orderBlackboard,
    enemyVisible: true,
    enemyKnown: true,
    best_cover_position: { x: 2, y: 2 },
  },
  cooldowns: session.cooldowns,
  nowMs: 1200,
});
assert.equal(coverStarted.status, 'running');
assert.equal(coverStarted.activeSubgraphId, 'take_cover');
assert.equal(coverStarted.effects.filter((effect) => effect.type === 'begin_move').length, 1, 'Replacement plan must own one new movement.');
session = {
  ...applyRuntimeResultToSession(session, coverStarted, 1200),
  stateRuntime: contact.runtime,
  activePlan: coverPlan,
  planHistory: [cancelledPlan],
  planSequence: 2,
};

const suppressed = updateAiStateRuntime(session.stateRuntime, {
  nowMs: 1800,
  suppression: 90,
});
assert.equal(suppressed.runtime.activeStateId, 'Suppressed');
assert.equal(isAiPlanAllowedInState(coverPlan, 'Suppressed'), true, 'TakeCover must remain valid after Contact to Suppressed transition.');
session = { ...session, stateRuntime: suppressed.runtime };

const serialized = JSON.parse(JSON.stringify(session));
const restored = normalizeAiRuntimeSession(serialized, { graphId, unitId }).session;
assert.equal(restored.activePlan?.id, coverPlan.id);
assert.equal(restored.activePlan?.currentStepIndex, 0);
assert.equal(restored.activePlan?.steps[0]?.status, 'running');
assert.equal(restored.stateRuntime.activeStateId, 'Suppressed');
const restoredToken = readAiExecutionOwnerToken(restored.executionState);
assert.ok(restoredToken);

const resumed = runAiGraphRuntime({
  graph: { ...coverGraph!, id: graphId },
  unitId,
  blackboard: {
    ...orderBlackboard,
    enemyVisible: true,
    enemyKnown: true,
    best_cover_position: { x: 2, y: 2 },
    active_move_source: 'ai',
    active_move_owner_token: restoredToken ?? null,
  },
  cooldowns: restored.cooldowns,
  nowMs: 2400,
  executionState: restored.executionState,
});
assert.equal(resumed.status, 'running');
assert.equal(resumed.effects.filter((effect) => effect.type === 'begin_move').length, 0, 'Restored subgraph must update without repeated start.');

const reachedCover = runAiGraphRuntime({
  graph: { ...coverGraph!, id: graphId },
  unitId,
  blackboard: {
    ...orderBlackboard,
    self_position: { x: 2, y: 2 },
    best_cover_position: { x: 2, y: 2 },
    enemyVisible: true,
    enemyKnown: true,
    active_move_source: 'ai',
    active_move_owner_token: restoredToken ?? null,
  },
  cooldowns: restored.cooldowns,
  nowMs: 3000,
  executionState: resumed.executionState,
});
assert.equal(reachedCover.status, 'success');
assert.equal(reachedCover.effects.filter((effect) => effect.type === 'clear_move').length, 1);
let coverProgress = applyAiPlanStepExecution(restored.activePlan as AiPlan, 'success').plan;
assert.equal(coverProgress.currentStepIndex, 1);
coverProgress = startCurrentAiPlanStep(coverProgress).plan;
const observeGraph = buildAiPlanStepGraph(coverProgress);
assert.ok(observeGraph);
const observed = runAiGraphRuntime({
  graph: { ...observeGraph!, id: graphId },
  unitId,
  blackboard: {
    ...orderBlackboard,
    self_position: { x: 2, y: 2 },
    enemyVisible: true,
    enemyKnown: true,
  },
  cooldowns: reachedCover.cooldowns,
  nowMs: 3600,
});
assert.equal(observed.status, 'success');
const completedPlan = applyAiPlanStepExecution(coverProgress, 'success').plan;
assert.equal(completedPlan.status, 'success');

const suppressionBelow = updateAiStateRuntime(suppressed.runtime, {
  nowMs: 3600,
  suppression: 20,
  suppressionExitStableMs: 1200,
});
assert.equal(suppressionBelow.runtime.activeStateId, 'Suppressed');
const suppressionStable = updateAiStateRuntime(suppressionBelow.runtime, {
  nowMs: 4800,
  suppression: 20,
  suppressionExitStableMs: 1200,
});
assert.equal(suppressionStable.runtime.activeStateId, 'Contact');
assert.equal(suppressionStable.transition?.reasonRu, 'Подавление устойчиво снизилось ниже порога выхода.');

console.log('AI state/plan scenario smoke passed: Idle, order, contact cancel, cover replacement, suppression, snapshot restore, no repeated start, completion and stable exit.');
