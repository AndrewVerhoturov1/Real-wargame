import type {
  CombatLabExperimentV1,
  CombatLabScenarioStepV1,
  CombatLabStepRuntimeSnapshotV1,
} from '../../core/testing/combat-lab/experiment';
import {
  combatLabActionLabelRu,
  combatLabActionTargetLabelRu,
  combatLabRuntimeStateLabelRu,
} from './CombatLabEditorFactories';

export interface CombatLabStepCardOptions {
  readonly experiment: CombatLabExperimentV1;
  readonly trackId: string;
  readonly step: CombatLabScenarioStepV1;
  readonly index: number;
  readonly runtime: CombatLabStepRuntimeSnapshotV1 | null;
  readonly selected: boolean;
  readonly onSelect: () => void;
  readonly onDuplicate: () => void;
  readonly onToggleEnabled: () => void;
  readonly onDelete: () => void;
  readonly onMoveBy: (offset: -1 | 1) => void;
  readonly onBeginPointerReorder: (event: PointerEvent) => void;
}

export class CombatLabStepCard {
  readonly root = document.createElement('article');
  private readonly details = document.createElement('details');

  constructor(private readonly options: CombatLabStepCardOptions) {
    const { step, runtime, selected } = options;
    this.root.className = 'combat-lab-step-card';
    this.root.dataset.combatLabStepCard = step.stepId;
    this.root.dataset.trackId = options.trackId;
    this.root.dataset.stepIndex = String(options.index);
    this.root.dataset.runtimeState = runtime?.state ?? 'idle';
    this.root.classList.toggle('is-selected', selected);
    this.root.classList.toggle('is-disabled', !step.enabled);
    this.root.tabIndex = 0;

    this.details.open = selected;
    const summary = document.createElement('summary');
    summary.className = 'combat-lab-step-summary';
    const drag = iconButton('↕', 'Перетащить шаг');
    drag.classList.add('combat-lab-step-drag-handle');
    drag.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      options.onBeginPointerReorder(event);
    });
    const number = text('span', 'combat-lab-step-number', String(options.index + 1));
    const action = text('span', 'combat-lab-step-action', combatLabActionLabelRu(step.action));
    const target = text('span', 'combat-lab-step-target', combatLabActionTargetLabelRu(options.experiment, step.action));
    const state = text('span', 'combat-lab-step-state', combatLabRuntimeStateLabelRu(runtime?.state ?? null));
    state.dataset.state = runtime?.state ?? 'idle';
    summary.append(drag, number, action, target, state);
    summary.addEventListener('click', () => options.onSelect());

    const body = document.createElement('div');
    body.className = 'combat-lab-step-card-body';
    body.append(
      compactFact('Начало', conditionSummary(step.startCondition)),
      compactFact('Завершение', completionSummary(step)),
      compactFact('Повтор', repeatSummary(step)),
      compactFact('Предельное время', `${step.timeoutSeconds} с`),
      compactFact('Ошибка', failurePolicyLabel(step.failurePolicy)),
    );
    if (step.breakpointBefore) body.append(compactFact('Точка остановки', 'перед действием'));
    if (runtime?.reasonRu) body.append(text('div', 'combat-lab-step-reason', runtime.reasonRu));

    const actions = document.createElement('div');
    actions.className = 'combat-lab-step-card-actions';
    actions.append(
      actionButton('Копия', options.onDuplicate),
      actionButton(step.enabled ? 'Отключить' : 'Включить', options.onToggleEnabled),
      actionButton('Удалить', options.onDelete, 'danger'),
    );
    body.append(actions);
    this.details.append(summary, body);
    this.root.append(this.details);

    this.root.addEventListener('click', () => options.onSelect());
    this.root.addEventListener('keydown', this.handleKeyDown);
  }

  destroy(): void {
    this.root.removeEventListener('keydown', this.handleKeyDown);
    this.root.remove();
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (!event.altKey) return;
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.options.onMoveBy(-1);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.options.onMoveBy(1);
    }
  };
}

function conditionSummary(condition: CombatLabScenarioStepV1['startCondition']): string {
  switch (condition.kind) {
    case 'always': return 'сразу';
    case 'elapsed': return `${condition.seconds} с от ${condition.anchor === 'experiment_start' ? 'начала опыта' : 'начала шага'}`;
    case 'step_state': return `${condition.trackId}/${condition.stepId}: ${condition.state}`;
    case 'role_state': return `${condition.roleId}: ${condition.state}`;
    case 'contact': return `${condition.observerRoleId} ${condition.present ? 'обнаружил' : 'потерял'} ${condition.targetRoleId}`;
    case 'ammo': return condition.comparison === 'empty'
      ? `${condition.roleId}: пусто`
      : `${condition.roleId}: ${condition.comparison} ${condition.rounds}`;
    case 'suppression': return `${condition.roleId}: ${condition.comparison} ${condition.value}`;
  }
}

function completionSummary(step: CombatLabScenarioStepV1): string {
  const completion = step.completion;
  if (completion.kind === 'production_action') return 'физическое действие';
  if (completion.kind === 'shot_resolved') return 'выстрел разрешён';
  return `условие: ${conditionSummary(completion.condition)}`;
}

function repeatSummary(step: CombatLabScenarioStepV1): string {
  return step.repeat.kind === 'once'
    ? 'один раз'
    : `до условия, максимум ${step.repeat.maximumAttempts}, пауза ${step.repeat.retryDelaySeconds} с`;
}

function failurePolicyLabel(value: CombatLabScenarioStepV1['failurePolicy']): string {
  if (value === 'stop_experiment') return 'остановить опыт';
  if (value === 'skip_step') return 'пропустить шаг';
  return 'ждать доступности';
}

function compactFact(label: string, value: string): HTMLElement {
  const row = document.createElement('div');
  row.className = 'combat-lab-step-fact';
  row.append(text('span', '', label), text('strong', '', value));
  return row;
}

function actionButton(label: string, onClick: () => void, className = ''): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  if (className) button.classList.add(className);
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    onClick();
  });
  return button;
}

function iconButton(label: string, ariaLabel: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.setAttribute('aria-label', ariaLabel);
  return button;
}

function text<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, value: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = value;
  return element;
}