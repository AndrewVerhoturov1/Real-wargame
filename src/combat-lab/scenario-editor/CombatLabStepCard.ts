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
    const { step, runtime, selected } = options;
    const summary = buildCombatLabActionSummary(options.experiment, step);
    this.root.className = 'combat-lab-step-card combat-lab-step-card--compact';
    this.root.dataset.combatLabStepCard = step.stepId;
    this.root.dataset.trackId = options.trackId;
    this.root.dataset.stepIndex = String(options.index);
    this.root.dataset.runtimeState = runtime?.state ?? 'idle';
    this.root.classList.toggle('is-selected', selected);
    this.root.classList.toggle('is-disabled', !step.enabled);
    this.root.tabIndex = 0;

    const main = document.createElement('div');
    main.className = 'combat-lab-step-summary';
    const drag = iconButton('↕', 'Перетащить действие');
    drag.classList.add('combat-lab-step-drag-handle');
    drag.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      options.onBeginPointerReorder(event);
    });
    const number = text('span', 'combat-lab-step-number', String(options.index + 1));
    const copy = document.createElement('div');
    copy.className = 'combat-lab-step-copy';
    copy.append(
      text('strong', 'combat-lab-step-action', summary.titleRu),
      text('span', 'combat-lab-step-target', summary.targetRu),
      text('span', 'combat-lab-step-schedule', summary.scheduleRu),
    );
    const state = text('span', 'combat-lab-step-state', combatLabRuntimeStateLabelRu(runtime?.state ?? null));
    state.dataset.state = runtime?.state ?? 'idle';
    main.append(drag, number, copy, state);

    const actions = document.createElement('div');
    actions.className = 'combat-lab-step-card-actions';
    actions.append(
      actionButton('Изменить', (button) => options.onEdit(button)),
      actionButton('Копировать', () => options.onDuplicate()),
      actionButton(step.enabled ? 'Отключить' : 'Включить', () => options.onToggleEnabled()),
      actionButton('Удалить', () => options.onDelete(), 'danger'),
    );
    this.root.append(main, actions);
    if (runtime?.reasonRu) this.root.append(text('div', 'combat-lab-step-reason', runtime.reasonRu));

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

function actionButton(label: string, onClick: (button: HTMLButtonElement) => void, className = ''): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  if (className) button.classList.add(className);
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    onClick(button);
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
