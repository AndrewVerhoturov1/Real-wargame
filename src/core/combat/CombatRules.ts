import type { SimulationState } from '../simulation/SimulationState';

interface CombatRulesState {
  fireAllowed: boolean;
  revision: number;
}

const rulesByState = new WeakMap<SimulationState, CombatRulesState>();
const legacyAutomaticFireDisabledStates = new WeakSet<SimulationState>();

export function isFireAllowed(state: SimulationState): boolean {
  if (legacyAutomaticFireDisabledStates.has(state)) return false;
  return rulesByState.get(state)?.fireAllowed ?? false;
}

export function setFireAllowed(state: SimulationState, allowed: boolean): void {
  const current = getCombatRulesState(state);
  const next = legacyAutomaticFireDisabledStates.has(state) ? false : Boolean(allowed);
  if (current.fireAllowed === next) return;
  current.fireAllowed = next;
  current.revision += 1;
}

export function disableLegacyAutomaticFire(state: SimulationState): void {
  legacyAutomaticFireDisabledStates.add(state);
  setFireAllowed(state, false);
}

export function getCombatRulesRevision(state: SimulationState): number {
  return rulesByState.get(state)?.revision ?? 0;
}

export function clearCombatRules(state: SimulationState): void {
  rulesByState.delete(state);
  legacyAutomaticFireDisabledStates.delete(state);
}

function getCombatRulesState(state: SimulationState): CombatRulesState {
  let rules = rulesByState.get(state);
  if (!rules) {
    rules = { fireAllowed: false, revision: 0 };
    rulesByState.set(state, rules);
  }
  return rules;
}
