import type { SimulationState } from '../simulation/SimulationState';

export type RouteCostOverlayMode = 'baseTerrain' | 'finalCost' | 'directionalTerrain';

export interface RouteCostOverlayRuntimeState {
  active: boolean;
  mode: RouteCostOverlayMode;
}

const stateBySimulation = new WeakMap<SimulationState, RouteCostOverlayRuntimeState>();

export function getRouteCostOverlayState(state: SimulationState): RouteCostOverlayRuntimeState {
  let overlay = stateBySimulation.get(state);
  if (!overlay) {
    overlay = { active: false, mode: 'finalCost' };
    stateBySimulation.set(state, overlay);
  }
  return overlay;
}

export function setRouteCostOverlayActive(state: SimulationState, active: boolean): void {
  getRouteCostOverlayState(state).active = active;
}

export function toggleRouteCostOverlay(state: SimulationState): boolean {
  const overlay = getRouteCostOverlayState(state);
  overlay.active = !overlay.active;
  return overlay.active;
}

export function setRouteCostOverlayMode(state: SimulationState, mode: RouteCostOverlayMode): void {
  getRouteCostOverlayState(state).mode = mode;
}
