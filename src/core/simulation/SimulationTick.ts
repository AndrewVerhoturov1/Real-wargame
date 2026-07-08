import { clampPercent } from '../behavior/BehaviorModel';
import type { GridPosition } from '../geometry';
import { clampGridPositionToMap } from '../map/MapModel';
import { getPressureReportAtPosition } from '../pressure/PressureZone';
import type { UnitModel } from '../units/UnitModel';
import type { SimulationState } from './SimulationState';

const ORDER_COMPLETION_EPSILON_CELLS = 0.02;
const UNIT_VISUAL_BODY_RADIUS_CELLS = 0.42;
const UNIT_COLLISION_RADIUS_CELLS = UNIT_VISUAL_BODY_RADIUS_CELLS / 3;
const UNIT_MIN_CENTER_DISTANCE_CELLS = UNIT_COLLISION_RADIUS_CELLS * 2;
const COLLISION_PASSES = 3;

export function tickSimulation(state: SimulationState, deltaSeconds: number): void {
  for (const unit of state.units) {
    updateMetrics(unit, state, deltaSeconds);
    updateStateLabels(unit);
    moveUnit(unit, deltaSeconds);
  }

  resolveUnitCollisions(state);
}

function updateMetrics(unit: UnitModel, state: SimulationState, deltaSeconds: number): void {
  const report = getPressureReportAtPosition(unit.position, state.pressureZones);

  unit.behaviorRuntime.rawDanger = report?.rawPressure ?? 0;
  unit.behaviorRuntime.danger = Math.round(unit.behaviorRuntime.rawDanger);

  if (report) {
    unit.behaviorRuntime.stress = clampPercent(
      unit.behaviorRuntime.stress + report.stressPerSecond * unit.behaviorSettings.fear * deltaSeconds,
    );
    unit.behaviorRuntime.lastEvent = `pressure:${report.zone.id}`;
    unit.behaviorRuntime.reason = `inside pressure zone ${report.zone.id}`;
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

function moveUnit(unit: UnitModel, deltaSeconds: number): void {
  if (!unit.order) {
    return;
  }

  const remainingDistance = getDistance(unit.position, unit.order.target);
  const stepDistance = unit.speedCellsPerSecond * deltaSeconds;
  unit.position = moveToPoint(unit.position, unit.order.target, stepDistance);

  if (remainingDistance <= stepDistance + ORDER_COMPLETION_EPSILON_CELLS) {
    unit.position = { ...unit.order.target };
    unit.order = null;
    setState(unit, 'observing', 'target reached');
    unit.behaviorRuntime.currentAction = 'observe';
    unit.behaviorRuntime.reason = 'target reached';
    unit.behaviorRuntime.lastEvent = 'move_done';
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

  if (distance >= UNIT_MIN_CENTER_DISTANCE_CELLS) {
    return;
  }

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
  if (unit.behaviorRuntime.state === nextState) {
    return;
  }

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

  if (length === 0 || length <= maxDistance) {
    return { ...target };
  }

  return {
    x: current.x + (dx / length) * maxDistance,
    y: current.y + (dy / length) * maxDistance,
  };
}
