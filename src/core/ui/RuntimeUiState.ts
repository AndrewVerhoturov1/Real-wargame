import type { GridPosition } from '../geometry';
import type { SimulationState } from '../simulation/SimulationState';

export type SimulationLayerMode = 'info' | 'danger' | 'stealth' | 'memory';

export interface KnowledgeOverlayRuntimeState {
  active: boolean;
}

export interface RealReliefOverlayRuntimeState {
  active: boolean;
}

export interface CommandPlanRouteOverlayRuntimeState {
  active: boolean;
}

export interface VisibilityProbeRuntimeState {
  active: boolean;
  target: GridPosition | null;
}

export interface SimulationLayerRuntimeState {
  mode: SimulationLayerMode;
  selectedCoverId: string | null;
  hoveredCoverId: string | null;
}

interface RuntimeUiState {
  knowledgeOverlay: KnowledgeOverlayRuntimeState;
  realReliefOverlay: RealReliefOverlayRuntimeState;
  commandPlanRouteOverlay: CommandPlanRouteOverlayRuntimeState;
  visibilityProbe: VisibilityProbeRuntimeState;
  simulationLayer: SimulationLayerRuntimeState;
}

const runtimeByState = new WeakMap<SimulationState, RuntimeUiState>();

export function getKnowledgeOverlayState(state: SimulationState): KnowledgeOverlayRuntimeState {
  return getRuntimeUiState(state).knowledgeOverlay;
}

export function setKnowledgeOverlayActive(state: SimulationState, active: boolean): void {
  getRuntimeUiState(state).knowledgeOverlay.active = active;
}

export function getRealReliefOverlayState(state: SimulationState): RealReliefOverlayRuntimeState {
  return getRuntimeUiState(state).realReliefOverlay;
}

export function toggleRealReliefOverlay(state: SimulationState): boolean {
  const overlay = getRuntimeUiState(state).realReliefOverlay;
  overlay.active = !overlay.active;
  return overlay.active;
}

export function getCommandPlanRouteOverlayState(state: SimulationState): CommandPlanRouteOverlayRuntimeState {
  return getRuntimeUiState(state).commandPlanRouteOverlay;
}

export function toggleCommandPlanRouteOverlay(state: SimulationState): boolean {
  const overlay = getRuntimeUiState(state).commandPlanRouteOverlay;
  overlay.active = !overlay.active;
  return overlay.active;
}

export function setCommandPlanRouteOverlayActive(state: SimulationState, active: boolean): void {
  getRuntimeUiState(state).commandPlanRouteOverlay.active = active;
}

export function getVisibilityProbeState(state: SimulationState): VisibilityProbeRuntimeState {
  return getRuntimeUiState(state).visibilityProbe;
}

export function setVisibilityProbe(state: SimulationState, active: boolean, target: GridPosition | null): void {
  const probe = getRuntimeUiState(state).visibilityProbe;
  probe.active = active;
  probe.target = active ? target : null;
}

export function getSimulationLayerState(state: SimulationState): SimulationLayerRuntimeState {
  return getRuntimeUiState(state).simulationLayer;
}

export function setSimulationLayerMode(state: SimulationState, mode: SimulationLayerMode): void {
  const layer = getRuntimeUiState(state).simulationLayer;
  layer.mode = mode;
  if (mode === 'info') {
    layer.selectedCoverId = null;
    layer.hoveredCoverId = null;
  }
}

export function setSelectedSimulationCover(state: SimulationState, coverId: string | null): void {
  getRuntimeUiState(state).simulationLayer.selectedCoverId = coverId;
}

export function setHoveredSimulationCover(state: SimulationState, coverId: string | null): void {
  getRuntimeUiState(state).simulationLayer.hoveredCoverId = coverId;
}

function getRuntimeUiState(state: SimulationState): RuntimeUiState {
  let runtime = runtimeByState.get(state);

  if (!runtime) {
    runtime = {
      knowledgeOverlay: { active: false },
      realReliefOverlay: { active: false },
      commandPlanRouteOverlay: { active: true },
      visibilityProbe: { active: false, target: null },
      simulationLayer: {
        mode: 'info',
        selectedCoverId: null,
        hoveredCoverId: null,
      },
    };
    runtimeByState.set(state, runtime);
  }

  return runtime;
}
