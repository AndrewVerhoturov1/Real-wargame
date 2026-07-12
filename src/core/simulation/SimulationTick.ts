import { createDirectPlayerMovePlan } from '../ai/UnitPlan';
import { clampPercent, POSTURE_MOVE_MULTIPLIER } from '../behavior/BehaviorModel';
import type { GridPosition } from '../geometry';
import { syncSoldierThreatMemory } from '../knowledge/SoldierThreatMemory';
import { clampGridPositionToMap } from '../map/MapModel';
import { ensureNavigationRouteCurrent } from '../navigation/NavigationRouteReplanner';
import type { MoveOrder } from '../orders/MoveOrder';
import { updatePlayerCommandStatus } from '../orders/PlayerCommand';
import { tickSelectedSoldierPerception } from '../perception/PerceptionSystem';
import { evaluateThreatsAtPosition } from '../pressure/ThreatEvaluation';
import { getAiTestTimeScale } from '../testing/AiTestLabRuntime';
import type { UnitModel } from '../units/UnitModel';
import type { SimulationState } from './SimulationState';

const ORDER_COMPLETION_EPSILON_CELLS = 0.02;
const UNIT_VISUAL_BODY_RADIUS_CELLS = 0.42;
const UNIT_COLLISION_RADIUS_CELLS = UNIT_VISUAL_BODY_RADIUS_CELLS / 3;
const UNIT_MIN_CENTER_DISTANCE_CELLS = UNIT_COLLISION_RADIUS_CELLS * 2;
const COLLISION_PASSES = 3;

export function tickSimulation(state: SimulationState, deltaSeconds: number): void {
  const scaledDeltaSeconds = deltaSeconds * getAiTestTimeScale(state);
  state.simulationTimeSeconds += scaledDeltaSeconds;

  for (const unit of state.units) {
    updateMetrics(unit, state, scaledDeltaSeconds);
    updateStateLabels(unit);
  }

  tickSelectedSoldierPerception(state, scaledDeltaSeconds);

  for (const unit of state.units) {
    syncSoldierThreatMemory(state, unit, scaledDeltaSeconds);
    moveUnit(unit, state, scaledDeltaSeconds);
  }

  resolveUnitCollisions(state);
}

function updateMetrics(unit: UnitModel, state: SimulationState, deltaSeconds: number): void {
  const report = evaluateThreatsAtPosition(state.map, unit, state.pressureZones);

  unit.behaviorRuntime.rawDanger = report.danger;
  unit.behaviorRuntime.danger = report.danger;
  unit.behaviorRuntime.suppression = report.suppression;

  if (report.strongest) {
    unit.behaviorRuntime.stress = clampPercent(
      unit.behaviorRuntime.stress + report.stressPerSecond * unit.behaviorSettings.fear * deltaSeconds,
    );
    unit.behaviorRuntime.lastEvent = `pressure:${report.strongest.zone.id}`;
    unit.behaviorRuntime.reason = `under threat from ${report.strongest.zone.id}`;
    return;
  }

  unit.behaviorRuntime.stress = clampPercent(
    unit.behaviorRuntime.stress - unit.behaviorSettings.stressRecoveryPerSecond * deltaSeconds,
  );
  unit.behaviorRuntime.reason = unit.order ? 'moving outside pressure zone' : 'outside pressure zone';
}

function updateStateLabels(unit: UnitModel): void {
  unit.behaviorRuntime.currentAction = unit.order ? 'move' : 'observe';

  if (unit.order) {
    setState(unit, 'moving', 'active move order');
    return;
  }

  setState(unit, unit.behaviorRuntime.state === 'idle' ? 'idle' : 'observing', 'no active move order');
}

function moveUnit(unit: UnitModel, state: SimulationState, deltaSeconds: number): void {
  if (!unit.order || deltaSeconds <= 0) return;
  if (!ensureRoutePassable(unit, state)) return;
  const order = unit.order;
  if (!order) return;

  const waypointIndex = order.waypointIndex ?? 0;
  const movementTarget = order.waypoints?.[waypointIndex] ?? order.target;
  const remainingDistance = getDistance(unit.position, movementTarget);
  const postureMultiplier = POSTURE_MOVE_MULTIPLIER[unit.behaviorRuntime.posture];
  const conditionMultiplier = Math.max(0.35, unit.soldier.condition.speed / 100);
  const stepDistance = unit.speedCellsPerSecond * postureMultiplier * conditionMultiplier * deltaSeconds;
  unit.position = moveToPoint(unit.position, movementTarget, stepDistance);

  if (remainingDistance > stepDistance + ORDER_COMPLETION_EPSILON_CELLS) return;
  unit.position = { ...movementTarget };

  const waypoints = order.waypoints;
  if (waypoints && waypointIndex < waypoints.length - 1) {
    order.waypointIndex = waypointIndex + 1;
    if (order.routeStatus === 'planned') order.routeStatus = 'following';
    unit.behaviorRuntime.lastEvent = 'move_waypoint_reached';
    unit.behaviorRuntime.reason = `Точка маршрута ${order.waypointIndex + 1} из ${waypoints.length}.`;
    return;
  }

  unit.position = { ...order.target };
  unit.order = null;
  completeLinkedPlayerCommand(unit, order);
  setState(unit, 'observing', 'target reached');
  unit.behaviorRuntime.currentAction = 'observe';
  unit.behaviorRuntime.reason = 'target reached';
  unit.behaviorRuntime.lastEvent = 'move_done';
}

