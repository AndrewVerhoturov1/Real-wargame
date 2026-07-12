import { createDirectPlayerMovePlan } from '../ai/UnitPlan';
import type { GridPosition } from '../geometry';
import { clampGridPositionToMap } from '../map/MapModel';
import { buildUnitTacticalRouteContext, resolveUnitNavigationProfile } from '../navigation/NavigationRuntime';
import { getPressureReportAtPosition } from '../pressure/PressureZone';
import type { SimulationState } from '../simulation/SimulationState';
import type { UnitModel } from '../units/UnitModel';
import { planMoveOrder } from './MoveOrderPlanning';
import { createPlayerMoveCommand, updatePlayerCommandStatus } from './PlayerCommand';

export function issueRoutedMoveOrderToSelectedUnits(
  state: SimulationState,
  rawTarget: GridPosition,
): void {
  const selectedIds = new Set(state.selectedUnitIds);
  const selectedUnits = state.units.filter((unit) => selectedIds.has(unit.id));
  if (selectedUnits.length === 0) return;

  const target = clampGridPositionToMap(state.map, rawTarget);
  const center = selectionCenter(selectedUnits);

  for (const unit of selectedUnits) {
    const requestedTarget = selectedUnits.length === 1
      ? target
      : clampGridPositionToMap(state.map, {
          x: target.x + unit.position.x - center.x,
          y: target.y + unit.position.y - center.y,
        });
    const command = createPlayerMoveCommand(
      unit.id,
      requestedTarget,
      unit.playerCommand,
      Date.now(),
      'normal',
      unit.playerNavigationProfileId ?? 'normal',
    );
    unit.playerCommand = command;
    const resolvedNavigation = resolveUnitNavigationProfile(unit, command);
    const planned = planMoveOrder(state.map, unit.position, requestedTarget, {
      source: 'player',
      playerCommandId: command.id,
      movementMode: command.movementMode,
      navigationProfile: resolvedNavigation.profile,
      navigationProfileSource: resolvedNavigation.source,
      tacticalContext: buildUnitTacticalRouteContext(unit),
    });

    if (!planned.ok) {
      unit.order = null;
      unit.playerCommand = updatePlayerCommandStatus(
        command,
        'blocked',
        `Player movement command is blocked: ${planned.reason}`,
        `Приказ движения заблокирован: ${planned.reasonRu}`,
      );
      unit.plan = createDirectPlayerMovePlan(unit.plan, unit.playerCommand, requestedTarget);
      unit.behaviorRuntime.currentAction = 'observe';
      unit.behaviorRuntime.lastEvent = 'move_route_unavailable';
      unit.behaviorRuntime.reason = `Маршрут недоступен: ${planned.reasonRu}`;
      continue;
    }

    unit.order = planned.order;
    unit.plan = createDirectPlayerMovePlan(unit.plan, command, planned.order.target);
    applyPressurePreview(state, unit, planned.order.target);
    unit.behaviorRuntime.lastEvent = 'move_order_received';
    setUnitDirection(unit, planned.order.waypoints?.[0] ?? planned.order.target);
  }
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
