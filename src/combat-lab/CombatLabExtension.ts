import { setFireAllowed } from '../core/combat/CombatRules';
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
import { CombatLabShell, createCombatLabLayout, type CombatLabLayoutV1 } from './ui/CombatLabShell';
import {
  isCombatLabWorkspaceTab,
  type CombatLabWorkspaceHosts,
  type CombatLabWorkspaceTab,
} from './ui/CombatLabWorkspaceHosts';
import { CombatLabWorkspaceTabs } from './ui/CombatLabWorkspaceTabs';
import {
  CombatLabWorkspaceServices,
  registerCombatLabWorkspaceServices,
} from './CombatLabWorkspaceServices';

type ExperimentChangeSource = 'editor' | 'external';

interface WorkspaceMountLayout {
  readonly templateSelect: HTMLSelectElement;
  readonly templateLoadButton: HTMLButtonElement;
  readonly validationHost: HTMLElement;
  readonly scenePanelHost: HTMLElement;
  readonly programHost: HTMLElement;
  readonly mapModeStatus: HTMLElement;
  readonly parametersPanelHost: HTMLElement;
  readonly manualHost: HTMLElement;
  readonly runtimeStatusHost: HTMLElement;
  readonly currentMetricsHost: HTMLElement;
  readonly batchPanelHost: HTMLElement;
  readonly batchResultsHost: HTMLElement;
  readonly runtimeJournalHost: HTMLElement;
  readonly authoringLogHost: HTMLElement;
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
  private readonly workspace: CombatLabWorkspaceTabs;
  private readonly layout: WorkspaceMountLayout;
  private readonly renderer: CombatLabRenderer;
  private readonly legacyRoot = node('div', 'combat-lab-legacy-manual-root');
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
  private readonly workspaceServices: CombatLabWorkspaceServices;
  private readonly unregisterWorkspaceServices: () => void;
  private readonly removeSelectionTickerListener: () => void;
  private readonly listeners: Array<readonly [EventTarget, string, EventListener]> = [];
  private mapAuthoringController: CombatLabMapAuthoringController | null = null;
  private validationIssues: readonly CombatLabExperimentIssueV1[];
  private runtimeSnapshot: CombatLabScenarioRuntimeSnapshotV1 | null = null;
  private latestBatchResult: CombatLabBatchResultV1 | null = null;
  private lastJournalIdentity = '';
  private destroyed = false;

