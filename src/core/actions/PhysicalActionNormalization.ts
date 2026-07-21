import type { WeaponRuntimeState } from '../combat/WeaponModel';
import type { UnitModel } from '../units/UnitModel';
import { isPhysicalActionRecord, type UnitPhysicalAction } from './PhysicalAction';
import {
  normalizePostureTransitionAction,
  synchronizeEffectivePostureFromAction,
} from './PostureTransition';
import {
  normalizeWeaponReloadAction,
  synchronizeWeaponReloadRuntimeAfterRestore,
} from './WeaponReload';

export function normalizeUnitPhysicalAction(
  value: unknown,
  fallbackUnitId: string,
  weaponRuntime: WeaponRuntimeState,
): UnitPhysicalAction | null {
  if (!isPhysicalActionRecord(value)) return null;
  if (value.type === 'posture_transition') {
    return normalizePostureTransitionAction(value, fallbackUnitId);
  }
  if (value.type === 'weapon_reload') {
    return normalizeWeaponReloadAction(value, fallbackUnitId, weaponRuntime);
  }
  return null;
}

export function synchronizePhysicalActionAfterRestore(unit: UnitModel): void {
  if (unit.behaviorRuntime.physicalAction?.type === 'posture_transition') {
    synchronizeEffectivePostureFromAction(unit);
    return;
  }
  if (unit.behaviorRuntime.physicalAction?.type === 'weapon_reload') {
    synchronizeWeaponReloadRuntimeAfterRestore(unit);
  }
}
