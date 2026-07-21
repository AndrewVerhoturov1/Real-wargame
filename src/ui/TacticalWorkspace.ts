import '../cell-inspector.css';
import type { AiGameBridgeHandle } from '../core/ai/AiGameBridge';
import { setRouteCostOverlayActive } from '../core/navigation/RouteCostOverlayState';
import type { SimulationState } from '../core/simulation/SimulationState';
import { getStaticTacticalPositionService } from '../core/tactical/static/StaticTacticalPositionService';
import type { StaticTacticalPositionKind } from '../core/tactical/static/StaticTacticalPositionBasis';
import {
  getSimulationLayerState,
  setSimulationLayerMode,
  toggleThreatCones,
  type SimulationLayerMode,
} from '../core/ui/RuntimeUiState';
import { installCellInspector } from './CellInspector';
import {
  installTacticalWorkspace as installTacticalWorkspaceBase,
} from './TacticalWorkspaceBase';
import { installTacticalPositionSearchControls } from './TacticalPositionSearchControls';
import { installTacticalPositionSettingsControls } from './TacticalPositionSettingsControls';
import { installTacticalPositionWorkspaceTab } from './TacticalPositionWorkspaceTab';

export * from './TacticalWorkspaceBase';

const ROUTE_COST_INSPECTOR_RENDERED_EVENT = 'real-wargame:route-cost-inspector-rendered';

interface StaticTacticalTabDefinition {
  readonly kind: StaticTacticalPositionKind;
  readonly mode: SimulationLayerMode;
  readonly label: string;
}

const STATIC_TACTICAL_TABS: readonly StaticTacticalTabDefinition[] = Object.freeze([
  { kind: 'observation', mode: 'observation_positions', label: 'Наблюдение' },
  { kind: 'defense', mode: 'defense_positions', label: 'Оборона' },
  { kind: 'firing', mode: 'firing_positions', label: 'Огонь' },
]);