  private constructor(
    private readonly root: HTMLElement,
    private readonly session: CombatLabVisualSession,
    private readonly context: GameApplicationContext,
  ) {
    this.workspace = CombatLabWorkspaceTabs.create({ host: root });
    this.layout = createWorkspaceMountLayout(this.workspace.hosts);

    const initialExperiment = buildCombatLabBuiltInExperiment(session.definition.scenarioId, session.seed);
    this.draft = new CombatLabExperimentDraft(initialExperiment);
    this.validationIssues = validateCombatLabExperiment(initialExperiment);
    this.batchClient = new CombatLabBatchClient();
    this.workspaceServices = CombatLabWorkspaceServices.create({
      state: session.state,
      draft: this.draft,
      onExperimentChanged: (experiment) => this.handleExperimentChanged(experiment, 'external'),
      initialMapToolMode: 'program_authoring',
      mapToolEventTarget: window,
      mapToolStatusHost: this.layout.mapModeStatus,
      getMapToolStatusOverride: () => (
        this.isStructuralEditingLocked()
          ? 'Карта заблокирована до остановки или сброса прогона.'
          : null
      ),
    });
    this.unregisterWorkspaceServices = registerCombatLabWorkspaceServices(
      this.workspace.root,
      this.workspaceServices,
    );
    this.removeSelectionTickerListener = context.addTickerListener(
      () => this.workspaceServices.selection.syncFromState(),
    );

    this.renderer = CombatLabRenderer.create(context, session, this.handleFrame);
    this.visualController = CombatLabExperimentVisualController.create({
      session,
      getExperiment: () => this.draft.getExperiment(),
      onRuntimeChanged: this.handleRuntimeChanged,
    });

    const legacyLayout = createCombatLabLayout(this.legacyRoot);
    this.legacyShell = new CombatLabShell(legacyLayout, session, this.renderer);
    legacyLayout.top.replaceChildren();
    this.currentMetrics = installLegacyMetricsView(legacyLayout, this.layout.currentMetricsHost);
    this.layout.manualHost.append(legacyLayout.right);

    this.scenePanel = new CombatLabScenePanel({
      state: session.state,
      draft: this.draft,
      host: this.layout.scenePanelHost,
      parametersHost: this.layout.parametersPanelHost,
      getSelectedUnitId: () => session.state.selectedUnitId,
      onSelectRole: (roleId) => this.selectRoleUnit(roleId),
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
      onMapModeChanged: (mode) => {
        this.workspaceServices.mapTools.setPersistentMode(
          mode === 'manual_control' ? 'manual_control' : 'program_authoring',
        );
        this.mapAuthoringController?.syncMode();
        this.updateInteractionState();
      },
      onSelectionChanged: (selection) => this.handleEditorSelection(selection),
      isMutationAllowed: () => !this.isStructuralEditingLocked(),
    });

    this.runToolbar = CombatLabExperimentRunToolbar.create({
      host: this.workspace.toolbarHost,
      controller: this.visualController,
      getValidationIssues: () => this.validationIssues,
      onRequestBatch: () => this.activateTab('batch'),
    });
    this.runtimeStatus = CombatLabScenarioRuntimeStatus.create({ host: this.layout.runtimeStatusHost });

    this.batchResults = new CombatLabBatchResultsView({
      host: this.layout.batchResultsHost,
      onReplayRepresentative: (representative) => {
        replayCombatLabRepresentativeRun(this.visualController, representative);
        this.activateTab('program');
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
        this.activateTab('batch');
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
    this.listen(this.workspace.toggle, 'click', this.handleToggle);
    this.listen(this.workspace.root, 'combat-lab-workspace-tab-change', this.handleWorkspaceTabChanged as EventListener);
    this.listen(this.root, 'combat-lab:activate-tab', this.handleTabRequest as EventListener);
    this.listen(this.root, 'combat-lab:toggle-pause', this.handleTogglePauseRequest);
    this.listen(this.root, 'combat-lab:set-paused', this.handleSetPausedRequest as EventListener);

    this.root.dataset.combatLabExtension = 'active';
    document.body.classList.add('combat-lab-dock-open');
    document.body.classList.remove('combat-lab-dock-collapsed');
    this.renderer.setAuthoredExperiment(initialExperiment);
    this.handleEditorSelection(this.editorPanel.getSelectedStep());
    this.renderValidation();
    this.handleRuntimeChanged(this.visualController.getSnapshot());
    this.syncVisibleWorkspace();
    context.forceRender();
  }

  static create(root: HTMLElement, session: CombatLabVisualSession, context: GameApplicationContext): CombatLabExtension {
    return new CombatLabExtension(root, session, context);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.teardownFoundationServices();
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
    this.legacyRoot.replaceChildren();
    delete this.root.dataset.combatLabExtension;
    this.workspace.destroy();
    document.body.classList.remove('combat-lab-dock-open', 'combat-lab-dock-collapsed');
  }

  private readonly handleRuntimeChanged = (snapshot: CombatLabScenarioRuntimeSnapshotV1): void => {
    if (this.destroyed) return;
    this.runtimeSnapshot = snapshot;
    this.runToolbar?.refresh(snapshot);
    const activeStep = snapshot.steps.find((step) => (
      step.state === 'running' || step.state === 'waiting' || step.state === 'paused_at_breakpoint'
    ));
    this.renderer?.setAuthoringSelection(activeStep
      ? { trackId: activeStep.trackId, stepId: activeStep.stepId }
      : this.editorPanel?.getSelectedStep() ?? null);
    this.updateInteractionState();
    this.updateCompactStatus();
    this.syncVisibleWorkspace();
    this.sharedSimulationControls?.sync();
    this.context.forceRender();
  };

  private readonly handleFrame = (): void => {
    if (this.destroyed) return;
    setFireAllowed(this.session.state, true);
    if (this.workspace.isActive('metrics')) this.legacyShell?.refreshLive();
    if (this.workspace.isActive('journal')) this.renderRuntimeJournal();
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
    this.workspaceServices.selection.reconcileFromState();
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
    this.workspaceServices.selection.select({
      kind: 'participant',
      roleId: role.roleId,
      unitId: role.unitId,
    });
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
    this.mapAuthoringController?.syncMode();
    this.workspaceServices.mapTools.refreshStatus();
  }

  private teardownFoundationServices(): void {
    runTeardownStep('temporary map transaction', () => this.workspaceServices.mapTools.cancel());
    runTeardownStep('selection ticker', this.removeSelectionTickerListener);
    runTeardownStep('workspace services registry', this.unregisterWorkspaceServices);
    runTeardownStep('workspace services', () => this.workspaceServices.destroy());
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
    this.layout.authoringLogHost.prepend(entry);
  }

  private activateTab(tab: CombatLabWorkspaceTab): void {
    this.workspace.activate(tab);
  }

  private syncVisibleWorkspace(): void {
    if (this.destroyed) return;
    const snapshot = this.runtimeSnapshot;
    if (snapshot && this.workspace.isActive('program')) this.editorPanel?.setRuntimeSnapshot(snapshot);
    if (snapshot && this.workspace.isActive('metrics')) {
      this.runtimeStatus?.refresh(snapshot);
      this.legacyShell?.refreshLive(true);
    }
    if (this.workspace.isActive('batch')) {
      this.batchPanel?.refresh();
      if (this.latestBatchResult) this.batchResults?.render(this.latestBatchResult);
    }
    if (this.workspace.isActive('journal')) this.renderRuntimeJournal();
  }

  private renderRuntimeJournal(): void {
    const snapshot = this.runtimeSnapshot;
    const eventCount = this.session.state.events.length;
    const identity = `${snapshot?.status ?? 'none'}:${snapshot?.activeTrackCount ?? 0}:${snapshot?.completedTrackCount ?? 0}:${eventCount}`;
    if (identity === this.lastJournalIdentity) return;
    this.lastJournalIdentity = identity;
    const entries: HTMLElement[] = [];
    if (snapshot) {
      entries.push(node('div', 'combat-lab-journal-entry', `Статус: ${snapshot.status}. Дорожки: активных ${snapshot.activeTrackCount}, завершено ${snapshot.completedTrackCount}.`));
      const failed = snapshot.steps.filter((step) => step.state === 'failed').slice(0, 6);
      for (const step of failed) entries.push(node('div', 'combat-lab-journal-entry is-error', `${step.reasonRu ?? 'Шаг завершился ошибкой.'} · ${step.trackId}/${step.stepId}`));
    }
    for (const event of this.session.state.events.slice(-12).reverse()) {
      entries.push(node('div', 'combat-lab-journal-entry', `${event.time.toFixed(2)} с · ${event.message}`));
    }
    this.layout.runtimeJournalHost.replaceChildren(...(entries.length > 0 ? entries : [node('div', 'combat-lab-editor-empty', 'Журнал пока пуст.') ]));
  }

  private updateCompactStatus(): void {
    if (!this.runtimeSnapshot) return;
    const visualSnapshot = asCombatLabExperimentVisualSnapshot(this.runtimeSnapshot);
    const statusLabel = visualSnapshot?.visualStatus === 'running'
      ? 'Идёт прогон'
      : visualSnapshot?.visualStatus === 'paused'
        ? 'Пауза'
        : visualSnapshot?.visualStatus === 'stopped'
          ? 'Остановлено'
          : visualSnapshot?.visualStatus === 'completed'
            ? 'Завершено'
            : visualSnapshot?.visualStatus === 'failed'
              ? 'Ошибка'
              : 'Готово';
    const seed = visualSnapshot?.visualSeed ?? this.session.seed;
    this.workspace.setStatus(`${statusLabel} · seed ${seed}`);
  }

  private readonly handleToggle = (): void => {
    document.body.classList.toggle('combat-lab-dock-collapsed', this.workspace.isCollapsed());
    this.context.forceRender();
  };

  private readonly handleWorkspaceTabChanged = (event: CustomEvent<CombatLabWorkspaceTab>): void => {
    if (!isCombatLabWorkspaceTab(event.detail)) return;
    this.syncVisibleWorkspace();
    this.context.forceRender();
  };

  private readonly handleTabRequest = (event: CustomEvent<CombatLabWorkspaceTab>): void => {
    if (!isCombatLabWorkspaceTab(event.detail)) return;
    this.activateTab(event.detail);
  };

  private readonly handleTogglePauseRequest = (): void => {
    if (!this.visualController) return;
    const snapshot = this.visualController.getSnapshot();
    const visual = asCombatLabExperimentVisualSnapshot(snapshot);
    if (visual?.visualStatus === 'running') this.visualController.pause();
    else if (visual?.visualStatus === 'paused') this.visualController.resume();
  };

  private readonly handleSetPausedRequest = (event: CustomEvent<boolean>): void => {
    if (!this.visualController) return;
    const shouldPause = event.detail === true;
    const visual = asCombatLabExperimentVisualSnapshot(this.visualController.getSnapshot());
    if (shouldPause && visual?.visualStatus === 'running') this.visualController.pause();
    if (!shouldPause && visual?.visualStatus === 'paused') this.visualController.resume();
  };

  private listen(target: EventTarget, type: string, listener: EventListenerOrEventListenerObject): void {
    target.addEventListener(type, listener);
    this.listeners.push([target, type, listener as EventListener]);
  }
}

function createWorkspaceMountLayout(hosts: CombatLabWorkspaceHosts): WorkspaceMountLayout {
  const templateSelect = document.createElement('select');
  templateSelect.append(option('', 'Текущий черновик'));
  const templateLoadButton = button('Загрузить шаблон');
  const validationHost = node('div', 'combat-lab-validation-host');
  const scenePanelHost = node('div', 'combat-lab-scene-panel-host');
  hosts.scene.append(
    buildSection('Источник эксперимента', templateSelect, templateLoadButton),
    validationHost,
    scenePanelHost,
  );

  const programHost = node('div', 'combat-lab-program-host');
  const mapModeStatus = node('div', 'combat-lab-map-mode-status');
  mapModeStatus.dataset.combatLabMapModeStatus = 'true';
  hosts.program.append(mapModeStatus, programHost);

  const parametersPanelHost = node('div', 'combat-lab-parameters-panel-host');
  parametersPanelHost.dataset.combatLabParametersHost = 'selected-unit';
  hosts.parameters.append(parametersPanelHost);

  const manualHost = node('div', 'combat-lab-manual-host');
  hosts.manual.append(manualHost);

  const runtimeStatusHost = node('div', 'combat-lab-runtime-status-host');
  const currentMetricsHost = node('div', 'combat-lab-current-metrics-host');
  hosts.metrics.append(runtimeStatusHost, currentMetricsHost);

  const batchPanelHost = node('div', 'combat-lab-batch-panel-host');
  const batchResultsHost = node('div', 'combat-lab-batch-results-host');
  hosts.batch.append(batchPanelHost, batchResultsHost);

  const runtimeJournalHost = node('div', 'combat-lab-runtime-journal-host');
  const authoringLogHost = node('div', 'combat-lab-authoring-log-host');
  hosts.journal.append(
    buildSection('События прогона', runtimeJournalHost),
    buildSection('Сообщения редактора', authoringLogHost),
  );

  return {
    templateSelect,
    templateLoadButton,
    validationHost,
    scenePanelHost,
    programHost,
    mapModeStatus,
    parametersPanelHost,
    manualHost,
    runtimeStatusHost,
    currentMetricsHost,
    batchPanelHost,
    batchResultsHost,
    runtimeJournalHost,
    authoringLogHost,
  };
}

function buildSection(title: string, ...children: HTMLElement[]): HTMLElement {
  const section = node('section', 'combat-lab-panel');
  section.append(node('h3', 'combat-lab-section-title', title), ...children);
  return section;
}

function installSharedSimulationControls(
  controller: CombatLabExperimentVisualController,
  session: CombatLabVisualSession,
  canStart: () => boolean,
  forceRender: () => void,
): SharedSimulationControls {
  const button = document.querySelector<HTMLButtonElement>('#pause-button');
  const listener = () => {
    const snapshot = controller.getSnapshot();
    const visual = asCombatLabExperimentVisualSnapshot(snapshot);
    if (!visual) return;
    if (visual.visualStatus === 'running') controller.pause();
    else if (visual.visualStatus === 'paused') controller.resume();
    else if (canStart()) controller.start();
    forceRender();
  };
  button?.addEventListener('click', listener, true);
  const sync = () => syncGamePauseControl(session, controller.getSnapshot());
  sync();
  return {
    sync,
    destroy: () => button?.removeEventListener('click', listener, true),
  };
}

function syncGamePauseControl(
  session: CombatLabVisualSession,
  snapshot?: CombatLabScenarioRuntimeSnapshotV1 | null,
): void {
  const button = document.querySelector<HTMLButtonElement>('#pause-button');
  if (!button) return;
  const visual = asCombatLabExperimentVisualSnapshot(snapshot ?? null);
  const status = visual?.visualStatus;
  button.disabled = status === 'completed' || status === 'failed' || status === 'stopped';
  button.textContent = status === 'running'
    ? 'Пауза'
    : status === 'paused'
      ? 'Продолжить'
      : session.state.paused
        ? 'Продолжить'
        : 'Пауза';
}

function installLegacyMetricsView(layout: CombatLabLayoutV1, host: HTMLElement): DisposableView {
  const section = node('section', 'combat-lab-panel');
  const heading = node('h3', 'combat-lab-section-title', 'Текущие метрики');
  section.append(heading, layout.metrics);
  host.append(section);
  return {
    destroy: () => section.remove(),
  };
}

function installMapInputGuard(
  context: GameApplicationContext,
  isLocked: () => boolean,
): () => void {
  const canvas = (context.board as unknown as BoardCanvasInternals).app.canvas;
  const block = (event: Event) => {
    if (!isLocked()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  canvas.addEventListener('pointerdown', block, true);
  canvas.addEventListener('pointermove', block, true);
  canvas.addEventListener('pointerup', block, true);
  return () => {
    canvas.removeEventListener('pointerdown', block, true);
    canvas.removeEventListener('pointermove', block, true);
    canvas.removeEventListener('pointerup', block, true);
  };
}

function runTeardownStep(label: string, action: () => void): void {
  try {
    action();
  } catch (error) {
    console.error(`[Combat Lab] teardown failed: ${label}`, error);
  }
}

function button(label: string, className = ''): HTMLButtonElement {
  const control = document.createElement('button');
  control.type = 'button';
  control.textContent = label;
  control.className = className;
  return control;
}

function option(value: string, label: string): HTMLOptionElement {
  const entry = document.createElement('option');
  entry.value = value;
  entry.textContent = label;
  return entry;
}

function node<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = '',
  textContent = '',
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = textContent;
  return element;
}