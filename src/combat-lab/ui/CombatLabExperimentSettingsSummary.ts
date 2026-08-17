import type { CombatLabExperimentV1 } from '../../core/testing/combat-lab';
import { COMBAT_LAB_METRES_PER_CELL } from '../../core/testing/combat-lab/CombatLabGridScale';

export interface CombatLabExperimentSettingsSummaryOptions {
  readonly host: HTMLElement;
  readonly getExperiment: () => CombatLabExperimentV1;
  readonly onOpenSettings: () => void;
  readonly onRandomizeSeed: () => void;
  readonly onUpdateDuration: (maximumSimulationSeconds: number) => void;
  readonly onUpdateSeed: (seed: number) => void;
}

export class CombatLabExperimentSettingsSummary {
  private readonly root = document.createElement('div');
  private readonly seed = document.createElement('input');
  private readonly duration = document.createElement('input');
  private readonly durationUnit = document.createElement('span');
  private readonly grid = document.createElement('span');
  private readonly settingsButton = document.createElement('button');
  private readonly randomizeSeedButton = document.createElement('button');
  private readonly durationField = document.createElement('label');
  private readonly seedField = document.createElement('label');
  private readonly onClick = () => this.options.onOpenSettings();
  private readonly onRandomizeSeed = () => this.options.onRandomizeSeed();
  private readonly onDurationChange = () => {
    const value = Number(this.duration.value);
    if (Number.isFinite(value) && value > 0) this.options.onUpdateDuration(Math.min(3600, Math.max(1, Math.round(value))));
    this.refresh();
  };
  private readonly onSeedChange = () => {
    const value = Number(this.seed.value);
    if (Number.isFinite(value) && value >= 0) this.options.onUpdateSeed(Math.min(2_147_483_647, Math.max(0, Math.round(value))));
    this.refresh();
  };
  private destroyed = false;

  constructor(private readonly options: CombatLabExperimentSettingsSummaryOptions) {
    this.root.className = 'combat-lab-experiment-settings-summary';
    this.seed.type = 'number';
    this.seed.className = 'combat-lab-experiment-settings-summary__seed';
    this.seed.min = '0';
    this.seed.max = '2147483647';
    this.seed.setAttribute('aria-label', 'Зерно случайности');
    this.seedField.className = 'combat-lab-experiment-settings-summary__field combat-lab-experiment-settings-summary__field--seed';
    this.seedField.title = 'Зерно случайности';
    this.seedField.append(symbol('#'), this.seed);
    this.duration.type = 'number';
    this.duration.className = 'combat-lab-experiment-settings-summary__duration';
    this.duration.min = '1';
    this.duration.max = '3600';
    this.duration.setAttribute('aria-label', 'Длительность эксперимента');
    this.durationField.className = 'combat-lab-experiment-settings-summary__field combat-lab-experiment-settings-summary__field--duration';
    this.durationField.title = 'Длительность эксперимента';
    this.durationUnit.className = 'combat-lab-experiment-settings-summary__unit';
    this.durationUnit.textContent = 'с';
    this.durationField.append(symbol('⏱'), this.duration, this.durationUnit);
    this.grid.className = 'combat-lab-experiment-settings-summary__grid';
    this.settingsButton.type = 'button';
    this.settingsButton.className = 'combat-lab-experiment-settings-summary__button';
    this.settingsButton.textContent = 'Настройки';
    this.settingsButton.addEventListener('click', this.onClick);
    this.randomizeSeedButton.type = 'button';
    this.randomizeSeedButton.className = 'combat-lab-experiment-settings-summary__randomize';
    this.randomizeSeedButton.textContent = '⚄';
    this.randomizeSeedButton.title = 'Новое зерно случайности';
    this.randomizeSeedButton.setAttribute('aria-label', 'Создать новое зерно случайности');
    this.randomizeSeedButton.addEventListener('click', this.onRandomizeSeed);
    this.duration.addEventListener('change', this.onDurationChange);
    this.seed.addEventListener('change', this.onSeedChange);
    this.seedField.append(this.randomizeSeedButton);
    this.root.append(this.durationField, this.seedField, this.grid, this.settingsButton);
    options.host.append(this.root);
    this.refresh();
  }

  refresh(): void {
    if (this.destroyed) return;
    const experiment = this.options.getExperiment();
    this.seed.value = String(experiment.defaults.seed);
    this.seed.title = `Зерно: ${experiment.defaults.seed}`;
    this.duration.value = String(experiment.stopCondition.maximumSimulationSeconds);
    this.duration.title = `Лимит времени: ${formatSeconds(experiment.stopCondition.maximumSimulationSeconds)}`;
    this.grid.textContent = `Сетка: ${COMBAT_LAB_METRES_PER_CELL}×${COMBAT_LAB_METRES_PER_CELL} м`;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.settingsButton.removeEventListener('click', this.onClick);
    this.randomizeSeedButton.removeEventListener('click', this.onRandomizeSeed);
    this.duration.removeEventListener('change', this.onDurationChange);
    this.seed.removeEventListener('change', this.onSeedChange);
    this.root.remove();
  }
}

function symbol(text: string): HTMLSpanElement {
  const element = document.createElement('span');
  element.className = 'combat-lab-experiment-settings-summary__symbol';
  element.textContent = text;
  return element;
}

function formatSeconds(value: number): string {
  const normalized = Number.isInteger(value) ? String(value) : String(value).replace('.', ',');
  return `${normalized} с`;
}
