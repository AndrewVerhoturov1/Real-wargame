import assert from 'node:assert/strict';
import type { GridPosition } from '../src/core/geometry';
import { normalizeMap, type MapObject, type TacticalMapData } from '../src/core/map/MapModel';
import { createMoveOrder } from '../src/core/orders/MoveOrder';
import { planMoveOrder } from '../src/core/orders/MoveOrderPlanning';
import { issueRoutedMoveOrderToSelectedUnits } from '../src/core/orders/RoutedMoveOrders';
import { createInitialState } from '../src/core/simulation/SimulationState';
import { tickSimulation } from '../src/core/simulation/SimulationTick';
import type { UnitData, UnitModel } from '../src/core/units/UnitModel';

verifyPlannerCreatesRoutedOrder();
verifyWaypointFollowingAndFinalCompletion();
verifyLegacyDirectMoveCompatibility();
verifyPlayerOrderUsesSharedPlanner();
verifyRouteReplansAroundNewObstacle();
verifyImpossibleReplanStopsMovement();

console.log('Routed movement smoke passed: planning, waypoints, completion, legacy compatibility, player orders, replan, failure.');

function verifyPlannerCreatesRoutedOrder(): void {
  const map = normalizeMap(makeWallMap(false));
  const start = { x: 1.5, y: 3.5 };
  const requestedTarget = { x: 7.5, y: 3.5 };
  const result = planMoveOrder(map, start, requestedTarget, { source: 'player' });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.order.requestedTarget, requestedTarget);
  assert.deepEqual(result.order.target, result.path.resolvedGoal);
  assert.equal(result.order.routeStatus, 'planned');
  assert.equal(result.order.routeRevision, 1);
  assert.equal(result.order.waypointIndex, 0);
  assert.ok((result.order.waypoints?.length ?? 0) >= 1);
  assert.ok((result.order.routeCells?.length ?? 0) > 2);
  assert.equal(result.order.source, 'player');
}

function verifyWaypointFollowingAndFinalCompletion(): void {
  const state = createTestState(makeWallMap(false));
  const unit = selectedUnit(state);
  const requestedTarget = { x: 7.5, y: 3.5 };
  const planned = planMoveOrder(state.map, unit.position, requestedTarget, { source: 'player' });
  assert.equal(planned.ok, true);
  if (!planned.ok) return;
  unit.order = planned.order;

  const firstWaypointIndex = unit.order.waypointIndex ?? 0;
  let advanced = false;
  for (let step = 0; step < 200 && unit.order; step += 1) {
    tickSimulation(state, 0.05);
    if ((unit.order?.waypointIndex ?? firstWaypointIndex) > firstWaypointIndex) {
      advanced = true;
      break;
    }
  }
  assert.equal(advanced, true, 'movement must advance through at least one intermediate waypoint');
  assert.ok(unit.order, 'reaching an intermediate waypoint must not complete the whole order');

  for (let step = 0; step < 1000 && unit.order; step += 1) tickSimulation(state, 0.05);
  assert.equal(unit.order, null, 'order must complete at the final resolved destination');
  assert.ok(distance(unit.position, planned.path.resolvedGoal) < 0.03);
  assert.equal(unit.behaviorRuntime.lastEvent, 'move_done');
}

function verifyLegacyDirectMoveCompatibility(): void {
  const state = createTestState(makeEmptyMap());
  const unit = selectedUnit(state);
  const target = { x: 3.5, y: 3.5 };
  unit.order = createMoveOrder(target);
  assert.equal(unit.order.waypoints, undefined);

  for (let step = 0; step < 300 && unit.order; step += 1) tickSimulation(state, 0.05);
  assert.equal(unit.order, null);
  assert.ok(distance(unit.position, target) < 0.03);
}

function verifyPlayerOrderUsesSharedPlanner(): void {
  const state = createTestState(makeWallMap(false));
  const unit = selectedUnit(state);
  issueRoutedMoveOrderToSelectedUnits(state, { x: 7.5, y: 3.5 });
  assert.ok(unit.order);
  assert.equal(unit.order?.source, 'player');
  assert.ok((unit.order?.routeCells?.length ?? 0) > 2);
  assert.equal(unit.order?.routeStatus, 'planned');
}

