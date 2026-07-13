import assert from 'node:assert/strict';
import mapData from '../src/data/maps/test_map.json';
import unitsData from '../src/data/units/test_units.json';
import { updateSelectedRouteStatus } from '../src/core/ai/AiStatefulMoveGameBridge';
import type { AiGraphExecutionState } from '../src/core/ai/AiGraphRuntime';
import { createAiRuntimeSession } from '../src/core/ai/runtime/AiRuntimeSession';
import type { TacticalMapData } from '../src/core/map/MapModel';
import { createMoveOrder } from '../src/core/orders/MoveOrder';
import { createInitialState } from '../src/core/simulation/SimulationState';
import type { UnitData } from '../src/core/units/UnitModel';

const state = createInitialState(
  mapData as TacticalMapData,
  unitsData as UnitData[],
  [],
);
const unit = state.units[0];
assert.ok(unit, 'test map must contain at least one soldier');
state.selectedUnitId = unit.id;
state.selectedUnitIds = [unit.id];

const target = { x: unit.position.x + 6, y: unit.position.y };
const ownerToken = `${unit.id}:move_to_destination:0`;
unit.order = createMoveOrder(target, {
  source: 'ai',
  ownerToken,
  requestedTarget: target,
});

const nestedMoveExecution: AiGraphExecutionState = {
  version: 1,
  graphId: 'move_and_observe',
  unitId: unit.id,
  branchNodeId: 'move_branch',
  sequenceNodeId: 'move_sequence',
  childIndex: 0,
  activeNodeId: 'move_to_destination',
  activeNodeStartedAtMs: 0,
  lastUpdatedAtMs: 0,
  status: 'running',
  frames: [],
  activeData: {
    kind: 'move_to_blackboard_position',
    targetKey: 'destination',
    target: { ...target },
    acceptanceRadiusCells: 0.2,
    timeoutMs: 15000,
    actionToken: ownerToken,
  },
};

const planExecution: AiGraphExecutionState = {
  version: 1,
  graphId: 'ai_plan_step',
  unitId: unit.id,
  branchNodeId: 'plan_branch',
  sequenceNodeId: 'plan_branch',
  childIndex: 0,
  activeNodeId: 'plan_step_subgraph',
  activeNodeStartedAtMs: 0,
  lastUpdatedAtMs: 0,
  status: 'running',
  frames: [],
  activeData: {
    kind: 'subgraph',
    subgraphId: 'move_and_observe',
    startedAtMs: 0,
    localBlackboard: {
      destination: { ...target },
      self_position: { ...unit.position },
      active_move_source: 'ai',
      active_move_owner_token: ownerToken,
      active_move_target: { ...target },
    },
    nestedExecutionState: nestedMoveExecution,
  },
};

unit.behaviorRuntime.aiRuntimeSession = createAiRuntimeSession({
  graphId: 'ai_plan_step',
  unitId: unit.id,
  executionState: planExecution,
  blackboardMemory: {
    active_move_source: 'ai',
    active_move_owner_token: ownerToken,
    active_move_target: { ...target },
  },
});

const result = updateSelectedRouteStatus(state, 600);
assert.ok(result, 'nested state-plan movement must produce route status');
assert.equal(result.status, 'moving', 'a destination stored in subgraph-local memory must remain available');
assert.equal(result.shouldCancelRuntime, false, 'route monitoring must not cancel a valid nested movement target');
assert.equal(result.abortCode, undefined);

console.log('AI plan move scope smoke passed: nested destination remains available to route monitoring.');
