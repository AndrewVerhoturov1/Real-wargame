import { publishTacticalOrderIntentToAiMemory } from '../ai/TacticalOrderBlackboard';
import { createDirectPlayerMovePlan } from '../ai/UnitPlan';
import {
  recordPerformanceEvent,
  recordPerformanceOperation,
  recordPerformanceQueueTransition,
  recordPerformanceWork,
} from '../debug/PerformanceTelemetryBridge';
import { withPerformancePhaseContext } from '../debug/PerformancePhases';
import type { GridPosition } from '../geometry';
import { clampGridPositionToMap } from '../map/MapModel';
import { buildUnitTacticalRouteContext, resolveUnitNavigationProfile } from '../navigation/NavigationRuntime';
import { clearAttentionOverride, setAttentionMode, setSearchSector } from '../perception/AttentionController';
import { degreesToRadians } from '../perception/AttentionModel';
import { getPressureReportAtPosition } from '../pressure/PressureZone';
import type { SimulationState } from '../simulation/SimulationState';
import type { UnitModel } from '../units/UnitModel';
import { planMoveOrder } from './MoveOrderPlanning';
import { createPlayerMoveCommand, updatePlayerCommandStatus } from './PlayerCommand';
import {
  createTacticalOrderIntent,
  withTacticalOrderNavigationProfile,
  type TacticalOrderIntent,
  type TacticalOrderPresetId,
} from './TacticalOrderIntent';

export function issueTacticalOrderToSelectedUnits(
  state: SimulationState,
  rawTarget: GridPosition,
  presetId: TacticalOrderPresetId,
  finalFacingRadians?: number,
): void {
  issueTacticalOrderIntentToSelectedUnits(
    state,
    rawTarget,
    () => createTacticalOrderIntent(presetId),
    finalFacingRadians,
  );
}

export function issueRoutedMoveOrderToSelectedUnits(
  state: SimulationState,
  rawTarget: GridPosition,
  finalFacingRadians?: number,
): void {
  issueTacticalOrderIntentToSelectedUnits(
    state,
    rawTarget,
    (unit) => withTacticalOrderNavigationProfile(
      createTacticalOrderIntent('move'),
      unit.playerNavigationProfileId ?? 'normal',
    ),
    finalFacingRadians,
  );
}

