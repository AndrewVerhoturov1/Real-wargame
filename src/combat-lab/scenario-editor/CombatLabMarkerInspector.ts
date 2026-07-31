import type { CombatLabExperimentV1, CombatLabMarkerV1 } from '../../core/testing/combat-lab/experiment';
import type { CombatLabSelectionControllerV1 } from '../selection/CombatLabSelectionController';
import type { CombatLabExperimentDraft } from './CombatLabExperimentDraft';
import type { CombatLabMarkerManager } from './CombatLabMarkerManager';

export interface CombatLabMarkerInspectorOptionsV1 {
  readonly host: HTMLElement;
  readonly draft: CombatLabExperimentDraft;
  readonly manager: CombatLabMarkerManager;
  readonly selection: Pick<CombatLabSelectionControllerV1, 'subscribe'>;
  readonly onExperimentChanged?: (experiment: CombatLabExperimentV1) => void;
}

export class CombatLabMarkerInspector {
  readonly root = document.createElement('section');
  private readonly unsubscribe: () => void;
  private destroyed = false;

  constructor(private readonly options: CombatLabMarkerInspectorOptionsV1) {
    this.root.className = 'combat-lab-marker-inspector combat-lab-panel';
    this.root.setAttribute('aria-label', 'Метки и области программы');
    options.host.append(this.root);
    this.unsubscribe = options.selection.subscribe(() => this.render());
    this.render();
  }

  refresh(): void {
    this.render();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.unsubscribe();
    this.root.remove();
  }

  private render(): void {
    if (this.destroyed) return;
    const experiment = this.options.draft.getExperiment();
    const marker = this.options.manager.getSelectedMarker();
    const heading = document.createElement('header');
    heading.className = 'combat-lab-marker-inspector__heading';
    heading.append(text('h3', '', 'Метки и области'));

    const list = document.createElement('div');
    list.className = 'combat-lab-marker-list';
    for (const candidate of experiment.markers) {
      const control = button(candidate.titleRu, () => this.options.manager.select(candidate.markerId));
      control.classList.toggle('active', marker?.markerId === candidate.markerId);
      control.setAttribute('aria-pressed', String(marker?.markerId === candidate.markerId));
      control.title = candidate.kind === 'circle' ? 'Круглая область' : 'Точечная метка';
      list.append(control);
    }
    if (experiment.markers.length === 0) list.append(text('div', 'combat-lab-editor-empty', 'Метки ещё не созданы.'));

    const content = marker ? this.buildEditor(marker) : text('div', 'combat-lab-editor-note', 'Выберите метку на карте или в списке.');
    this.root.replaceChildren(heading, list, content);
  }

  private buildEditor(marker: CombatLabMarkerV1): HTMLElement {
    const form = document.createElement('div');
    form.className = 'combat-lab-marker-form';
    const title = input('text', marker.titleRu);
    const x = numberInput(marker.xMetres, 0.1);
    const y = numberInput(marker.yMetres, 0.1);
    const radius = marker.kind === 'circle' ? numberInput(marker.radiusMetres, 0.1) : null;
    const id = input('text', marker.markerId);
    id.readOnly = true;
    id.classList.add('is-technical');

    const status = text('div', 'combat-lab-dialog-error', '');
    status.setAttribute('role', 'alert');
    const referenceHost = document.createElement('div');
    referenceHost.className = 'combat-lab-marker-reference-summary';

    const save = button('Сохранить', () => {
      try {
        this.options.manager.rename(marker.markerId, title.value);
        this.options.manager.updateCoordinates(marker.markerId, Number(x.value), Number(y.value), radius ? Number(radius.value) : undefined);
        status.textContent = 'Изменения сохранены.';
        this.options.onExperimentChanged?.(this.options.draft.getExperiment());
        this.render();
      } catch (error) {
        status.textContent = error instanceof Error ? error.message : 'Не удалось сохранить метку.';
      }
    });
    save.classList.add('primary');

    const actions = document.createElement('div');
    actions.className = 'combat-lab-marker-actions';
    actions.append(
      button('Указать на карте', () => this.options.manager.beginMove(marker.markerId)),
      button('Дублировать', () => {
        this.options.manager.duplicate(marker.markerId);
        this.options.onExperimentChanged?.(this.options.draft.getExperiment());
        this.render();
      }),
    );
    if (marker.kind === 'circle') actions.append(button('Изменить радиус на карте', () => this.options.manager.beginResize(marker.markerId)));
    const remove = button('Удалить', () => this.tryRemove(marker, referenceHost, status));
    remove.classList.add('danger');
    actions.append(remove);

    form.append(
      text('div', 'combat-lab-marker-kind', marker.kind === 'circle' ? 'Круглая область' : 'Точечная метка'),
      field('Название', title),
      inlineFields(field('X, м', x), field('Y, м', y), ...(radius ? [field('Радиус, м', radius)] : [])),
      field('Технический ID', id),
      save,
      actions,
      status,
      referenceHost,
    );
    return form;
  }

  private tryRemove(marker: CombatLabMarkerV1, referenceHost: HTMLElement, status: HTMLElement): void {
    const summary = this.options.manager.getReferenceSummary(marker.markerId);
    if (summary.references.length === 0) {
      this.options.manager.remove(marker.markerId);
      this.options.onExperimentChanged?.(this.options.draft.getExperiment());
      this.render();
      return;
    }
    status.textContent = 'Обычное удаление заблокировано: метка используется программой.';
    const message = text('pre', '', summary.messageRu);
    const cascade = button('Удалить метку и зависимые действия', () => {
      this.options.manager.removeCascade(marker.markerId);
      this.options.onExperimentChanged?.(this.options.draft.getExperiment());
      this.render();
    });
    cascade.classList.add('danger');
    referenceHost.replaceChildren(message, cascade);
  }
}

function input(type: string, value: string): HTMLInputElement {
  const control = document.createElement('input');
  control.type = type;
  control.value = value;
  return control;
}

function numberInput(value: number, step: number): HTMLInputElement {
  const control = input('number', String(value));
  control.step = String(step);
  return control;
}

function field(labelRu: string, control: HTMLElement): HTMLLabelElement {
  const label = document.createElement('label');
  label.className = 'combat-lab-field';
  label.append(text('span', '', labelRu), control);
  return label;
}

function inlineFields(...fields: HTMLElement[]): HTMLElement {
  const root = document.createElement('div');
  root.className = 'combat-lab-marker-inline-fields';
  root.append(...fields);
  return root;
}

function button(label: string, onClick: () => void): HTMLButtonElement {
  const control = document.createElement('button');
  control.type = 'button';
  control.textContent = label;
  control.addEventListener('click', onClick);
  return control;
}

function text<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, value: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = value;
  return element;
}
