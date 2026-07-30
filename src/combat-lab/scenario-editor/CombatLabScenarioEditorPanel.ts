import type {
  CombatLabExperimentV1,
  CombatLabScenarioRuntimeSnapshotV1,
} from '../../core/testing/combat-lab/experiment';
import { CombatLabActionDialog } from './CombatLabActionDialog';
import { CombatLabEditorHistory } from './CombatLabEditorHistory';
import type { CombatLabExperimentDraft } from './CombatLabExperimentDraft';
import type { CombatLabMapPickRequestV1 } from './CombatLabMapAuthoringController';
import type {
  CombatLabScenarioEditorCapabilitiesV1,
  CombatLabSelectedStepV1,
} from './CombatLabScenarioEditorTypes';
import { CombatLabTrackList } from './CombatLabTrackList';
import './combat-lab-scenario-editor.css';

export type CombatLabMapInteractionModeV1 = 'scenario_editor' | 'manual_control';

export interface CombatLabScenarioEditorPanelOptions {
  readonly host: HTMLElement;
  readonly draft: CombatLabExperimentDraft;
  readonly onExperimentChanged: (experiment: CombatLabExperimentV1) => void;
  readonly onRequestMapPick: (request: CombatLabMapPickRequestV1) => void;
  readonly onSelectRole: (roleId: string) => void;
  readonly capabilities?: CombatLabScenarioEditorCapabilitiesV1;
  readonly initialMapMode?: CombatLabMapInteractionModeV1;
  readonly onMapModeChanged?: (mode: CombatLabMapInteractionModeV1) => void;
  readonly onSelectionChanged?: (selection: CombatLabSelectedStepV1 | null) => void;
  readonly isMutationAllowed?: () => boolean;
}

export class CombatLabScenarioEditorPanel {
  readonly root = document.createElement('section');
  private readonly status = document.createElement('div');
  private readonly trackHost = document.createElement('div');
  private readonly history: CombatLabEditorHistory;
  private readonly trackList: CombatLabTrackList;
  private actionDialog: CombatLabActionDialog | null = null;
  private runtimeSnapshot: CombatLabScenarioRuntimeSnapshotV1 | null = null;
  private runtimePresentationKey = '';
  private selectedStep: CombatLabSelectedStepV1 | null = null;
  private selectedActorRoleId: string | null = null;
  private mapMode: CombatLabMapInteractionModeV1;
  private destroyed = false;

  private constructor(private readonly options: CombatLabScenarioEditorPanelOptions) {
    this.root.className = 'combat-lab-scenario-editor';
    this.root.setAttribute('aria-label', 'Редактор программы эксперимента');
    this.mapMode = options.initialMapMode ?? 'scenario_editor';
    this.history = new CombatLabEditorHistory(options.draft.getExperiment());
    const toolbar = this.buildToolbar();
    this.status.className = 'combat-lab-editor-status';
    this.status.setAttribute('role', 'status');
    this.trackHost.className = 'combat-lab-editor-track-host';
    this.root.append(toolbar, this.status, this.trackHost);
    options.host.append(this.root);
    this.syncModeButtons();

    this.trackList = new CombatLabTrackList({
      host: this.trackHost,
      draft: options.draft,
      capabilities: options.capabilities,
      getRuntimeSnapshot: () => this.runtimeSnapshot,
      getSelectedStep: () => this.selectedStep,
      onSelectStep: (trackId, stepId) => this.selectStep(trackId, stepId),
      onEditStep: (trackId, stepId, returnFocusTo) => this.openActionDialog(trackId, stepId, returnFocusTo),
      onDraftMutation: (mutation) => this.applyMutation(mutation),
      onError: (messageRu) => this.showStatus(messageRu, true),
    });
    window.addEventListener('keydown', this.handleGlobalKeyDown);
    this.selectInitialStep();
    this.showStatus('Программа готова к редактированию.', false);
  }

  static create(options: CombatLabScenarioEditorPanelOptions): CombatLabScenarioEditorPanel { return new CombatLabScenarioEditorPanel(options); }

  setRuntimeSnapshot(snapshot: CombatLabScenarioRuntimeSnapshotV1 | null): void {
    this.runtimeSnapshot = snapshot;
    const nextKey = buildRuntimePresentationKey(snapshot);
    if (nextKey === this.runtimePresentationKey) return;
    this.runtimePresentationKey = nextKey;
    this.trackList.render();
  }

  selectStep(trackId: string, stepId: string): void {
    const experiment = this.options.draft.getExperiment();
    const track = experiment.tracks.find((candidate) => candidate.trackId === trackId);
    if (!track?.steps.some((step) => step.stepId === stepId)) return;
    this.selectedStep = { trackId, stepId };
    this.selectedActorRoleId = track.actorRoleId;
    this.options.onSelectRole(track.actorRoleId);
    this.publishSelection();
    this.trackList.render();
  }

