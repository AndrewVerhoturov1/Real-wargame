import type { CombatLabExperimentV1 } from '../../core/testing/combat-lab';
import { normalizeMaximumSimulationSeconds } from '../scenario-editor/CombatLabExperimentRuntimeSettings';

const PRESET_SECONDS = [30, 60, 120, 300] as const;
const CUSTOM_VALUE = 'custom';

export interface CombatLabExperimentSettingsDialogOptions {
  readonly host: HTMLElement;
  readonly getExperiment: () => CombatLabExperimentV1;
  readonly onApply: (maximumSimulationSeconds: number) => void;
}

export class CombatLabExperimentSettingsDialog {
  private readonly dialog = document.createElement('dialog');
  private readonly form = document.createElement('form');
  private readonly preset = document.createElement('select');
  private readonly custom = document.createElement('input');
  private readonly error = document.createElement('p');
  private readonly onPresetChanged = () => this.syncCustomAvailability();
  private readonly onSubmit = (event: SubmitEvent) => this.handleSubmit(event);
  private destroyed = false;

  constructor(private readonly options: CombatLabExperimentSettingsDialogOptions) {
    this.dialog.className = 'combat-lab-experiment-settings-dialog';
    this.dialog.setAttribute('aria-label', 'Настройки эксперимента');
    this.form.method = 'dialog';
    this.form.className = 'combat-lab-experiment-settings-dialog__form';
    this.form.append(heading('Настройки эксперимента'));

    const description = document.createElement('p');
    description.textContent = 'Лимит задаётся в симуляционных секундах и одинаково применяется к визуальному прогону и серии.';
    this.form.append(description);

    const presetField = document.createElement('label');
    presetField.append(labelText('Максимальная длительность'));
    for (const seconds of PRESET_SECONDS) {
      const option = document.createElement('option');
      option.value = String(seconds);
      option.textContent = `${seconds} с`;
      this.preset.append(option);
    }
    const customOption = document.createElement('option');
    customOption.value = CUSTOM_VALUE;
    customOption.textContent = 'Произвольное значение';
    this.preset.append(customOption);
    presetField.append(this.preset);

    const customField = document.createElement('label');
    customField.append(labelText('Произвольная длительность, с'));
    this.custom.type = 'number';
    this.custom.min = '0.1';
    this.custom.max = '600';
    this.custom.step = '0.1';
    this.custom.inputMode = 'decimal';
    customField.append(this.custom);

    this.error.className = 'combat-lab-experiment-settings-dialog__error';
    this.error.setAttribute('role', 'alert');

    const actions = document.createElement('div');
    actions.className = 'combat-lab-experiment-settings-dialog__actions';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = 'Отмена';
    cancel.addEventListener('click', () => this.dialog.close());
    const save = document.createElement('button');
    save.type = 'submit';
    save.className = 'primary';
    save.textContent = 'Сохранить';
    actions.append(cancel, save);

    this.form.append(presetField, customField, this.error, actions);
    this.dialog.append(this.form);
    options.host.append(this.dialog);
    this.preset.addEventListener('change', this.onPresetChanged);
    this.form.addEventListener('submit', this.onSubmit);
  }

  open(): void {
    if (this.destroyed) return;
    const maximum = this.options.getExperiment().stopCondition.maximumSimulationSeconds;
    const preset = PRESET_SECONDS.find((candidate) => candidate === maximum);
    this.preset.value = preset === undefined ? CUSTOM_VALUE : String(preset);
    this.custom.value = String(maximum);
    this.error.textContent = '';
    this.syncCustomAvailability();
    if (!this.dialog.open) this.dialog.showModal();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.preset.removeEventListener('change', this.onPresetChanged);
    this.form.removeEventListener('submit', this.onSubmit);
    this.dialog.remove();
  }

  private syncCustomAvailability(): void {
    const custom = this.preset.value === CUSTOM_VALUE;
    this.custom.disabled = !custom;
    if (custom) this.custom.focus();
  }

  private handleSubmit(event: SubmitEvent): void {
    event.preventDefault();
    try {
      const raw = this.preset.value === CUSTOM_VALUE ? Number(this.custom.value) : Number(this.preset.value);
      const maximumSimulationSeconds = normalizeMaximumSimulationSeconds(raw);
      this.options.onApply(maximumSimulationSeconds);
      this.dialog.close();
    } catch (error) {
      this.error.textContent = error instanceof Error ? error.message : 'Не удалось сохранить длительность эксперимента.';
    }
  }
}

function heading(text: string): HTMLHeadingElement {
  const element = document.createElement('h3');
  element.textContent = text;
  return element;
}

function labelText(text: string): HTMLSpanElement {
  const element = document.createElement('span');
  element.textContent = text;
  return element;
}
