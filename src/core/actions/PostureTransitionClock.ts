import type { UnitModel } from '../units/UnitModel';
import {
  getRunningPostureTransition,
  tickPostureTransition,
} from './PostureTransition';

export interface PostureTransitionTickResult {
  readonly wasRunning: boolean;
  readonly consumedSeconds: number;
  readonly remainingSeconds: number;
  readonly completed: boolean;
}

/**
 * Advances the posture action with an explicit simulation-time budget.
 *
 * The consumed part of the tick belongs to the body action. Only the returned
 * remainder may be used for translation. This prevents a large simulation step
 * from completing a posture transition and then also granting movement for the
 * whole original step.
 */
export function tickPostureTransitionWithTimeBudget(
  unit: UnitModel,
  deltaSeconds: number,
  combatCapable: boolean,
): PostureTransitionTickResult {
  const delta = finiteNonNegative(deltaSeconds);
  const action = getRunningPostureTransition(unit);
  if (!action) {
    return {
      wasRunning: false,
      consumedSeconds: 0,
      remainingSeconds: delta,
      completed: false,
    };
  }

  if (!combatCapable) {
    tickPostureTransition(unit, delta, false);
    return {
      wasRunning: true,
      consumedSeconds: delta,
      remainingSeconds: 0,
      completed: false,
    };
  }

  const remainingActionSeconds = Math.max(
    0,
    (1 - action.progress) * Math.max(0.001, action.durationSeconds),
  );
  const consumedSeconds = Math.min(delta, remainingActionSeconds);
  const advanceSeconds = consumedSeconds > 0
    ? consumedSeconds
    : delta > 0 && action.progress + 1e-9 >= 1
      ? Math.min(delta, 1e-9)
      : 0;

  if (advanceSeconds > 0) tickPostureTransition(unit, advanceSeconds, true);
  const completed = action.status === 'completed';
  const chargedSeconds = completed ? consumedSeconds : delta;
  return {
    wasRunning: true,
    consumedSeconds: chargedSeconds,
    remainingSeconds: completed ? Math.max(0, delta - consumedSeconds) : 0,
    completed,
  };
}

/**
 * Advances a posture action only for the part of a simulation interval during
 * which that action already existed. This matters for commands emitted by the
 * AI scheduler inside a coarse simulation step: a command timestamped at
 * 60 ms receives the same 550 ms of body-action time whether the outer step is
 * split into small pieces or delivered as one 610 ms interval.
 */
export function tickPostureTransitionWithinInterval(
  unit: UnitModel,
  intervalStartSeconds: number,
  intervalEndSeconds: number,
  combatCapable: boolean,
): PostureTransitionTickResult {
  const start = finiteNonNegative(intervalStartSeconds);
  const end = Math.max(start, finiteNonNegative(intervalEndSeconds));
  const intervalSeconds = end - start;
  const action = getRunningPostureTransition(unit);
  if (!action) {
    return {
      wasRunning: false,
      consumedSeconds: 0,
      remainingSeconds: intervalSeconds,
      completed: false,
    };
  }

  if (!combatCapable) {
    tickPostureTransition(unit, intervalSeconds, false);
    return {
      wasRunning: true,
      consumedSeconds: intervalSeconds,
      remainingSeconds: 0,
      completed: false,
    };
  }

  const actionStart = action.restoredFromSave
    ? start
    : Math.max(start, Math.min(end, finiteNonNegative(action.startedSeconds)));
  const beforeActionSeconds = Math.max(0, actionStart - start);
  const availableActionSeconds = Math.max(0, end - actionStart);
  const tick = tickPostureTransitionWithTimeBudget(unit, availableActionSeconds, true);

  return {
    wasRunning: true,
    consumedSeconds: tick.consumedSeconds,
    remainingSeconds: beforeActionSeconds + tick.remainingSeconds,
    completed: tick.completed,
  };
}

function finiteNonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}
