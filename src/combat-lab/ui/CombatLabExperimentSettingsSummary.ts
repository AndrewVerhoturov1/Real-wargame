import type { CombatLabExperimentV1 } from '../../core/testing/combat-lab';
import { COMBAT_LAB_METRES_PER_CELL } from '../../core/testing/combat-lab/CombatLabGridScale';

export interface CombatLabExperimentSettingsSummaryOptions {
  readonly host: HTMLElement;
  readonly getExperiment: () => CombatLabExperimentV1;
  readonly onOpenSettings: () => void;
}

export class CombatLabExperimentSettingsSummary {
  private readonly root = document.createElement('div');
  private readonly seed = document.createElement('span');
  private readonly duration = document.createElement('span');
  private readonly grid = document.createElement('span');
  private readonly settingsButton = document.createElement('button');
  private readonly onClick = () => this.options.onOpenSettings();
  private destroyed = false;

  constructor(private readonly options: CombatLabExperimentSettingsSummaryOptions) {
    this.root.className = 'combat-lab-experiment-settings-summary';
    this.seed.className = 'combat-lab-experiment-settings-summary__seed';
    this.duration.className = 'combat-lab-experiment-settings-summary__duration';
    this.grid.className = 'combat-lab-experiment-settings-summary__grid';
    this.settingsButton.type = 'button';
    this.settingsButton.className = 'combat-lab-experiment-settings-summary__button';
    this.settingsButton.textContent = 'Настройки';
    this.settingsButton.addEventListener('click', this.onClick);
    this.root.append(this.seed, this.duration, this.grid, this.settingsButton);
    options.host.append(this.root);
    this.refresh();
  }

  refresh(): void {
    if (this.destroyed) return;
    const experiment = this.options.getExperiment();
    this.seed.textContent = `# ${experiment.defaults.seed}`;
    this.seed.title = `Seed: ${experiment.defaults.seed}`;
    this.duration.textContent = `⏱ ${formatSeconds(experiment.stopCondition.maximumSimulationSeconds)}`;
    this.duration.title = `Лимит времени: ${formatSeconds(experiment.stopCondition.maximumSimulationSeconds)}`;
    this.grid.textContent = `Сетка: ${COMBAT_LAB_METRES_PER_CELL}×${COMBAT_LAB_METRES_PER_CELL} м`;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.settingsButton.removeEventListener('click', this.onClick);
    this.root.remove();
  }
}

function formatSeconds(value: number): string {
  const normalized = Number.isInteger(value) ? String(value) : String(value).replace('.', ',');
  return `${normalized} с`;
}