function issueTacticalOrderIntentToSelectedUnits(
  state: SimulationState,
  rawTarget: GridPosition,
  resolveIntent: (unit: UnitModel) => TacticalOrderIntent,
  finalFacingRadians?: number,
): void {
  const selectedIds = new Set(state.selectedUnitIds);
  const selectedUnits = state.units.filter((unit) => selectedIds.has(unit.id));
  if (selectedUnits.length === 0) return;

  const target = clampGridPositionToMap(state.map, rawTarget);
  const center = selectionCenter(selectedUnits);
  const batchOperationId = `op-route-batch-${state.simulationStep}-${Date.now().toString(36)}`;
  recordPerformanceEvent('order.created', {
    batchSize: selectedUnits.length,
    target,
    simulationStep: state.simulationStep,
  }, selectedUnits.length >= 32 ? 'critical' : 'important', {
    operationId: batchOperationId,
    eventType: 'order.created',
    source: 'player',
  }, batchOperationId);

  for (let index = 0; index < selectedUnits.length; index += 1) {
    const unit = selectedUnits[index];
    const requestedTarget = selectedUnits.length === 1
      ? target
      : clampGridPositionToMap(state.map, {
          x: target.x + unit.position.x - center.x,
          y: target.y + unit.position.y - center.y,
        });
    const intent = resolveIntent(unit);
    const command = createPlayerMoveCommand(
      unit.id,
      requestedTarget,
      unit.playerCommand,
      Date.now(),
      intent,
      null,
      finalFacingRadians ?? null,
    );
    const operationId = `op-route-${command.id}`;
    const routeRequestId = `route-${command.id}`;
    const queueDepth = selectedUnits.length - index;
    const cause = {
      eventType: 'order.created',
      eventId: batchOperationId,
      operationId,
      requestId: routeRequestId,
      orderId: command.id,
      routeRequestId,
      unitId: unit.id,
      revision: unit.tacticalKnowledge.revision,
      profileId: command.intent.navigationProfileId,
      source: 'player',
    };

    recordPerformanceQueueTransition({
      queue: 'routePlanning',
      transition: 'created',
      requestId: routeRequestId,
      unitId: unit.id,
      orderId: command.id,
      depth: queueDepth,
      inFlight: 0,
      reason: selectedUnits.length > 1 ? 'mass-order-batch' : 'player-order',
    });
    recordPerformanceEvent('route.request-created', {
      batchOperationId,
      batchSize: selectedUnits.length,
      queueDepth,
      start: { ...unit.position },
      goal: requestedTarget,
    }, queueDepth >= 32 ? 'critical' : 'important', cause, operationId);

    unit.playerCommand = command;
    unit.playerNavigationProfileId = command.intent.navigationProfileId;
    publishTacticalOrderIntentToAiMemory(unit, command.intent);
    applyIntentAttention(unit, command.intent);
    const resolvedNavigation = resolveUnitNavigationProfile(unit, command);
    const routeStartedAt = performance.now();
    recordPerformanceQueueTransition({
      queue: 'routePlanning',
      transition: 'started',
      requestId: routeRequestId,
      unitId: unit.id,
      orderId: command.id,
      waitMs: 0,
      depth: Math.max(0, queueDepth - 1),
      inFlight: 1,
      reason: 'synchronous-route-planning',
    });
    recordPerformanceEvent('route.search-started', {
      start: { ...unit.position },
      goal: requestedTarget,
      profileId: resolvedNavigation.profile.id,
    }, 'important', cause, operationId);

    const planned = withPerformancePhaseContext(cause, () => planMoveOrder(state.map, unit.position, requestedTarget, {
      source: 'player',
      playerCommandId: command.id,
      movementMode: command.movementMode,
      navigationProfile: resolvedNavigation.profile,
      navigationProfileSource: resolvedNavigation.source,
      finalFacingRadians,
      calculatedAtSimulationStep: state.simulationStep,
      tacticalContext: buildUnitTacticalRouteContext(unit, {
        freshness: 'immediate',
        metersPerCell: state.map.metersPerCell,
      }),
    }));
    const routeDurationMs = performance.now() - routeStartedAt;

    if (!planned.ok) {
      recordPerformanceQueueTransition({
        queue: 'routePlanning',
        transition: 'failed',
        requestId: routeRequestId,
        unitId: unit.id,
        orderId: command.id,
        waitMs: 0,
        depth: Math.max(0, queueDepth - 1),
        inFlight: 0,
        reason: planned.reason,
      });
      recordPerformanceOperation({
        phase: 'route.plan-move-order',
        durationMs: routeDurationMs,
        operationId,
        cause,
        work: {},
        result: 'not_found',
      });
      recordPerformanceWork('navigation', {
        totalRequests: 1,
        notFound: 1,
      });
      recordPerformanceEvent('route.search-failed', {
        durationMs: routeDurationMs,
        reason: planned.reason,
        reasonRu: planned.reasonRu,
      }, 'critical', cause, operationId);
      unit.order = null;
      unit.playerCommand = updatePlayerCommandStatus(
        command,
        'blocked',
        `Player tactical order is blocked: ${planned.reason}`,
        `Тактический приказ заблокирован: ${planned.reasonRu}`,
      );
      unit.plan = createDirectPlayerMovePlan(unit.plan, unit.playerCommand, requestedTarget);
      unit.behaviorRuntime.currentAction = 'observe';
      unit.behaviorRuntime.lastEvent = 'move_route_unavailable';
      unit.behaviorRuntime.reason = `Маршрут недоступен: ${planned.reasonRu}`;
      continue;
    }

    const route = planned.order;
    const visitedCells = route.pathVisitedCells ?? 0;
    const pathLength = route.routeCells?.length ?? route.waypoints?.length ?? 0;
    recordPerformanceQueueTransition({
      queue: 'routePlanning',
      transition: 'completed',
      requestId: routeRequestId,
      unitId: unit.id,
      orderId: command.id,
      waitMs: 0,
      depth: Math.max(0, queueDepth - 1),
      inFlight: 0,
      reason: 'route-applied',
    });
    recordPerformanceOperation({
      phase: 'route.plan-move-order',
      durationMs: routeDurationMs,
      operationId,
      cause,
      work: {
        visitedCells,
        pathLength,
        routeCost: route.pathCost ?? 0,
      },
      result: 'found',
    });
    recordPerformanceWork('navigation', {
      totalRequests: 1,
      tacticalSearches: 1,
      found: 1,
      applied: 1,
      visitedCells,
      pathLength,
      routeCost: route.pathCost ?? 0,
    });
    recordPerformanceEvent('route.search-completed', {
      durationMs: routeDurationMs,
      visitedCells,
      pathLength,
      routeCost: route.pathCost ?? null,
      routeRevision: route.routeRevision ?? 0,
    }, routeDurationMs >= 50 ? 'critical' : 'important', cause, operationId);
    recordPerformanceEvent('route.result-applied', {
      routeRevision: route.routeRevision ?? 0,
      calculatedAtSimulationStep: route.calculatedAtSimulationStep ?? state.simulationStep,
    }, 'important', cause, operationId);

    unit.order = route;
    unit.plan = createDirectPlayerMovePlan(unit.plan, command, route.target);
    applyPressurePreview(state, unit, route.target);
    unit.behaviorRuntime.lastEvent = `tactical_order_${command.intent.presetId}_received`;
    unit.behaviorRuntime.reason = `Принят приказ «${command.intent.presetId}».`;
    setUnitDirection(unit, route.waypoints?.[0] ?? route.target);
  }
}

