import type { CombatLabActionV1 } from '../../core/testing/combat-lab/experiment';
import {
  createCombatLabActionFromCatalog,
  findCombatLabActionDescriptorForAction,
  listCombatLabActionDescriptors,
} from './CombatLabActionCatalog';
import type { CombatLabExperimentDraft } from './CombatLabExperimentDraft';
import type { CombatLabScenarioEditorCapabilitiesV1 } from './CombatLabScenarioEditorTypes';
import { CombatLabStepInspector } from './CombatLabStepInspector';
import './combat-lab-action-dialog.css';

export interface CombatLabActionDialogOptions {
  readonly draft: CombatLabExperimentDraft;
  readonly trackId: string;
  readonly stepId: string;
  readonly capabilities?: CombatLabScenarioEditorCapabilitiesV1;
  readonly onDraftMutation: (mutation: () => void) => void;
  readonly onError: (messageRu: string) => void;
  readonly returnFocusTo?: HTMLElement | null;
}

export class CombatLabActionDialog {
  static open(options: CombatLabActionDialogOptions): CombatLabActionDialog { return new CombatLabActionDialog(options); }

  readonly root = document.createElement('dialog');
  private readonly catalogHost = document.createElement('div');
  private readonly inspectorHost = document.createElement('div');
  private readonly inspector: CombatLabStepInspector;
  private destroyed = false;

  private constructor(private readonly options: CombatLabActionDialogOptions) {
    this.root.className = 'combat-lab-action-dialog';
    this.root.setAttribute('aria-label', 'Редактирование действия');
    const header = document.createElement('header');
    header.className = 'combat-lab-action-dialog__header';
    const title = document.createElement('h2');
    title.textContent = 'Изменить действие';
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = 'Закрыть';
    close.addEventListener('click', () => this.root.close());
    header.append(title, close);
    this.catalogHost.className = 'combat-lab-action-dialog__catalog';
    this.inspectorHost.className = 'combat-lab-action-dialog__content';
    this.root.append(header, this.catalogHost, this.inspectorHost);
    this.inspector = new CombatLabStepInspector({
      host: this.inspectorHost,
      draft: options.draft,
      capabilities: options.capabilities,
      onDraftMutation: (mutation) => {
        options.onDraftMutation(mutation);
        this.refresh();
      },
      onError: options.onError,
    });
    this.refresh();
    this.root.addEventListener('cancel', (event) => {
      event.preventDefault();
      this.root.close();
    });
    this.root.addEventListener('close', () => this.destroy(), { once: true });
    document.body.append(this.root);
    this.root.showModal();
    queueMicrotask(() => this.catalogHost.querySelector<HTMLElement>('select, input, button')?.focus());
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.inspector.destroy();
    this.root.remove();
    this.options.returnFocusTo?.focus();
  }

  private refresh(): void {
    if (this.destroyed) return;
    this.renderCatalogControls();
    this.inspector.render(this.options.trackId, this.options.stepId);
  }

  private renderCatalogControls(): void {
    const resolved = this.resolve();
    if (!resolved) {
      this.catalogHost.replaceChildren(note('Действие больше не существует.'));
      return;
    }
    const { experiment, action, actorRoleId } = resolved;
    const descriptor = findCombatLabActionDescriptorForAction(action);
    const type = document.createElement('select');
    for (const candidate of listCombatLabActionDescriptors()) {
      const option = document.createElement('option');
      option.value = candidate.id;
      option.textContent = candidate.labelRu;
      type.append(option);
    }
    type.value = descriptor.id;
    type.addEventListener('change', () => {
      const next = createCombatLabActionFromCatalog(experiment, actorRoleId, type.value, preservedOptions(action));
      this.updateAction(next);
    });

    const controls: HTMLElement[] = [field('Действие', type)];
    if (action.kind === 'move') {
      controls.push(
        field('Точка назначения', markerSelect(experiment, action.markerId, (markerId) => this.updateAction({ ...action, markerId }))),
        field('Куда смотреть после прибытия', nullableMarkerSelect(experiment, action.finalFacingMarkerId ?? null, (finalFacingMarkerId) => this.updateAction({ ...action, finalFacingMarkerId }))),
      );
    } else if (action.kind === 'face') {
      controls.push(field('Точка направления', markerSelect(experiment, action.markerId, (markerId) => this.updateAction({ ...action, markerId }))));
    }
    this.catalogHost.replaceChildren(...controls);
  }

  private resolve(): { experiment: ReturnType<CombatLabExperimentDraft['getExperiment']>; action: CombatLabActionV1; actorRoleId: string } | null {
    const experiment = this.options.draft.getExperiment();
    const track = experiment.tracks.find((candidate) => candidate.trackId === this.options.trackId);
    const step = track?.steps.find((candidate) => candidate.stepId === this.options.stepId);
    return track && step ? { experiment, action: step.action, actorRoleId: track.actorRoleId } : null;
  }

  private updateAction(action: CombatLabActionV1): void {
    try {
      this.options.onDraftMutation(() => this.options.draft.updateStep(this.options.trackId, this.options.stepId, { action }));
      this.refresh();
    } catch (error) {
      this.options.onError(error instanceof Error ? error.message : 'Не удалось изменить действие.');
    }
  }
}

function preservedOptions(action: CombatLabActionV1) {
  return {
    targetRoleId: action.kind === 'fire' && action.target.kind === 'role' ? action.target.roleId
      : action.kind === 'transfer' || action.kind === 'first_aid' ? action.targetRoleId : null,
    markerId: action.kind === 'move' || action.kind === 'face' ? action.markerId
      : action.kind === 'fire' && action.target.kind === 'marker' ? action.target.markerId : null,
    helperRoleId: action.kind === 'reload' || action.kind === 'deploy' || action.kind === 'undeploy' ? action.helperRoleId : null,
    finalFacingMarkerId: action.kind === 'move' ? action.finalFacingMarkerId ?? null : null,
    waitSeconds: action.kind === 'wait' ? action.durationSeconds ?? 1 : 1,
  };
}

function markerSelect(experiment: ReturnType<CombatLabExperimentDraft['getExperiment']>, value: string, onChange: (value: string) => void): HTMLSelectElement {
  const select = document.createElement('select');
  for (const marker of experiment.markers) {
    const option = document.createElement('option');
    option.value = marker.markerId;
    option.textContent = marker.titleRu;
    select.append(option);
  }
  select.value = value;
  select.addEventListener('change', () => onChange(select.value));
  return select;
}

function nullableMarkerSelect(experiment: ReturnType<CombatLabExperimentDraft['getExperiment']>, value: string | null, onChange: (value: string | null) => void): HTMLSelectElement {
  const select = document.createElement('select');
  const empty = document.createElement('option');
  empty.value = '';
  empty.textContent = 'Не менять направление';
  select.append(empty);
  for (const marker of experiment.markers) {
    const option = document.createElement('option');
    option.value = marker.markerId;
    option.textContent = marker.titleRu;
    select.append(option);
  }
  select.value = value ?? '';
  select.addEventListener('change', () => onChange(select.value || null));
  return select;
}

function field(label: string, control: HTMLElement): HTMLLabelElement {
  const root = document.createElement('label');
  root.className = 'combat-lab-field';
  const title = document.createElement('span');
  title.textContent = label;
  root.append(title, control);
  return root;
}
function note(value: string): HTMLElement { const result = document.createElement('div'); result.className = 'combat-lab-editor-note'; result.textContent = value; return result; }
