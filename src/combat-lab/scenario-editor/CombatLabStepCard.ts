import type {
  CombatLabExperimentV1,
  CombatLabScenarioStepV1,
  CombatLabStepRuntimeSnapshotV1,
} from '../../core/testing/combat-lab/experiment';
import { buildCombatLabActionSummary } from './CombatLabActionSummary';
import { combatLabRuntimeStateLabelRu } from './CombatLabEditorFactories';

export interface CombatLabStepCardOptions {
  readonly experiment: CombatLabExperimentV1;
  readonly trackId: string;
  readonly step: CombatLabScenarioStepV1;
  readonly index: number;
  readonly runtime: CombatLabStepRuntimeSnapshotV1 | null;
  readonly selected: boolean;
  readonly onSelect: () => void;
  readonly onEdit: (returnFocusTo: HTMLElement) => void;
  readonly onDuplicate: () => void;
  readonly onToggleEnabled: () => void;
  readonly onDelete: () => void;
  readonly onMoveBy: (offset: -1 | 1) => void;
  readonly onBeginPointerReorder: (event: PointerEvent) => void;
}

export class CombatLabStepCard {
  readonly root = document.createElement('article');

  constructor(private readonly options: CombatLabStepCardOptions) {
    const { step, runtime, selected, experiment } = options;
    const summary = buildCombatLabActionSummary(experiment, step);
    const actorTitle = resolveActorTitle(experiment, options.trackId, step);
    const runtimeLabel = combatLabRuntimeStateLabelRu(runtime?.state ?? null);

    this.root.className = 'combat-lab-step-card combat-lab-step-card--compact';
    this.root.dataset.combatLabStepCard = step.stepId;
    this.root.dataset.trackId = options.trackId;
    this.root.dataset.stepIndex = String(options.index);
    this.root.dataset.runtimeState = runtime?.state ?? 'idle';
    this.root.classList.toggle('is-selected', selected);
    this.root.classList.toggle('is-disabled', !step.enabled);
    this.root.tabIndex = 0;

    const heading = document.createElement('div');
    heading.className = 'combat-lab-step-name-row';
    const drag = iconButton('↕', 'Перетащить действие');
    drag.classList.add('combat-lab-step-drag-handle');
    drag.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      options.onBeginPointerReorder(event);
    });
    const number = text('span', 'combat-lab-step-number', String(options.index + 1));
    const name = text('strong', 'combat-lab-step-name', step.titleRu || summary.titleRu);
    name.title = step.titleRu || summary.titleRu;
    heading.append(drag, number, name);

    const relation = document.createElement('div');
    relation.className = 'combat-lab-step-relation-row';
    relation.append(
      text('span', 'combat-lab-step-actor', actorTitle),
      text('span', 'combat-lab-step-arrow', '→'),
      text('span', 'combat-lab-step-target', summary.targetRu),
    );

    const condition = document.createElement('div');
    condition.className = 'combat-lab-step-condition-row';
    condition.append(
      text('span', 'combat-lab-step-row-label', 'Начало'),
      text('span', 'combat-lab-step-schedule', summary.scheduleRu),
    );

    const runtimeRow = document.createElement('div');
    runtimeRow.className = 'combat-lab-step-runtime-row';
    const state = text('span', 'combat-lab-step-state', step.enabled ? runtimeLabel : 'Отключено');
    state.dataset.state = step.enabled ? runtime?.state ?? 'idle' : 'disabled';
    runtimeRow.append(state);
    if (runtime?.reasonRu) {
      const reason = text('span', 'combat-lab-step-reason', runtime.reasonRu);
      reason.title = runtime.reasonRu;
      runtimeRow.append(reason);
    }

    const actions = document.createElement('div');
    actions.className = 'combat-lab-step-card-actions';
    actions.append(
      actionButton('Изменить', 'Изменить действие', (control) => options.onEdit(control)),
      actionButton('Копия', 'Дублировать действие', () => options.onDuplicate()),
      actionButton(step.enabled ? 'Выкл.' : 'Вкл.', step.enabled ? 'Отключить действие' : 'Включить действие', () => options.onToggleEnabled()),
      actionButton('Удалить', 'Удалить действие', () => options.onDelete(), 'danger'),
    );

    this.root.append(heading, relation, condition, runtimeRow, actions);
    this.root.addEventListener('click', this.handleClick);
    this.root.addEventListener('keydown', this.handleKeyDown);
  }

  destroy(): void {
    this.root.removeEventListener('click', this.handleClick);
    this.root.removeEventListener('keydown', this.handleKeyDown);
    this.root.remove();
  }

  private readonly handleClick = (event: MouseEvent): void => {
    if ((event.target as HTMLElement).closest('button')) return;
    this.options.onSelect();
  };

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Enter' && !event.altKey) {
      event.preventDefault();
      this.options.onEdit(this.root);
      return;
    }
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

function resolveActorTitle(
  experiment: CombatLabExperimentV1,
  trackId: string,
  step: CombatLabScenarioStepV1,
): string {
  const track = experiment.tracks.find((candidate) => candidate.trackId === trackId);
  const actorRoleId = track?.actorRoleId ?? actorRoleForStep(step);
  return experiment.roles.find((role) => role.roleId === actorRoleId)?.titleRu ?? 'Исполнитель';
}

function actorRoleForStep(step: CombatLabScenarioStepV1): string | null {
  const action = step.action;
  if (action.kind === 'wait') return null;
  if (action.kind === 'transfer') return action.sourceRoleId;
  return action.actorRoleId;
}

function actionButton(
  label: string,
  ariaLabel: string,
  onClick: (button: HTMLButtonElement) => void,
  className = '',
): HTMLButtonElement {
  const control = document.createElement('button');
  control.type = 'button';
  control.textContent = label;
  control.setAttribute('aria-label', ariaLabel);
  control.title = ariaLabel;
  if (className) control.classList.add(className);
  control.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    onClick(control);
  });
  return control;
}

function iconButton(label: string, ariaLabel: string): HTMLButtonElement {
  const control = document.createElement('button');
  control.type = 'button';
  control.textContent = label;
  control.setAttribute('aria-label', ariaLabel);
  control.title = ariaLabel;
  return control;
}

function text<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, value: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = value;
  return element;
}
