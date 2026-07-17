import { publishTacticalOrderIntentToAiMemory } from '../ai/TacticalOrderBlackboard';
import { createDirectPlayerMovePlan } from '../ai/UnitPlan';
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

  for (const unit of selectedUnits) {
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
    unit.playerCommand = command;
    unit.playerNavigationProfileId = command.intent.navigationProfileId;
    publishTacticalOrderIntentToAiMemory(unit, command.intent);
    applyIntentAttention(unit, command.intent);
    const resolvedNavigation = resolveUnitNavigationProfile(unit, command);
    const planned = planMoveOrder(state.map, unit.position, requestedTarget, {
      source: 'player',
      playerCommandId: command.id,
      movementMode: command.movementMode,
      navigationProfile: resolvedNavigation.profile,
      navigationProfileSource: resolvedNavigation.source,
      movementProfileId: command.intent.movementProfileId,
      movementProfileSource: 'player_order',
      movementProfileOwnerToken: command.id,
      movementProfileSelectionRevision: command.revision,
      finalFacingRadians,
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
        `Player tactical order is blocked: ${planned.reason}`,
        `Тактический приказ заблокирован: ${planned.reasonRu}`,
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
    unit.behaviorRuntime.lastEvent = `tactical_order_${command.intent.presetId}_received`;
    unit.behaviorRuntime.reason = `Принят приказ «${command.intent.presetId}».`;
    setUnitDirection(unit, planned.order.waypoints?.[0] ?? planned.order.target);
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