function verifyRouteReplansAroundNewObstacle(): void {
  const state = createTestState(makeWallMap(false));
  const unit = selectedUnit(state);
  const requestedTarget = { x: 7.5, y: 3.5 };
  const planned = planMoveOrder(state.map, unit.position, requestedTarget, { source: 'player' });
  assert.equal(planned.ok, true);
  if (!planned.ok) return;
  unit.order = planned.order;
  assert.ok(planned.path.cells.some((cell) => cell.x === 4 && cell.y === 3));

  state.map.objects.push(blockerAt(4.5, 3.5, 'new_gap_blocker'));
  tickSimulation(state, 0.05);

  assert.ok(unit.order, 'an alternate route around the wall edge must keep the order active');
  assert.equal(unit.order?.routeStatus, 'replanned');
  assert.equal(unit.order?.routeRevision, 2);
  assert.equal(unit.behaviorRuntime.lastEvent, 'move_route_replanned');
  assert.ok(!(unit.order?.routeCells ?? []).some((cell) => cell.x === 4 && cell.y === 3));

  for (let step = 0; step < 1200 && unit.order; step += 1) tickSimulation(state, 0.05);
  assert.equal(unit.order, null);
  assert.ok(distance(unit.position, requestedTarget) < 0.03);
}

function verifyImpossibleReplanStopsMovement(): void {
  const state = createTestState(makeWallMap(true));
  const unit = selectedUnit(state);
  const requestedTarget = { x: 7.5, y: 3.5 };
  const planned = planMoveOrder(state.map, unit.position, requestedTarget, { source: 'ai', ownerToken: 'route-token' });
  assert.equal(planned.ok, true);
  if (!planned.ok) return;
  unit.order = planned.order;

  state.map.objects.push(blockerAt(4.5, 3.5, 'sealed_gap'));
  tickSimulation(state, 0.05);

  assert.equal(unit.order, null, 'movement must stop when the only passage is closed and no replan exists');
  assert.equal(unit.behaviorRuntime.lastEvent, 'move_route_unavailable');
  assert.match(unit.behaviorRuntime.reason, /маршрут|путь/i);
}

function createTestState(mapData: TacticalMapData) {
  const state = createInitialState(mapData, [testUnitData()], []);
  state.selectedUnitId = 'path_unit';
  state.selectedUnitIds = ['path_unit'];
  return state;
}

function selectedUnit(state: ReturnType<typeof createTestState>): UnitModel {
  const unit = state.units.find((candidate) => candidate.id === 'path_unit');
  assert.ok(unit);
  return unit;
}

function testUnitData(): UnitData {
  return {
    id: 'path_unit',
    label: 'Path unit',
    labelRu: 'Проверочный боец',
    type: 'infantry_squad',
    side: 'player',
    x: 1,
    y: 3,
    speedCellsPerSecond: 4,
  };
}

function makeEmptyMap(): TacticalMapData {
  return {
    width: 10,
    height: 7,
    cellSize: 24,
    metersPerCell: 10,
    defaultTerrain: 'field',
    defaultHeight: 0,
    cells: [],
    objects: [],
  };
}

function makeWallMap(sealedEdges: boolean): TacticalMapData {
  const cells = [];
  const minimumY = sealedEdges ? 0 : 1;
  const maximumY = sealedEdges ? 6 : 5;
  for (let y = minimumY; y <= maximumY; y += 1) {
    if (y !== 3) cells.push({ x: 4, y, terrain: 'water' as const });
  }
  return {
    ...makeEmptyMap(),
    width: 9,
    cells,
  };
}

function blockerAt(x: number, y: number, id: string): MapObject {
  return {
    id,
    kind: 'structure',
    x,
    y,
    rotationRadians: 0,
    widthCells: 0.9,
    heightCells: 0.9,
    labels: null,
  };
}

function distance(left: GridPosition, right: GridPosition): number {
  return Math.hypot(right.x - left.x, right.y - left.y);
}
