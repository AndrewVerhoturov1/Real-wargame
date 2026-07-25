import type { SimulationState } from '../../simulation/SimulationState';
import type { UnitModel } from '../../units/UnitModel';
import type { InfantryWeaponInstanceV1, AimFactorBreakdownV1 } from './InfantryCombatRuntimeTypes';
import { calculateAimFactorBreakdown } from './AimRuntimeStage5';
import { getEffectiveCombatCapabilities } from './EffectiveCombatCapabilities';
import { applyMachineGunFireFactors } from './MachineGunFireModifiers';

export * from './AimRuntimeStage5';

export function resolveProductionAimFactors(
  state: Pick<SimulationState, 'map'>,
  shooter: UnitModel,
  weapon: InfantryWeaponInstanceV1,
): AimFactorBreakdownV1 {
  const capabilities = getEffectiveCombatCapabilities(shooter);
  const base = calculateAimFactorBreakdown({
    weapon: weapon.resolved.weapon,
    posture: shooter.behaviorRuntime.posture,
    isMoving: shooter.movementRuntime.isMoving,
    movementSpeedMetresPerSecond: Math.hypot(
      shooter.movementRuntime.velocityCellsPerSecond.x,
      shooter.movementRuntime.velocityCellsPerSecond.y,
    ) * state.map.metersPerCell,
    shootingSkill: weapon.operatorProfile.shootingSkill,
    proficiency: weapon.operatorProfile.proficiencyByWeaponClass[weapon.resolved.weapon.weaponClass],
    fatigue: shooter.infantryCombatRuntime.physiology.fatigue.fatigue,
    woundStabilityMultiplier: clamp(
      Math.min(capabilities.stabilityMultiplier, capabilities.accuracyMultiplier),
      0.2,
      1,
    ),
  });
  const mode = shooter.infantryCombatRuntime.activeFireTask?.mode ?? 'single';
  return applyMachineGunFireFactors(base, weapon, mode);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, Number.isFinite(value) ? value : minimum));
}
