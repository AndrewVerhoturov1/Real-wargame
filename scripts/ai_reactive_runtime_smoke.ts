import assert from 'node:assert/strict';
import type { AiGraph } from '../src/core/ai/AiGraph';
import {
  runAiGraphRuntime,
  type AiGraphExecutionState,
  type AiGraphRuntimeResult,
} from '../src/core/ai/AiGraphRuntime';
import type { AiEvent } from '../src/core/ai/events/AiEvent';
import { deriveReactiveObserverDefinitions } from '../src/core/ai/events/AiReactiveRuntime';
import { validateAiGraph } from '../src/core/ai/AiGraphValidation';

const graph: AiGraph = {
  version: 1,
  id: 'reactive_runtime_graph',
  name: 'Reactive runtime graph',
  nameRu: 'Граф реактивного runtime',
  rootNodeId: 'root',
  blackboardDefaults: {
    route_ok: true,
    best_cover_position: { x: 7, y: 4 },
    self_position: { x: 1, y: 1 },
    active_move_source: null,
    active_move_owner_token: null,
    active_move_target: null,
  },
  nodes: [
    { id: 'root', type: 'Root', children: ['utility'] },
    { id: 'utility', type: 'UtilitySelector', children: ['branch'] },
    { id: 'branch', type: 'ActionBranch', children: ['selector'], displayNameRu: 'Основная ветвь' },
    { id: 'selector', type: 'Selector', children: ['reactive', 'fallback'] },
    {
      id: 'reactive',
      type: 'ReactiveSequence',
      children: ['route-condition', 'move'],
      displayName: 'Reactive move',
      displayNameRu: 'Реактивное движение',
      parameters: {
        observePrecedingConditions: true,
        abortReason: 'Movement condition changed.',
        abortReasonRu: 'Условие движения изменилось.',
      },
    },
    {
      id: 'route-condition',
      type: 'FlagCheck',
      children: [],
      parameters: { flagKey: 'route_ok', expected: true },
    },
    {
      id: 'move',
      type: 'MoveToBlackboardPosition',
      children: [],
      parameters: {
        targetKey: 'best_cover_position',
        acceptanceRadiusCells: 0.2,
        timeoutSeconds: 15,
      },
    },
    {
      id: 'fallback',
      type: 'SequenceWithMemory',
      children: ['fallback-posture', 'fallback-wait'],
      displayNameRu: 'Запасная ветвь',
    },
    {
      id: 'fallback-posture',
      type: 'SetPosture',
      children: [],
      parameters: { posture: 'prone' },
    },
    {
      id: 'fallback-wait',
      type: 'Wait',
      children: [],
      parameters: { durationSeconds: 2, timeoutSeconds: 0 },
    },
  ],
};

const validation = validateAiGraph(graph);
assert.equal(validation.valid, true, JSON.stringify(validation.issues));

verifyConditionAbortAndAlternative();
verifyIrrelevantEventDoesNotWake();
verifyRouteAbortParity();

console.log('AI reactive runtime smoke passed: observer abort, cleanup order, alternative branch, irrelevant event, route token parity and reactive trace.');

function verifyConditionAbortAndAlternative(): void {
  const started = startMove();
  const observerDefinitions = deriveReactiveObserverDefinitions(graph, started.state);
  assert.equal(observerDefinitions.length, 1);
  assert.equal(observerDefinitions[0]?.key, 'route_ok');
  assert.equal(observerDefinitions[0]?.observerId, 'reactive:route-condition:route_ok');

  const event = aiEvent('observer-route-false', 'blackboard_observer_changed', 100, 80, {
    observerId: 'reactive:route-condition:route_ok',
    key: 'route_ok',
    sourceNodeId: 'route-condition',
  });
  const aborted = runAiGraphRuntime({
    ...baseInput(started.actionToken, false),
    nowMs: 100,
    executionState: started.state,
    events: [event],
  });

  assert.equal(aborted.status, 'waiting');
  assert.equal(aborted.activeNodeId, 'fallback-wait');
  assert.deepEqual(aborted.effects.map((effect) => effect.type), ['clear_move', 'set_posture']);
  assert.deepEqual(aborted.lifecycle.map((item) => `${item.phase}:${item.nodeId}`), [
    'cancel:move',
    'start:fallback-wait',
  ]);
  assert.deepEqual(aborted.consumedEventIds, ['observer-route-false']);
  assert.equal(aborted.reactiveAbort?.eventType, 'blackboard_observer_changed');
  assert.equal(aborted.reactiveAbort?.observerId, 'reactive:route-condition:route_ok');
  assert.equal(aborted.reactiveAbort?.abortSourceNodeId, 'route-condition');
  assert.equal(aborted.reactiveAbort?.oldBranchNodeId, 'branch');
  assert.equal(aborted.reactiveAbort?.activeChildNodeId, 'move');
  assert.equal(aborted.reactiveAbort?.cleanupOutcome, 'completed');
  assert.equal(aborted.reactiveAbort?.newBranchNodeId, 'fallback');
  assert.match(aborted.reactiveAbort?.reasonRu ?? '', /перестало выполняться/i);
  assert.equal(aborted.executionState?.frames?.some((frame) => frame.kind === 'reactive_sequence'), false);
}