function ensureRoutePassable(unit: UnitModel, state: SimulationState): boolean {
  return ensureNavigationRouteCurrent(unit, state);
}

function completeLinkedPlayerCommand(unit: UnitModel, order: MoveOrder): void {
  const command = unit.playerCommand;
  if (!order.playerCommandId || command?.id !== order.playerCommandId) return;
  unit.playerCommand = updatePlayerCommandStatus(
    command,
    'completed',
    'Player movement command completed.',
    'Приказ движения выполнен.',
  );
  if (unit.plan?.source === 'player_fallback' && unit.plan.commandId === command.id) {
    unit.plan = createDirectPlayerMovePlan(unit.plan, unit.playerCommand, order.target);
  }
}

function blockLinkedPlayerCommand(
  unit: UnitModel,
  order: MoveOrder,
  reason: string,
  reasonRu: string,
): void {
  const command = unit.playerCommand;
  if (!order.playerCommandId || command?.id !== order.playerCommandId) return;
  unit.playerCommand = updatePlayerCommandStatus(
    command,
    'blocked',
    `Player movement command is blocked: ${reason}`,
    `Приказ движения заблокирован: ${reasonRu}`,
  );
  if (unit.plan?.source === 'player_fallback' && unit.plan.commandId === command.id) {
    unit.plan = createDirectPlayerMovePlan(unit.plan, unit.playerCommand, order.target);
  }
}

function resolveUnitCollisions(state: SimulationState): void {
  for (let pass = 0; pass < COLLISION_PASSES; pass += 1) {
    for (let leftIndex = 0; leftIndex < state.units.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < state.units.length; rightIndex += 1) {
        separateUnits(state, state.units[leftIndex], state.units[rightIndex], leftIndex, rightIndex);
      }
    }
  }
}

function separateUnits(
  state: SimulationState,
  left: UnitModel,
  right: UnitModel,
  leftIndex: number,
  rightIndex: number,
): void {
  const dx = right.position.x - left.position.x;
  const dy = right.position.y - left.position.y;
  const distance = Math.hypot(dx, dy);

  if (distance >= UNIT_MIN_CENTER_DISTANCE_CELLS) return;

  const safeDistance = distance > 0.0001 ? distance : 0.0001;
  const fallbackAngle = (leftIndex + rightIndex) * 2.399963229728653;
  const normalX = distance > 0.0001 ? dx / safeDistance : Math.cos(fallbackAngle);
  const normalY = distance > 0.0001 ? dy / safeDistance : Math.sin(fallbackAngle);
  const pushDistance = (UNIT_MIN_CENTER_DISTANCE_CELLS - safeDistance) / 2;

  left.position = clampGridPositionToMap(state.map, {
    x: left.position.x - normalX * pushDistance,
    y: left.position.y - normalY * pushDistance,
  });
  right.position = clampGridPositionToMap(state.map, {
    x: right.position.x + normalX * pushDistance,
    y: right.position.y + normalY * pushDistance,
  });
}

function setState(unit: UnitModel, nextState: UnitModel['behaviorRuntime']['state'], reason: string): void {
  if (unit.behaviorRuntime.state === nextState) return;

  unit.behaviorRuntime.previousState = unit.behaviorRuntime.state;
  unit.behaviorRuntime.state = nextState;
  unit.behaviorRuntime.stateChangedBecause = reason;
}

function getDistance(a: GridPosition, b: GridPosition): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function moveToPoint(current: GridPosition, target: GridPosition, maxDistance: number): GridPosition {
  const dx = target.x - current.x;
  const dy = target.y - current.y;
  const length = Math.hypot(dx, dy);

  if (length === 0 || length <= maxDistance) return { ...target };

  return {
    x: current.x + (dx / length) * maxDistance,
    y: current.y + (dy / length) * maxDistance,
  };
}
