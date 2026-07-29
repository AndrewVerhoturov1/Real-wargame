import { setFireAllowed } from '../core/combat/CombatRules';
import { selectUnit } from '../core/simulation/SimulationState';
import {
  buildCombatLabBuiltInExperiment,
  listCombatLabScenarioDefinitions,
  parseCombatLabExperiment,
  serializeCombatLabExperiment,
  validateCombatLabExperiment,
  type CombatLabBatchResultV1,
  type CombatLabExperimentIssueV1,
  type CombatLabExperimentV1,
  type CombatLabScenarioRuntimeSnapshotV1,
} from '../core/testing/combat-lab';
import type { GameApplicationContext, GameApplicationExtension } from '../game/GameApplicationTypes';
import { CombatLabRenderer } from './rendering/CombatLabRenderer';
import {
  CombatLabExperimentDraft,
  CombatLabMapAuthoringController,
  CombatLabScenarioEditorPanel,
  CombatLabScenePanel,
  type CombatLabMapInteractionModeV1,
  type CombatLabSelectedStepV1,
} from './scenario-editor';
import { CombatLabBatchClient } from './runtime/CombatLabBatchClient';
import { CombatLabExperimentVisualController } from './runtime/CombatLabExperimentVisualController';
import { asCombatLabExperimentVisualSnapshot } from './runtime/CombatLabExperimentRunState';
import { replayCombatLabRepresentativeRun } from './runtime/CombatLabRepresentativeRunReplay';
import type { CombatLabVisualSession } from './runtime/CombatLabVisualSession';
import { CombatLabBatchPanel } from './ui/CombatLabBatchPanel';
import { CombatLabBatchResultsView } from './ui/CombatLabBatchResultsView';
import { CombatLabExperimentRunToolbar } from './ui/CombatLabExperimentRunToolbar';
import { combatLabMetricLabelRu } from './ui/CombatLabMetricLabels';
import { CombatLabScenarioRuntimeStatus } from './ui/CombatLabScenarioRuntimeStatus';
import { CombatLabShell, createCombatLabLayout } from './ui/CombatLabShell';

type CombatLabDockTab = 'stand' | 'metrics' | 'log';
type CombatLabStandView = 'scene' | 'program';
type CombatLabMetricsView = 'current' | 'batch';
type ExperimentChangeSource = 'editor' | 'external';

interface DockLayout {
  readonly root: HTMLElement;
  readonly status: HTMLElement;
  readonly toggle: HTMLButtonElement;
  readonly tabButtons: ReadonlyMap<CombatLabDockTab, HTMLButtonElement>;
  readonly tabPanels: ReadonlyMap<CombatLabDockTab, HTMLElement>;
  readonly standButtons: ReadonlyMap<CombatLabStandView, HTMLButtonElement>;
  readonly standPanels: ReadonlyMap<CombatLabStandView, HTMLElement>;
  readonly metricsButtons: ReadonlyMap<CombatLabMetricsView, HTMLButtonElement>;
  readonly metricsPanels: ReadonlyMap<CombatLabMetricsView, HTMLElement>;
  readonly toolbarHost: HTMLElement;
  readonly runtimeStatusHost: HTMLElement;
  readonly templateSelect: HTMLSelectElement;
  readonly templateLoadButton: HTMLButtonElement;
  readonly validationHost: HTMLElement;
  readonly scenePanelHost: HTMLElement;
  readonly programHost: HTMLElement;
  readonly mapModeStatus: HTMLElement;
  readonly manualHost: HTMLElement;
  readonly currentMetricsHost: HTMLElement;
  readonly batchPanelHost: HTMLElement;
  readonly batchResultsHost: HTMLElement;
  readonly logHost: HTMLElement;
}

interface SharedSimulationControls {
  sync(): void;
  destroy(): void;
}

interface DisposableView {
  destroy(): void;
}

interface BoardCanvasInternals {
  readonly app: { readonly canvas: HTMLCanvasElement };
}

