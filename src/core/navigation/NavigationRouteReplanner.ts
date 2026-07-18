import { createDirectPlayerMovePlan } from '../ai/UnitPlan';
import { measurePerformancePhase } from '../debug/PerformancePhases';
import type { MoveOrder } from '../orders/MoveOrder';
import { planMoveOrder } from '../orders/MoveOrderPlanning';
import { updatePlayerCommandStatus } from '../orders/PlayerCommand';
import { isMapCellPassable } from '../pathfinding/GridNavigation';
import type { SimulationState } from '../simulation/SimulationState';
import type { UnitModel } from '../units/UnitModel';
import { evaluateNavigationReplan } from './NavigationReplanPolicy';
import { evaluatePreparedNavigationRouteCost } from './NavigationRouteCost';
import { buildUnitTacticalRouteContext, resolveUnitNavigationProfile } from './NavigationRuntime';
import { getRouteCostFields, getSharedRouteCostFieldCache, type RouteCostFields } from './RouteCostField';
import { getOrRequestAsyncRouteCostFields } from './RouteCostWorkerClient';
import { buildBoundedRouteDangerDiagnostic, routeDangerDiagnosticInputsMatch } from './RouteDangerDiagnostic';

const ROUTE_LOOKAHEAD_CELLS = 6;

export interface NavigationReplanWorkBudget {
  remainingSearches: number;
  readonly claimedUnitIds: string[];
  readonly deferredUnitIds: string[];
}

export function ensureNavigationRouteCurrent(
  unit: UnitModel,
  state: SimulationState,
  workBudget?: NavigationReplanWorkBudget,
): boolean {
  const order = unit.order;
  const routeCells = order?.routeCells;
  const requestedTarget = order?.requestedTarget;
  if (!order || !routeCells || routeCells.length === 0 || !requestedTarget) return true;

  updateRouteCellIndex(unit, order);
  const blocked = routeLookaheadBlocked(state, order);
  const resolved = resolveUnitNavigationProfile(unit, unit.playerCommand);
  const tacticalContext = measurePerformancePhase(
    'route.context',
    () => buildUnitTacticalRouteContext(unit, {
      freshness: 'coalesced',
      metersPerCell: state.map.metersPerCell,
    }),
  );
  refreshRouteDangerDiagnostic(
    order,
    state,
    resolved.profile.revision,
    tacticalContext,
  );
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
  const replanSearchCount = (order.replanSearchCount ?? 0) + 1;
  let routeFields: RouteCostFields | null = null;
  const asynchronous = getOrRequestAsyncRouteCostFields(
    state.map,
    resolved.profile,
    tacticalContext,
  );
  if (asynchronous.status === 'pending') {
    unit.behaviorRuntime.lastEvent = blocked
      ? 'move_blocked_route_field_pending'
      : 'move_route_field_pending';
    unit.behaviorRuntime.reason = blocked
      ? 'Текущий маршрут заблокирован; боец остановлен до готовности точного фонового перестроения.'
      : 'Тактическое поле маршрута готовится в фоне; текущий маршрут сохранён.';
    return !blocked;
  }
  if (asynchronous.status === 'ready') routeFields = asynchronous.fields;
  if (workBudget && workBudget.remainingSearches <= 0) {
    if (!workBudget.deferredUnitIds.includes(unit.id)) workBudget.deferredUnitIds.push(unit.id);
    unit.behaviorRuntime.lastEvent = blocked
      ? 'move_blocked_route_replan_deferred'
      : 'move_route_replan_deferred';
    unit.behaviorRuntime.reason = blocked
      ? 'Текущий маршрут заблокирован; точное перестроение безопасно отложено до следующего лимита маршрутов.'
      : 'Точное перестроение маршрута отложено по детерминированному бюджету; текущий маршрут сохранён.';
    return !blocked;
  }
  if (workBudget) {
    workBudget.remainingSearches -= 1;
    workBudget.claimedUnitIds.push(unit.id);
  }
  if (!routeFields) {
    routeFields = measurePerformancePhase(
      'route.fields.prepare',
      () => getRouteCostFields(
        state.map,
        resolved.profile,
        tacticalContext,
        getSharedRouteCostFieldCache(state.map),
      ),
    );
  }
  const currentRouteCost = blocked
    ? order.pathCost
    : measurePerformancePhase('route.current-path-evaluate', () => evaluatePreparedNavigationRouteCost(
        remainingRouteCells(order),
        routeFields,
      ));
  const replanned = measurePerformancePhase('route.candidate-search', () => planMoveOrder(state.map, unit.position, requestedTarget, {
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
    movementProfileId: order.movementProfileId
      ?? unit.playerCommand?.intent.movementProfileId,
    movementProfileSource: order.movementProfileSource,
    movementProfileOwnerToken: order.movementProfileOwnerToken,
    movementProfileDefinitionRevision: order.movementProfileDefinitionRevision,
    movementProfileSelectionRevision: order.movementProfileSelectionRevision,
    finalFacingRadians: order.finalFacingRadians,
    calculatedAtSimulationStep: state.simulationStep,
    tacticalContext,
    preparedCostFields: routeFields,
    replanSearchCount,
    replanCount: (order.replanCount ?? 0) + 1,
    lastReplanAtSeconds: state.simulationTimeSeconds,
    lastReplanReason: reason,
    lastReplanReasonRu: reasonRu,
  }));

  if (!replanned.ok) {
    markReplanRevisionProcessed(
      order,
      state.simulationTimeSeconds,
      resolved.profile.revision,
      tacticalContext.knowledgeRevision,
      replanSearchCount,
      reason,
      reasonRu,
    );
    if (!blocked) {
      unit.behaviorRuntime.lastEvent = 'move_route_replan_rejected';
      unit.behaviorRuntime.reason = 'Новый маршрут не найден; сохранён текущий путь.';
      return true;
    }
    blockRoute(unit, order, replanned.reason, replanned.reasonRu);
    return false;
  }

  const replacement = evaluateNavigationReplan({
    order: {
      ...order,
      pathCost: currentRouteCost,
    },
    profile: resolved.profile,
    nowSeconds: state.simulationTimeSeconds,
    blocked,
    currentProfileRevision: resolved.profile.revision,
    currentKnowledgeRevision: tacticalContext.knowledgeRevision,
    candidateCost: replanned.order.pathCost,
  });
  if (!replacement.shouldReplace) {
    markReplanRevisionProcessed(
      order,
      state.simulationTimeSeconds,
      resolved.profile.revision,
      tacticalContext.knowledgeRevision,
      replanSearchCount,
      reason,
      reasonRu,
    );
    unit.behaviorRuntime.lastEvent = 'move_route_replan_hysteresis';
    unit.behaviorRuntime.reason = 'Новый маршрут улучшает путь недостаточно; сохранён текущий маршрут.';
    return true;
  }

  if (!isSameOwnedOrder(unit.order, order)) {
    unit.behaviorRuntime.lastEvent = 'move_route_replan_stale';
    unit.behaviorRuntime.reason = 'Новый более свежий приказ сохранён; устаревшее перестроение маршрута пропущено.';
    return true;
  }

  unit.order = replanned.order;
  unit.behaviorRuntime.lastEvent = 'move_route_replanned';
  unit.behaviorRuntime.reason = `Маршрут перестроен: ${replanned.path.reasonRu}`;
  return true;
}

