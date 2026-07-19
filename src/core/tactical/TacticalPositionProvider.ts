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

interface ActiveProviderEntry {
  readonly state: SimulationState;
  readonly provider: TacticalPositionProvider;
}

const MAX_ACTIVE_PROVIDER_STATES = 4;
const providerByState = new WeakMap<SimulationState, TacticalPositionProvider>();
const activeProviders: ActiveProviderEntry[] = [];

export function installTacticalPositionProvider(
  state: SimulationState,
  provider: TacticalPositionProvider,
): void {
  providerByState.set(state, provider);
  const existingIndex = activeProviders.findIndex((entry) => entry.state === state);
  if (existingIndex >= 0) activeProviders.splice(existingIndex, 1);
  activeProviders.push({ state, provider });
  while (activeProviders.length > MAX_ACTIVE_PROVIDER_STATES) activeProviders.shift();
}

export function getTacticalPositionProvider(
  state: SimulationState,
): TacticalPositionProvider | null {
  return providerByState.get(state) ?? null;
}

/**
 * Runtime fallback for graph execution paths that only carry the stable unit id.
 * The registry is explicitly bounded and lifecycle-owned by the active simulation.
 */
export function generateRegisteredTacticalPositions(
  unitId: string,
  request: TacticalQueryGenerationRequest,
): TacticalQueryGenerationResult | null {
  for (let index = activeProviders.length - 1; index >= 0; index -= 1) {
    const entry = activeProviders[index]!;
    const unit = entry.state.units.find((candidate) => candidate.id === unitId);
    if (unit) return entry.provider.generate(unit, request);
  }
  return null;
}

export function clearTacticalPositionProvider(state: SimulationState): void {
  providerByState.delete(state);
  const index = activeProviders.findIndex((entry) => entry.state === state);
  if (index >= 0) activeProviders.splice(index, 1);
}
