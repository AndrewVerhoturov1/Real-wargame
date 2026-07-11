import assert from 'node:assert/strict';
import {
  createAiRouteStatusState,
  updateAiRouteStatus,
  type AiRouteStatusSettings,
} from '../src/core/ai/AiRouteStatus';

const settings: AiRouteStatusSettings = {
  stuckTimeoutMs: 2500,
  minimumProgressCells: 0.05,
  abortOnTargetLost: true,
};

const ownerToken = 'soldier:move:100';
const target = { x: 10, y: 0 };

const initialState = createAiRouteStatusState({
  nowMs: 0,
  position: { x: 0, y: 0 },
  target,
  ownerToken,
});
assert.equal(initialState.status, 'moving');
assert.equal(initialState.lastDistanceCells, 10);

const start = updateAiRouteStatus({
  nowMs: 0,
  position: { x: 0, y: 0 },
  target,
  acceptanceRadiusCells: 0.2,
  ownerToken,
  activeOrderSource: 'ai',
  activeOrderToken: ownerToken,
  targetAvailable: true,
  paused: false,
  settings,
});
assert.equal(start.status, 'moving');
assert.equal(start.noProgressMs, 0);
assert.equal(start.shouldForceRuntimeTick, false);
assert.equal(start.shouldCancelRuntime, false);

const progress = updateAiRouteStatus({
  nowMs: 600,
  position: { x: 1, y: 0 },
  target,
  acceptanceRadiusCells: 0.2,
  ownerToken,
  activeOrderSource: 'ai',
  activeOrderToken: ownerToken,
  targetAvailable: true,
  paused: false,
  settings,
  previousState: start.state,
});
assert.equal(progress.status, 'moving');
assert.equal(progress.state.lastProgressAtMs, 600);
assert.equal(progress.noProgressMs, 0);

const stalled = updateAiRouteStatus({
  nowMs: 1800,
  position: { x: 1.01, y: 0 },
  target,
  acceptanceRadiusCells: 0.2,
  ownerToken,
  activeOrderSource: 'ai',
  activeOrderToken: ownerToken,
  targetAvailable: true,
  paused: false,
  settings,
  previousState: progress.state,
});
assert.equal(stalled.status, 'stalled');
assert.equal(stalled.noProgressMs, 1200);
assert.equal(stalled.shouldCancelRuntime, false);

const blocked = updateAiRouteStatus({
  nowMs: 3100,
  position: { x: 1.01, y: 0 },
  target,
  acceptanceRadiusCells: 0.2,
  ownerToken,
  activeOrderSource: 'ai',
  activeOrderToken: ownerToken,
  targetAvailable: true,
  paused: false,
  settings,
  previousState: progress.state,
});
assert.equal(blocked.status, 'blocked');
assert.equal(blocked.abortCode, 'route_blocked');
assert.equal(blocked.shouldForceRuntimeTick, true);
assert.equal(blocked.shouldCancelRuntime, true);
assert.match(blocked.abortReasonRu ?? '', /не продвигается/i);

const playerOverride = updateAiRouteStatus({
  nowMs: 700,
  position: { x: 1, y: 0 },
  target,
  acceptanceRadiusCells: 0.2,
  ownerToken,
  activeOrderSource: 'player',
  activeOrderToken: null,
  targetAvailable: true,
  paused: false,
  settings,
  previousState: progress.state,
});
assert.equal(playerOverride.status, 'player_override');
assert.equal(playerOverride.abortCode, 'player_order_replaced');
assert.equal(playerOverride.shouldForceRuntimeTick, true);
assert.equal(playerOverride.shouldCancelRuntime, false);

const targetLost = updateAiRouteStatus({
  nowMs: 700,
  position: { x: 1, y: 0 },
  target,
  acceptanceRadiusCells: 0.2,
  ownerToken,
  activeOrderSource: 'ai',
  activeOrderToken: ownerToken,
  targetAvailable: false,
  paused: false,
  settings,
  previousState: progress.state,
});
assert.equal(targetLost.status, 'target_lost');
assert.equal(targetLost.abortCode, 'target_lost');
assert.equal(targetLost.shouldCancelRuntime, true);

const targetLossIgnored = updateAiRouteStatus({
  nowMs: 700,
  position: { x: 1.1, y: 0 },
  target,
  acceptanceRadiusCells: 0.2,
  ownerToken,
  activeOrderSource: 'ai',
  activeOrderToken: ownerToken,
  targetAvailable: false,
  paused: false,
  settings: { ...settings, abortOnTargetLost: false },
  previousState: progress.state,
});
assert.notEqual(targetLossIgnored.status, 'target_lost');
assert.equal(targetLossIgnored.shouldCancelRuntime, false);

const orderMissing = updateAiRouteStatus({
  nowMs: 700,
  position: { x: 1, y: 0 },
  target,
  acceptanceRadiusCells: 0.2,
  ownerToken,
  activeOrderSource: null,
  activeOrderToken: null,
  targetAvailable: true,
  paused: false,
  settings,
  previousState: progress.state,
});
assert.equal(orderMissing.status, 'order_missing');
assert.equal(orderMissing.abortCode, 'owned_order_missing');
assert.equal(orderMissing.shouldForceRuntimeTick, true);
assert.equal(orderMissing.shouldCancelRuntime, false);

const arrived = updateAiRouteStatus({
  nowMs: 700,
  position: { x: 9.9, y: 0 },
  target,
  acceptanceRadiusCells: 0.2,
  ownerToken,
  activeOrderSource: 'ai',
  activeOrderToken: ownerToken,
  targetAvailable: true,
  paused: false,
  settings,
  previousState: progress.state,
});
assert.equal(arrived.status, 'arrived');
assert.equal(arrived.shouldForceRuntimeTick, false);
assert.equal(arrived.shouldCancelRuntime, false);

const paused = updateAiRouteStatus({
  nowMs: 8000,
  position: { x: 1, y: 0 },
  target,
  acceptanceRadiusCells: 0.2,
  ownerToken,
  activeOrderSource: 'ai',
  activeOrderToken: ownerToken,
  targetAvailable: true,
  paused: true,
  settings,
  previousState: progress.state,
});
assert.equal(paused.state.lastProgressAtMs, 8000);
assert.equal(paused.state.lastCheckedAtMs, 8000);
assert.equal(paused.noProgressMs, 0);
assert.equal(paused.shouldCancelRuntime, false);

const resumedAfterPause = updateAiRouteStatus({
  nowMs: 8100,
  position: { x: 1, y: 0 },
  target,
  acceptanceRadiusCells: 0.2,
  ownerToken,
  activeOrderSource: 'ai',
  activeOrderToken: ownerToken,
  targetAvailable: true,
  paused: false,
  settings,
  previousState: paused.state,
});
assert.equal(resumedAfterPause.status, 'stalled');
assert.equal(resumedAfterPause.noProgressMs, 100);
assert.equal(resumedAfterPause.shouldCancelRuntime, false);

console.log('AI route status smoke passed: start, progress, stall, block, player override, target loss, missing order, arrival, pause, resume.');
