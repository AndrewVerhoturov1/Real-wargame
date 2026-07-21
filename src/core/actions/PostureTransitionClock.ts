import type { UnitModel } from '../units/UnitModel';
import { tickPhysicalActionWithTimeBudget } from './PhysicalActionClock';

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
  const result = tickPhysicalActionWithTimeBudget(unit, deltaSeconds, combatCapable);
  if (result.actionType !== 'posture_transition') {
    return {
      wasRunning: false,
      consumedSeconds: 0,
      remainingSeconds: Number.isFinite(deltaSeconds) ? Math.max(0, deltaSeconds) : 0,
      completed: false,
    };
  }
  return {
    wasRunning: result.wasRunning,
    consumedSeconds: result.consumedSeconds,
    remainingSeconds: result.remainingSeconds,
    completed: result.completed,
  };
}
