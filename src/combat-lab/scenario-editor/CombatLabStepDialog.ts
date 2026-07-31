import type {
  CombatLabExperimentV1,
  CombatLabScenarioStepV1,
} from '../../core/testing/combat-lab/experiment';
import {
  createCombatLabActionFromCatalog,
  findCombatLabActionDescriptorForAction,
  listCombatLabActionDescriptors,
} from './CombatLabActionCatalog';
import { CombatLabActionEditor } from './CombatLabActionEditor';
import { CombatLabConditionEditor } from './CombatLabConditionEditor';
import { CombatLabExperimentDraft } from './CombatLabExperimentDraft';
import { CombatLabRepeatEditor } from './CombatLabRepeatEditor';
import type { CombatLabScenarioEditorCapabilitiesV1 } from './CombatLabScenarioEditorTypes';
import { CombatLabStepInspector } from './CombatLabStepInspector';

export interface CombatLabStepDialogOptionsV1 {
  readonly draft: CombatLabExperimentDraft;
  readonly trackId: string;
  readonly stepId: string;
  readonly capabilities?: CombatLabScenarioEditorCapabilitiesV1;
  readonly onDraftMutation: (mutation: () => void) => void;
  readonly onError: (messageRu: string) => void;
  readonly returnFocusTo?: HTMLElement | null;
}

export type CombatLabStepDraftValidationV1 =
  | { readonly ok: true; readonly reasonRu: null }
  | { readonly ok: false; readonly reasonRu: string };

export class CombatLabStepEditSession {
  private draft: CombatLabScenarioStepV1;
  private finished = false;

  constructor(
    original: CombatLabScenarioStepV1,
    private readonly onSave: (step: CombatLabScenarioStepV1) => void,
  ) {
    this.draft = clone(original);
  }

  getDraft(): CombatLabScenarioStepV1 {
    return clone(this.draft);
  }

  patch(patch: Partial<CombatLabScenarioStepV1>): void {
    if (this.finished) return;
    this.draft = clone({ ...this.draft, ...patch, stepId: this.draft.stepId });
  }

  replace(step: CombatLabScenarioStepV1): void {
    if (this.finished) return;
    this.draft = clone({ ...step, stepId: this.draft.stepId });
  }

  save(): void {
    if (this.finished) return;
    this.finished = true;
    this.onSave(clone(this.draft));
  }

  cancel(): void {
    this.finished = true;
  }
}

export function validateCombatLabStepDraft(
  step: CombatLabScenarioStepV1,
  experiment: Pick<CombatLabExperimentV1, 'roles' | 'markers' | 'tracks'>,
): CombatLabStepDraftValidationV1 {
  if (!step.titleRu.trim()) return { ok: false, reasonRu: 'Введите понятное название действия.' };
  if (!Number.isFinite(step.timeoutSeconds) || step.timeoutSeconds <= 0) {
    return { ok: false, reasonRu: 'Предельное время шага должно быть больше нуля.' };
  }
  if (step.timeoutSeconds > 600) return { ok: false, reasonRu: 'Предельное время шага не может превышать 600 секунд.' };
  const roles = new Set(experiment.roles.map((role) => role.roleId));
  const markers = new Set(experiment.markers.map((marker) => marker.markerId));
  for (const roleId of actionRoleIds(step)) {
    if (!roles.has(roleId)) return { ok: false, reasonRu: 'Один из выбранных бойцов больше не существует.' };
  }
  for (const markerId of actionMarkerIds(step)) {
    if (!markers.has(markerId)) return { ok: false, reasonRu: 'Одна из выбранных меток больше не существует.' };
  }
  if (step.repeat.kind === 'until_condition') {
    if (!Number.isInteger(step.repeat.maximumAttempts) || step.repeat.maximumAttempts < 1 || step.repeat.maximumAttempts > 1000) {
      return { ok: false, reasonRu: 'Число попыток должно быть от 1 до 1000.' };
    }
    if (!Number.isFinite(step.repeat.retryDelaySeconds) || step.repeat.retryDelaySeconds < 0) {
      return { ok: false, reasonRu: 'Задержка между попытками должна быть неотрицательной.' };
    }
  }
  return { ok: true, reasonRu: null };
}