function verifyIrrelevantEventDoesNotWake(): void {
  const started = startMove();
  const irrelevant = aiEvent('ammo-empty', 'ammo_empty', 100, 80, { ammo: 0 });
  const result = runAiGraphRuntime({
    ...baseInput(started.actionToken, true),
    nowMs: 100,
    executionState: started.state,
    events: [irrelevant],
  });
  assert.equal(result.status, 'running');
  assert.equal(result.activeNodeId, 'move');
  assert.deepEqual(result.effects, []);
  assert.deepEqual(result.lifecycle.map((item) => item.phase), ['update']);
  assert.deepEqual(result.consumedEventIds ?? [], []);
  assert.equal(result.reactiveAbort, undefined);
}

function verifyRouteAbortParity(): void {
  const matching = startMove();
  const routeBlocked = aiEvent('route-blocked', 'route_blocked', 100, 90, {
    ownerToken: matching.actionToken,
    reason: 'Route blocked.',
    reasonRu: 'Маршрут заблокирован.',
  });
  const aborted = runAiGraphRuntime({
    ...baseInput(matching.actionToken, true),
    nowMs: 100,
    executionState: matching.state,
    events: [routeBlocked],
  });
  assert.equal(aborted.status, 'waiting');
  assert.deepEqual(aborted.effects.map((effect) => effect.type), ['clear_move', 'set_posture']);
  assert.equal(aborted.reactiveAbort?.eventType, 'route_blocked');
  assert.equal(aborted.reactiveAbort?.cleanupOutcome, 'completed');

  const mismatched = startMove();
  const foreignRoute = aiEvent('foreign-route', 'route_blocked', 100, 90, {
    ownerToken: 'another-action-token',
  });
  const unchanged = runAiGraphRuntime({
    ...baseInput(mismatched.actionToken, true),
    nowMs: 100,
    executionState: mismatched.state,
    events: [foreignRoute],
  });
  assert.equal(unchanged.status, 'running');
  assert.deepEqual(unchanged.effects, []);
  assert.equal(unchanged.reactiveAbort, undefined);
}

function startMove(): { state: AiGraphExecutionState; actionToken: string; result: AiGraphRuntimeResult } {
  const result = runAiGraphRuntime({
    ...baseInput(null, true),
    nowMs: 0,
  });
  assert.equal(result.status, 'running');
  assert.equal(result.activeNodeId, 'move');
  assert.deepEqual(result.effects.map((effect) => effect.type), ['begin_move']);
  assert.ok(result.executionState);
  assert.equal(result.executionState.frames?.some((frame) => frame.kind === 'reactive_sequence'), true);
  const activeData = result.executionState.activeData;
  assert.equal(activeData?.kind, 'move_to_blackboard_position');
  if (activeData?.kind !== 'move_to_blackboard_position') throw new Error('Move action state missing.');
  return { state: result.executionState, actionToken: activeData.actionToken, result };
}

function baseInput(actionToken: string | null, routeOk: boolean) {
  return {
    graph,
    unitId: 'reactive-soldier',
    blackboard: {
      route_ok: routeOk,
      best_cover_position: { x: 7, y: 4 },
      self_position: { x: 1, y: 1 },
      active_move_source: actionToken ? 'ai' : null,
      active_move_owner_token: actionToken,
      active_move_target: actionToken ? { x: 7, y: 4 } : null,
    },
    cooldowns: {},
  };
}

function aiEvent(
  id: string,
  type: string,
  timestampMs: number,
  priority: number,
  payload: Record<string, unknown>,
): AiEvent {
  return {
    version: 1,
    id,
    sequence: 0,
    type,
    timestampMs,
    priority,
    payload,
  };
}