  getMapMode(): CombatLabMapInteractionModeV1 { return this.mapMode; }
  getSelectedActorRoleId(): string | null { return this.selectedActorRoleId; }
  getSelectedStep(): CombatLabSelectedStepV1 | null { return this.selectedStep ? { ...this.selectedStep } : null; }

  acceptExternalExperiment(experiment: CombatLabExperimentV1, recordHistory = true): void {
    if (this.destroyed) return;
    this.closeActionDialog();
    this.options.draft.replaceExperiment(experiment);
    if (recordHistory) this.history.execute(experiment);
    this.ensureSelectionExists(experiment);
    this.publishSelection();
    this.renderAll();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    window.removeEventListener('keydown', this.handleGlobalKeyDown);
    this.closeActionDialog();
    this.trackList.destroy();
    this.options.onSelectionChanged?.(null);
    this.root.remove();
  }

  private openActionDialog(trackId: string, stepId: string, returnFocusTo: HTMLElement): void {
    if (!this.ensureMutationAllowed()) return;
    this.selectStep(trackId, stepId);
    this.closeActionDialog();
    this.actionDialog = CombatLabActionDialog.open({
      draft: this.options.draft,
      trackId,
      stepId,
      capabilities: this.options.capabilities,
      onDraftMutation: (mutation) => this.applyMutation(mutation),
      onError: (messageRu) => this.showStatus(messageRu, true),
      returnFocusTo,
    });
  }

  private closeActionDialog(): void {
    this.actionDialog?.destroy();
    this.actionDialog = null;
  }

  private buildToolbar(): HTMLElement {
    const toolbar = document.createElement('div');
    toolbar.className = 'combat-lab-editor-toolbar';
    const modeGroup = document.createElement('div');
    modeGroup.className = 'combat-lab-editor-mode-switch';
    modeGroup.setAttribute('role', 'group');
    modeGroup.setAttribute('aria-label', 'Режим правой кнопки карты');
    const scenario = button('Редактор сценария', () => this.setMapMode('scenario_editor'));
    const manual = button('Ручное управление', () => this.setMapMode('manual_control'));
    scenario.dataset.mapMode = 'scenario_editor';
    manual.dataset.mapMode = 'manual_control';
    modeGroup.append(scenario, manual);

    const editGroup = document.createElement('div');
    editGroup.className = 'combat-lab-editor-toolbar-row';
    editGroup.append(
      button('Отменить', () => this.undo(), '', 'Ctrl+Z'),
      button('Повторить', () => this.redo(), '', 'Ctrl+Y'),
      button('Точка на карте', () => {
        if (!this.ensureMutationAllowed()) return;
        this.options.onRequestMapPick({ kind: 'point_marker', suggestedTitleRu: 'Точка' });
      }),
      button('Область на карте', () => {
        if (!this.ensureMutationAllowed()) return;
        this.options.onRequestMapPick({ kind: 'circle_marker', suggestedTitleRu: 'Область', defaultRadiusMetres: 5 });
      }),
    );

    const trackGroup = document.createElement('div');
    trackGroup.className = 'combat-lab-editor-toolbar-row';
    const roleSelect = document.createElement('select');
    roleSelect.setAttribute('aria-label', 'Боец для новой дорожки');
    this.fillRoleSelect(roleSelect);
    const addTrack = button('Создать дорожку', () => {
      if (!this.ensureMutationAllowed()) return;
      const roleId = roleSelect.value;
      if (!roleId) return this.showStatus('Сначала выберите бойца.', true);
      this.applyMutation(() => {
        const trackId = this.options.draft.addTrack(roleId);
        this.selectedActorRoleId = roleId;
        const track = this.options.draft.getExperiment().tracks.find((candidate) => candidate.trackId === trackId);
        const first = track?.steps[0];
        this.selectedStep = first ? { trackId, stepId: first.stepId } : null;
      });
    });
    trackGroup.append(roleSelect, addTrack);
    toolbar.append(modeGroup, editGroup, trackGroup);
    return toolbar;
  }

  private fillRoleSelect(select: HTMLSelectElement): void {
    select.replaceChildren();
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Боец…';
    select.append(placeholder);
    for (const role of this.options.draft.getExperiment().roles) {
      const option = document.createElement('option');
      option.value = role.roleId;
      option.textContent = role.titleRu;
      select.append(option);
    }
  }

  private setMapMode(mode: CombatLabMapInteractionModeV1): void {
    if (this.mapMode === mode) return;
    this.mapMode = mode;
    this.syncModeButtons();
    this.options.onMapModeChanged?.(mode);
    this.showStatus(mode === 'scenario_editor' ? 'Правая кнопка добавляет действия в программу.' : 'Правая кнопка снова отдаёт непосредственные игровые приказы.', false);
  }

