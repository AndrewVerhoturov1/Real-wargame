import type {
  CombatLabActionV1,
  CombatLabCompletionV1,
  CombatLabConditionV1,
  CombatLabExperimentV1,
  CombatLabRepeatPolicyV1,
  CombatLabScenarioStepV1,
} from '../../core/testing/combat-lab/experiment';
import type { CombatLabExperimentDraft } from './CombatLabExperimentDraft';
import type { CombatLabScenarioEditorCapabilitiesV1 } from './CombatLabScenarioEditorTypes';

export interface CombatLabStepInspectorOptions {
  readonly host: HTMLElement;
  readonly draft: CombatLabExperimentDraft;
  readonly capabilities?: CombatLabScenarioEditorCapabilitiesV1;
  readonly onDraftMutation: (mutation: () => void) => void;
  readonly onError: (messageRu: string) => void;
}

export class CombatLabStepInspector {
  readonly root = document.createElement('section');
  private accuracyMount: { destroy(): void } | null = null;
  private selected: { trackId: string; stepId: string } | null = null;
  private destroyed = false;

  constructor(private readonly options: CombatLabStepInspectorOptions) {
    this.root.className = 'combat-lab-step-inspector combat-lab-panel';
    options.host.append(this.root);
    this.render(null, null);
  }