export class CombatLabStepDialog {
  readonly root = document.createElement('dialog');
  private readonly sentence = document.createElement('p');
  private readonly errorHost = document.createElement('div');
  private readonly temporaryDraft: CombatLabExperimentDraft;
  private readonly session: CombatLabStepEditSession;
  private readonly inspector: CombatLabStepInspector;
  private destroyed = false;

  private constructor(private readonly options: CombatLabStepDialogOptionsV1) {
    const resolved = resolveStep(options.draft.getExperiment(), options.trackId, options.stepId);
    if (!resolved) throw new Error('Редактируемое действие больше не существует.');

    this.root.className = 'combat-lab-dialog combat-lab-step-dialog';
    this.root.setAttribute('aria-label', 'Изменить действие');
    this.temporaryDraft = new CombatLabExperimentDraft(options.draft.getExperiment());
    this.session = new CombatLabStepEditSession(resolved.step, (step) => {
      options.onDraftMutation(() => options.draft.updateStep(options.trackId, options.stepId, step));
    });

    const header = document.createElement('header');
    header.className = 'combat-lab-step-dialog__header';
    const heading = document.createElement('h2');
    heading.textContent = 'Изменить действие';
    this.sentence.className = 'combat-lab-step-dialog__sentence';
    header.append(heading, this.sentence);

    const navigation = document.createElement('nav');
    navigation.className = 'combat-lab-step-dialog__section-list';
    navigation.setAttribute('aria-label', 'Разделы параметров действия');
    for (const label of [
      'Исполнитель', 'Цель', 'Параметры действия', 'Условие начала', 'Условие завершения',
      'Повтор и предельное время', 'При ошибке', 'Дополнительно',
    ]) navigation.append(tag(label));

    const catalog = this.buildActionCatalog();
    const inspectorHost = document.createElement('div');
    inspectorHost.className = 'combat-lab-step-dialog__editor';
    this.inspector = new CombatLabStepInspector({
      host: inspectorHost,
      draft: this.temporaryDraft,
      capabilities: options.capabilities,
      onDraftMutation: (mutation) => {
        mutation();
        const next = this.resolveTemporaryStep();
        if (next) this.session.replace(next);
        this.refreshSentence();
      },
      onError: (messageRu) => { this.errorHost.textContent = messageRu; },
    });
    this.inspector.render(options.trackId, options.stepId);

    const technical = document.createElement('details');
    technical.className = 'combat-lab-step-dialog__technical';
    const summary = document.createElement('summary');
    summary.textContent = 'Дополнительно';
    const code = document.createElement('code');
    code.textContent = `${options.trackId}/${options.stepId}`;
    technical.append(summary, code);

    this.errorHost.className = 'combat-lab-dialog-error';
    this.errorHost.setAttribute('role', 'alert');
    const footer = document.createElement('footer');
    footer.className = 'combat-lab-dialog-actions';
    const cancel = button('Отмена', () => {
      this.session.cancel();
      this.root.close('cancel');
    });
    const save = button('Сохранить', () => this.save());
    save.classList.add('primary');
    footer.append(cancel, save);

    this.root.append(header, navigation, catalog, inspectorHost, technical, this.errorHost, footer);
    this.root.addEventListener('cancel', (event) => {
      event.preventDefault();
      this.session.cancel();
      this.root.close('cancel');
    });
    this.root.addEventListener('keydown', this.handleFocusTrap);
    this.root.addEventListener('close', () => this.destroy(), { once: true });
    document.body.append(this.root);
    this.refreshSentence();
    this.root.showModal();
    queueMicrotask(() => this.root.querySelector<HTMLElement>('select, input, button')?.focus());
  }

  static open(options: CombatLabStepDialogOptionsV1): CombatLabStepDialog {
    return new CombatLabStepDialog(options);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.root.removeEventListener('keydown', this.handleFocusTrap);
    this.inspector.destroy();
    this.root.remove();
    this.options.returnFocusTo?.focus();
  }