  private syncModeButtons(): void {
    for (const control of this.root.querySelectorAll<HTMLButtonElement>('[data-map-mode]')) {
      const active = control.dataset.mapMode === this.mapMode;
      control.classList.toggle('active', active);
      control.setAttribute('aria-pressed', String(active));
    }
  }

  private applyMutation(mutation: () => void): void {
    if (!this.ensureMutationAllowed()) return;
    const before = this.options.draft.getExperiment();
    mutation();
    const next = this.options.draft.getExperiment();
    if (next === before || next.revision === before.revision) return;
    this.history.execute(next);
    this.ensureSelectionExists(next);
    this.publishSelection();
    this.options.onExperimentChanged(next);
    this.renderAll();
    this.showStatus('Изменение сохранено.', false);
  }

  private undo(): void {
    if (!this.ensureMutationAllowed()) return;
    this.closeActionDialog();
    const previous = this.history.undo();
    if (!previous) return this.showStatus('Отменять больше нечего.', false);
    this.options.draft.replaceExperiment(previous);
    this.ensureSelectionExists(previous);
    this.publishSelection();
    this.options.onExperimentChanged(previous);
    this.renderAll();
    this.showStatus('Изменение отменено.', false);
  }

  private redo(): void {
    if (!this.ensureMutationAllowed()) return;
    this.closeActionDialog();
    const next = this.history.redo();
    if (!next) return this.showStatus('Повторять больше нечего.', false);
    this.options.draft.replaceExperiment(next);
    this.ensureSelectionExists(next);
    this.publishSelection();
    this.options.onExperimentChanged(next);
    this.renderAll();
    this.showStatus('Изменение повторено.', false);
  }

  private ensureSelectionExists(experiment: CombatLabExperimentV1): void {
    if (this.selectedStep) {
      const track = experiment.tracks.find((candidate) => candidate.trackId === this.selectedStep?.trackId);
      if (track?.steps.some((step) => step.stepId === this.selectedStep?.stepId)) {
        this.selectedActorRoleId = track.actorRoleId;
        return;
      }
    }
    const firstTrack = experiment.tracks[0];
    const firstStep = firstTrack?.steps[0];
    this.selectedActorRoleId = firstTrack?.actorRoleId ?? experiment.roles[0]?.roleId ?? null;
    this.selectedStep = firstTrack && firstStep ? { trackId: firstTrack.trackId, stepId: firstStep.stepId } : null;
  }

  private selectInitialStep(): void {
    this.ensureSelectionExists(this.options.draft.getExperiment());
    if (this.selectedActorRoleId) this.options.onSelectRole(this.selectedActorRoleId);
    this.publishSelection();
    this.renderAll();
  }

  private renderAll(): void {
    this.trackList.render();
    const roleSelect = this.root.querySelector<HTMLSelectElement>('.combat-lab-editor-toolbar-row select');
    if (roleSelect) this.fillRoleSelect(roleSelect);
    this.syncModeButtons();
  }

  private publishSelection(): void { this.options.onSelectionChanged?.(this.getSelectedStep()); }

  private ensureMutationAllowed(): boolean {
    if (this.options.isMutationAllowed?.() !== false) return true;
    this.showStatus('Сначала остановите или сбросьте текущий визуальный прогон.', true);
    return false;
  }

  private readonly handleGlobalKeyDown = (event: KeyboardEvent): void => {
    if (this.destroyed || isTextEntry(event.target)) return;
    const modifier = event.ctrlKey || event.metaKey;
    if (!modifier) return;
    if (event.key.toLowerCase() === 'z' && !event.shiftKey) {
      event.preventDefault();
      this.undo();
    } else if (event.key.toLowerCase() === 'y' || (event.key.toLowerCase() === 'z' && event.shiftKey)) {
      event.preventDefault();
      this.redo();
    }
  };

  private showStatus(messageRu: string, error: boolean): void {
    this.status.textContent = messageRu;
    this.status.classList.toggle('is-error', error);
  }
}

function buildRuntimePresentationKey(snapshot: CombatLabScenarioRuntimeSnapshotV1 | null): string {
  if (!snapshot) return 'none';
  return snapshot.steps.map((step) => [step.trackId, step.stepId, step.state, step.reasonCode ?? '', step.reasonRu ?? ''].join('\u0000')).join('\u0001');
}
function button(label: string, onClick: () => void, className = '', title = ''): HTMLButtonElement {
  const control = document.createElement('button');
  control.type = 'button';
  control.textContent = label;
  if (className) control.className = className;
  if (title) control.title = title;
  control.addEventListener('click', onClick);
  return control;
}
function isTextEntry(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || (target instanceof HTMLElement && target.isContentEditable);
}
