import type { SimulationState } from '../../simulation/SimulationState';
import type { UnitModel } from '../../units/UnitModel';
import type { InfantryWeaponInstanceV1, AimFactorBreakdownV1 } from './InfantryCombatRuntimeTypes';
import {
  resolveProductionAimFactors as resolveStage5ProductionAimFactors,
} from './AimRuntimeStage5';

export * from './AimRuntimeStage5';

export function resolveProductionAimFactors(
  state: Pick<SimulationState, 'map'>,
  shooter: UnitModel,
  weapon: InfantryWeaponInstanceV1,
): AimFactorBreakdownV1 {
  const base = resolveStage5ProductionAimFactors(state, shooter, weapon);
  const capabilities = shooter.infantryCombatRuntime.wounds.capabilities;
  const desired = clamp(
    Math.min(capabilities.stabilityMultiplier, capabilities.accuracyMultiplier),
    0.2,
    1,
  );
  const current = clamp(base.woundStabilityMultiplier, 0.2, 1);
  const ratio = desired / current;
  return {
    ...base,
    fatigue: 0,
    woundStabilityMultiplier: desired,
    woundDispersionMultiplier: base.woundDispersionMultiplier / ratio,
    aimRateMultiplier: base.aimRateMultiplier * ratio,
    recoilRecoveryMultiplier: base.recoilRecoveryMultiplier * ratio,
    recoilImpulseMultiplier: base.recoilImpulseMultiplier / ratio,
    effectiveDispersionRadians: base.effectiveDispersionRadians / ratio,
    aimQualityPerSecond: base.aimQualityPerSecond * ratio,
  };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, Number.isFinite(value) ? value : minimum));
}
