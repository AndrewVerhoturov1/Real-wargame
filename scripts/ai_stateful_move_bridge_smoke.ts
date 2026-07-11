import assert from 'node:assert/strict';
import mapData from '../src/data/maps/test_map.json';
import unitsData from '../src/data/units/test_units.json';
import type { AiBlackboardValue } from '../src/core/ai/AiBlackboard';
import type { AiGraph } from '../src/core/ai/AiGraph';
import {
  applyOwnedMoveEffects,
  buildReactiveRouteTickOptions,
  syncSelectedMoveOrderMemory,
  updateSelectedRouteStatus,
} from '../src/core/ai/AiStatefulMoveGameBridge';
import type { AiGraphExecutionState, AiGraphRuntimeResult } from '../src/core/ai/AiGraphRuntime';
import { validateAiGraph } from '../src/core/ai/AiGraphValidation';
import type { TacticalMapData } from '../src/core/map/MapModel';
import { createMoveOrder } from '../src/core/orders/MoveOrder';
import { createInitialState, type SimulationState } from '../src/core/simulation/SimulationState';
import { tickSimulation } from '../src/core/simulation/SimulationTick';
import { setAiTestPaused } from '../src/core/testing/AiTestLabRuntime';
import type { UnitData, UnitModel } from '../src/core/units/UnitModel';