/**
 * Compatibility shell around the existing workspace while legacy cover widgets
 * are removed. Tactical-position search, objective tactical layers and route
 * diagnostics own dedicated inspector tabs and are never mounted into the
 * shared Info/Danger/Stealth body.
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

    .route-cost-inspector-body[hidden],
    .static-tactical-inspector-body[hidden] {
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

    .danger-cone-controls,
    .static-tactical-inspector-panel {
      display: grid;
      gap: 6px;
      margin: 0 0 12px;
      padding: 10px;
      border: 1px solid rgba(255, 240, 161, 0.13);
      border-radius: 10px;
      background: rgba(255, 242, 168, 0.035);
    }

    .danger-cone-controls > span,
    .static-tactical-inspector-panel p,
    .static-tactical-inspector-panel span {
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

    .static-tactical-layer-tabs {
      display: contents;
    }

    .static-tactical-inspector-panel h3 {
      margin: 0;
      color: var(--workspace-accent);
      font-size: 13px;
    }

    .static-tactical-inspector-panel dl {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 5px 10px;
      margin: 4px 0 0;
      font-size: 11px;
    }

    .static-tactical-inspector-panel dt {
      color: var(--workspace-muted);
    }

    .static-tactical-inspector-panel dd {
      margin: 0;
      color: #fff0a1;
      font-weight: 700;
      text-align: right;
    }
  `;
  document.head.append(style);

  const teardownBase = installTacticalWorkspaceBase(state, aiBridge, onChanged);
  const teardownTab = installTacticalPositionWorkspaceTab(state, onChanged);
  const teardownSettings = installTacticalPositionSettingsControls(state, onChanged);
  const teardownSearch = installTacticalPositionSearchControls(state, onChanged);
  const teardownCellInspector = installCellInspector(state);
  const staticService = getStaticTacticalPositionService(state);
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
  let staticTacticalInspectorPanel: HTMLElement | null = null;
  let activeStaticTacticalTab: StaticTacticalTabDefinition | null = null;
  const staticTacticalTabButtons = new Map<StaticTacticalPositionKind, HTMLButtonElement>();

  if (shell && sidebarBody && tabs) {
    const memoryTab = tabs.querySelector<HTMLButtonElement>('[data-tab="memory"]');
    const staticMarkup = STATIC_TACTICAL_TABS
      .map((definition) => `<button data-static-tactical-kind="${definition.kind}">${definition.label}</button>`)
      .join('');
    const markup = `${staticMarkup}<button data-tab="routeCost">Маршрут</button>`;
    if (memoryTab) memoryTab.insertAdjacentHTML('beforebegin', markup);
    else tabs.insertAdjacentHTML('beforeend', markup);
    routeCostTab = tabs.querySelector<HTMLButtonElement>('[data-tab="routeCost"]');
    for (const definition of STATIC_TACTICAL_TABS) {
      const button = tabs.querySelector<HTMLButtonElement>(`[data-static-tactical-kind="${definition.kind}"]`);
      if (button) staticTacticalTabButtons.set(definition.kind, button);
    }

    routeCostInspectorPanel = document.createElement('div');
    routeCostInspectorPanel.className = `${sidebarBody.className} route-cost-inspector-body`;
    routeCostInspectorPanel.hidden = true;
    routeCostInspectorPanel.innerHTML = '<div class="workspace-panel-section route-cost-inspector-panel" data-role="route-cost-inspector-host"></div>';
    sidebarBody.after(routeCostInspectorPanel);

    staticTacticalInspectorPanel = document.createElement('div');
    staticTacticalInspectorPanel.className = `${sidebarBody.className} static-tactical-inspector-body`;
    staticTacticalInspectorPanel.hidden = true;
    staticTacticalInspectorPanel.innerHTML = '<section class="static-tactical-inspector-panel" data-role="static-tactical-inspector-panel"></section>';
    routeCostInspectorPanel.after(staticTacticalInspectorPanel);

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
    if (!shell || !sidebarBody || routeCostTabActive || activeStaticTacticalTab) {
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

  const syncInspectorUi = (): void => {
    if (!shell || !sidebarBody || !sidebarTitle || !routeCostTab || !routeCostInspectorPanel || !staticTacticalInspectorPanel) return;
    const staticActive = activeStaticTacticalTab !== null;
    routeCostInspectorPanel.hidden = !routeCostTabActive;
    staticTacticalInspectorPanel.hidden = !staticActive;
    sidebarBody.hidden = routeCostTabActive || staticActive;
    if (routeCostTabActive) sidebarTitle.textContent = 'Маршрут';
    else if (activeStaticTacticalTab) sidebarTitle.textContent = staticLayerTitle(activeStaticTacticalTab.kind);
    shell.querySelectorAll<HTMLButtonElement>('[data-tab], [data-static-tactical-kind]').forEach((button) => {
      const kind = button.dataset.staticTacticalKind as StaticTacticalPositionKind | undefined;
      button.classList.toggle('active', routeCostTabActive ? button === routeCostTab : Boolean(kind && kind === activeStaticTacticalTab?.kind));
    });
  };

  const renderStaticTacticalInspector = (): void => {
    const host = staticTacticalInspectorPanel?.querySelector<HTMLElement>('[data-role="static-tactical-inspector-panel"]');
    const active = activeStaticTacticalTab;
    if (!host || !active) return;
    const diagnostics = staticService.getDiagnostics();
    const basis = staticService.readAnyReady();
    const candidates = basis ? candidateCount(basis, active.kind) : 0;
    const fieldLabel = active.kind === 'observation'
      ? 'Обзор, скрытность и частичная защита'
      : active.kind === 'defense'
        ? 'Направленная защита, обратные склоны и укрытия'
        : 'Линии огня, проницаемость и защита стрелка';
    host.innerHTML = `
      <h3>${staticLayerTitle(active.kind)}</h3>
      <p>${fieldLabel}. Слой показывает объективный потенциал местности и не использует положение неизвестного противника.</p>
      <dl>
        <dt>Состояние</dt><dd>${staticStatusLabel(diagnostics.status)}</dd>
        <dt>Кандидатов в индексе</dt><dd>${candidates}</dd>
        <dt>Время построения</dt><dd>${basis ? `${basis.diagnostics.buildMs.toFixed(1)} мс` : '—'}</dd>
        <dt>Обработано клеток</dt><dd>${basis?.diagnostics.cellsProcessed ?? '—'}</dd>
        <dt>Лучи наблюдения</dt><dd>${basis?.diagnostics.observationRays ?? '—'}</dd>
        <dt>Лучи прострела</dt><dd>${basis?.diagnostics.firingRays ?? '—'}</dd>
      </dl>`;
  };

  const handleRouteCostTabClick = (): void => {
    routeCostTabActive = true;
    activeStaticTacticalTab = null;
    setSimulationLayerMode(state, 'info');
    setRouteCostOverlayActive(state, true);
    dangerConeControls.remove();
    syncInspectorUi();
    window.dispatchEvent(new CustomEvent(ROUTE_COST_INSPECTOR_RENDERED_EVENT));
    onChanged();
  };
  const handleStaticTacticalTabClick = (definition: StaticTacticalTabDefinition): void => {
    routeCostTabActive = false;
    activeStaticTacticalTab = definition;
    setRouteCostOverlayActive(state, false);
    setSimulationLayerMode(state, definition.mode);
    dangerConeControls.remove();
    renderStaticTacticalInspector();
    syncInspectorUi();
    onChanged();
  };
  const handleOtherTabClick = (): void => {
    routeCostTabActive = false;
    activeStaticTacticalTab = null;
    setRouteCostOverlayActive(state, false);
    syncInspectorUi();
    window.requestAnimationFrame(mountDangerConeControls);
    onChanged();
  };
  const handleModeClick = (): void => {
    routeCostTabActive = false;
    activeStaticTacticalTab = null;
    setRouteCostOverlayActive(state, false);
    syncInspectorUi();
    window.requestAnimationFrame(mountDangerConeControls);
    onChanged();
  };

  routeCostTab?.addEventListener('click', handleRouteCostTabClick);
  const staticTabHandlers = new Map<StaticTacticalPositionKind, () => void>();
  for (const definition of STATIC_TACTICAL_TABS) {
    const handler = () => handleStaticTacticalTabClick(definition);
    staticTabHandlers.set(definition.kind, handler);
    staticTacticalTabButtons.get(definition.kind)?.addEventListener('click', handler);
  }
  originalTabButtons.forEach((button) => button.addEventListener('click', handleOtherTabClick));
  modeButtons.forEach((button) => button.addEventListener('click', handleModeClick));
  const unsubscribeStatic = staticService.subscribe(() => {
    if (!activeStaticTacticalTab) return;
    renderStaticTacticalInspector();
    onChanged();
  });

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
      syncInspectorUi();
      renderStaticTacticalInspector();
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
    unsubscribeStatic();
    if (scheduledFrame !== 0) window.cancelAnimationFrame(scheduledFrame);
    setRouteCostOverlayActive(state, false);
    dangerConeToggle.removeEventListener('click', handleDangerConeToggle);
    dangerConeControls.remove();
    routeCostTab?.removeEventListener('click', handleRouteCostTabClick);
    for (const definition of STATIC_TACTICAL_TABS) {
      const button = staticTacticalTabButtons.get(definition.kind);
      const handler = staticTabHandlers.get(definition.kind);
      if (button && handler) button.removeEventListener('click', handler);
      button?.remove();
    }
    originalTabButtons.forEach((button) => button.removeEventListener('click', handleOtherTabClick));
    modeButtons.forEach((button) => button.removeEventListener('click', handleModeClick));
    staticTacticalInspectorPanel?.remove();
    routeCostInspectorPanel?.remove();
    routeCostTab?.remove();
    style.remove();
    teardownCellInspector();
    teardownSearch();
    teardownSettings();
    teardownTab();
    teardownBase();
  };
}

function staticLayerTitle(kind: StaticTacticalPositionKind): string {
  if (kind === 'observation') return 'Наблюдательные позиции';
  if (kind === 'defense') return 'Оборонительные позиции';
  return 'Огневые позиции';
}

function staticStatusLabel(status: ReturnType<ReturnType<typeof getStaticTacticalPositionService>['getDiagnostics']>['status']): string {
  if (status === 'ready') return 'готово';
  if (status === 'queued') return 'в очереди';
  if (status === 'calculating') return 'рассчитывается';
  if (status === 'stale') return 'устарело, ожидается новый расчёт';
  if (status === 'failed') return 'ошибка';
  if (status === 'destroyed') return 'сервис остановлен';
  return 'ожидание';
}

function candidateCount(
  basis: NonNullable<ReturnType<ReturnType<typeof getStaticTacticalPositionService>['readAnyReady']>>,
  kind: StaticTacticalPositionKind,
): number {
  if (kind === 'observation') return basis.candidateIndex.observation.cellIndices.length;
  if (kind === 'defense') return basis.candidateIndex.defense.cellIndices.length;
  return basis.candidateIndex.firing.cellIndices.length;
}
