import type { GridPosition } from '../geometry';
import type { SimulationState } from '../simulation/SimulationState';

export type SimulationLayerMode = 'info' | 'danger' | 'positions' | 'stealth' | 'memory';

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

export interface RouteFacingDraft {
  target: GridPosition;
  pointer: GridPosition;
  finalFacingRadians: number | null;
}

export interface UnitCommandToolRuntimeState {
  turnToolActive: boolean;
  routeFacingDraft: RouteFacingDraft | null;
}

export interface AttentionOverlayRuntimeState {
  active: boolean;
  showCurrentView: boolean;
  showMemoryMarkers: boolean;
  showCurrentContacts: boolean;
  showUncertainty: boolean;
  /** Legacy compatibility flag. The rotating diagnostic fan is no longer rendered. */
  showVisibilityFan: boolean;
  selectedContactId: string | null;
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
  unitCommandTool: UnitCommandToolRuntimeState;
  attentionOverlay: AttentionOverlayRuntimeState;
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

export function getUnitCommandToolState(state: SimulationState): UnitCommandToolRuntimeState {
  return getRuntimeUiState(state).unitCommandTool;
}

export function setTurnToolActive(state: SimulationState, active: boolean): void {
  const tool = getRuntimeUiState(state).unitCommandTool;
  tool.turnToolActive = active;
  if (active) tool.routeFacingDraft = null;
}

export function consumeTurnTool(state: SimulationState): boolean {
  const tool = getRuntimeUiState(state).unitCommandTool;
  const active = tool.turnToolActive;
  tool.turnToolActive = false;
  return active;
}

export function setRouteFacingDraft(state: SimulationState, draft: RouteFacingDraft | null): void {
  getRuntimeUiState(state).unitCommandTool.routeFacingDraft = draft
    ? {
        target: { ...draft.target },
        pointer: { ...draft.pointer },
        finalFacingRadians: draft.finalFacingRadians,
      }
    : null;
}

export function getAttentionOverlayState(state: SimulationState): AttentionOverlayRuntimeState {
  return getRuntimeUiState(state).attentionOverlay;
}

export function setAttentionOverlayActive(state: SimulationState, active: boolean): void {
  getRuntimeUiState(state).attentionOverlay.active = active;
}

export function toggleAttentionOverlay(state: SimulationState): boolean {
  const overlay = getRuntimeUiState(state).attentionOverlay;
  overlay.active = !overlay.active;
  return overlay.active;
}

export function setAttentionCurrentView(state: SimulationState, active: boolean): void {
  getRuntimeUiState(state).attentionOverlay.showCurrentView = active;
}

export function setAttentionMemoryMarkers(state: SimulationState, active: boolean): void {
  getRuntimeUiState(state).attentionOverlay.showMemoryMarkers = active;
}

export function setAttentionCurrentContacts(state: SimulationState, active: boolean): void {
  getRuntimeUiState(state).attentionOverlay.showCurrentContacts = active;
}

export function setAttentionUncertainty(state: SimulationState, active: boolean): void {
  getRuntimeUiState(state).attentionOverlay.showUncertainty = active;
}

export function setAttentionVisibilityFan(state: SimulationState, active: boolean): void {
  getRuntimeUiState(state).attentionOverlay.showVisibilityFan = active;
}

export function setSelectedAttentionContact(state: SimulationState, contactId: string | null): void {
  getRuntimeUiState(state).attentionOverlay.selectedContactId = contactId;
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
      unitCommandTool: { turnToolActive: false, routeFacingDraft: null },
      attentionOverlay: {
        active: false,
        showCurrentView: true,
        showMemoryMarkers: true,
        showCurrentContacts: true,
        showUncertainty: true,
        showVisibilityFan: false,
        selectedContactId: null,
      },
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
