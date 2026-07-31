import type {
  CombatLabExperimentV1,
  CombatLabScenarioRuntimeSnapshotV1,
  CombatLabTrackV1,
} from '../../core/testing/combat-lab/experiment';
import type { CombatLabMapToolCoordinator } from '../map-tools/CombatLabMapToolCoordinator';
import type { CombatLabSelectionControllerV1 } from '../selection/CombatLabSelectionController';
import { CombatLabEditorHistory } from './CombatLabEditorHistory';
import type { CombatLabExperimentDraft } from './CombatLabExperimentDraft';
import type { CombatLabMapPickRequestV1 } from './CombatLabMapAuthoringController';
import { CombatLabMarkerInspector } from './CombatLabMarkerInspector';
import type { CombatLabMarkerManager } from './CombatLabMarkerManager';
import {
  CombatLabProgramMapMode,
  type CombatLabProgramMapModeV1,
} from './CombatLabProgramMapMode';
import type {
  CombatLabScenarioEditorCapabilitiesV1,
  CombatLabSelectedStepV1,
} from './CombatLabScenarioEditorTypes';
import { CombatLabStepDialog } from './CombatLabStepDialog';
import {
  CombatLabTrackDialog,
  resolveCombatLabTrackInsertionIndex,
  type CombatLabTrackCreationV1,
} from './CombatLabTrackDialog';
import { CombatLabTrackList } from './CombatLabTrackList';
import './combat-lab-scenario-editor.css';

export type CombatLabMapInteractionModeV1 = CombatLabProgramMapModeV1;

export interface CombatLabScenarioEditorPanelOptions {
  readonly host: HTMLElement;
  readonly draft: CombatLabExperimentDraft;
  readonly onExperimentChanged: (experiment: CombatLabExperimentV1) => void;
  readonly onRequestMapPick: (request: CombatLabMapPickRequestV1) => void;
  readonly onSelectRole: (roleId: string) => void;
  readonly capabilities?: CombatLabScenarioEditorCapabilitiesV1;
  readonly initialMapMode?: CombatLabMapInteractionModeV1;
  readonly mapTools?: Pick<CombatLabMapToolCoordinator, 'getPersistentMode' | 'setPersistentMode' | 'subscribe'>;
  readonly selection?: Pick<CombatLabSelectionControllerV1, 'get' | 'select' | 'subscribe'>;
  readonly onMapModeChanged?: (mode: CombatLabMapInteractionModeV1) => void;
  readonly onSelectionChanged?: (selection: CombatLabSelectedStepV1 | null) => void;
  readonly isMutationAllowed?: () => boolean;
}

export class CombatLabScenarioEditorPanel {
  readonly root = document.createElement('section');
  private readonly status = document.createElement('div');
  private readonly trackHost = document.createElement('div');
  private readonly markerHost = document.createElement('div');
  private readonly history: CombatLabEditorHistory;
  private readonly trackList: CombatLabTrackList;
  private readonly mapModeController: CombatLabProgramMapMode | null;
  private readonly unsubscribeMapMode: () => void;
  private stepDialog: CombatLabStepDialog | null = null;
  private trackDialog: CombatLabTrackDialog | null = null;
  private markerInspector: CombatLabMarkerInspector | null = null;
  private runtimeSnapshot: CombatLabScenarioRuntimeSnapshotV1 | null = null;
  private runtimePresentationKey = '';
  private runtimeRenderPending = false;
  private selectedStep: CombatLabSelectedStepV1 | null = null;
  private selectedActorRoleId: string | null = null;
  private mapMode: CombatLabMapInteractionModeV1;
  private active = true;
  private destroyed = false;

