import { createDirectPlayerMovePlan } from '../ai/UnitPlan';
import type { MoveOrder } from '../orders/MoveOrder';
import { planMoveOrder } from '../orders/MoveOrderPlanning';
import { updatePlayerCommandStatus } from '../orders/PlayerCommand';
import { isMapCellPassable } from '../pathfinding/GridNavigation';
import type { SimulationState } from '../simulation/SimulationState';
import type { UnitModel } from '../units/UnitModel';
import { evaluateNavigationReplan } from './NavigationReplanPolicy';
import { buildUnitTacticalRouteContext, resolveUnitNavigationProfile } from './NavigationRuntime';

const ROUTE_LOOKAHEAD_CELLS = 6;

export function ensureNavigationRouteCurrent(unit: UnitModel, state: SimulationState): boolean {
  const order = unit.order;
  const routeCells = order?.routeCells;
  const requestedTarget = order?.requestedTarget;
  if (!order || !routeCells || routeCells.length === 0 || !requestedTarget) return true;

  updateRouteCellIndex(unit, order);
  const blocked = routeLookaheadBlocked(state, order);
  const resolved = resolveUnitNavigationProfile(unit, unit.playerCommand);
  const tacticalContext = buildUnitTacticalRouteContext(unit);
  const evaluation = evaluateNavigationReplan({
    order,
    profile: resolved.profile,
    nowSeconds: state.simulationTimeSeconds,
    blocked,
    currentProfileRevision: resolved.profile.revision,
    currentKnowledgeRevision: tacticalContext.knowledgeRevision,
  });
  if (!evaluation.shouldSearch) return true;

  const reason = evaluation.reason ?? (blocked ? 'blocked' : 'navigation_changed');
  const reasonRu = evaluation.reasonRu ?? 'Изменились условия построения маршрута.';
  const replanned = planMoveOrder(state.map, unit.position, requestedTarget, {
    source: order.source,
    ownerToken: order.ownerToken,
    playerCommandId: order.playerCommandId,
    routeStatus: 'replanned',
    routeRevision: (order.routeRevision ?? 1) + 1,
    movementMode: order.movementMode
      ?? unit.playerCommand?.movementMode
      ?? unit.navigationMovementMode
      ?? 'normal',
    navigationProfile: resolved.profile,
    navigationProfileSource: resolved.source,
    finalFacingRadians: order.finalFacingRadians,
    tacticalContext,
    replanCount: (order.replanCount ?? 0) + 1,
    lastReplanAtSeconds: state.simulationTimeSeconds,
    lastReplanReason: reason,
    lastReplanReasonRu: reasonRu,
  });

  markReplanRevisionProcessed(
    order,
    state.simulationTimeSeconds,
    resolved.profile.revision,
    tacticalContext.knowledgeRevision,
    reason,
    reasonRu,
  );

  if (!replanned.ok) {
    if (!blocked) {
      unit.behaviorRuntime.lastEvent = 'move_route_replan_rejected';
      unit.behaviorRuntime.reason = 'Новый маршрут не найден; сохранён текущий путь.';
      return true;
    }
    blockRoute(unit, order, replanned.reason, replanned.reasonRu);
    return false;
  }

  const replacement = evaluateNavigationReplan({
    order,
    profile: resolved.profile,
    nowSeconds: state.simulationTimeSeconds,
    blocked,
    currentProfileRevision: resolved.profile.revision,
    currentKnowledgeRevision: tacticalContext.knowledgeRevision,
    candidateCost: replanned.order.pathCost,
  });
  if (!replacement.shouldReplace) {
    unit.behaviorRuntime.lastEvent = 'move_route_replan_hysteresis';
    unit.behaviorRuntime.reason = 'Новый маршрут улучшает путь недостаточно; сохранён текущий маршрут.';
    return true;
  }

  unit.order = replanned.order;
  unit.behaviorRuntime.lastEvent = 'move_route_replanned';
  unit.behaviorRuntime.reason = `Маршрут перестроен: ${replanned.path.reasonRu}`;
  return true;
}

function updateRouteCellIndex(unit: UnitModel, order: MoveOrder): void {
  const routeCells = order.routeCells;
  if (!routeCells || routeCells.length === 0) return;
  const currentX = Math.floor(unit.position.x);
  const currentY = Math.floor(unit.position.y);
  const previousIndex = Math.max(0, order.routeCellIndex ?? 0);
  const matchingIndex = routeCells.findIndex((cell, index) => (
    index >= previousIndex && cell.x === currentX && cell.y === currentY
  ));
  if (matchingIndex >= 0) order.routeCellIndex = matchingIndex;
}

function routeLookaheadBlocked(state: SimulationState, order: MoveOrder): boolean {
  const routeCells = order.routeCells;
  if (!routeCells || routeCells.length === 0) return false;
  const previousIndex = Math.max(0, order.routeCellIndex ?? 0);
  const startIndex = Math.min(routeCells.length - 1, previousIndex + 1);
  const endIndex = Math.min(routeCells.length - 1, startIndex + ROUTE_LOOKAHEAD_CELLS - 1);
  for (let index = startIndex; index <= endIndex; index += 1) {
    const cell = routeCells[index];
    if (!isMapCellPassable(state.map, cell.x, cell.y)) return true;
  }
  return false;
}

function markReplanRevisionProcessed(
  order: MoveOrder,
  nowSeconds: number,
  profileRevision: number,
  knowledgeRevision: number,
  reason: string,
  reasonRu: string,
): void {
  order.lastReplanAtSeconds = nowSeconds;
  order.navigationProfileRevision = profileRevision;
  order.knowledgeRevision = knowledgeRevision;
  order.lastReplanReason = reason;
  order.lastReplanReasonRu = reasonRu;
}

function blockRoute(unit: UnitModel, order: MoveOrder, reason: string, reasonRu: string): void {
  unit.order = null;
  const command = unit.playerCommand;
  if (order.playerCommandId && command?.id === order.playerCommandId) {
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

  unit.behaviorRuntime.previousState = unit.behaviorRuntime.state;
  unit.behaviorRuntime.state = 'observing';
  unit.behaviorRuntime.currentAction = 'observe';
  unit.behaviorRuntime.lastEvent = 'move_route_unavailable';
  unit.behaviorRuntime.reason = `Маршрут недоступен: ${reasonRu}`;
}