function applyIntentAttention(unit: UnitModel, intent: TacticalOrderIntent): void {
  if (intent.attentionPolicy === 'automatic') {
    clearAttentionOverride(unit);
    return;
  }
  if (intent.attentionPolicy === 'search') {
    setSearchSector(
      unit,
      unit.facingRadians,
      degreesToRadians(unit.attentionSettings.profiles.search.defaultSearchArcDegrees),
      'player',
    );
    return;
  }
  setAttentionMode(unit, 'engage', 'player');
}

function applyPressurePreview(
  state: SimulationState,
  unit: UnitModel,
  target: GridPosition,
): void {
  const report = getPressureReportAtPosition(target, state.pressureZones);
  unit.behaviorRuntime.state = 'moving';
  unit.behaviorRuntime.posture = 'standing';
  unit.behaviorRuntime.currentAction = 'move';

  if (!report) {
    unit.behaviorRuntime.danger = 0;
    unit.behaviorRuntime.reason = 'move_target_clear';
    return;
  }

  unit.behaviorRuntime.rawDanger = report.rawPressure;
  unit.behaviorRuntime.danger = Math.round(report.rawPressure);
  unit.behaviorRuntime.reason = `move_target_pressure:${report.zone.id}`;
}

function selectionCenter(units: readonly UnitModel[]): GridPosition {
  const total = units.reduce((sum, unit) => ({
    x: sum.x + unit.position.x,
    y: sum.y + unit.position.y,
  }), { x: 0, y: 0 });
  return {
    x: total.x / units.length,
    y: total.y / units.length,
  };
}

function setUnitDirection(unit: UnitModel, target: GridPosition): void {
  const dx = target.x - unit.position.x;
  const dy = target.y - unit.position.y;
  if (Math.abs(dx) < 0.0001 && Math.abs(dy) < 0.0001) return;
  unit.facingRadians = Math.atan2(dy, dx);
}
