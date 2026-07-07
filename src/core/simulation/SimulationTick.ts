import {
  POSTURE_EXPOSURE_MULTIPLIER,
  POSTURE_MOVE_MULTIPLIER,
  clampPercent,
  type UnitPosture,
  type UnitState,
} from '../behavior/BehaviorModel';
import type { GridPosition } from '../geometry';
import { getPressureReportAtPosition } from '../pressure/PressureZone';
import type { UnitModel } from '../units/UnitModel';
import type { SimulationState } from './SimulationState';

const ORDER_COMPLETION_EPSILON_CELLS = 0.02;

export function tickSimulation(state: SimulationState, deltaSeconds: number): void {
  for (const unit of state.units) {
    refreshUnitPressure(unit, state, deltaSeconds);
    refreshUnitDecision(unit);
    refreshUnitMovement(unit, deltaSeconds);
  }
}

function refreshUnitPressure(unit: UnitModel, state: SimulationState, deltaSeconds: number): void {
  const report = getPressureReportAtPosition(unit.position, state.pressureZones);
  const exposure = POSTURE_EXPOSURE_MULTIPLIER[unit.behaviorRuntime.posture];

  unit.behaviorRuntime.rawDanger = report?.rawPressure ?? 0;
  unit.behaviorRuntime.danger = Math.round(unit.behaviorRuntime.rawDanger * exposure);

  if (report) {
    unit.behaviorRuntime.stress = clampPercent(
      unit.behaviorRuntime.stress + report.stressPerSecond * exposure * unit.behaviorSettings.fear * deltaSeconds,
    );
    unit.behaviorRuntime.lastEvent = `pressure:${report.zone.id}`;
    unit.behaviorRuntime.reason = `inside pressure zone ${report.zone.id}`;
    return;
  }

  unit.behaviorRuntime.stress = clampPercent(
    unit.behaviorRuntime.stress - unit.behaviorSettings.stressRecoveryPerSecond * deltaSeconds,
  );

  if (unit.behaviorRuntime.lastEvent?.startsWith('pressure:')) {
    unit.behaviorRuntime.lastEvent = 'pressure_clear';
  }
}

function refreshUnitDecision(unit: UnitModel): void {
  const runtime = unit.behaviorRuntime;
  const settings = unit.behaviorSettings;
  const hasOrder = unit.order !== null;

  if (runtime.stress >= settings.stressStopThreshold) {
    setPosture(unit, 'prone', `stress ${Math.round(runtime.stress)} >= ${settings.stressStopThreshold}`);
    setState(unit, 'stressed', `stress ${Math.round(runtime.stress)} >= ${settings.stressStopThreshold}`);
    runtime.currentAction = 'wait_low';
    runtime.reason = 'stress too high';
    return;
  }

  if (runtime.danger >= settings.dangerProneThreshold) {
    setPosture(unit, 'prone', `danger ${runtime.danger} >= ${settings.dangerProneThreshold}`);
    setState(unit, hasOrder ? 'taking_cover' : 'observing', `danger ${runtime.danger} >= ${settings.dangerProneThreshold}`);
    runtime.currentAction = hasOrder ? 'low_move' : 'low_observe';
    runtime.reason = 'high pressure';
    return;
  }

  if (runtime.danger >= settings.dangerCrouchThreshold) {
    setPosture(unit, 'crouched', `danger ${runtime.danger} >= ${settings.dangerCrouchThreshold}`);
    setState(unit, hasOrder ? 'moving' : 'observing', `danger ${runtime.danger} >= ${settings.dangerCrouchThreshold}`);
    runtime.currentAction = hasOrder ? 'cautious_move' : 'cautious_observe';
    runtime.reason = 'medium pressure';
    return;
  }

  setPosture(unit, 'standing', `danger ${runtime.danger} < ${settings.dangerCrouchThreshold}`);

  if (hasOrder) {
    setState(unit, 'moving', 'move order active');
    runtime.currentAction = 'move';
    runtime.reason = 'pressure acceptable';
    return;
  }

  setState(unit, runtime.state === 'idle' ? 'idle' : 'observing', 'no active order');
  runtime.currentAction = runtime.state === 'idle' ? 'waiting' : 'observe';
  runtime.reason = runtime.state === 'idle' ? 'no active order' : 'target reached';
}

function refreshUnitMovement(unit: UnitModel, deltaSeconds: number): void {
  if (!unit.order || unit.behaviorRuntime.state === 'stressed') {
    return;
  }

  const remainingDistance = getDistance(unit.position, unit.order.target);
  const stepDistance = unit.speedCellsPerSecond * POSTURE_MOVE_MULTIPLIER[unit.behaviorRuntime.posture] * deltaSeconds;
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

function setState(unit: UnitModel, nextState: UnitState, reason: string): void {
  if (unit.behaviorRuntime.state === nextState) {
    return;
  }

  unit.behaviorRuntime.previousState = unit.behaviorRuntime.state;
  unit.behaviorRuntime.state = nextState;
  unit.behaviorRuntime.stateChangedBecause = reason;
}

function setPosture(unit: UnitModel, nextPosture: UnitPosture, reason: string): void {
  if (unit.behaviorRuntime.posture === nextPosture) {
    return;
  }

  unit.behaviorRuntime.previousPosture = unit.behaviorRuntime.posture;
  unit.behaviorRuntime.posture = nextPosture;
  unit.behaviorRuntime.postureChangedBecause = reason;
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