  private buildActionCatalog(): HTMLElement {
    const host = document.createElement('div');
    host.className = 'combat-lab-step-dialog__catalog';
    const select = document.createElement('select');
    select.setAttribute('aria-label', 'Тип действия');
    const step = this.resolveTemporaryStep()!;
    for (const descriptor of listCombatLabActionDescriptors()) {
      const option = document.createElement('option');
      option.value = descriptor.id;
      option.textContent = descriptor.labelRu;
      select.append(option);
    }
    select.value = findCombatLabActionDescriptorForAction(step.action).id;
    select.addEventListener('change', () => {
      const resolved = resolveStep(this.temporaryDraft.getExperiment(), this.options.trackId, this.options.stepId);
      if (!resolved) return;
      const action = createCombatLabActionFromCatalog(
        this.temporaryDraft.getExperiment(),
        resolved.track.actorRoleId,
        select.value,
        preservedOptions(resolved.step),
      );
      this.temporaryDraft.updateStep(this.options.trackId, this.options.stepId, { action });
      const next = this.resolveTemporaryStep();
      if (next) this.session.replace(next);
      this.inspector.render(this.options.trackId, this.options.stepId);
      this.refreshSentence();
    });
    const label = document.createElement('label');
    label.className = 'combat-lab-field';
    label.append(tag('Тип действия'), select);
    host.append(label);
    return host;
  }

  private save(): void {
    const step = this.resolveTemporaryStep();
    if (!step) {
      this.errorHost.textContent = 'Редактируемое действие больше не существует.';
      return;
    }
    const experiment = this.temporaryDraft.getExperiment();
    const validation = validateCombatLabStepDraft(step, experiment);
    const actionError = CombatLabActionEditor.validate(step.action, experiment);
    const startError = CombatLabConditionEditor.validate(step.startCondition, experiment);
    const completionError = step.completion.kind === 'condition'
      ? CombatLabConditionEditor.validate(step.completion.condition, experiment)
      : null;
    const repeatError = CombatLabRepeatEditor.validate(step.repeat, experiment);
    const reasonRu = validation.ok ? actionError ?? startError ?? completionError ?? repeatError : validation.reasonRu;
    if (reasonRu) {
      this.errorHost.textContent = reasonRu;
      return;
    }
    this.session.replace(step);
    this.session.save();
    this.root.close('save');
  }

  private resolveTemporaryStep(): CombatLabScenarioStepV1 | null {
    return resolveStep(this.temporaryDraft.getExperiment(), this.options.trackId, this.options.stepId)?.step ?? null;
  }

  private refreshSentence(): void {
    const step = this.resolveTemporaryStep();
    this.sentence.textContent = step
      ? CombatLabActionEditor.describe(step.action, this.temporaryDraft.getExperiment())
      : 'Действие больше не существует.';
  }

  private readonly handleFocusTrap = (event: KeyboardEvent): void => {
    if (event.key !== 'Tab') return;
    const focusable = [...this.root.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), summary')];
    if (focusable.length === 0) return;
    const first = focusable[0]!;
    const last = focusable.at(-1)!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
}

function resolveStep(experiment: CombatLabExperimentV1, trackId: string, stepId: string) {
  const track = experiment.tracks.find((candidate) => candidate.trackId === trackId);
  const step = track?.steps.find((candidate) => candidate.stepId === stepId);
  return track && step ? { track, step } : null;
}

function actionRoleIds(step: CombatLabScenarioStepV1): string[] {
  const action = step.action;
  switch (action.kind) {
    case 'fire': return [action.actorRoleId, ...(action.target.kind === 'role' ? [action.target.roleId] : [])];
    case 'move':
    case 'face':
    case 'posture':
    case 'cancel_action':
    case 'stop_fire': return [action.actorRoleId];
    case 'reload':
    case 'deploy':
    case 'undeploy': return [action.actorRoleId, ...(action.helperRoleId ? [action.helperRoleId] : [])];
    case 'transfer': return [action.sourceRoleId, action.targetRoleId];
    case 'first_aid': return [action.actorRoleId, action.targetRoleId];
    case 'wait': return [];
  }
}

function actionMarkerIds(step: CombatLabScenarioStepV1): string[] {
  const action = step.action;
  if (action.kind === 'move') return [action.markerId, ...(action.finalFacingMarkerId ? [action.finalFacingMarkerId] : [])];
  if (action.kind === 'face') return [action.markerId];
  if (action.kind === 'fire' && action.target.kind === 'marker') return [action.target.markerId];
  return [];
}

function preservedOptions(step: CombatLabScenarioStepV1) {
  const action = step.action;
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

function clone<T>(value: T): T {
  return typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value)) as T;
}
function button(label: string, onClick: () => void): HTMLButtonElement {
  const control = document.createElement('button');
  control.type = 'button';
  control.textContent = label;
  control.addEventListener('click', onClick);
  return control;
}
function tag(value: string): HTMLElement { const element = document.createElement('span'); element.textContent = value; return element; }