export class CombatLabExtension implements GameApplicationExtension {
  private readonly layout: DockLayout;
  private readonly renderer: CombatLabRenderer;
  private readonly legacyShell: CombatLabShell;
  private readonly draft: CombatLabExperimentDraft;
  private readonly visualController: CombatLabExperimentVisualController;
  private readonly batchClient: CombatLabBatchClient;
  private readonly scenePanel: CombatLabScenePanel;
  private readonly editorPanel: CombatLabScenarioEditorPanel;
  private readonly runToolbar: CombatLabExperimentRunToolbar;
  private readonly runtimeStatus: CombatLabScenarioRuntimeStatus;
  private readonly batchPanel: CombatLabBatchPanel;
  private readonly batchResults: CombatLabBatchResultsView;
  private readonly sharedSimulationControls: SharedSimulationControls;
  private readonly currentMetrics: DisposableView;
  private readonly removeMapInputGuard: () => void;
  private readonly listeners: Array<readonly [EventTarget, string, EventListener]> = [];
  private mapAuthoringController: CombatLabMapAuthoringController | null = null;
  private validationIssues: readonly CombatLabExperimentIssueV1[];
  private runtimeSnapshot: CombatLabScenarioRuntimeSnapshotV1 | null = null;
  private latestBatchResult: CombatLabBatchResultV1 | null = null;
  private collapsed = false;
  private destroyed = false;

  private constructor(
    private readonly root: HTMLElement,
    private readonly session: CombatLabVisualSession,
    private readonly context: GameApplicationContext,
  ) {
    this.layout = createCombatLabDockLayout(root);
    const initialExperiment = buildCombatLabBuiltInExperiment(session.definition.scenarioId, session.seed);
    this.draft = new CombatLabExperimentDraft(initialExperiment);
    this.validationIssues = validateCombatLabExperiment(initialExperiment);
    this.batchClient = new CombatLabBatchClient();

    this.renderer = CombatLabRenderer.create(context, session, this.handleFrame);
    this.visualController = CombatLabExperimentVisualController.create({
      session,
      getExperiment: () => this.draft.getExperiment(),
      onRuntimeChanged: this.handleRuntimeChanged,
    });

    const legacyRoot = node('div', 'combat-lab-legacy-manual-root');
    const legacyLayout = createCombatLabLayout(legacyRoot);
    this.legacyShell = new CombatLabShell(legacyLayout, session, this.renderer);
    legacyLayout.top.replaceChildren();
    this.layout.manualHost.append(legacyLayout.left, legacyLayout.right);
    this.layout.logHost.append(...Array.from(legacyLayout.bottom.childNodes));
    this.currentMetrics = installLegacyMetricsView(legacyLayout.right, this.layout.currentMetricsHost);

    this.scenePanel = new CombatLabScenePanel({
      state: session.state,
      draft: this.draft,
      host: this.layout.scenePanelHost,
      getSelectedUnitId: () => session.state.selectedUnitId,
      onExperimentChanged: (experiment) => this.handleExperimentChanged(experiment, 'external'),
      fileCodec: {
        serialize: serializeCombatLabExperiment,
        parse: parseCombatLabExperiment,
      },
    });

    this.editorPanel = CombatLabScenarioEditorPanel.create({
      host: this.layout.programHost,
      draft: this.draft,
      onExperimentChanged: (experiment) => this.handleExperimentChanged(experiment, 'editor'),
      onRequestMapPick: (request) => this.mapAuthoringController?.requestPick(request),
      onSelectRole: (roleId) => this.selectRoleUnit(roleId),
      onMapModeChanged: () => {
        this.mapAuthoringController?.syncMode();
        this.updateInteractionState();
      },
      onSelectionChanged: (selection) => this.handleEditorSelection(selection),
      isMutationAllowed: () => !this.isStructuralEditingLocked(),
    });

    this.runToolbar = CombatLabExperimentRunToolbar.create({
      host: this.layout.toolbarHost,
      controller: this.visualController,
      getValidationIssues: () => this.validationIssues,
      onRequestBatch: () => {
        this.activateTab('metrics');
        this.activateMetricsView('batch');
      },
    });
    this.runtimeStatus = CombatLabScenarioRuntimeStatus.create({ host: this.layout.runtimeStatusHost });

    this.batchResults = new CombatLabBatchResultsView({
      host: this.layout.batchResultsHost,
      onReplayRepresentative: (representative) => {
        replayCombatLabRepresentativeRun(this.visualController, representative);
        this.activateTab('stand');
        this.activateStandView('program');
      },
    });
    this.batchResults.clear();
    this.batchPanel = new CombatLabBatchPanel({
      host: this.layout.batchPanelHost,
      client: this.batchClient,
      getExperiment: () => this.draft.getExperiment(),
      getValidationIssues: () => this.validationIssues,
      onResult: (result) => {
        if (this.destroyed) return;
        this.latestBatchResult = result;
        this.batchResults.render(result);
        this.activateTab('metrics');
        this.activateMetricsView('batch');
      },
    });

    this.removeMapInputGuard = installMapInputGuard(context, () => this.isStructuralEditingLocked());
    this.mapAuthoringController = CombatLabMapAuthoringController.create({
      context,
      state: session.state,
      draft: this.draft,
      getMode: () => this.effectiveMapMode(),
      getSelectedActorRoleId: () => this.editorPanel.getSelectedActorRoleId(),
      onExperimentChanged: (experiment) => this.handleExperimentChanged(experiment, 'external'),
      onMessage: (messageRu, error) => this.showAuthoringMessage(messageRu, error),
      onSelectHelperRole: (roleId) => this.selectRoleUnit(roleId),
    });

    this.sharedSimulationControls = installSharedSimulationControls(
      this.visualController,
      session,
      () => !this.hasValidationErrors(),
      context.forceRender,
    );

    for (const definition of listCombatLabScenarioDefinitions()) {
      this.layout.templateSelect.append(option(definition.scenarioId, definition.titleRu));
    }
    this.layout.templateSelect.value = initialExperiment.baseScenarioId ?? '';
    this.listen(this.layout.templateLoadButton, 'click', this.handleTemplateLoad);
    this.listen(this.layout.toggle, 'click', this.handleToggle);
    for (const [tab, button] of this.layout.tabButtons) this.listen(button, 'click', () => this.activateTab(tab));
    for (const [view, button] of this.layout.standButtons) this.listen(button, 'click', () => this.activateStandView(view));
    for (const [view, button] of this.layout.metricsButtons) this.listen(button, 'click', () => this.activateMetricsView(view));
    this.listen(this.root, 'combat-lab:activate-tab', this.handleTabRequest as EventListener);
    this.listen(this.root, 'combat-lab:toggle-pause', this.handleTogglePauseRequest);
    this.listen(this.root, 'combat-lab:set-paused', this.handleSetPausedRequest as EventListener);

    this.root.dataset.combatLabExtension = 'active';
    document.body.classList.add('combat-lab-dock-open');
    document.body.classList.remove('combat-lab-dock-collapsed');
    this.activateTab('stand');
    this.activateStandView('scene');
    this.activateMetricsView('current');
    this.renderer.setAuthoredExperiment(initialExperiment);
    this.handleEditorSelection(this.editorPanel.getSelectedStep());
    this.renderValidation();
    this.handleRuntimeChanged(this.visualController.getSnapshot());
    context.forceRender();
  }