  private constructor(private readonly options: CombatLabScenarioEditorPanelOptions) {
    this.root.className = 'combat-lab-scenario-editor';
    this.root.setAttribute('aria-label', 'Редактор программы эксперимента');
    this.mapMode = options.initialMapMode ?? 'program_authoring';
    this.mapModeController = options.mapTools ? new CombatLabProgramMapMode(options.mapTools) : null;
    if (this.mapModeController) this.mapMode = this.mapModeController.get();
    this.unsubscribeMapMode = this.mapModeController?.subscribe((mode) => {
      this.mapMode = mode;
      this.syncModeButtons();
      this.showStatus(statusForMode(mode), false);
      this.options.onMapModeChanged?.(mode);
    }) ?? (() => undefined);

    this.history = new CombatLabEditorHistory(options.draft.getExperiment());
    this.status.className = 'combat-lab-editor-status';
    this.status.setAttribute('role', 'status');
    this.trackHost.className = 'combat-lab-editor-track-host';
    this.markerHost.className = 'combat-lab-editor-marker-host';
    this.root.append(this.buildToolbar(), this.status, this.trackHost, this.markerHost);
    options.host.append(this.root);

    this.trackList = new CombatLabTrackList({
      host: this.trackHost,
      draft: options.draft,
      capabilities: options.capabilities,
      getRuntimeSnapshot: () => this.runtimeSnapshot,
      getSelectedStep: () => this.selectedStep,
      onSelectStep: (trackId, stepId) => this.selectStep(trackId, stepId),
      onEditStep: (trackId, stepId, returnFocusTo) => this.openStepDialog(trackId, stepId, returnFocusTo),
      onDraftMutation: (mutation) => this.applyMutation(mutation),
      onError: (messageRu) => this.showStatus(messageRu, true),
    });
    window.addEventListener('keydown', this.handleGlobalKeyDown);
    this.selectInitialStep();
    this.syncModeButtons();
    this.showStatus('Программа готова к редактированию.', false);
  }

  static create(options: CombatLabScenarioEditorPanelOptions): CombatLabScenarioEditorPanel {
    return new CombatLabScenarioEditorPanel(options);
  }

  setActive(active: boolean): void {
    if (this.destroyed || this.active === active) return;
    this.active = active;
    this.root.classList.toggle('is-inactive', !active);
    if (active && this.runtimeRenderPending) {
      this.runtimeRenderPending = false;
      this.trackList.render();
    }
  }

  setMarkerManager(
    manager: CombatLabMarkerManager,
    selection: Pick<CombatLabSelectionControllerV1, 'subscribe'>,
  ): void {
    if (this.destroyed) return;
    this.markerInspector?.destroy();
    this.markerInspector = new CombatLabMarkerInspector({
      host: this.markerHost,
      draft: this.options.draft,
      manager,
      selection,
      onExperimentChanged: (experiment) => this.acceptExternalExperiment(experiment),
    });
  }

  setRuntimeSnapshot(snapshot: CombatLabScenarioRuntimeSnapshotV1 | null): void {
    this.runtimeSnapshot = snapshot;
    const nextKey = buildRuntimePresentationKey(snapshot);
    if (nextKey === this.runtimePresentationKey) return;
    this.runtimePresentationKey = nextKey;
    if (!this.active) {
      this.runtimeRenderPending = true;
      return;
    }
    this.trackList.render();
  }

  selectStep(trackId: string, stepId: string): void {
    const experiment = this.options.draft.getExperiment();
    const track = experiment.tracks.find((candidate) => candidate.trackId === trackId);
    if (!track?.steps.some((step) => step.stepId === stepId)) return;
    this.selectedStep = { trackId, stepId };
    this.selectedActorRoleId = track.actorRoleId;
    this.options.onSelectRole(track.actorRoleId);
    this.options.selection?.select(participantSelection(experiment, track.actorRoleId));
    this.publishSelection();
    this.trackList.render();
  }

  getMapMode(): CombatLabMapInteractionModeV1 { return this.mapMode; }
  getSelectedActorRoleId(): string | null { return this.selectedActorRoleId; }
  getSelectedStep(): CombatLabSelectedStepV1 | null { return this.selectedStep ? { ...this.selectedStep } : null; }

