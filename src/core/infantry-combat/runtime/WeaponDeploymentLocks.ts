import type { UnitModel } from '../../units/UnitModel';

export interface WeaponDeploymentLockResultV1 {
  readonly blocked: boolean;
  readonly reasonCode: string | null;
  readonly reasonRu: string | null;
}

const stepLockedUnits = new WeakSet<UnitModel>();

/**
 * Captures units whose deployment action existed at the outer step boundary.
 * This prevents an undeploy completed in combat from granting a full movement
 * interval later in the same outer step.
 */
export function beginWeaponDeploymentStepLocks(units: readonly UnitModel[]): Map<UnitModel, number> {
  const facingByUnit = new Map<UnitModel, number>();
  for (const unit of units) {
    if (!deploymentModeLocksBody(unit)) continue;
    stepLockedUnits.add(unit);
    facingByUnit.set(unit, unit.facingRadians);
  }
  return facingByUnit;
}

export function endWeaponDeploymentStepLocks(facingByUnit: ReadonlyMap<UnitModel, number>): void {
  for (const [unit, facingRadians] of facingByUnit) {
    unit.facingRadians = facingRadians;
    stepLockedUnits.delete(unit);
  }
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
  return stepLockedUnits.has(unit) || deploymentModeLocksBody(unit);
}

function deploymentModeLocksBody(unit: UnitModel): boolean {
  const mode = unit.infantryCombatRuntime.primaryWeapon?.deployment.mode;
  return mode === 'deploying' || mode === 'deployed' || mode === 'undeploying';
}
function available(): WeaponDeploymentLockResultV1 { return { blocked: false, reasonCode: null, reasonRu: null }; }
function blocked(reasonCode: string, reasonRu: string): WeaponDeploymentLockResultV1 { return { blocked: true, reasonCode, reasonRu }; }
