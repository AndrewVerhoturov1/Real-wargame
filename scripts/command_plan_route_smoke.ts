import assert from 'node:assert/strict';
import type { AiGraph } from '../src/core/ai/AiGraph';
import type { AiGraphRuntimeResult } from '../src/core/ai/AiGraphRuntime';
import {
  createDirectPlayerMovePlan,
  updateUnitPlanFromRuntime,
} from '../src/core/ai/UnitPlan';
import { normalizeMap, type TacticalMapData } from '../src/core/map/MapModel';
import { createMoveOrder } from '../src/core/orders/MoveOrder';
import {
  createPlayerMoveCommand,
  updatePlayerCommandStatus,
} from '../src/core/orders/PlayerCommand';
import { createInitialState } from '../src/core/simulation/SimulationState';
import { buildCommandPlanRouteOverlaySnapshot } from '../src/rendering/CommandPlanRouteOverlayModel';

verifyPlayerCommandIdentityAndRevision();
verifyDirectFallbackPlan();
verifyRuntimePlanStages();
verifyOverlaySnapshotIsBounded();

console.log('Command/plan/route smoke passed: command identity, fallback plan, graph stages, bounded overlay snapshot.');

function verifyPlayerCommandIdentityAndRevision(): void {
  const target = { x: 8.5, y: 4.5 };
  const first = createPlayerMoveCommand('unit-a', target, null, 1000);
  const second = createPlayerMoveCommand('unit-a', { x: 9.5, y: 4.5 }, first, 1100);
  const blocked = updatePlayerCommandStatus(first, 'blocked', 'Route unavailable.', 'Маршрут недоступен.');

  assert.equal(first.type, 'move_to_position');
  assert.equal(first.status, 'active');
  assert.equal(second.revision, first.revision + 1);
  assert.notEqual(second.id, first.id);
  assert.equal(blocked.id, first.id);
  assert.equal(blocked.revision, first.revision + 1);
  assert.deepEqual(blocked.target, target);
}

function verifyDirectFallbackPlan(): void {
  const command = createPlayerMoveCommand('unit-a', { x: 8.5, y: 4.5 }, null, 1000);
  const plan = createDirectPlayerMovePlan(null, command, { x: 8.5, y: 3.5 });

  assert.equal(plan.source, 'player_fallback');
  assert.equal(plan.commandId, command.id);
  assert.equal(plan.status, 'active');
  assert.equal(plan.activeStageIndex, 0);
  assert.equal(plan.stages.length, 1);
  assert.equal(plan.stages[0].status, 'active');
  assert.deepEqual(plan.stages[0].target, { x: 8.5, y: 3.5 });
}

function verifyRuntimePlanStages(): void {
  const graph: AiGraph = {
    version: 1,
    id: 'plan-test',
    name: 'Plan test',
    nameRu: 'Проверка плана',
    rootNodeId: 'root',
    blackboardDefaults: {},
    nodes: [
      { id: 'root', type: 'Root', children: ['branch'] },
      { id: 'branch', type: 'Branch', displayName: 'Covered approach', displayNameRu: 'Подход через укрытие', children: ['sequence'] },
      { id: 'sequence', type: 'SequenceWithMemory', children: ['prepare', 'move', 'observe'] },
      { id: 'prepare', type: 'Wait', displayName: 'Prepare', displayNameRu: 'Подготовиться' },
      { id: 'move', type: 'MoveToBlackboardPosition', displayName: 'Move to cover', displayNameRu: 'Двигаться к укрытию', parameters: { targetKey: 'best_cover_position' } },
      { id: 'observe', type: 'Wait', displayName: 'Observe', displayNameRu: 'Осмотреться' },
    ],
  };
  const result = {
    ok: true,
    unitId: 'unit-a',
    graphId: graph.id,
    selectedBranchNodeId: 'branch',
    selectedBranchName: 'Covered approach',
    selectedBranchNameRu: 'Подход через укрытие',
    status: 'running',
    explanation: 'Moving through cover.',
    explanationRu: 'Движение через укрытие.',
    blackboard: { best_cover_position: { x: 6.5, y: 3.5 } },
    cooldowns: {},
    effects: [],
    trace: [],
    scores: [],
    lifecycle: [],
    executionState: {
      version: 1,
      graphId: graph.id,
      unitId: 'unit-a',
      branchNodeId: 'branch',
      sequenceNodeId: 'sequence',
      childIndex: 1,
      activeNodeId: 'move',
      activeNodeStartedAtMs: 1000,
      lastUpdatedAtMs: 1200,
      status: 'running',
    },
  } as unknown as AiGraphRuntimeResult;

  const first = updateUnitPlanFromRuntime(null, graph, result);
  assert.ok(first);
  assert.equal(first?.source, 'ai_graph');
  assert.equal(first?.branchLabelRu, 'Подход через укрытие');
  assert.equal(first?.activeStageIndex, 1);
  assert.deepEqual(first?.stages.map((stage) => stage.status), ['completed', 'active', 'pending']);
  assert.deepEqual(first?.stages[1].target, { x: 6.5, y: 3.5 });

  const unchanged = updateUnitPlanFromRuntime(first, graph, result);
  assert.equal(unchanged?.revision, first?.revision, 'structurally identical runtime result must not churn overlay revision');
}

function verifyOverlaySnapshotIsBounded(): void {
  const state = createInitialState(makeMap(), [{
    id: 'unit-a',
    label: 'Unit A',
    labelRu: 'Боец А',
    type: 'infantry_squad',
    side: 'player',
    x: 1,
    y: 2,
  }], []);
  const unit = state.units[0];
  unit.playerCommand = createPlayerMoveCommand(unit.id, { x: 8.5, y: 2.5 }, null, 1000);
  unit.plan = createDirectPlayerMovePlan(null, unit.playerCommand, { x: 7.5, y: 2.5 });
  unit.order = createMoveOrder({ x: 7.5, y: 2.5 }, {
    source: 'player',
    playerCommandId: unit.playerCommand.id,
    requestedTarget: unit.playerCommand.target,
    waypoints: [{ x: 3.5, y: 2.5 }, { x: 5.5, y: 3.5 }, { x: 7.5, y: 2.5 }],
    waypointIndex: 1,
    routeRevision: 2,
    routeCells: Array.from({ length: 1000 }, (_, index) => ({ x: index, y: index })),
  });

  const snapshot = buildCommandPlanRouteOverlaySnapshot(state.map, unit, true);
  assert.deepEqual(snapshot.command?.target, unit.playerCommand.target);
  assert.equal(snapshot.planStages.length, 1);
  assert.deepEqual(snapshot.routePoints, [unit.position, { x: 5.5, y: 3.5 }, { x: 7.5, y: 2.5 }]);
  assert.ok(snapshot.key.length < 500, `overlay key must stay bounded, got ${snapshot.key.length}`);
  assert.doesNotMatch(snapshot.key, /999:999/, 'overlay key must not serialize route cells');
}

function makeMap(): TacticalMapData {
  return {
    width: 12,
    height: 8,
    cellSize: 12,
    metersPerCell: 2,
    defaultTerrain: 'field',
    defaultHeight: 0,
    cells: [],
    objects: [],
  };
}