  static create(root: HTMLElement, session: CombatLabVisualSession, context: GameApplicationContext): CombatLabExtension {
    return new CombatLabExtension(root, session, context);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const [target, type, listener] of this.listeners) target.removeEventListener(type, listener);
    this.listeners.length = 0;
    this.batchPanel.destroy();
    this.batchResults.destroy();
    this.runToolbar.destroy();
    this.runtimeStatus.destroy();
    this.scenePanel.destroy();
    this.editorPanel.destroy();
    this.mapAuthoringController?.destroy();
    this.mapAuthoringController = null;
    this.removeMapInputGuard();
    this.visualController.destroy();
    this.batchClient.destroy();
    this.currentMetrics.destroy();
    this.sharedSimulationControls.destroy();
    this.renderer.clearAuthoringOverlay();
    this.renderer.destroy();
    this.root.replaceChildren();
    delete this.root.dataset.combatLabExtension;
    document.body.classList.remove('combat-lab-dock-open', 'combat-lab-dock-collapsed');
  }

  private readonly handleRuntimeChanged = (snapshot: CombatLabScenarioRuntimeSnapshotV1): void => {
    if (this.destroyed) return;
    this.runtimeSnapshot = snapshot;
    this.runToolbar?.refresh(snapshot);
    this.runtimeStatus?.refresh(snapshot);
    this.editorPanel?.setRuntimeSnapshot(snapshot);
    const activeStep = snapshot.steps.find((step) => (
      step.state === 'running' || step.state === 'waiting' || step.state === 'paused_at_breakpoint'
    ));
    this.renderer?.setAuthoringSelection(activeStep
      ? { trackId: activeStep.trackId, stepId: activeStep.stepId }
      : this.editorPanel?.getSelectedStep() ?? null);
    this.updateInteractionState();
    this.updateCompactStatus();
    this.legacyShell?.refreshLive(true);
    this.sharedSimulationControls?.sync();
    this.context.forceRender();
  };

  private readonly handleFrame = (): void => {
    if (this.destroyed) return;
    setFireAllowed(this.session.state, true);
    this.legacyShell?.refreshLive();
    this.updateCompactStatus();
    this.sharedSimulationControls?.sync();
    syncGamePauseControl(this.session);
  };

  private handleExperimentChanged(experiment: CombatLabExperimentV1, source: ExperimentChangeSource): void {
    if (this.destroyed) return;
    if (source === 'external') this.editorPanel.acceptExternalExperiment(experiment);
    const current = this.draft.getExperiment();
    this.validationIssues = validateCombatLabExperiment(current);
    this.batchClient.cancel();
    this.latestBatchResult = null;
    this.batchResults.clear();
    this.scenePanel.refresh();
    this.batchPanel.refresh();
    this.layout.templateSelect.value = current.baseScenarioId ?? '';
    this.renderer.setAuthoredExperiment(current);
    this.renderValidation();
    this.visualController.reset(current.defaults.seed);
    this.mapAuthoringController?.syncMode();
    this.updateInteractionState();
  }

  private readonly handleTemplateLoad = (): void => {
    if (this.isStructuralEditingLocked()) {
      this.showAuthoringMessage('Сначала остановите или сбросьте текущий визуальный прогон.', true);
      return;
    }
    const definition = listCombatLabScenarioDefinitions()
      .find((candidate) => candidate.scenarioId === this.layout.templateSelect.value);
    if (!definition) return;
    const experiment = buildCombatLabBuiltInExperiment(definition.scenarioId, definition.defaultSeed);
    this.handleExperimentChanged(experiment, 'external');
    this.showAuthoringMessage(`Шаблон «${definition.titleRu}» загружен.`, false);
  };

  private handleEditorSelection(selection: CombatLabSelectedStepV1 | null): void {
    if (this.destroyed) return;
    if (!this.isStructuralEditingLocked()) this.renderer.setAuthoringSelection(selection);
  }

  private selectRoleUnit(roleId: string): void {
    const role = this.draft.getExperiment().roles.find((candidate) => candidate.roleId === roleId);
    if (!role) return;
    selectUnit(this.session.state, role.unitId);
    this.context.forceRender();
  }

  private effectiveMapMode(): CombatLabMapInteractionModeV1 {
    return this.isStructuralEditingLocked() ? 'manual_control' : this.editorPanel.getMapMode();
  }

  private isStructuralEditingLocked(): boolean {
    const snapshot = this.runtimeSnapshot;
    if (!snapshot) return false;
    const visual = asCombatLabExperimentVisualSnapshot(snapshot);
    const status = visual?.visualStatus ?? snapshot.status;
    return status === 'running' || status === 'paused';
  }

  private hasValidationErrors(): boolean {
    return this.validationIssues.some((issue) => issue.severity === 'error');
  }

  private updateInteractionState(): void {
    const locked = this.isStructuralEditingLocked();
    const manualMode = this.editorPanel?.getMapMode() === 'manual_control';
    this.layout.scenePanelHost.inert = locked;
    this.layout.programHost.inert = locked;
    this.layout.manualHost.inert = locked || !manualMode;
    this.layout.scenePanelHost.setAttribute('aria-disabled', String(locked));
    this.layout.programHost.setAttribute('aria-disabled', String(locked));
    this.layout.manualHost.setAttribute('aria-disabled', String(locked || !manualMode));
    this.layout.mapModeStatus.textContent = locked
      ? 'Карта заблокирована до остановки или сброса прогона.'
      : manualMode
        ? 'Режим карты: ручное управление.'
        : 'Режим карты: редактор сценария.';
    this.mapAuthoringController?.syncMode();
  }

  private renderValidation(): void {
    const errors = this.validationIssues.filter((issue) => issue.severity === 'error');
    const warnings = this.validationIssues.filter((issue) => issue.severity === 'warning');
    const summary = node(
      'div',
      `combat-lab-editor-status${errors.length > 0 ? ' is-error' : ''}`,
      errors.length > 0
        ? `Запуск заблокирован: ошибок ${errors.length}, предупреждений ${warnings.length}.`
        : `Проверка пройдена: предупреждений ${warnings.length}.`,
    );
    const details = errors.length + warnings.length > 0 ? document.createElement('details') : null;
    if (details) {
      details.className = 'combat-lab-details';
      details.append(node('summary', '', 'Замечания проверки'));
      for (const issue of this.validationIssues.slice(0, 12)) {
        details.append(node('div', `combat-lab-journal-entry${issue.severity === 'error' ? ' is-error' : ''}`, `${issue.messageRu} · ${issue.path}`));
      }
    }
    this.layout.validationHost.replaceChildren(summary, ...(details ? [details] : []));
  }

  private showAuthoringMessage(messageRu: string, error: boolean): void {
    const entry = node('div', `combat-lab-journal-entry${error ? ' is-error' : ''}`, messageRu);
    this.layout.logHost.prepend(entry);
  }

  private activateTab(tab: CombatLabDockTab): void {
    activateChoice(tab, this.layout.tabButtons, this.layout.tabPanels);
  }

  private activateStandView(view: CombatLabStandView): void {
    activateChoice(view, this.layout.standButtons, this.layout.standPanels);
  }

  private activateMetricsView(view: CombatLabMetricsView): void {
    activateChoice(view, this.layout.metricsButtons, this.layout.metricsPanels);
  }

  private updateCompactStatus(): void {
    const snapshot = this.runtimeSnapshot;
    if (!snapshot) return;
    const visual = asCombatLabExperimentVisualSnapshot(snapshot);
    const status = visual?.visualStatus ?? snapshot.status;
    this.layout.status.textContent = `${snapshot.simulatedSeconds.toFixed(1)} с · ${status} · ×${this.session.getSpeed()}`;
  }

  private listen(target: EventTarget, type: string, callback: EventListenerOrEventListenerObject | (() => void)): void {
    const listener: EventListener = typeof callback === 'function'
      ? (event) => (callback as (event: Event) => void)(event)
      : (event) => callback.handleEvent(event);
    target.addEventListener(type, listener);
    this.listeners.push([target, type, listener]);
  }

  private readonly handleToggle = (): void => {
    this.collapsed = !this.collapsed;
    this.layout.root.classList.toggle('collapsed', this.collapsed);
    this.layout.toggle.textContent = this.collapsed ? 'Полигон ›' : 'Свернуть';
    this.layout.toggle.setAttribute('aria-expanded', String(!this.collapsed));
    document.body.classList.toggle('combat-lab-dock-collapsed', this.collapsed);
    document.body.classList.toggle('combat-lab-dock-open', !this.collapsed);
    window.requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
  };

  private readonly handleTabRequest = (event: Event): void => {
    const tab = (event as CustomEvent<CombatLabDockTab>).detail;
    if (this.layout.tabPanels.has(tab)) this.activateTab(tab);
  };

  private readonly handleTogglePauseRequest = (): void => {
    if (this.session.isPaused()) {
      if (!this.hasValidationErrors()) this.visualController.start();
    } else {
      this.visualController.pause();
    }
  };

  private readonly handleSetPausedRequest = (event: Event): void => {
    const paused = Boolean((event as CustomEvent<boolean>).detail);
    if (paused) this.visualController.pause();
    else if (!this.hasValidationErrors()) this.visualController.start();
  };
}

