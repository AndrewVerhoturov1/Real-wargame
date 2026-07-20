import type { AiGameBridgeHandle } from '../core/ai/AiGameBridge';
import { setRouteCostOverlayActive } from '../core/navigation/RouteCostOverlayState';
import type { SimulationState } from '../core/simulation/SimulationState';
import {
  getSimulationLayerState,
  setSimulationLayerMode,
  toggleThreatCones,
} from '../core/ui/RuntimeUiState';
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
 * are removed. Tactical-position search and route diagnostics own dedicated
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

    .route-cost-inspector-panel select {
      color-scheme: dark;
    }

    .route-cost-inspector-panel select option,
    .route-cost-inspector-panel select optgroup {
      color: #fff0a1;
      background: #11170e;
    }

    .route-cost-inspector-panel select option:disabled {
      color: #777d6d;
    }

    .workspace-display-panel #vision-toggle {
      display: none !important;
    }

    .danger-cone-controls {
      display: grid;
      gap: 6px;
      margin: 0 0 12px;
      padding: 10px;
      border: 1px solid rgba(255, 240, 161, 0.13);
      border-radius: 10px;
      background: rgba(255, 242, 168, 0.035);
    }

    .danger-cone-controls > span {
      color: var(--workspace-muted);
      font-size: 11px;
      line-height: 1.4;
    }

    .danger-cone-controls button {
      width: 100%;
      min-height: 36px;
      padding: 7px 10px;
      border-radius: 8px;
      text-align: left;
      font-size: 11px;
      font-weight: 800;
    }

    .danger-cone-controls button.active {
      color: #141910;
      border-color: var(--workspace-accent);
      background: var(--workspace-accent);
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
  const dangerConeControls = document.createElement('section');
  dangerConeControls.className = 'danger-cone-controls';
  dangerConeControls.dataset.role = 'danger-cone-controls';
  const dangerConeDescription = document.createElement('span');
  dangerConeDescription.textContent = 'Показывает направленные сектора известных угроз поверх карты опасности.';
  const dangerConeToggle = document.createElement('button');
  dangerConeToggle.type = 'button';
  dangerConeControls.append(dangerConeDescription, dangerConeToggle);

  let routeCostTab: HTMLButtonElement | null = null;
  let routeCostInspectorPanel: HTMLElement | null = null;
  let routeCostTabActive = false;

  if (shell && sidebarBody && tabs) {
    const memoryTab = tabs.querySelector<HTMLButtonElement>('[data-tab="memory"]');
    const markup = '<button data-tab="routeCost">Маршрут</button>';
    if (memoryTab) memoryTab.insertAdjacentHTML('beforebegin', markup);
    else tabs.insertAdjacentHTML('beforeend', markup);
    routeCostTab = tabs.querySelector<HTMLButtonElement>('[data-tab="routeCost"]');

    routeCostInspectorPanel = document.createElement('div');
    routeCostInspectorPanel.className = `${sidebarBody.className} route-cost-inspector-body`;
    routeCostInspectorPanel.hidden = true;
    routeCostInspectorPanel.innerHTML = '<div class="workspace-panel-section route-cost-inspector-panel" data-role="route-cost-inspector-host"></div>';
    sidebarBody.after(routeCostInspectorPanel);

    const routeCostInspectorHost = routeCostInspectorPanel.querySelector<HTMLElement>('[data-role="route-cost-inspector-host"]');
    const routeProfileLabel = shell.querySelector<HTMLElement>('.unit-route-profile');
    const routeDetails = shell.querySelector<HTMLDetailsElement>('.unit-route-details');
    const routeControls = shell.querySelector<HTMLElement>('.unit-bar-route-controls');
    const routeProfileCaption = routeProfileLabel?.querySelector<HTMLElement>('span');
    if (routeProfileCaption) routeProfileCaption.textContent = 'Профиль движения';
    if (routeDetails) routeDetails.open = true;
    if (routeCostInspectorHost && routeProfileLabel && routeDetails) {
      routeCostInspectorHost.append(routeProfileLabel, routeDetails);
    }
    routeControls?.classList.add('route-controls-migrated');

    shell.querySelector<HTMLButtonElement>('[data-action="route-cost-quick-toggle"]')?.remove();
    setRouteCostOverlayActive(state, false);
    window.dispatchEvent(new CustomEvent(ROUTE_COST_INSPECTOR_RENDERED_EVENT));
  }

  const syncDangerConeToggle = (): void => {
    const active = getSimulationLayerState(state).showThreatCones;
    dangerConeToggle.textContent = active ? 'Конусы угроз: вкл' : 'Конусы угроз: выкл';
    dangerConeToggle.setAttribute('aria-pressed', String(active));
    dangerConeToggle.classList.toggle('active', active);
  };

  const mountDangerConeControls = (): void => {
    if (!shell || !sidebarBody || routeCostTabActive) {
      dangerConeControls.remove();
      return;
    }
    const dangerActive = Boolean(shell.querySelector<HTMLButtonElement>('[data-tab="danger"].active'));
    if (!dangerActive) {
      dangerConeControls.remove();
      return;
    }
    const heading = sidebarBody.querySelector<HTMLElement>('.workspace-panel-heading');
    if (heading) heading.after(dangerConeControls);
    else sidebarBody.prepend(dangerConeControls);
    syncDangerConeToggle();
  };

  const handleDangerConeToggle = (): void => {
    toggleThreatCones(state);
    syncDangerConeToggle();
    onChanged();
  };
  dangerConeToggle.addEventListener('click', handleDangerConeToggle);

  const syncRouteCostInspectorUi = (): void => {
    if (!shell || !sidebarBody || !sidebarTitle || !routeCostTab || !routeCostInspectorPanel) return;
    routeCostInspectorPanel.hidden = !routeCostTabActive;
    sidebarBody.hidden = routeCostTabActive;
    if (!routeCostTabActive) return;

    if (sidebarTitle.textContent !== 'Маршрут') sidebarTitle.textContent = 'Маршрут';
    shell.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((button) => {
      button.classList.toggle('active', button === routeCostTab);
    });
  };

  const handleRouteCostTabClick = (): void => {
    routeCostTabActive = true;
    setSimulationLayerMode(state, 'info');
    setRouteCostOverlayActive(state, true);
    dangerConeControls.remove();
    syncRouteCostInspectorUi();
    window.dispatchEvent(new CustomEvent(ROUTE_COST_INSPECTOR_RENDERED_EVENT));
    onChanged();
  };
  const handleOtherTabClick = (): void => {
    routeCostTabActive = false;
    setRouteCostOverlayActive(state, false);
    syncRouteCostInspectorUi();
    window.requestAnimationFrame(mountDangerConeControls);
    onChanged();
  };
  const handleModeClick = (): void => {
    routeCostTabActive = false;
    setRouteCostOverlayActive(state, false);
    syncRouteCostInspectorUi();
    window.requestAnimationFrame(mountDangerConeControls);
    onChanged();
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
      mountDangerConeControls();
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
  syncDangerConeToggle();
  cleanRemovedCoverUi();

  return () => {
    observer?.disconnect();
    if (scheduledFrame !== 0) window.cancelAnimationFrame(scheduledFrame);
    setRouteCostOverlayActive(state, false);
    dangerConeToggle.removeEventListener('click', handleDangerConeToggle);
    dangerConeControls.remove();
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
