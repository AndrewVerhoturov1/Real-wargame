import type { CombatLabParticipantEditContextV1 } from '../editor/CombatLabParticipantEditContext';
import { listCombatLabQuickParameterDescriptors } from '../parameters/CombatLabQuickParameterRegistry';
import {
  listCombatLabQuickParameterPresets,
  resolveCombatLabQuickParameterPresetIds,
} from '../parameters/CombatLabQuickParameterPresets';
import type { CombatLabQuickParameterIdV1 } from '../parameters/CombatLabQuickParameterTypes';

export interface CombatLabQuickParameterPickerRequestV1 {
  readonly context: CombatLabParticipantEditContextV1;
  readonly pinnedIds: readonly CombatLabQuickParameterIdV1[];
  readonly onApply: (ids: readonly CombatLabQuickParameterIdV1[]) => void;
}

export class CombatLabQuickParameterPickerDialog {
  private readonly dialog = document.createElement('dialog');
  private request: CombatLabQuickParameterPickerRequestV1 | null = null;
  private returnFocus: HTMLElement | null = null;
  private destroyed = false;

  constructor() {
    this.dialog.className = 'combat-lab-modal combat-lab-quick-parameter-picker';
    this.dialog.setAttribute('aria-label', 'Добавить быстрые параметры');
    document.body.append(this.dialog);
    this.dialog.addEventListener('close', this.handleClose);
    this.dialog.addEventListener('cancel', this.handleCancel);
  }

  open(request: CombatLabQuickParameterPickerRequestV1): void {
    if (this.destroyed) return;
    this.request = request;
    this.returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.render();
    if (typeof this.dialog.showModal === 'function') this.dialog.showModal();
    else this.dialog.setAttribute('open', '');
  }

  close(): void {
    if (!this.dialog.open && !this.dialog.hasAttribute('open')) return;
    if (typeof this.dialog.close === 'function') this.dialog.close();
    else {
      this.dialog.removeAttribute('open');
      this.handleClose();
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.dialog.removeEventListener('close', this.handleClose);
    this.dialog.removeEventListener('cancel', this.handleCancel);
    this.dialog.remove();
    this.request = null;
    this.returnFocus = null;
  }

  private render(): void {
    const request = this.request;
    if (!request) return;
    const selected = new Set<CombatLabQuickParameterIdV1>(request.pinnedIds);
    const form = document.createElement('form');
    form.method = 'dialog';
    const header = node('header', 'combat-lab-modal-header');
    header.append(
      node('div', '', 'Добавить параметры'),
      node('p', '', 'Выберите отдельные параметры или готовый набор. Набор меняет только список на панели.'),
    );

    const presetSection = node('section', 'combat-lab-quick-parameter-picker-presets');
    presetSection.append(node('h4', '', 'Наборы'));
    for (const preset of listCombatLabQuickParameterPresets()) {
      const control = button(preset.labelRu, 'combat-lab-quick-parameter-preset-button');
      const available = preset.isAvailable(request.context);
      control.disabled = !available;
      control.title = available ? preset.descriptionRu : preset.unavailableReasonRu;
      control.addEventListener('click', () => {
        for (const id of resolveCombatLabQuickParameterPresetIds(preset.presetId, request.context)) selected.add(id);
        syncCheckboxes(form, selected);
      });
      presetSection.append(control);
    }

    const list = node('div', 'combat-lab-quick-parameter-picker-list');
    for (const descriptor of listCombatLabQuickParameterDescriptors()) {
      const available = descriptor.isAvailable?.(request.context) ?? true;
      const label = node('label', 'combat-lab-quick-parameter-picker-option');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = descriptor.id;
      checkbox.dataset.quickParameterId = descriptor.id;
      checkbox.checked = selected.has(descriptor.id);
      checkbox.disabled = !available;
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) selected.add(descriptor.id);
        else selected.delete(descriptor.id);
      });
      const copy = node('span', '');
      copy.append(
        node('strong', '', descriptor.labelRu),
        node('small', '', available ? descriptor.descriptionRu : descriptor.unavailableReasonRu?.(request.context) ?? 'Недоступно.'),
      );
      label.append(checkbox, copy);
      list.append(label);
    }

    const actions = node('footer', 'combat-lab-modal-actions');
    const cancel = button('Отмена');
    cancel.value = 'cancel';
    cancel.addEventListener('click', () => this.close());
    const apply = button('Применить список', 'primary');
    apply.value = 'apply';
    apply.addEventListener('click', () => {
      request.onApply(Object.freeze([...selected]));
      this.close();
    });
    actions.append(cancel, apply);
    form.append(header, presetSection, list, actions);
    this.dialog.replaceChildren(form);
  }

  private readonly handleCancel = (event: Event): void => {
    event.preventDefault();
    this.close();
  };

  private readonly handleClose = (): void => {
    this.request = null;
    const returnFocus = this.returnFocus;
    this.returnFocus = null;
    returnFocus?.focus();
  };
}

function syncCheckboxes(form: HTMLElement, selected: ReadonlySet<CombatLabQuickParameterIdV1>): void {
  for (const checkbox of form.querySelectorAll<HTMLInputElement>('input[data-quick-parameter-id]')) {
    checkbox.checked = selected.has(checkbox.value as CombatLabQuickParameterIdV1);
  }
}

function button(label: string, className = ''): HTMLButtonElement {
  const control = document.createElement('button');
  control.type = 'button';
  control.textContent = label;
  if (className) control.className = className;
  return control;
}

function node<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}