function refreshRouteDangerDiagnostic(
  order: MoveOrder,
  state: SimulationState,
  navigationProfileRevision: number,
  tacticalContext: ReturnType<typeof buildUnitTacticalRouteContext>,
): void {
  const routeCells = order.routeCells ?? [];
  if (routeCells.length === 0 || routeDangerDiagnosticInputsMatch(
    order.routeDangerDiagnostic,
    state.map,
    routeCells,
    navigationProfileRevision,
    tacticalContext,
  )) return;
  const diagnostic = buildBoundedRouteDangerDiagnostic(state.map, routeCells, {
    revision: (order.routeDangerDiagnostic?.revision ?? 0) + 1,
    calculatedAtSimulationStep: state.simulationStep,
    navigationProfileRevision,
    tacticalContext,
  });
  order.routeDangerDiagnostic = diagnostic ?? undefined;
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

function remainingRouteCells(order: MoveOrder): readonly { x: number; y: number }[] {
  const routeCells = order.routeCells ?? [];
  if (routeCells.length === 0) return routeCells;
  const startIndex = Math.max(0, Math.min(routeCells.length - 1, order.routeCellIndex ?? 0));
  return routeCells.slice(startIndex);
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
  replanSearchCount: number,
  reason: string,
  reasonRu: string,
): void {
  order.lastReplanAtSeconds = nowSeconds;
  order.navigationProfileRevision = profileRevision;
  order.knowledgeRevision = knowledgeRevision;
  order.replanSearchCount = replanSearchCount;
  order.lastReplanReason = reason;
  order.lastReplanReasonRu = reasonRu;
}

function isSameOwnedOrder(current: MoveOrder | null, expected: MoveOrder): boolean {
  if (current !== expected) return false;
  return current.ownerToken === expected.ownerToken;
}

function blockRoute(unit: UnitModel, order: MoveOrder, reason: string, reasonRu: string): void {
  if (!isSameOwnedOrder(unit.order, order)) {
    unit.behaviorRuntime.lastEvent = 'move_route_cleanup_skipped';
    unit.behaviorRuntime.reason = 'Новый более свежий приказ сохранён; устаревшая очистка маршрута пропущена.';
    return;
  }

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
