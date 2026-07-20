import type { SimulationState } from '../core/simulation/SimulationState';
import { clearVisibleTacticalPositions } from '../core/tactical/SimulationTacticalPositionSelection';
import { getSimulationLayerState } from '../core/ui/RuntimeUiState';

const TAB_CHANGED_EVENT = 'real-wargame:tactical-position-tab-changed';

export function isTacticalPositionWorkspaceTabActive(state: SimulationState): boolean {
  return getSimulationLayerState(state).mode === 'positions';
}

export function installTacticalPositionWorkspaceTab(
  state: SimulationState,
  onChanged: () => void,
): () => void {
  let wasActive = isTacticalPositionWorkspaceTabActive(state);
  const handleTabChange = (): void => {
    const active = isTacticalPositionWorkspaceTabActive(state);
    if (wasActive && !active) clearVisibleTacticalPositions(state);
    wasActive = active;
    onChanged();
  };
  window.addEventListener(TAB_CHANGED_EVENT, handleTabChange);
  handleTabChange();
  return () => window.removeEventListener(TAB_CHANGED_EVENT, handleTabChange);
}

export function subscribeTacticalPositionWorkspaceTab(listener: () => void): () => void {
  window.addEventListener(TAB_CHANGED_EVENT, listener);
  return () => window.removeEventListener(TAB_CHANGED_EVENT, listener);
}
