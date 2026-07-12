import assert from 'node:assert/strict';
import mapData from '../src/data/maps/test_map.json';
import unitsData from '../src/data/units/test_units.json';
import type { AiBlackboardValue } from '../src/core/ai/AiBlackboard';
import type { AiGraph } from '../src/core/ai/AiGraph';
import {
  applyOwnedMoveEffects,
  syncSelectedMoveOrderMemory,
} from '../src/core/ai/AiStatefulMoveGameBridge';
import type { AiGraphRuntimeResult } from '../src/core/ai/AiGraphRuntime';
import { validateAiGraph } from '../src/core/ai/AiGraphValidation';
import type { TacticalMapData } from '../src/core/map/MapModel';
import { createMoveOrder } from '../src/core/orders/MoveOrder';
import { createInitialState } from '../src/core/simulation/SimulationState';
import { tickSimulation } from '../src/core/simulation/SimulationTick';
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
    { id: 'sequence', type: 'SequenceWithMemory', children: ['move'] },
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

const state = createInitialState(
  mapData as TacticalMapData,
  unitsData as UnitData[],
  [],
);
const unit = state.units[0];
assert.ok(unit, 'test map must contain at least one soldier');
state.selectedUnitId = unit.id;
state.selectedUnitIds = [unit.id];

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
assert.deepEqual(unit.order?.requestedTarget, aiTarget);
assert.deepEqual(unit.order?.target, aiTarget, 'AI movement must keep its exact requested target');
assert.ok((unit.order?.routeCells?.length ?? 0) > 1, 'AI movement must receive a grid route');
assert.equal(unit.order?.routeStatus, 'planned');

const distanceBeforeTick = distanceTo(unit.position, unit.order?.target ?? aiTarget);
tickSimulation(state, 0.5);
const distanceAfterTick = distanceTo(unit.position, unit.order?.target ?? aiTarget);
assert.ok(distanceAfterTick < distanceBeforeTick, 'SimulationTick must physically advance an AI-owned routed order');
assert.equal(unit.order?.ownerToken, aiToken, 'movement integration must preserve AI order ownership');

syncSelectedMoveOrderMemory(state);
const memory = readAiMemory(unit);
assert.equal(memory.active_move_source, 'ai');
assert.equal(memory.active_move_owner_token, aiToken);
assert.deepEqual(memory.active_move_target, unit.order?.target);
assert.equal(memory.active_move_path_status, unit.order?.routeStatus);
assert.equal(memory.active_move_path_waypoint_count, unit.order?.waypoints?.length);
assert.deepEqual(memory.active_move_path_requested_target, aiTarget);
assert.deepEqual(memory.active_move_path_resolved_target, unit.order?.target);

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

verifyUnreachableAiStart();
verifyBlockedExactAiGoal();

console.log('AI stateful move bridge smoke passed: exact routed AI target, path memory, movement, ownership, cleanup, unreachable start and blocked exact goal.');

function verifyUnreachableAiStart(): void {
  const blockedState = createState();
  const blockedUnit = blockedState.units[0];
  assert.ok(blockedUnit);
  blockedState.map.objects.push({
    id: 'start_blocker',
    kind: 'structure',
    x: Math.floor(blockedUnit.position.x),
    y: Math.floor(blockedUnit.position.y),
    rotationRadians: 0,
    widthCells: 1,
    heightCells: 1,
    labels: null,
  });

  applyOwnedMoveEffects(blockedState, runtimeResult(blockedUnit.id, [{
    type: 'begin_move',
    ownerToken: 'blocked-token',
    targetPosition: { x: blockedUnit.position.x + 4, y: blockedUnit.position.y },
    targetKey: 'best_cover_position',
    reason: 'Blocked move.',
    reasonRu: 'Заблокированное движение.',
  }]));

  assertUnreachable(blockedUnit, /старт|клетк/i);
}

function verifyBlockedExactAiGoal(): void {
  const blockedState = createState();
  const blockedUnit = blockedState.units[0];
  assert.ok(blockedUnit);
  const target = { x: blockedUnit.position.x + 4, y: blockedUnit.position.y };
  blockedState.map.objects.push({
    id: 'goal_blocker',
    kind: 'structure',
    x: Math.floor(target.x),
    y: Math.floor(target.y),
    rotationRadians: 0,
    widthCells: 1,
    heightCells: 1,
    labels: null,
  });

  applyOwnedMoveEffects(blockedState, runtimeResult(blockedUnit.id, [{
    type: 'begin_move',
    ownerToken: 'exact-goal-token',
    targetPosition: target,
    targetKey: 'best_cover_position',
    reason: 'Exact goal move.',
    reasonRu: 'Движение к точной цели.',
  }]));

  assertUnreachable(blockedUnit, /точн|непроходим/i);
  assert.deepEqual(readAiMemory(blockedUnit).active_move_path_requested_target, target);
  assert.equal(readAiMemory(blockedUnit).active_move_path_resolved_target, null);
}

function createState() {
  const next = createInitialState(
    mapData as TacticalMapData,
    unitsData as UnitData[],
    [],
  );
  const firstUnit = next.units[0];
  assert.ok(firstUnit);
  next.selectedUnitId = firstUnit.id;
  next.selectedUnitIds = [firstUnit.id];
  return next;
}

function assertUnreachable(unitModel: UnitModel, reasonPattern: RegExp): void {
  assert.equal(unitModel.order, null);
  assert.equal(unitModel.behaviorRuntime.lastEvent, 'ai_graph_move_route_unavailable');
  assert.match(unitModel.behaviorRuntime.reason, /маршрут/i);
  const blockedMemory = readAiMemory(unitModel);
  assert.equal(blockedMemory.active_move_path_status, 'unreachable');
  assert.equal(blockedMemory.active_move_path_waypoint_count, 0);
  assert.match(String(blockedMemory.active_move_path_reason), reasonPattern);
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

function readAiMemory(unitModel: UnitModel): Record<string, AiBlackboardValue> {
  const runtime = unitModel.behaviorRuntime as UnitModel['behaviorRuntime'] & {
    aiGraphMemory?: Record<string, AiBlackboardValue>;
  };
  assert.ok(runtime.aiGraphMemory);
  return runtime.aiGraphMemory;
}

function distanceTo(from: { x: number; y: number }, to: { x: number; y: number }): number {
  return Math.hypot(to.x - from.x, to.y - from.y);
}
