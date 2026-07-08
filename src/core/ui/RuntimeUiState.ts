import type { GridPosition } from '../geometry';
import type { SimulationState } from '../simulation/SimulationState';

export interface KnowledgeOverlayRuntimeState {
  active: boolean;
}

export interface VisibilityProbeRuntimeState {
  active: boolean;
  target: GridPosition | null;
}

interface RuntimeUiState {
  knowledgeOverlay: KnowledgeOverlayRuntimeState;
  visibilityProbe: VisibilityProbeRuntimeState;
}

const runtimeByState = new WeakMap<SimulationState, RuntimeUiState>();

export function getKnowledgeOverlayState(state: SimulationState): KnowledgeOverlayRuntimeState {
  return getRuntimeUiState(state).knowledgeOverlay;
}

export function setKnowledgeOverlayActive(state: SimulationState, active: boolean): void {
  getRuntimeUiState(state).knowledgeOverlay.active = active;
}

export function getVisibilityProbeState(state: SimulationState): VisibilityProbeRuntimeState {
  return getRuntimeUiState(state).visibilityProbe;
}

export function setVisibilityProbe(state: SimulationState, active: boolean, target: GridPosition | null): void {
  const probe = getRuntimeUiState(state).visibilityProbe;
  probe.active = active;
  probe.target = active ? target : null;
}

function getRuntimeUiState(state: SimulationState): RuntimeUiState {
  let runtime = runtimeByState.get(state);

  if (!runtime) {
    runtime = {
      knowledgeOverlay: {
        active: false,
      },
      visibilityProbe: {
        active: false,
        target: null,
      },
    };
    runtimeByState.set(state, runtime);
  }

  return runtime;
}