function createCombatLabDockLayout(host: HTMLElement): DockLayout {
  host.replaceChildren();
  const dock = node('section', 'combat-lab-dock combat-lab-drawer');
  dock.setAttribute('aria-label', 'Испытательный полигон');
  const header = node('header', 'combat-lab-dock-header');
  const brand = node('div', 'combat-lab-dock-brand');
  brand.append(node('strong', '', 'Испытательный полигон'), node('span', '', 'Stage 10 · редактор и серии прогонов'));
  const status = node('span', 'combat-lab-dock-status');
  const toggle = createToggle();
  header.append(brand, status, toggle);

  const tabButtons = new Map<CombatLabDockTab, HTMLButtonElement>();
  const tabPanels = new Map<CombatLabDockTab, HTMLElement>();
  const tabList = choiceButtons<CombatLabDockTab>([
    ['stand', 'Стенд'], ['metrics', 'Метрики'], ['log', 'Журнал'],
  ], tabButtons, 'combat-lab-tab-list');
  const tabPanelHost = node('div', 'combat-lab-tab-panels');
  for (const tab of ['stand', 'metrics', 'log'] as const) {
    const panel = node('section', `combat-lab-tab-panel combat-lab-${tab}-panel`);
    panel.dataset.combatLabTabPanel = tab;
    panel.setAttribute('role', 'tabpanel');
    tabPanels.set(tab, panel);
    tabPanelHost.append(panel);
  }

  const toolbarHost = node('div', 'combat-lab-stage10-toolbar-host');
  const runtimeStatusHost = node('div', 'combat-lab-stage10-runtime-status-host');
  const standButtons = new Map<CombatLabStandView, HTMLButtonElement>();
  const standPanels = new Map<CombatLabStandView, HTMLElement>();
  const standSwitch = choiceButtons<CombatLabStandView>([
    ['scene', 'Сцена'], ['program', 'Программа'],
  ], standButtons, 'combat-lab-subtab-list');
  const scenePanel = node('section', 'combat-lab-subtab-panel combat-lab-stage10-scene');
  const programPanel = node('section', 'combat-lab-subtab-panel combat-lab-stage10-program');
  standPanels.set('scene', scenePanel);
  standPanels.set('program', programPanel);

  const templatePanel = node('section', 'combat-lab-panel combat-lab-template-panel');
  templatePanel.append(node('h2', 'combat-lab-section-title', 'Шаблон стенда'));
  const templateSelect = document.createElement('select');
  templateSelect.setAttribute('aria-label', 'Встроенный шаблон эксперимента');
  const templateLoadButton = createButton('Загрузить шаблон', 'primary');
  templatePanel.append(field('Шаблон', templateSelect), templateLoadButton);
  const validationHost = node('div', 'combat-lab-stage10-validation-host');
  const scenePanelHost = node('div', 'combat-lab-stage10-scene-host');
  const mapModeStatus = node('div', 'combat-lab-editor-status');
  const manualDetails = document.createElement('details');
  manualDetails.className = 'combat-lab-details combat-lab-manual-controls';
  manualDetails.append(node('summary', '', 'Ручные действия и диагностика'));
  const manualHost = node('div', 'combat-lab-stage10-manual-host');
  manualDetails.append(manualHost);
  scenePanel.append(templatePanel, validationHost, scenePanelHost, mapModeStatus, manualDetails);
  const programHost = node('div', 'combat-lab-stage10-program-host');
  programPanel.append(programHost);
  tabPanels.get('stand')!.append(toolbarHost, runtimeStatusHost, standSwitch, scenePanel, programPanel);

  const metricsButtons = new Map<CombatLabMetricsView, HTMLButtonElement>();
  const metricsPanels = new Map<CombatLabMetricsView, HTMLElement>();
  const metricsSwitch = choiceButtons<CombatLabMetricsView>([
    ['current', 'Текущий прогон'], ['batch', 'Серия прогонов'],
  ], metricsButtons, 'combat-lab-subtab-list');
  const currentPanel = node('section', 'combat-lab-subtab-panel combat-lab-current-metrics');
  const batchPanel = node('section', 'combat-lab-subtab-panel combat-lab-batch-metrics');
  metricsPanels.set('current', currentPanel);
  metricsPanels.set('batch', batchPanel);
  const currentMetricsHost = node('div', 'combat-lab-stage10-current-metrics-host');
  const batchPanelHost = node('div', 'combat-lab-stage10-batch-panel-host');
  const batchResultsHost = node('div', 'combat-lab-stage10-batch-results-host');
  currentPanel.append(currentMetricsHost);
  batchPanel.append(batchPanelHost, batchResultsHost);
  tabPanels.get('metrics')!.append(metricsSwitch, currentPanel, batchPanel);

  const logHost = node('div', 'combat-lab-stage10-log-host');
  tabPanels.get('log')!.classList.add('combat-lab-log-panel');
  tabPanels.get('log')!.append(logHost);

  dock.append(header, tabList, tabPanelHost);
  host.append(dock);
  return {
    root: dock,
    status,
    toggle,
    tabButtons,
    tabPanels,
    standButtons,
    standPanels,
    metricsButtons,
    metricsPanels,
    toolbarHost,
    runtimeStatusHost,
    templateSelect,
    templateLoadButton,
    validationHost,
    scenePanelHost,
    programHost,
    mapModeStatus,
    manualHost,
    currentMetricsHost,
    batchPanelHost,
    batchResultsHost,
    logHost,
  };
}

