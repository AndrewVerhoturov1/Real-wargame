import type { FireMode } from '../catalogs/CombatCatalogTypes';
import type { AimFactorBreakdownV1, InfantryWeaponInstanceV1 } from './InfantryCombatRuntimeTypes';

export function getPortableMachineGunSustainedFireFactor(
  weapon: InfantryWeaponInstanceV1,
  mode: FireMode,
): number {
  if (weapon.resolved.weapon.weaponClass !== 'machine_gun') return 1;
  if (weapon.deployment.mode === 'deployed') return 1;
  if (mode !== 'long_burst' && mode !== 'suppress') return 1;
  return clamp(weapon.resolved.weapon.undeployedSustainedFireMultiplier, 0.1, 1);
}

export function applyMachineGunFireFactors(
  factors: AimFactorBreakdownV1,
  weapon: InfantryWeaponInstanceV1,
  mode: FireMode,
): AimFactorBreakdownV1 {
  const factor = getPortableMachineGunSustainedFireFactor(weapon, mode);
  if (factor === 1) return factors;
  return {
    ...factors,
    aimRateMultiplier: factors.aimRateMultiplier * factor,
    recoilRecoveryMultiplier: factors.recoilRecoveryMultiplier * factor,
    recoilImpulseMultiplier: factors.recoilImpulseMultiplier / factor,
    effectiveDispersionRadians: factors.effectiveDispersionRadians / factor,
    aimQualityPerSecond: factors.aimQualityPerSecond * factor,
  };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, Number.isFinite(value) ? value : minimum));
}
