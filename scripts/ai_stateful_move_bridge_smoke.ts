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
applyOwnedMoveEffects(state, runtimeResult(unit.id, [{
  type: 'begin_move',
  ownerToken: aiToken,
  targetPosition: { x: 7, y: 4 },
  targetKey: 'best_cover_position',
  reason: 'Move started.',
  reasonRu: 'Движение начато.',
}]));

assert.equal(unit.order?.source, 'ai');
assert.equal(unit.order?.ownerToken, aiToken);
assert.deepEqual(unit.order?.target, { x: 7, y: 4 });

syncSelectedMoveOrderMemory(state);
const memory = readAiMemory(unit);
assert.equal(memory.active_move_source, 'ai');
assert.equal(memory.active_move_owner_token, aiToken);
assert.deepEqual(memory.active_move_target, { x: 7, y: 4 });

unit.order = createMoveOrder({ x: 12, y: 8 }, { source: 'player' });
const playerOrder = unit.order;
applyOwnedMoveEffects(state, runtimeResult(unit.id, [{
  type: 'clear_move',
  ownerToken: aiToken,
  reason: 'Old AI move cancelled.',
  reasonRu: 'Старое движение ИИ отменено.',
}]));

assert.equal(unit.order, playerOrder, 'stale AI cleanup must preserve the replacement player order');
assert.equal(unit.order?.source, 'player');
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

console.log('AI stateful move bridge smoke passed: catalog validation, owned start, memory sync, player replacement protection, matching cleanup.');

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
