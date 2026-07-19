import type { SimulationState } from '../core/simulation/SimulationState';
import { clearVisibleTacticalPositions } from '../core/tactical/SimulationTacticalPositionSelection';
import { setSimulationLayerMode } from '../core/ui/RuntimeUiState';

const TAB_CHANGED_EVENT = 'real-wargame:tactical-position-tab-changed';
const activeByState = new WeakMap<SimulationState, boolean>();

export function isTacticalPositionWorkspaceTabActive(state: SimulationState): boolean {
  return activeByState.get(state) === true;
}

export function installTacticalPositionWorkspaceTab(
  state: SimulationState,
  onChanged: () => void,
): () => void {
  const shell = document.querySelector<HTMLElement>('.tactical-workspace-shell');
  const tabs = shell?.querySelector<HTMLElement>('.simulation-tabs');
  const sidebarTitle = shell?.querySelector<HTMLElement>('[data-role="sidebar-title"]');
  const sidebarBody = shell?.querySelector<HTMLElement>('[data-role="sidebar-body"]');
  if (!shell || !tabs || !sidebarTitle || !sidebarBody) return () => undefined;

  activeByState.set(state, false);
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.tacticalPositionTab = 'true';
  button.textContent = 'Позиции';
  const dangerButton = tabs.querySelector<HTMLButtonElement>('[data-tab="danger"]');
  dangerButton?.insertAdjacentElement('afterend', button);
  if (!button.isConnected) tabs.append(button);

  const renderPositionsBody = (): void => {
    if (!isTacticalPositionWorkspaceTabActive(state)) return;
    for (const tabButton of tabs.querySelectorAll<HTMLButtonElement>('button')) {
      tabButton.classList.toggle('active', tabButton === button);
    }
    sidebarTitle.textContent = 'Тактические позиции';
    if (!sidebarBody.querySelector('[data-role="tactical-position-tab-body"]')) {
      sidebarBody.innerHTML = '<div data-role="tactical-position-tab-body"></div>';
    }
  };

  const publishTabChange = (): void => {
    window.dispatchEvent(new CustomEvent(TAB_CHANGED_EVENT));
  };

  const openPositions = (event: Event): void => {
    event.preventDefault();
    event.stopPropagation();
    activeByState.set(state, true);
    // Reuse the soldier-owned danger raster while keeping marker interaction
    // isolated behind this dedicated tab flag.
    setSimulationLayerMode(state, 'positions');
    renderPositionsBody();
    publishTabChange();
    onChanged();
  };
  button.addEventListener('click', openPositions);

  const handleOtherTab = (event: Event): void => {
    const target = event.target instanceof Element
      ? event.target.closest<HTMLButtonElement>('[data-tab]')
      : null;
    if (!target || !isTacticalPositionWorkspaceTabActive(state)) return;
    activeByState.set(state, false);
    clearVisibleTacticalPositions(state);
    publishTabChange();
  };
  tabs.addEventListener('click', handleOtherTab, { capture: true });

  let scheduled = false;
  const observer = new MutationObserver(() => {
    if (scheduled || !isTacticalPositionWorkspaceTabActive(state)) return;
    scheduled = true;
    window.requestAnimationFrame(() => {
      scheduled = false;
      renderPositionsBody();
      publishTabChange();
    });
  });
  observer.observe(sidebarBody, { childList: true, subtree: true });

  return () => {
    activeByState.delete(state);
    observer.disconnect();
    button.removeEventListener('click', openPositions);
    tabs.removeEventListener('click', handleOtherTab, { capture: true });
    button.remove();
  };
}

export function subscribeTacticalPositionWorkspaceTab(listener: () => void): () => void {
  window.addEventListener(TAB_CHANGED_EVENT, listener);
  return () => window.removeEventListener(TAB_CHANGED_EVENT, listener);
}
