import { clampPercent } from '../behavior/BehaviorModel';
import type { GridPosition } from '../geometry';
import { getPressureReportAtPosition } from '../pressure/PressureZone';
import type { UnitModel } from '../units/UnitModel';
import type { SimulationState } from './SimulationState';

const ORDER_COMPLETION_EPSILON_CELLS = 0.02;

export function tickSimulation(state: SimulationState, deltaSeconds: number): void {
  for (const unit of state.units) {
    updateMetrics(unit, state, deltaSeconds);
    updateStateLabels(unit);
    moveUnit(unit, deltaSeconds);
  }
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
  unit.behaviorRuntime.posture = 'standing';
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

  const ratio = maxDistance / length;
  return {
    x: current.x + dx * ratio,
    y: current.y + dy * ratio,
  };
}
