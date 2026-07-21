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

function finiteNonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}