function installLegacyMetricsView(source: HTMLElement, host: HTMLElement): DisposableView {
  const diagnostics = source.querySelector<HTMLElement>('.combat-lab-diagnostics');
  const title = source.querySelector<HTMLElement>('.combat-lab-section-title:last-of-type');
  if (!diagnostics) {
    host.append(node('div', 'combat-lab-empty-tab', 'Диагностика появится после запуска стенда.'));
    return { destroy: () => host.replaceChildren() };
  }
  title?.remove();
  const grid = node('div', 'combat-lab-metric-grid');
  const details = document.createElement('details');
  details.className = 'combat-lab-details combat-lab-raw-diagnostics';
  details.append(node('summary', '', 'Полная диагностика'), diagnostics);
  host.append(grid, details);
  const render = () => renderMetricCards(grid, diagnostics.textContent ?? '');
  const observer = new MutationObserver(render);
  observer.observe(diagnostics, { childList: true, characterData: true, subtree: true });
  render();
  return {
    destroy(): void {
      observer.disconnect();
      host.replaceChildren();
    },
  };
}

function installMapInputGuard(context: GameApplicationContext, isLocked: () => boolean): () => void {
  const internals = context.board as unknown as BoardCanvasInternals;
  const canvas = internals.app?.canvas;
  if (!canvas) return () => undefined;
  const block = (event: Event): void => {
    if (!isLocked()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  for (const type of ['contextmenu', 'pointerdown', 'pointerup'] as const) canvas.addEventListener(type, block, true);
  return () => {
    for (const type of ['contextmenu', 'pointerdown', 'pointerup'] as const) canvas.removeEventListener(type, block, true);
  };
}

function installSharedSimulationControls(
  controller: CombatLabExperimentVisualController,
  session: CombatLabVisualSession,
  canRun: () => boolean,
  forceRender: () => void,
): SharedSimulationControls {
  const pauseButton = document.querySelector<HTMLButtonElement>('.simulation-controls [data-action="pause"]');
  const stepButton = document.querySelector<HTMLButtonElement>('.simulation-controls [data-action="step"]');
  const speedButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('.unit-bar-speed-group [data-speed]'));
  const legacyFireButton = document.querySelector<HTMLButtonElement>('.simulation-controls [data-action="fire-contact"]');
  const firePermissionButton = document.querySelector<HTMLButtonElement>('.simulation-controls [data-action="toggle-fire-permission"]');
  const originalPauseHandler = pauseButton?.onclick ?? null;
  const originalStepHandler = stepButton?.onclick ?? null;
  const originalSpeedHandlers = speedButtons.map((button) => button.onclick);
  const originalLegacyFireState = legacyFireButton ? { hidden: legacyFireButton.hidden, disabled: legacyFireButton.disabled } : null;
  const originalFirePermissionState = firePermissionButton ? { hidden: firePermissionButton.hidden, disabled: firePermissionButton.disabled } : null;

  const sync = (): void => {
    keepProductionTickerPaused(session);
    setFireAllowed(session.state, true);
    if (pauseButton) {
      pauseButton.textContent = session.isPaused() ? 'Продолжить' : 'Пауза';
      pauseButton.classList.toggle('active', session.isPaused());
      pauseButton.setAttribute('aria-pressed', String(session.isPaused()));
    }
    for (const button of speedButtons) {
      const active = Number(button.dataset.speed) === controller.getSpeed();
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    }
  };
  if (pauseButton) pauseButton.onclick = () => {
    if (session.isPaused()) {
      if (canRun()) controller.start();
    } else controller.pause();
    sync();
    forceRender();
  };
  if (stepButton) stepButton.onclick = () => {
    if (canRun()) controller.stepOnce();
    sync();
    forceRender();
  };
  speedButtons.forEach((button) => {
    button.onclick = () => {
      controller.setSpeed(Number(button.dataset.speed));
      sync();
    };
  });
  for (const button of [legacyFireButton, firePermissionButton]) {
    if (!button) continue;
    button.hidden = true;
    button.disabled = true;
  }
  sync();
  return {
    sync,
    destroy(): void {
      if (pauseButton) pauseButton.onclick = originalPauseHandler;
      if (stepButton) stepButton.onclick = originalStepHandler;
      speedButtons.forEach((button, index) => { button.onclick = originalSpeedHandlers[index] ?? null; });
      if (legacyFireButton && originalLegacyFireState) {
        legacyFireButton.hidden = originalLegacyFireState.hidden;
        legacyFireButton.disabled = originalLegacyFireState.disabled;
      }
      if (firePermissionButton && originalFirePermissionState) {
        firePermissionButton.hidden = originalFirePermissionState.hidden;
        firePermissionButton.disabled = originalFirePermissionState.disabled;
      }
    },
  };
}

function renderMetricCards(host: HTMLElement, json: string): void {
  let metrics: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(json) as { metrics?: Record<string, unknown> };
    metrics = parsed.metrics ?? {};
  } catch {
    return;
  }
  const entries = Object.entries(metrics).slice(0, 20);
  host.replaceChildren(...entries.map(([key, value]) => {
    const card = node('div', 'combat-lab-metric-card');
    card.append(node('span', '', combatLabMetricLabelRu(key)), node('strong', '', formatMetric(value)));
    return card;
  }));
  if (entries.length === 0) host.append(node('div', 'combat-lab-empty-tab', 'Метрики появятся после прогона.'));
}