  render(trackId: string | null, stepId: string | null): void {
    if (this.destroyed) return;
    this.accuracyMount?.destroy();
    this.accuracyMount = null;
    this.selected = trackId && stepId ? { trackId, stepId } : null;
    const resolved = this.resolveStep();
    if (!resolved) {
      this.root.replaceChildren(
        text('h3', 'combat-lab-section-title', 'Параметры действия'),
        text('div', 'combat-lab-editor-empty', 'Выберите карточку действия.'),
      );
      return;
    }

    const { experiment, trackId: selectedTrackId, step } = resolved;
    const heading = document.createElement('header');
    heading.className = 'combat-lab-inspector-heading';
    heading.append(
      text('h3', 'combat-lab-section-title', 'Параметры действия'),
      text('code', '', `${selectedTrackId}/${step.stepId}`),
    );

    const title = input('text', step.titleRu);
    title.addEventListener('change', () => this.update({ titleRu: title.value.trim() || step.titleRu }));
    const enabled = checkbox(step.enabled, (value) => this.update({ enabled: value }));
    const breakpoint = checkbox(step.breakpointBefore, (value) => this.update({ breakpointBefore: value }));
    const timeout = numberInput(step.timeoutSeconds, 0.1, 600, 0.1, (value) => this.update({ timeoutSeconds: value }));
    const failure = selectControl([
      ['stop_experiment', 'Остановить эксперимент'],
      ['wait', 'Ждать доступности'],
      ['skip_step', 'Пропустить шаг'],
    ], step.failurePolicy, (value) => this.update({ failurePolicy: value as CombatLabScenarioStepV1['failurePolicy'] }));

    const accuracyHost = document.createElement('div');
    accuracyHost.className = 'combat-lab-step-accuracy-host';
    this.root.replaceChildren(
      heading,
      field('Название', title),
      inlineChecks(labelledCheck('Шаг включён', enabled), labelledCheck('Точка остановки перед шагом', breakpoint)),
      field('Предельное время, с', timeout),
      field('При ошибке', failure),
      this.buildActionEditor(experiment, step.action),
      this.buildConditionEditor('Условие начала', experiment, step.startCondition, (condition) => this.update({ startCondition: condition })),
      this.buildCompletionEditor(experiment, step.completion),
      this.buildRepeatEditor(experiment, step.repeat),
      accuracyHost,
    );

    if (step.action.kind === 'fire') {
      const accuracyControls = this.options.capabilities?.accuracyControls;
      if (accuracyControls) {
        this.accuracyMount = accuracyControls.mount(
          accuracyHost,
          step.action.actorRoleId,
          step.accuracyOverrides,
          (accuracyOverrides) => this.update({ accuracyOverrides }),
        );
      } else {
        accuracyHost.append(text('div', 'combat-lab-editor-note', 'Параметры точности подключаются через штатный адаптер Combat Lab.'));
      }
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.accuracyMount?.destroy();
    this.accuracyMount = null;
    this.root.remove();
  }

  private resolveStep(): { experiment: CombatLabExperimentV1; trackId: string; step: CombatLabScenarioStepV1 } | null {
    if (!this.selected) return null;
    const experiment = this.options.draft.getExperiment();
    const track = experiment.tracks.find((candidate) => candidate.trackId === this.selected?.trackId);
    const step = track?.steps.find((candidate) => candidate.stepId === this.selected?.stepId);
    if (!track || !step) return null;
    return { experiment, trackId: track.trackId, step };
  }

  private buildActionEditor(experiment: CombatLabExperimentV1, action: CombatLabActionV1): HTMLElement {
    const details = detailsBlock('Действие', true);
    if (action.kind !== 'wait') {
      details.append(field('Исполнитель', roleSelect(experiment, actorRoleFor(action), (roleId) => this.updateAction(changeActor(action, roleId)))));
    }
    switch (action.kind) {
      case 'fire': {
        details.append(
          field('Режим', selectControl([
            ['single', 'Одиночный'], ['short_burst', 'Короткая очередь'], ['long_burst', 'Длинная очередь'], ['suppress', 'Подавление'],
          ], action.mode, (mode) => this.updateAction({ ...action, mode: mode as typeof action.mode }))),
          field('Тип цели', selectControl([['role', 'Роль'], ['marker', 'Метка']], action.target.kind, (kind) => {
            const target = kind === 'marker'
              ? { kind: 'marker' as const, markerId: experiment.markers[0]?.markerId ?? '' }
              : { kind: 'role' as const, roleId: firstOtherRole(experiment, action.actorRoleId) };
            this.updateAction({ ...action, target });
          })),
          action.target.kind === 'role'
            ? field('Цель', roleSelect(experiment, action.target.roleId, (roleId) => this.updateAction({ ...action, target: { kind: 'role', roleId } })))
            : field('Цель', markerSelect(experiment, action.target.markerId, (markerId) => this.updateAction({ ...action, target: { kind: 'marker', markerId } }))),
          field('Радиус цели, м', numberInput(action.targetRadiusMetres, 0, 100, 0.1, (targetRadiusMetres) => this.updateAction({ ...action, targetRadiusMetres }))),
          field('Минимум решения', numberInput(action.minimumSolutionQuality, 0, 1, 0.01, (minimumSolutionQuality) => this.updateAction({ ...action, minimumSolutionQuality }))),
          field('Минимум восприятия', numberInput(action.minimumPerceptionQuality, 0, 1, 0.01, (minimumPerceptionQuality) => this.updateAction({ ...action, minimumPerceptionQuality }))),
          labelledCheck('Принудительная стрельба', checkbox(action.forceFire, (forceFire) => this.updateAction({ ...action, forceFire }))),
        );
        break;
      }
      case 'move':
        details.append(field('Метка назначения', markerSelect(experiment, action.markerId, (markerId) => this.updateAction({ ...action, markerId }))));
        break;
      case 'posture':
        details.append(field('Поза', selectControl([
          ['standing', 'Стоя'], ['crouched', 'Пригнувшись'], ['prone', 'Лёжа'],
        ], action.targetPosture, (targetPosture) => this.updateAction({ ...action, targetPosture: targetPosture as typeof action.targetPosture }))));
        break;
      case 'wait':
        details.append(field('Длительность, с; пусто — ждать условие', nullableNumberInput(action.durationSeconds, 0, 600, 0.1, (durationSeconds) => this.updateAction({ ...action, durationSeconds }))));
        break;
      case 'reload':
      case 'deploy':
      case 'undeploy':
        details.append(field('Помощник', nullableRoleSelect(experiment, action.helperRoleId, (helperRoleId) => this.updateAction({ ...action, helperRoleId }))));
        break;
      case 'transfer':
        details.append(
          field('Получатель', roleSelect(experiment, action.targetRoleId, (targetRoleId) => this.updateAction({ ...action, targetRoleId }))),
          field('Количество патронов', numberInput(action.requestedRounds, 1, 100_000, 1, (requestedRounds) => this.updateAction({ ...action, requestedRounds }))),
        );
        break;
      case 'first_aid':
        details.append(
          field('Получатель', roleSelect(experiment, action.targetRoleId, (targetRoleId) => this.updateAction({ ...action, targetRoleId }))),
          field('Зона', selectControl([
            ['', 'Автоматический приоритет'], ['head', 'Голова'], ['torso', 'Туловище'], ['arms', 'Руки'], ['legs', 'Ноги'],
          ], action.zone ?? '', (zone) => this.updateAction({ ...action, zone: zone === '' ? null : zone as NonNullable<typeof action.zone> }))),
        );
        break;
      case 'stop_fire':
        break;
    }
    return details;
  }

  private buildConditionEditor(
    label: string,
    experiment: CombatLabExperimentV1,
    condition: CombatLabConditionV1,
    onChange: (condition: CombatLabConditionV1) => void,
  ): HTMLElement {
    const details = detailsBlock(label, false);
    details.append(field('Тип', selectControl([
      ['always', 'Всегда'], ['elapsed', 'Прошло время'], ['step_state', 'Состояние шага'], ['role_state', 'Состояние роли'],
      ['contact', 'Контакт'], ['ammo', 'Боеприпасы'], ['suppression', 'Подавление'],
    ], condition.kind, (kind) => onChange(defaultCondition(kind as CombatLabConditionV1['kind'], experiment)))));

    if (condition.kind === 'elapsed') {
      details.append(
        field('Отсчёт', selectControl([['experiment_start', 'Начало эксперимента'], ['step_start', 'Начало шага']], condition.anchor, (anchor) => onChange({ ...condition, anchor: anchor as typeof condition.anchor }))),
        field('Секунды', numberInput(condition.seconds, 0, 600, 0.1, (seconds) => onChange({ ...condition, seconds }))),
      );
    } else if (condition.kind === 'step_state') {
      details.append(
        field('Дорожка', trackSelect(experiment, condition.trackId, (trackId) => onChange({ ...condition, trackId, stepId: experiment.tracks.find((track) => track.trackId === trackId)?.steps[0]?.stepId ?? '' }))),
        field('Шаг', stepSelect(experiment, condition.trackId, condition.stepId, (stepId) => onChange({ ...condition, stepId }))),
        field('Состояние', selectControl([['started', 'Начат'], ['completed', 'Завершён'], ['failed', 'Ошибка']], condition.state, (state) => onChange({ ...condition, state: state as typeof condition.state }))),
      );
    } else if (condition.kind === 'role_state') {
      details.append(
        field('Роль', roleSelect(experiment, condition.roleId, (roleId) => onChange({ ...condition, roleId }))),
        field('Состояние', selectControl([
          ['capable', 'Боеспособна'], ['incapacitated', 'Небоеспособна'], ['can_fire', 'Может стрелять'], ['cannot_fire', 'Не может стрелять'],
          ['can_move', 'Может двигаться'], ['cannot_move', 'Не может двигаться'],
        ], condition.state, (state) => onChange({ ...condition, state: state as typeof condition.state }))),
      );
    } else if (condition.kind === 'contact') {
      details.append(
        field('Наблюдатель', roleSelect(experiment, condition.observerRoleId, (observerRoleId) => onChange({ ...condition, observerRoleId }))),
        field('Цель', roleSelect(experiment, condition.targetRoleId, (targetRoleId) => onChange({ ...condition, targetRoleId }))),
        labelledCheck('Контакт присутствует', checkbox(condition.present, (present) => onChange({ ...condition, present }))),
      );
    } else if (condition.kind === 'ammo') {
      details.append(
        field('Роль', roleSelect(experiment, condition.roleId, (roleId) => onChange({ ...condition, roleId }))),
        field('Сравнение', selectControl([['empty', 'Пусто'], ['at_most', 'Не больше'], ['at_least', 'Не меньше']], condition.comparison, (comparison) => {
          onChange(comparison === 'empty'
            ? { kind: 'ammo', roleId: condition.roleId, comparison: 'empty' }
            : { kind: 'ammo', roleId: condition.roleId, comparison: comparison as 'at_most' | 'at_least', rounds: 'rounds' in condition ? condition.rounds : 0 });
        })),
      );
      if (condition.comparison !== 'empty') details.append(field('Патроны', numberInput(condition.rounds, 0, 100_000, 1, (rounds) => onChange({ ...condition, rounds }))));
    } else if (condition.kind === 'suppression') {
      details.append(
        field('Роль', roleSelect(experiment, condition.roleId, (roleId) => onChange({ ...condition, roleId }))),
        field('Сравнение', selectControl([['at_most', 'Не выше'], ['at_least', 'Не ниже']], condition.comparison, (comparison) => onChange({ ...condition, comparison: comparison as typeof condition.comparison }))),
        field('Значение', numberInput(condition.value, 0, 1, 0.01, (value) => onChange({ ...condition, value }))),
      );
    }
    return details;
  }

  private buildCompletionEditor(experiment: CombatLabExperimentV1, completion: CombatLabCompletionV1): HTMLElement {
    const details = detailsBlock('Условие завершения', false);
    details.append(field('Тип', selectControl([
      ['production_action', 'Игровое действие завершено'], ['shot_resolved', 'Выстрел разрешён'], ['condition', 'Заданное условие'],
    ], completion.kind, (kind) => this.update({ completion: kind === 'condition'
      ? { kind: 'condition', condition: { kind: 'always' } }
      : { kind: kind as 'production_action' | 'shot_resolved' } }))));
    if (completion.kind === 'condition') {
      details.append(this.buildConditionEditor('Проверяемое условие', experiment, completion.condition, (condition) => this.update({ completion: { kind: 'condition', condition } })));
    }
    return details;
  }

  private buildRepeatEditor(experiment: CombatLabExperimentV1, repeat: CombatLabRepeatPolicyV1): HTMLElement {
    const details = detailsBlock('Повтор', false);
    details.append(field('Политика', selectControl([['once', 'Один раз'], ['until_condition', 'Повторять до условия']], repeat.kind, (kind) => {
      const next: CombatLabRepeatPolicyV1 = kind === 'once'
        ? { kind: 'once', maximumAttempts: 1, retryDelaySeconds: 0 }
        : { kind: 'until_condition', condition: { kind: 'always' }, maximumAttempts: 2, retryDelaySeconds: 0 };
      this.update({ repeat: next });
    })));
    if (repeat.kind === 'until_condition') {
      details.append(
        field('Максимум попыток', numberInput(repeat.maximumAttempts, 1, 1000, 1, (maximumAttempts) => this.update({ repeat: { ...repeat, maximumAttempts } }))),
        field('Пауза между попытками, с', numberInput(repeat.retryDelaySeconds, 0, 600, 0.1, (retryDelaySeconds) => this.update({ repeat: { ...repeat, retryDelaySeconds } }))),
        this.buildConditionEditor('Условие прекращения', experiment, repeat.condition, (condition) => this.update({ repeat: { ...repeat, condition } })),
      );
    }
    return details;
  }

  private update(patch: Partial<CombatLabScenarioStepV1>): void {
    if (!this.selected) return;
    try {
      const { trackId, stepId } = this.selected;
      this.options.onDraftMutation(() => this.options.draft.updateStep(trackId, stepId, patch));
    } catch (error) {
      this.options.onError(error instanceof Error ? error.message : 'Не удалось изменить действие.');
    }
  }

  private updateAction(action: CombatLabActionV1): void {
    this.update({ action });
  }
}

function actorRoleFor(action: CombatLabActionV1): string {
  return action.kind === 'transfer' ? action.sourceRoleId : action.kind === 'wait' ? '' : action.actorRoleId;
}

function changeActor(action: CombatLabActionV1, roleId: string): CombatLabActionV1 {
  if (action.kind === 'wait') return action;
  return action.kind === 'transfer' ? { ...action, sourceRoleId: roleId } : { ...action, actorRoleId: roleId };
}

function defaultCondition(kind: CombatLabConditionV1['kind'], experiment: CombatLabExperimentV1): CombatLabConditionV1 {
  const roleId = experiment.roles[0]?.roleId ?? '';
  const otherRoleId = experiment.roles[1]?.roleId ?? roleId;
  const track = experiment.tracks[0];
  const step = track?.steps[0];
  switch (kind) {
    case 'always': return { kind };
    case 'elapsed': return { kind, anchor: 'experiment_start', seconds: 1 };
    case 'step_state': return { kind, trackId: track?.trackId ?? '', stepId: step?.stepId ?? '', state: 'completed' };
    case 'role_state': return { kind, roleId, state: 'capable' };
    case 'contact': return { kind, observerRoleId: roleId, targetRoleId: otherRoleId, present: true };
    case 'ammo': return { kind, roleId, comparison: 'empty' };
    case 'suppression': return { kind, roleId, comparison: 'at_least', value: 0.5 };
  }
}

function firstOtherRole(experiment: CombatLabExperimentV1, actorRoleId: string): string {
  return experiment.roles.find((role) => role.roleId !== actorRoleId)?.roleId ?? actorRoleId;
}

function roleSelect(experiment: CombatLabExperimentV1, value: string, onChange: (value: string) => void): HTMLSelectElement {
  return selectControl(experiment.roles.map((role) => [role.roleId, `${role.titleRu} · ${role.roleId}`]), value, onChange);
}

function nullableRoleSelect(experiment: CombatLabExperimentV1, value: string | null, onChange: (value: string | null) => void): HTMLSelectElement {
  return selectControl([['', 'Без помощника'], ...experiment.roles.map((role) => [role.roleId, `${role.titleRu} · ${role.roleId}`] as const)], value ?? '', (next) => onChange(next || null));
}

function markerSelect(experiment: CombatLabExperimentV1, value: string, onChange: (value: string) => void): HTMLSelectElement {
  return selectControl(experiment.markers.map((marker) => [marker.markerId, `${marker.titleRu} · ${marker.markerId}`]), value, onChange);
}

function trackSelect(experiment: CombatLabExperimentV1, value: string, onChange: (value: string) => void): HTMLSelectElement {
  return selectControl(experiment.tracks.map((track) => [track.trackId, `${track.titleRu} · ${track.trackId}`]), value, onChange);
}

function stepSelect(experiment: CombatLabExperimentV1, trackId: string, value: string, onChange: (value: string) => void): HTMLSelectElement {
  const track = experiment.tracks.find((candidate) => candidate.trackId === trackId);
  return selectControl((track?.steps ?? []).map((step) => [step.stepId, `${step.titleRu} · ${step.stepId}`]), value, onChange);
}

function selectControl(options: ReadonlyArray<readonly [string, string]>, value: string, onChange: (value: string) => void): HTMLSelectElement {
  const select = document.createElement('select');
  for (const [optionValue, label] of options) {
    const option = document.createElement('option');
    option.value = optionValue;
    option.textContent = label;
    select.append(option);
  }
  select.value = value;
  select.addEventListener('change', () => onChange(select.value));
  return select;
}

function detailsBlock(title: string, open: boolean): HTMLDetailsElement {
  const details = document.createElement('details');
  details.className = 'combat-lab-editor-details';
  details.open = open;
  details.append(text('summary', '', title));
  return details;
}

function input(type: string, value: string): HTMLInputElement {
  const control = document.createElement('input');
  control.type = type;
  control.value = value;
  return control;
}

function numberInput(value: number, minimum: number, maximum: number, step: number, onChange: (value: number) => void): HTMLInputElement {
  const control = input('number', String(value));
  control.min = String(minimum);
  control.max = String(maximum);
  control.step = String(step);
  control.addEventListener('change', () => onChange(clampNumber(control.value, minimum, maximum, value)));
  return control;
}

function nullableNumberInput(value: number | null, minimum: number, maximum: number, step: number, onChange: (value: number | null) => void): HTMLInputElement {
  const control = input('number', value === null ? '' : String(value));
  control.min = String(minimum);
  control.max = String(maximum);
  control.step = String(step);
  control.placeholder = 'ждать условие';
  control.addEventListener('change', () => onChange(control.value.trim() === '' ? null : clampNumber(control.value, minimum, maximum, minimum)));
  return control;
}

function checkbox(value: boolean, onChange: (value: boolean) => void): HTMLInputElement {
  const control = document.createElement('input');
  control.type = 'checkbox';
  control.checked = value;
  control.addEventListener('change', () => onChange(control.checked));
  return control;
}

function field(label: string, control: HTMLElement): HTMLLabelElement {
  const root = document.createElement('label');
  root.className = 'combat-lab-field';
  root.append(text('span', '', label), control);
  return root;
}

function labelledCheck(label: string, control: HTMLInputElement): HTMLLabelElement {
  const root = document.createElement('label');
  root.className = 'combat-lab-editor-check';
  root.append(control, document.createTextNode(label));
  return root;
}

function inlineChecks(...controls: HTMLElement[]): HTMLElement {
  const root = document.createElement('div');
  root.className = 'combat-lab-editor-inline-checks';
  root.append(...controls);
  return root;
}

function clampNumber(value: string, minimum: number, maximum: number, fallback: number): number {
  const parsed = Number(value);
  return Math.max(minimum, Math.min(maximum, Number.isFinite(parsed) ? parsed : fallback));
}

function text<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, value: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = value;
  return element;
}