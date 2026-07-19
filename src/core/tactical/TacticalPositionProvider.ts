import type {
  TacticalQueryGenerationRequest,
  TacticalQueryGenerationResult,
} from '../ai/tactical/TacticalQuery';
import type { SimulationState } from '../simulation/SimulationState';
import type { UnitModel } from '../units/UnitModel';

/**
 * Pure AI-facing adapter over application-owned prepared tactical fields.
 * Implementations may schedule asynchronous preparation, but this call itself
 * must remain bounded and must never perform a full-map calculation.
 */
export interface TacticalPositionProvider {
  generate(
    unit: UnitModel,
    request: TacticalQueryGenerationRequest,
  ): TacticalQueryGenerationResult;
}

const providerByState = new WeakMap<SimulationState, TacticalPositionProvider>();

export function installTacticalPositionProvider(
  state: SimulationState,
  provider: TacticalPositionProvider,
): void {
  providerByState.set(state, provider);
}

export function getTacticalPositionProvider(
  state: SimulationState,
): TacticalPositionProvider | null {
  return providerByState.get(state) ?? null;
}

export function clearTacticalPositionProvider(state: SimulationState): void {
  providerByState.delete(state);
}