function activateChoice<T extends string>(
  activeValue: T,
  buttons: ReadonlyMap<T, HTMLButtonElement>,
  panels: ReadonlyMap<T, HTMLElement>,
): void {
  for (const [value, button] of buttons) {
    const active = value === activeValue;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
    button.tabIndex = active ? 0 : -1;
  }
  for (const [value, panel] of panels) panel.hidden = value !== activeValue;
}

function choiceButtons<T extends string>(
  entries: ReadonlyArray<readonly [T, string]>,
  output: Map<T, HTMLButtonElement>,
  className: string,
): HTMLElement {
  const host = node('nav', className);
  host.setAttribute('role', 'tablist');
  for (const [value, label] of entries) {
    const control = createButton(label);
    control.setAttribute('role', 'tab');
    output.set(value, control);
    host.append(control);
  }
  return host;
}

function createToggle(): HTMLButtonElement {
  const toggle = createButton('Свернуть', 'combat-lab-dock-toggle combat-lab-drawer-toggle');
  toggle.setAttribute('aria-expanded', 'true');
  toggle.setAttribute('aria-controls', 'combat-lab-extension-root');
  return toggle;
}

function createButton(label: string, className = ''): HTMLButtonElement {
  const control = document.createElement('button');
  control.type = 'button';
  control.textContent = label;
  if (className) control.className = className;
  return control;
}

function field(label: string, control: HTMLElement): HTMLElement {
  const root = node('label', 'combat-lab-field');
  root.append(node('span', '', label), control);
  return root;
}

function option(value: string, label: string): HTMLOptionElement {
  const result = document.createElement('option');
  result.value = value;
  result.textContent = label;
  return result;
}

function keepProductionTickerPaused(session: CombatLabVisualSession): void {
  (session.state as typeof session.state & { paused?: boolean }).paused = true;
}

function syncGamePauseControl(session: CombatLabVisualSession): void {
  const button = document.querySelector<HTMLButtonElement>('#pause-toggle');
  if (!button) return;
  const paused = session.isPaused();
  const label = paused ? 'Пауза: вкл' : 'Пауза: выкл';
  if (button.textContent !== label) button.textContent = label;
  if (button.getAttribute('aria-pressed') !== String(paused)) button.setAttribute('aria-pressed', String(paused));
  button.classList.toggle('hud-toggle-off', !paused);
}

function formatMetric(value: unknown): string {
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : value.toFixed(3);
  if (typeof value === 'string' || typeof value === 'boolean') return String(value);
  return value == null ? '—' : (JSON.stringify(value) ?? String(value));
}

function node<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}
