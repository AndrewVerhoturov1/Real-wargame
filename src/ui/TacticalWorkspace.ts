import type { AiGameBridgeHandle } from '../core/ai/AiGameBridge';
import type { SimulationState } from '../core/simulation/SimulationState';
import { setSimulationLayerMode } from '../core/ui/RuntimeUiState';
import {
  installTacticalWorkspace as installTacticalWorkspaceBase,
} from './TacticalWorkspaceBase';
import { installTacticalPositionSearchControls } from './TacticalPositionSearchControls';
import { installTacticalPositionSettingsControls } from './TacticalPositionSettingsControls';
import { installTacticalPositionWorkspaceTab } from './TacticalPositionWorkspaceTab';

export * from './TacticalWorkspaceBase';

const ROUTE_COST_INSPECTOR_RENDERED_EVENT = 'real-wargame:route-cost-inspector-rendered';

/**
 * Compatibility shell around the existing workspace while legacy cover widgets
 * are removed. Tactical-position search and route-cost diagnostics own dedicated
 * inspector tabs and are never mounted into the shared Info/Danger/Stealth body.
 */
export function installTacticalWorkspace(
  state: SimulationState,
  aiBridge: AiGameBridgeHandle,
  onChanged: () => void,
): () => void {
  const style = document.createElement('style');
  style.dataset.tacticalPositionMigration = 'true';
  style.textContent = `
    .cover-map-tooltip,
    .selected-cover-card,
    .workspace-panel-section:has([data-role="cover-list"]) {
      display: none !important;
    }

    .route-cost-inspector-body[hidden] {
      display: none !important;
    }
  `;
  document.head.append(style);

  const teardownBase = installTacticalWorkspaceBase(state, aiBridge, onChanged);
  const teardownTab = installTacticalPositionWorkspaceTab(state, onChanged);
  const teardownSettings = installTacticalPositionSettingsControls(state, onChanged);
  const teardownSearch = installTacticalPositionSearchControls(state, onChanged);
  const shell = document.querySelector<HTMLElement>('.tactical-workspace-shell');
  const sidebarBody = shell?.querySelector<HTMLElement>('[data-role="sidebar-body"]') ?? null;
  const sidebarTitle = shell?.querySelector<HTMLElement>('[data-role="sidebar-title"]') ?? null;
  const tabs = shell?.querySelector<HTMLElement>('.simulation-tabs') ?? null;
  const originalTabButtons = tabs
    ? Array.from(tabs.querySelectorAll<HTMLButtonElement>('[data-tab]'))
    : [];
  const modeButtons = shell
    ? Array.from(shell.querySelectorAll<HTMLButtonElement>('[data-mode]'))
    : [];

  let routeCostTab: HTMLButtonElement | null = null;
  let routeCostInspectorPanel: HTMLElement | null = null;
  let routeCostTabActive = false;

  if (shell && sidebarBody && tabs) {
    const memoryTab = tabs.querySelector<HTMLButtonElement>('[data-tab="memory"]');
    const markup = '<button data-tab="routeCost">Стоимость маршрута</button>';
    if (memoryTab) memoryTab.insertAdjacentHTML('beforebegin', markup);
    else tabs.insertAdjacentHTML('beforeend', markup);
    routeCostTab = tabs.querySelector<HTMLButtonElement>('[data-tab="routeCost"]');

    routeCostInspectorPanel = document.createElement('div');
    routeCostInspectorPanel.className = `${sidebarBody.className} route-cost-inspector-body`;
    routeCostInspectorPanel.hidden = true;
    routeCostInspectorPanel.innerHTML = '<div class="workspace-panel-section route-cost-inspector-panel" data-role="route-cost-inspector-host"></div>';
    sidebarBody.after(routeCostInspectorPanel);

    shell.querySelector<HTMLButtonElement>('[data-action="route-cost-quick-toggle"]')?.remove();
    window.dispatchEvent(new CustomEvent(ROUTE_COST_INSPECTOR_RENDERED_EVENT));
  }

  const syncRouteCostInspectorUi = (): void => {
    if (!shell || !sidebarBody || !sidebarTitle || !routeCostTab || !routeCostInspectorPanel) return;
    routeCostInspectorPanel.hidden = !routeCostTabActive;
    sidebarBody.hidden = routeCostTabActive;
    if (!routeCostTabActive) return;

    if (sidebarTitle.textContent !== 'Стоимость маршрута') sidebarTitle.textContent = 'Стоимость маршрута';
    shell.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((button) => {
      button.classList.toggle('active', button === routeCostTab);
    });
  };

  const handleRouteCostTabClick = (): void => {
    routeCostTabActive = true;
    setSimulationLayerMode(state, 'info');
    syncRouteCostInspectorUi();
    window.dispatchEvent(new CustomEvent(ROUTE_COST_INSPECTOR_RENDERED_EVENT));
    onChanged();
  };
  const handleOtherTabClick = (): void => {
    routeCostTabActive = false;
    syncRouteCostInspectorUi();
  };
  const handleModeClick = (): void => {
    routeCostTabActive = false;
    syncRouteCostInspectorUi();
  };

  routeCostTab?.addEventListener('click', handleRouteCostTabClick);
  originalTabButtons.forEach((button) => button.addEventListener('click', handleOtherTabClick));
  modeButtons.forEach((button) => button.addEventListener('click', handleModeClick));

  let cleaning = false;
  let scheduledFrame = 0;
  const cleanRemovedCoverUi = (): void => {
    if (!shell || cleaning) return;
    cleaning = true;
    try {
      shell.querySelectorAll<HTMLElement>('.cover-map-tooltip, .selected-cover-card').forEach((element) => element.remove());
      shell.querySelectorAll<HTMLElement>('.workspace-panel-section').forEach((section) => {
        const title = section.querySelector('h3')?.textContent?.trim() ?? '';
        if (title === 'Известные укрытия' || title === 'Известные предметы и укрытия') section.remove();
      });
      shell.querySelectorAll<HTMLElement>('.workspace-info-grid > div').forEach((row) => {
        const label = row.querySelector('span')?.textContent?.trim() ?? '';
        if (label === 'Известных укрытий') row.remove();
      });
      if (sidebarTitle?.textContent === 'Опасность и укрытия') sidebarTitle.textContent = 'Опасность';
      syncRouteCostInspectorUi();
    } finally {
      cleaning = false;
    }
  };
  const scheduleCleanup = (): void => {
    if (scheduledFrame !== 0) return;
    scheduledFrame = window.requestAnimationFrame(() => {
      scheduledFrame = 0;
      cleanRemovedCoverUi();
    });
  };

  let observer: MutationObserver | null = null;
  if (shell) {
    observer = new MutationObserver(scheduleCleanup);
    observer.observe(shell, { childList: true, subtree: true });
  }
  cleanRemovedCoverUi();

  return () => {
    observer?.disconnect();
    if (scheduledFrame !== 0) window.cancelAnimationFrame(scheduledFrame);
    routeCostTab?.removeEventListener('click', handleRouteCostTabClick);
    originalTabButtons.forEach((button) => button.removeEventListener('click', handleOtherTabClick));
    modeButtons.forEach((button) => button.removeEventListener('click', handleModeClick));
    routeCostInspectorPanel?.remove();
    routeCostTab?.remove();
    style.remove();
    teardownSearch();
    teardownSettings();
    teardownTab();
    teardownBase();
  };
}
