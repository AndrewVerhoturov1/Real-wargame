import type { SimulationState } from '../simulation/SimulationState';
import { isUnitCombatCapable } from './CombatDamage';
import { findBestDirectFireContact } from './CombatDecision';
import { getFireAction, requestFireAction } from './FireAction';
import { isFireAllowed } from './CombatRules';
import { getWeaponRuntime } from './WeaponModel';

export function tickAutomaticCombatEngagements(state: SimulationState): void {
  if (!isFireAllowed(state)) return;

  for (const unit of state.units) {
    if (!isUnitCombatCapable(unit) || getFireAction(unit)) continue;
    const weapon = getWeaponRuntime(unit);
    if (!weapon.ready || weapon.roundsLoaded <= 0) continue;
    if (state.simulationTimeSeconds < weapon.nextAllowedShotSeconds) continue;
    const contact = findBestDirectFireContact(state, unit);
    if (!contact) continue;
    requestFireAction(state, unit, contact.id);
  }
}
