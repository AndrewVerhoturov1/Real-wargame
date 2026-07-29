import { deriveBloodState } from '../../infantry-combat/runtime';
import type { SimulationState } from '../../simulation/SimulationState';
import type { CombatLabRoleV1 } from './CombatLabContracts';

const COMBAT_LAB_TARGET_MAXIMUM_BLOOD_LOSS = 0.49;

/**
 * Keeps designated measurement targets available for repeated impacts while
 * preserving projectile impacts, wound slots, hit counts and bleeding rates.
 * This is test infrastructure only and is never called by production gameplay.
 */
export function preserveCombatLabTargetSurvivability(
  state: SimulationState,
  roles: readonly CombatLabRoleV1[],
): void {
  const targetUnitIds = new Set(
    roles.filter((role) => role.selectableAs.includes('target')).map((role) => role.unitId),
  );
  for (const unit of state.units) {
    if (!targetUnitIds.has(unit.id)) continue;
    const blood = unit.infantryCombatRuntime.physiology.blood;
    blood.bloodLoss = Math.min(COMBAT_LAB_TARGET_MAXIMUM_BLOOD_LOSS, Math.max(0, blood.bloodLoss));
    blood.pendingBloodLoss = 0;
    blood.state = deriveBloodState(blood.bloodLoss);

    const structural = unit.infantryCombatRuntime.wounds.capabilities;
    unit.infantryCombatRuntime.wounds.capabilities = {
      ...structural,
      alive: true,
      conscious: true,
    };
  }
}
