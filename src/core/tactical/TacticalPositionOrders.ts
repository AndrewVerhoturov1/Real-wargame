import { publishTacticalOrderIntentToAiMemory } from '../ai/TacticalOrderBlackboard';
import { createDirectPlayerMovePlan } from '../ai/UnitPlan';
import type { UnitPosture } from '../behavior/BehaviorModel';
import type { GridPosition } from '../geometry';
import { clampGridPositionToMap } from '../map/MapModel';
import { buildUnitTacticalRouteContext, resolveUnitNavigationProfile } from '../navigation/NavigationRuntime';
import { planMoveOrder } from '../orders/MoveOrderPlanning';
import { createPlayerMoveCommand, updatePlayerCommandStatus } from '../orders/PlayerCommand';
import { createTacticalOrderIntent, withTacticalOrderNavigationProfile } from '../orders/TacticalOrderIntent';
import { clearAttentionOverride } from '../perception/AttentionController';
import { getPressureReportAtPosition } from '../pressure/PressureZone';
import type { SimulationState } from '../simulation/SimulationState';
import type { UnitModel } from '../units/UnitModel';

export function issueTacticalPositionMoveOrderToSelectedUnit(
  state: SimulationState,
  rawTarget: GridPosition,
  arrivalPosture: UnitPosture,
): boolean {
  const unitId = state.selectedUnitId;
  if (!unitId) return false;
  const unit = state.units.find((candidate) => candidate.id === unitId);
  if (!unit) return false;

  const target = clampGridPositionToMap(state.map, rawTarget);
  const intent = withTacticalOrderNavigationProfile(
    createTacticalOrderIntent('move'),
    unit.playerNavigationProfileId ?? 'normal',
  );
  const command = createPlayerMoveCommand(
    unit.id,
    target,
    unit.playerCommand,
    Date.now(),
    intent,
    null,
    null,
    arrivalPosture,
  );

  unit.playerCommand = command;
  unit.playerNavigationProfileId = command.intent.navigationProfileId;
  publishTacticalOrderIntentToAiMemory(unit, command.intent);
  clearAttentionOverride(unit);

  const resolvedNavigation = resolveUnitNavigationProfile(unit, command);
  const planned = planMoveOrder(state.map, unit.position, target, {
    source: 'player',
    playerCommandId: command.id,
    movementMode: command.movementMode,
    navigationProfile: resolvedNavigation.profile,
    navigationProfileSource: resolvedNavigation.source,
    movementProfileId: command.intent.movementProfileId,
    movementProfileSource: 'player_order',
    movementProfileOwnerToken: command.id,
    movementProfileSelectionRevision: command.revision,
    calculatedAtSimulationStep: state.simulationStep,
    tacticalContext: buildUnitTacticalRouteContext(unit, {
      freshness: 'immediate',
      metersPerCell: state.map.metersPerCell,
    }),
  });

  if (!planned.ok) {
    unit.order = null;
    unit.playerCommand = updatePlayerCommandStatus(
      command,
      'blocked',
      `Tactical-position order is blocked: ${planned.reason}`,
      `Путь к тактической позиции заблокирован: ${planned.reasonRu}`,
    );
    unit.plan = createDirectPlayerMovePlan(unit.plan, unit.playerCommand, target);
    unit.behaviorRuntime.currentAction = 'observe';
    unit.behaviorRuntime.lastEvent = 'tactical_position_route_unavailable';
    unit.behaviorRuntime.reason = `Маршрут к позиции недоступен: ${planned.reasonRu}`;
    return false;
  }

  unit.order = planned.order;
  unit.plan = createDirectPlayerMovePlan(unit.plan, command, planned.order.target);
  applyPressurePreview(state, unit, planned.order.target);
  unit.behaviorRuntime.lastEvent = 'tactical_position_order_received';
  unit.behaviorRuntime.reason = `Боец направлен на тактическую позицию; после прибытия: ${postureLabel(arrivalPosture)}.`;
  setUnitDirection(unit, planned.order.waypoints?.[0] ?? planned.order.target);
  return true;
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

function postureLabel(posture: UnitPosture): string {
  if (posture === 'standing') return 'стоять';
  if (posture === 'crouched') return 'сесть';
  return 'лечь';
}

function setUnitDirection(unit: UnitModel, target: GridPosition): void {
  const dx = target.x - unit.position.x;
  const dy = target.y - unit.position.y;
  if (Math.abs(dx) < 0.0001 && Math.abs(dy) < 0.0001) return;
  unit.facingRadians = Math.atan2(dy, dx);
}