  acceptExternalExperiment(experiment: CombatLabExperimentV1, recordHistory = true): void {
    if (this.destroyed) return;
    this.closeDialogs();
    this.options.draft.replaceExperiment(experiment);
    if (recordHistory) this.history.execute(experiment);
    this.ensureSelectionExists(experiment);
    this.publishSelection();
    this.renderAll();
    this.markerInspector?.refresh();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    window.removeEventListener('keydown', this.handleGlobalKeyDown);
    this.closeDialogs();
    this.markerInspector?.destroy();
    this.markerInspector = null;
    this.trackList.destroy();
    this.unsubscribeMapMode();
    this.mapModeController?.destroy();
    this.options.onSelectionChanged?.(null);
    this.root.remove();
  }

  private openStepDialog(trackId: string, stepId: string, returnFocusTo: HTMLElement): void {
    if (!this.ensureMutationAllowed()) return;
    this.selectStep(trackId, stepId);
    this.stepDialog?.destroy();
    this.stepDialog = CombatLabStepDialog.open({
      draft: this.options.draft,
      trackId,
      stepId,
      capabilities: this.options.capabilities,
      onDraftMutation: (mutation) => this.applyMutation(mutation),
      onError: (messageRu) => this.showStatus(messageRu, true),
      returnFocusTo,
    });
  }

  private openTrackDialog(returnFocusTo: HTMLElement): void {
    if (!this.ensureMutationAllowed()) return;
    this.trackDialog?.destroy();
    const experiment = this.options.draft.getExperiment();
    this.trackDialog = CombatLabTrackDialog.open({
      experiment,
      selectedActorRoleId: this.resolveDefaultActorRoleId(experiment),
      selectedTrackId: this.selectedStep?.trackId ?? null,
      returnFocusTo,
      onSave: (value) => this.createTrack(value),
    });
  }

  private createTrack(value: CombatLabTrackCreationV1): void {
    let createdTrackId = '';
    this.applyMutation(() => {
      const before = this.options.draft.getExperiment();
      createdTrackId = nextTrackId(before.tracks);
      const track: CombatLabTrackV1 = {
        trackId: createdTrackId,
        titleRu: value.titleRu.trim(),
        actorRoleId: value.actorRoleId,
        enabled: true,
        steps: [],
      };
      const insertionIndex = resolveCombatLabTrackInsertionIndex(before.tracks, value.insertion, value.selectedTrackId);
      const tracks = [...before.tracks];
      tracks.splice(insertionIndex, 0, track);
      this.options.draft.replaceExperiment({ ...before, revision: before.revision + 1, tracks });
      this.selectedActorRoleId = value.actorRoleId;
      this.selectedStep = null;
    });
    if (createdTrackId) {
      this.trackList.scrollTrackIntoView(createdTrackId);
      this.showStatus('Дорожка создана.', false);
    }
  }

  private buildToolbar(): HTMLElement {
    const toolbar = document.createElement('div');
    toolbar.className = 'combat-lab-editor-toolbar';

    const modeGroup = document.createElement('div');
    modeGroup.className = 'combat-lab-editor-mode-switch';
    modeGroup.setAttribute('role', 'group');
    modeGroup.setAttribute('aria-label', 'Режим карты');
    const program = button('Редактор программы', () => this.setMapMode('program_authoring'));
    const manual = button('Ручное управление', () => this.setMapMode('manual_control'));
    program.dataset.mapMode = 'program_authoring';
    manual.dataset.mapMode = 'manual_control';
    modeGroup.append(program, manual);

    const editGroup = document.createElement('div');
    editGroup.className = 'combat-lab-editor-toolbar-row';
    editGroup.append(
      button('Отменить', () => this.undo(), '', 'Ctrl+Z'),
      button('Повторить', () => this.redo(), '', 'Ctrl+Y'),
      button('Точка', () => this.requestMarker('point_marker')),
      button('Область', () => this.requestMarker('circle_marker')),
    );

    const addTrack = button('Создать дорожку', () => this.openTrackDialog(addTrack));
    addTrack.classList.add('combat-lab-create-track-button');
    toolbar.append(modeGroup, editGroup, addTrack);
    return toolbar;
  }

