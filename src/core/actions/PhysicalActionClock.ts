import type { UnitModel } from '../units/UnitModel';
import { getRunningPostureTransition, tickPostureTransition } from './PostureTransition';
import { getRunningWeaponReload, tickWeaponReload } from './WeaponReload';

export interface PhysicalActionTickResult {
  readonly wasRunning: boolean;
  readonly actionType: 'posture_transition' | 'weapon_reload' | null;
  readonly consumedSeconds: number;
  readonly remainingSeconds: number;
  readonly completed: boolean;
}

/**
 * Advances the single serializable body-action slot with an explicit time budget.
 * Only the returned remainder may be spent by combat preparation or translation.
 */
export function tickPhysicalActionWithTimeBudget(
  unit: UnitModel,
  deltaSeconds: number,
  combatCapable: boolean,
): PhysicalActionTickResult {
  const delta = finiteNonNegative(deltaSeconds);
  const posture = getRunningPostureTransition(unit);
  if (posture) {
    return advance(
      'posture_transition',
      posture,
      delta,
      combatCapable,
      (advanceSeconds, capable) => tickPostureTransition(unit, advanceSeconds, capable),
    );
  }

  const reload = getRunningWeaponReload(unit);
  if (reload) {
    return advance(
      'weapon_reload',
      reload,
      delta,
      combatCapable,
      (advanceSeconds) => tickWeaponReload(unit, advanceSeconds),
    );
  }

  return {
    wasRunning: false,
    actionType: null,
    consumedSeconds: 0,
    remainingSeconds: delta,
    completed: false,
  };
}

function advance(
  actionType: 'posture_transition' | 'weapon_reload',
  action: { progress: number; durationSeconds: number; status: string },
  delta: number,
  combatCapable: boolean,
  tick: (advanceSeconds: number, combatCapable: boolean) => void,
): PhysicalActionTickResult {
  if (!combatCapable) {
    tick(delta, false);
    return {
      wasRunning: true,
      actionType,
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

  if (advanceSeconds > 0) tick(advanceSeconds, true);
  const completed = action.status === 'completed';
  const chargedSeconds = completed ? consumedSeconds : delta;
  return {
    wasRunning: true,
    actionType,
    consumedSeconds: chargedSeconds,
    remainingSeconds: completed ? Math.max(0, delta - consumedSeconds) : 0,
    completed,
  };
}

function finiteNonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}
