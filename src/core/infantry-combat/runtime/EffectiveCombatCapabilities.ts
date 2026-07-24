import type { UnitModel } from '../../units/UnitModel';
import type { UnitCombatCapabilitiesV1 } from './InfantryBodyTypes';
import { deriveBloodCombatCapabilities } from './BloodLossRuntime';

export function composeCombatCapabilities(
  wound: UnitCombatCapabilitiesV1,
  blood: UnitCombatCapabilitiesV1,
): UnitCombatCapabilitiesV1 {
  const alive = wound.alive && blood.alive;
  const conscious = alive && wound.conscious && blood.conscious;
  const canStand = conscious && wound.canStand && blood.canStand;
  const canMove = conscious && wound.canMove && blood.canMove;
  const canUseHands = conscious && wound.canUseHands && blood.canUseHands;
  const canUseWeapon = canUseHands && wound.canUseWeapon && blood.canUseWeapon;
  if (!alive || !conscious) return disabledCapabilities(alive);
  return {
    alive,
    conscious,
    canStand,
    canMove,
    canUseHands,
    canUseWeapon,
    movementSpeedMultiplier: canMove
      ? clamp01(wound.movementSpeedMultiplier * blood.movementSpeedMultiplier)
      : 0,
    stabilityMultiplier: clamp01(wound.stabilityMultiplier * blood.stabilityMultiplier),
    accuracyMultiplier: clamp01(wound.accuracyMultiplier * blood.accuracyMultiplier),
  };
}

export function getEffectiveCombatCapabilities(unit: UnitModel): UnitCombatCapabilitiesV1 {
  return composeCombatCapabilities(
    unit.infantryCombatRuntime.wounds.capabilities,
    deriveBloodCombatCapabilities(unit.infantryCombatRuntime.physiology.blood.state),
  );
}

function disabledCapabilities(alive: boolean): UnitCombatCapabilitiesV1 {
  return {
    alive,
    conscious: false,
    canStand: false,
    canMove: false,
    canUseHands: false,
    canUseWeapon: false,
    movementSpeedMultiplier: 0,
    stabilityMultiplier: 0,
    accuracyMultiplier: 0,
  };
}
function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}