const movementGraph: AiGraph = {
  version: 1,
  id: 'move_validation_graph',
  name: 'Move validation graph',
  nameRu: 'Проверочный граф движения',
  rootNodeId: 'root',
  blackboardDefaults: {
    self_position: { x: 1, y: 1 },
    best_cover_position: { x: 7, y: 4 },
  },
  nodes: [
    { id: 'root', type: 'Root', children: ['sequence'] },
    {
      id: 'sequence',
      type: 'SequenceWithMemory',
      children: ['move'],
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
  ],
};

const validation = validateAiGraph(movementGraph);
assert.equal(validation.valid, true, JSON.stringify(validation.issues));

const state = createSelectedState();
const unit = selectedUnit(state);

const aiToken = 'soldier:move:100';
const aiTarget = { x: 7, y: 4 };
applyOwnedMoveEffects(state, runtimeResult(unit.id, [{
  type: 'begin_move',
  ownerToken: aiToken,
  targetPosition: aiTarget,
  targetKey: 'best_cover_position',
  reason: 'Move started.',
  reasonRu: 'Движение начато.',
}]));

assert.equal(unit.order?.source, 'ai');
assert.equal(unit.order?.ownerToken, aiToken);
assert.deepEqual(unit.order?.target, aiTarget);

const distanceBeforeTick = distanceTo(unit.position, aiTarget);
tickSimulation(state, 0.5);
const distanceAfterTick = distanceTo(unit.position, aiTarget);
assert.ok(distanceAfterTick < distanceBeforeTick, 'SimulationTick must physically advance an AI-owned order');
assert.equal(unit.order?.ownerToken, aiToken, 'movement integration must preserve AI order ownership');

syncSelectedMoveOrderMemory(state);
const memory = readAiMemory(unit);
assert.equal(memory.active_move_source, 'ai');
assert.equal(memory.active_move_owner_token, aiToken);
assert.deepEqual(memory.active_move_target, aiTarget);

unit.order = createMoveOrder({ x: 12, y: 8 });
const playerOrder = unit.order;
syncSelectedMoveOrderMemory(state);
assert.equal(memory.active_move_source, 'player', 'legacy right-click orders without a token must be treated as player orders');
assert.equal(memory.active_move_owner_token, null);
applyOwnedMoveEffects(state, runtimeResult(unit.id, [{
  type: 'clear_move',
  ownerToken: aiToken,
  reason: 'Old AI move cancelled.',
  reasonRu: 'Старое движение ИИ отменено.',
}]));

assert.equal(unit.order, playerOrder, 'stale AI cleanup must preserve the replacement player order');
assert.equal(unit.order?.ownerToken, undefined);
assert.deepEqual(unit.order?.target, { x: 12, y: 8 });
assert.equal(unit.behaviorRuntime.lastEvent, 'ai_graph_owned_move_cleanup_skipped');

unit.order = createMoveOrder({ x: 5, y: 5 }, { source: 'ai', ownerToken: aiToken });
applyOwnedMoveEffects(state, runtimeResult(unit.id, [{
  type: 'clear_move',
  ownerToken: aiToken,
  reason: 'Owned move completed.',
  reasonRu: 'Собственное движение завершено.',
}]));
assert.equal(unit.order, null, 'matching AI cleanup must remove its own order');
assert.equal(unit.behaviorRuntime.lastEvent, 'ai_graph_owned_move_cleared');

unit.order = createMoveOrder({ x: 5, y: 5 }, { source: 'ai', ownerToken: aiToken });
unit.behaviorRuntime.currentAction = 'posture:prone';
unit.behaviorRuntime.reason = 'Лечь после движения.';
unit.behaviorRuntime.lastEvent = 'ai_graph_set_posture';
applyOwnedMoveEffects(state, runtimeResult(unit.id, [
  {
    type: 'clear_move',
    ownerToken: aiToken,
    reason: 'Move completed before the next sequence step.',
    reasonRu: 'Движение завершено перед следующим шагом последовательности.',
  },
  {
    type: 'set_posture',
    posture: 'prone',
    reason: 'Go prone after arrival.',
    reasonRu: 'Лечь после прибытия.',
  },
]));
assert.equal(unit.order, null, 'completion cleanup must still remove the matching AI order');
assert.equal(unit.behaviorRuntime.currentAction, 'posture:prone', 'move cleanup must not hide the following sequence action');
assert.equal(unit.behaviorRuntime.reason, 'Лечь после движения.');
assert.equal(unit.behaviorRuntime.lastEvent, 'ai_graph_set_posture');

verifyNormalProgressAndBlocking();
verifyPlayerOverrideStatus();
verifyTargetLostStatus();
verifyOwnedOrderMissingStatus();
verifyRealPauseDoesNotBlockRoute();

console.log('AI stateful move bridge smoke passed: ownership safety, route progress, reactive tick mapping, pause exclusion, blocked route, player override, target loss, missing order.');

function verifyNormalProgressAndBlocking(): void {
  const routeState = createSelectedState();
  const routeUnit = selectedUnit(routeState);
  const token = 'route-progress-token';
  const target = { x: routeUnit.position.x + 10, y: routeUnit.position.y };
  routeUnit.order = createMoveOrder(target, { source: 'ai', ownerToken: token });
  setMoveExecutionState(routeUnit, token, target, 'best_cover_position');

  const start = updateSelectedRouteStatus(routeState, 0);
  assert.ok(start);
  assert.equal(start.status, 'moving');
  assert.equal(readAiMemory(routeUnit).active_move_route_status, 'moving');

  tickSimulation(routeState, 0.5);
  const progress = updateSelectedRouteStatus(routeState, 600);
  assert.ok(progress);
  assert.equal(progress.status, 'moving');
  assert.equal(progress.noProgressMs, 0);

  const blocked = updateSelectedRouteStatus(routeState, 3200);
  assert.ok(blocked);
  assert.equal(blocked.status, 'blocked');
  assert.equal(blocked.shouldCancelRuntime, true);
  assert.equal(readAiMemory(routeUnit).active_move_abort_code, 'route_blocked');
  assert.match(String(readAiMemory(routeUnit).active_move_abort_reason), /не продвигается/i);

  const tickOptions = buildReactiveRouteTickOptions(blocked);
  assert.equal(tickOptions.force, true);
  assert.equal(tickOptions.applyEffects, true);
  assert.match(tickOptions.cancel?.reasonRu ?? '', /не продвигается/i);
}

function verifyPlayerOverrideStatus(): void {
  const routeState = createSelectedState();
  const routeUnit = selectedUnit(routeState);
  const token = 'player-override-token';
  const target = { x: routeUnit.position.x + 5, y: routeUnit.position.y };
  setMoveExecutionState(routeUnit, token, target, 'best_cover_position');
  routeUnit.order = createMoveOrder({ x: target.x + 2, y: target.y + 1 });

  const result = updateSelectedRouteStatus(routeState, 100);
  assert.ok(result);
  assert.equal(result.status, 'player_override');
  assert.equal(result.shouldForceRuntimeTick, true);
  assert.equal(result.shouldCancelRuntime, false);
  assert.equal(readAiMemory(routeUnit).active_move_route_status, 'player_override');
  assert.equal(buildReactiveRouteTickOptions(result).cancel, undefined);
}

function verifyTargetLostStatus(): void {
  const routeState = createSelectedState();
  const routeUnit = selectedUnit(routeState);
  const token = 'target-lost-token';
  const target = { x: routeUnit.position.x + 5, y: routeUnit.position.y };
  routeUnit.order = createMoveOrder(target, { source: 'ai', ownerToken: token });
  setMoveExecutionState(routeUnit, token, target, 'missing_route_target');

  const result = updateSelectedRouteStatus(routeState, 100);
  assert.ok(result);
  assert.equal(result.status, 'target_lost');
  assert.equal(result.shouldCancelRuntime, true);
  assert.match(result.abortReasonRu ?? '', /исчезла/i);
  assert.match(buildReactiveRouteTickOptions(result).cancel?.reasonRu ?? '', /исчезла/i);
}

function verifyOwnedOrderMissingStatus(): void {
  const routeState = createSelectedState();
  const routeUnit = selectedUnit(routeState);
  const token = 'missing-order-token';
  const target = { x: routeUnit.position.x + 5, y: routeUnit.position.y };
  routeUnit.order = null;
  setMoveExecutionState(routeUnit, token, target, 'best_cover_position');

  const result = updateSelectedRouteStatus(routeState, 100);
  assert.ok(result);
  assert.equal(result.status, 'order_missing');
  assert.equal(result.shouldForceRuntimeTick, true);
  assert.equal(result.shouldCancelRuntime, false);
  assert.equal(buildReactiveRouteTickOptions(result).cancel, undefined);
}

function verifyRealPauseDoesNotBlockRoute(): void {
  const routeState = createSelectedState();
  const routeUnit = selectedUnit(routeState);
  const token = 'pause-route-token';
  const target = { x: routeUnit.position.x + 8, y: routeUnit.position.y };
  routeUnit.order = createMoveOrder(target, { source: 'ai', ownerToken: token });
  setMoveExecutionState(routeUnit, token, target, 'best_cover_position');

  const started = updateSelectedRouteStatus(routeState, 0);
  assert.ok(started);
  setAiTestPaused(routeState, true);
  const paused = updateSelectedRouteStatus(routeState, 5000);
  assert.ok(paused);
  assert.equal(paused.status, 'moving');
  assert.equal(paused.noProgressMs, 0);
  assert.equal(paused.shouldCancelRuntime, false);

  setAiTestPaused(routeState, false);
  const resumed = updateSelectedRouteStatus(routeState, 5100);
  assert.ok(resumed);
  assert.equal(resumed.status, 'stalled');
  assert.equal(resumed.noProgressMs, 100);
  assert.equal(resumed.shouldCancelRuntime, false);
}

function createSelectedState(): SimulationState {
  const next = createInitialState(
    mapData as TacticalMapData,
    unitsData as UnitData[],
    [],
  );
  const unit = next.units[0];
  assert.ok(unit, 'test map must contain at least one soldier');
  next.selectedUnitId = unit.id;
  next.selectedUnitIds = [unit.id];
  return next;
}

function selectedUnit(state: SimulationState): UnitModel {
  const unit = state.units.find((candidate) => candidate.id === state.selectedUnitId);
  assert.ok(unit);
  return unit;
}

function setMoveExecutionState(
  unit: UnitModel,
  ownerToken: string,
  target: { x: number; y: number },
  targetKey: string,
): void {
  const runtime = unit.behaviorRuntime as UnitModel['behaviorRuntime'] & {
    aiGraphExecutionState?: AiGraphExecutionState;
  };
  runtime.aiGraphExecutionState = {
    version: 1,
    graphId: 'route_bridge_graph',
    unitId: unit.id,
    branchNodeId: 'branch',
    sequenceNodeId: 'sequence',
    childIndex: 0,
    activeNodeId: 'move',
    activeNodeStartedAtMs: 0,
    lastUpdatedAtMs: 0,
    status: 'running',
    activeData: {
      kind: 'move_to_blackboard_position',
      targetKey,
      target,
      acceptanceRadiusCells: 0.2,
      timeoutMs: 15000,
      actionToken: ownerToken,
    },
  };
}

function runtimeResult(unitId: string, effects: readonly unknown[]): AiGraphRuntimeResult {
  return {
    ok: true,
    status: 'running',
    unitId,
    graphId: 'bridge_smoke_graph',
    selectedBranchNodeId: 'branch',
    selectedBranchName: 'Move branch',
    selectedBranchNameRu: 'Ветка движения',
    scores: [],
    effects,
    blackboard: {},
    cooldowns: {},
    trace: [],
    explanation: 'Bridge smoke result.',
    explanationRu: 'Проверочный результат мостика.',
    lifecycle: [],
  } as unknown as AiGraphRuntimeResult;
}

function readAiMemory(unit: UnitModel): Record<string, AiBlackboardValue> {
  const runtime = unit.behaviorRuntime as UnitModel['behaviorRuntime'] & {
    aiGraphMemory?: Record<string, AiBlackboardValue>;
  };
  assert.ok(runtime.aiGraphMemory);
  return runtime.aiGraphMemory;
}

function distanceTo(from: { x: number; y: number }, to: { x: number; y: number }): number {
  return Math.hypot(to.x - from.x, to.y - from.y);
}
