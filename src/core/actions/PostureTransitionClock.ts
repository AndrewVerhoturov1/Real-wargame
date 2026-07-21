import type { UnitModel } from '../units/UnitModel';
import { tickPhysicalActionWithTimeBudget } from './PhysicalActionClock';
import { isPostureTransitionRunning } from './PostureTransition';

export interface PostureTransitionTickResult {
  readonly wasRunning: boolean;
  readonly consumedSeconds: number;
  readonly remainingSeconds: number;
  readonly completed: boolean;
}

/** Compatibility facade retained for posture-specific callers and smoke tests. */
export function tickPostureTransitionWithTimeBudget(
  unit: UnitModel,
  deltaSeconds: number,
  combatCapable: boolean,
): PostureTransitionTickResult {
  const normalizedDelta = Number.isFinite(deltaSeconds) ? Math.max(0, deltaSeconds) : 0;
  if (!isPostureTransitionRunning(unit)) {
    return {
      wasRunning: false,
      consumedSeconds: 0,
      remainingSeconds: normalizedDelta,
      completed: false,
    };
  }
  const result = tickPhysicalActionWithTimeBudget(unit, normalizedDelta, combatCapable);
  return {
    wasRunning: result.wasRunning,
    consumedSeconds: result.consumedSeconds,
    remainingSeconds: result.remainingSeconds,
    completed: result.completed,
  };
}
