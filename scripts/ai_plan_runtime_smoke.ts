import assert from 'node:assert/strict';
import {
  createFollowMoveOrderPlan,
  createTakeCoverPlan,
  getCurrentAiPlanStep,
  type AiPlan,
} from '../src/core/ai/state/AiPlan';
import {
  applyAiPlanStepExecution,
  cancelAiPlan,
  evaluateAiPlanAbort,
  evaluateAiPlanReplan,
  makeAiPlanId,
  normalizeAiPlan,
  startCurrentAiPlanStep,
} from '../src/core/ai/state/AiPlanRuntime';

const follow = createFollowMoveOrderPlan({
  id: makeAiPlanId('soldier_1', 'FollowMoveOrder', 100, 1),
  nowMs: 100,
  createdForState: 'FollowingOrder',
  context: { orderRevision: 4, orderTarget: { x: 8, y: 3 } },
});
assert.equal(follow.status, 'active');
assert.equal(follow.goalRu, 'Выполнить приказ движения');
assert.equal(getCurrentAiPlanStep(follow)?.status, 'pending');

const started = startCurrentAiPlanStep(follow);
assert.equal(started.startedStep?.id, 'move_and_observe');
assert.equal(started.plan.steps[0]?.attempt, 1);
assert.equal(started.plan.steps[0]?.status, 'running');
const startedAgain = startCurrentAiPlanStep(started.plan);
assert.equal(startedAgain.startedStep, undefined, 'Running step must not start twice.');
assert.equal(startedAgain.plan.steps[0]?.attempt, 1);

const followDone = applyAiPlanStepExecution(started.plan, 'success');
assert.equal(followDone.plan.status, 'success');
assert.equal(followDone.plan.steps[0]?.status, 'success');
assert.equal(followDone.terminal, true);

const cover = createTakeCoverPlan({
  id: makeAiPlanId('soldier_1', 'TakeCover', 200, 2),
  nowMs: 200,
  createdForState: 'Suppressed',
  replacesPlanId: follow.id,
  context: { coverPosition: { x: 2, y: 5 }, contactId: 'enemy_1' },
});
assert.equal(cover.steps.length, 2);
assert.equal(cover.replacesPlanId, follow.id);
const coverStarted = startCurrentAiPlanStep(cover);
const coverReached = applyAiPlanStepExecution(coverStarted.plan, 'success');
assert.equal(coverReached.plan.status, 'active');
assert.equal(coverReached.plan.currentStepIndex, 1);
assert.equal(coverReached.plan.steps[0]?.status, 'success');
assert.equal(coverReached.plan.steps[1]?.status, 'pending');
const observeStarted = startCurrentAiPlanStep(coverReached.plan);
assert.equal(observeStarted.startedStep?.id, 'observe_after_cover');
assert.equal(observeStarted.plan.steps[1]?.attempt, 1);

const restored = normalizeAiPlan(JSON.parse(JSON.stringify(observeStarted.plan)));
assert.ok(restored);
assert.equal(restored?.id, cover.id);
assert.equal(restored?.currentStepIndex, 1);
assert.equal(restored?.steps[1]?.status, 'running');
assert.equal(startCurrentAiPlanStep(restored as AiPlan).startedStep, undefined, 'Restored running step must continue without another start.');

const cancelled = cancelAiPlan(restored as AiPlan, 'Emergency state transition.', 'Экстренный переход состояния.');
assert.equal(cancelled.plan.status, 'cancelled');
assert.equal(cancelled.plan.steps[1]?.status, 'cancelled');
assert.equal(cancelled.plan.cancellationReasonRu, 'Экстренный переход состояния.');

const retryPlan: AiPlan = {
  ...createFollowMoveOrderPlan({ id: 'retry_plan', nowMs: 0, createdForState: 'FollowingOrder' }),
  steps: [{
    id: 'retry_step',
    label: 'Retry step',
    labelRu: 'Повторяемый шаг',
    subgraphId: 'move_and_observe',
    status: 'running',
    failurePolicy: 'retry',
    maxAttempts: 2,
    attempt: 1,
  }],
};
const retry = applyAiPlanStepExecution(retryPlan, 'failure');
assert.equal(retry.plan.status, 'active');
assert.equal(retry.plan.steps[0]?.status, 'pending');
assert.equal(retry.needsReplan, false);
const retryStarted = startCurrentAiPlanStep(retry.plan);
assert.equal(retryStarted.plan.steps[0]?.attempt, 2);
const retryExhausted = applyAiPlanStepExecution(retryStarted.plan, 'failure');
assert.equal(retryExhausted.plan.status, 'failure');
assert.equal(retryExhausted.terminal, true);

const replanStarted = startCurrentAiPlanStep(createFollowMoveOrderPlan({ id: 'replan_old', nowMs: 0, createdForState: 'FollowingOrder' }));
const needsReplan = applyAiPlanStepExecution(replanStarted.plan, 'failure', 'Route blocked.', 'Маршрут заблокирован.');
assert.equal(needsReplan.plan.status, 'replanning');
assert.equal(needsReplan.needsReplan, true);
const replacement = createTakeCoverPlan({
  id: 'replan_new',
  nowMs: 500,
  createdForState: 'Contact',
  replacesPlanId: needsReplan.plan.id,
});
assert.equal(replacement.replacesPlanId, 'replan_old');

const abort = evaluateAiPlanAbort(follow, { player_command_active: false, enemyKnown: false });
assert.equal(abort.matched, true);
assert.equal(abort.conditionId, 'order_missing');
const replan = evaluateAiPlanReplan(follow, { player_command_revision: 7, active_move_path_status: 'moving' });
assert.equal(replan.matched, true);
assert.equal(replan.conditionId, 'new_order');

console.log('AI plan runtime smoke passed: start-once, steps, retry, replan, cancel, replacement, conditions and restore.');
