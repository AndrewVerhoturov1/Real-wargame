import type { UnitModel } from '../../units/UnitModel';

export interface WeaponDeploymentLockResultV1 {
  readonly blocked: boolean;
  readonly reasonCode: string | null;
  readonly reasonRu: string | null;
}

export function getWeaponDeploymentMovementLock(unit: UnitModel): WeaponDeploymentLockResultV1 {
  return deploymentLocksBody(unit)
    ? blocked('weapon_deployed_movement_blocked', 'Сначала явно снимите пулемёт с установки: движение сейчас заблокировано.')
    : available();
}

export function getWeaponDeploymentPostureLock(unit: UnitModel): WeaponDeploymentLockResultV1 {
  return deploymentLocksBody(unit)
    ? blocked('weapon_deployed_posture_blocked', 'Сначала явно снимите пулемёт с установки: смена позы сейчас заблокирована.')
    : available();
}

export function getWeaponDeploymentFacingLock(unit: UnitModel): WeaponDeploymentLockResultV1 {
  return deploymentLocksBody(unit)
    ? blocked('weapon_deployed_facing_locked', 'Сначала явно снимите пулемёт с установки: поворот корпуса сейчас заблокирован.')
    : available();
}

export function deploymentLocksBody(unit: UnitModel): boolean {
  const mode = unit.infantryCombatRuntime.primaryWeapon?.deployment.mode;
  return mode === 'deploying' || mode === 'deployed' || mode === 'undeploying';
}

function available(): WeaponDeploymentLockResultV1 { return { blocked: false, reasonCode: null, reasonRu: null }; }
function blocked(reasonCode: string, reasonRu: string): WeaponDeploymentLockResultV1 { return { blocked: true, reasonCode, reasonRu }; }