  private requestMarker(kind: 'point_marker' | 'circle_marker'): void {
    if (!this.ensureMutationAllowed()) return;
    this.options.onRequestMapPick(kind === 'point_marker'
      ? { kind, suggestedTitleRu: 'Точка' }
      : { kind, suggestedTitleRu: 'Область', defaultRadiusMetres: 5 });
  }

  private setMapMode(mode: CombatLabMapInteractionModeV1): void {
    if (this.mapMode === mode) return;
    this.mapMode = mode;
    this.mapModeController?.set(mode);
    this.syncModeButtons();
    this.options.onMapModeChanged?.(mode);
    this.showStatus(statusForMode(mode), false);
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
    this.markerInspector?.refresh();
    this.showStatus('Изменение сохранено.', false);
  }

  private undo(): void {
    if (!this.ensureMutationAllowed()) return;
    this.closeDialogs();
    const previous = this.history.undo();
    if (!previous) return this.showStatus('Отменять больше нечего.', false);
    this.options.draft.replaceExperiment(previous);
    this.ensureSelectionExists(previous);
    this.publishSelection();
    this.options.onExperimentChanged(previous);
    this.renderAll();
    this.markerInspector?.refresh();
    this.showStatus('Изменение отменено.', false);
  }

  private redo(): void {
    if (!this.ensureMutationAllowed()) return;
    this.closeDialogs();
    const next = this.history.redo();
    if (!next) return this.showStatus('Повторять больше нечего.', false);
    this.options.draft.replaceExperiment(next);
    this.ensureSelectionExists(next);
    this.publishSelection();
    this.options.onExperimentChanged(next);
    this.renderAll();
    this.markerInspector?.refresh();
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

  private resolveDefaultActorRoleId(experiment: CombatLabExperimentV1): string | null {
    const selection = this.options.selection?.get();
    if (selection?.kind === 'participant' && !experiment.tracks.some((track) => track.actorRoleId === selection.roleId)) {
      return selection.roleId;
    }
    if (this.selectedActorRoleId && !experiment.tracks.some((track) => track.actorRoleId === this.selectedActorRoleId)) {
      return this.selectedActorRoleId;
    }
    return experiment.roles.find((role) => !experiment.tracks.some((track) => track.actorRoleId === role.roleId))?.roleId ?? null;
  }

  private renderAll(): void {
    this.trackList.render();
    this.syncModeButtons();
  }

  private closeDialogs(): void {
    this.stepDialog?.destroy();
    this.stepDialog = null;
    this.trackDialog?.destroy();
    this.trackDialog = null;
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

function participantSelection(experiment: CombatLabExperimentV1, roleId: string) {
  const role = experiment.roles.find((candidate) => candidate.roleId === roleId);
  return role
    ? { kind: 'participant' as const, roleId: role.roleId, unitId: role.unitId }
    : { kind: 'none' as const };
}
function nextTrackId(tracks: readonly Pick<CombatLabTrackV1, 'trackId'>[]): string {
  const used = new Set(tracks.map((track) => track.trackId));
  for (let index = 1; index <= 1_000_000; index += 1) {
    const candidate = `track-${index}`;
    if (!used.has(candidate)) return candidate;
  }
  throw new Error('Не удалось создать свободный идентификатор дорожки.');
}
function statusForMode(mode: CombatLabMapInteractionModeV1): string {
  return mode === 'program_authoring'
    ? 'Правая кнопка добавляет действия в программу.'
    : 'Правая кнопка отдаёт непосредственные игровые приказы.';
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
