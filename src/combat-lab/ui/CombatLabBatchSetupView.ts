import {
  COMBAT_LAB_EXPERIMENT_LIMITS_V1,
  type CombatLabBatchConfigV1,
  type CombatLabExperimentV1,
  type CombatLabSeedStrategyV1,
} from '../../core/testing/combat-lab';

const MAX_UINT32 = 0xffff_ffff;

export interface CombatLabBatchSetupViewOptions {
  readonly host: HTMLElement;
  readonly onStart: () => void;
  readonly onCancel: () => void;
}

export class CombatLabBatchSetupView {
  readonly root = document.createElement('section');
  private readonly runCount = numberInput();
  private readonly seedStrategy = document.createElement('select');
  private readonly seedValue = numberInput();
  private readonly explicitSeeds = document.createElement('textarea');
  private readonly maximumSeconds = numberInput();
  private readonly workerCount = numberInput();
  private readonly representativeCount = numberInput();
  private readonly seedHint = document.createElement('p');
  private readonly fixedWarning = document.createElement('p');
  private readonly startButton = button('Запустить серию', 'primary');
  private readonly cancelButton = button('Отменить');
  private readonly listeners: Array<readonly [EventTarget, string, EventListener]> = [];
  private experimentSeed = 1;
  private running = false;

  constructor(private readonly options: CombatLabBatchSetupViewOptions) {
    this.root.className = 'combat-lab-batch-setup-view';
    const heading = document.createElement('h3');
    heading.textContent = 'Настройка серии';

    this.runCount.min = String(COMBAT_LAB_EXPERIMENT_LIMITS_V1.minimumRunCount);
    this.runCount.max = String(COMBAT_LAB_EXPERIMENT_LIMITS_V1.maximumRunCount);
    this.runCount.step = '1';

    appendOption(this.seedStrategy, 'sequential', 'Последовательные seed');
    appendOption(this.seedStrategy, 'fixed', 'Повторить один и тот же случай');
    appendOption(this.seedStrategy, 'explicit', 'Явный список seed');

    this.seedValue.min = '1';
    this.seedValue.max = String(MAX_UINT32);
    this.seedValue.step = '1';
    this.seedValue.inputMode = 'numeric';
    this.explicitSeeds.rows = 3;
    this.explicitSeeds.placeholder = 'Например: 9041, 9042, 9043';

    this.maximumSeconds.min = String(COMBAT_LAB_EXPERIMENT_LIMITS_V1.minimumSimulationSeconds);
    this.maximumSeconds.max = String(COMBAT_LAB_EXPERIMENT_LIMITS_V1.maximumSimulationSeconds);
    this.maximumSeconds.step = '0.1';
    this.workerCount.min = String(COMBAT_LAB_EXPERIMENT_LIMITS_V1.minimumWorkerCount);
    this.workerCount.max = String(COMBAT_LAB_EXPERIMENT_LIMITS_V1.maximumWorkerCount);
    this.workerCount.step = '1';
    this.representativeCount.min = String(COMBAT_LAB_EXPERIMENT_LIMITS_V1.minimumRepresentativeRuns);
    this.representativeCount.max = String(COMBAT_LAB_EXPERIMENT_LIMITS_V1.maximumRepresentativeRuns);
    this.representativeCount.step = '1';

    this.seedHint.className = 'combat-lab-batch-seed-hint';
    this.fixedWarning.className = 'combat-lab-batch-warning';
    this.fixedWarning.textContent = 'Один и тот же seed повторяет один случай. Такой режим проверяет воспроизводимость, но не показывает разброс случайных исходов.';

    const grid = document.createElement('div');
    grid.className = 'combat-lab-batch-setup-grid';
    grid.append(
      field('Число прогонов', this.runCount),
      field('Режим seed', this.seedStrategy),
      field('Первый или фиксированный seed', this.seedValue),
      field('Явные seed — ровно по числу прогонов', this.explicitSeeds),
      field('Максимум симуляционных секунд', this.maximumSeconds),
      field('Рабочие потоки', this.workerCount),
      field('Представительные прогоны', this.representativeCount),
    );

    const actions = document.createElement('div');
    actions.className = 'combat-lab-batch-actions';
    this.cancelButton.disabled = true;
    actions.append(this.startButton, this.cancelButton);
    this.root.append(heading, grid, this.seedHint, this.fixedWarning, actions);
    options.host.append(this.root);

    this.listen(this.startButton, 'click', options.onStart);
    this.listen(this.cancelButton, 'click', options.onCancel);
    this.listen(this.seedStrategy, 'change', () => this.refreshSeedExplanation());
    this.listen(this.seedValue, 'input', () => this.refreshSeedExplanation());
    this.listen(this.explicitSeeds, 'input', () => this.refreshSeedExplanation());
    this.listen(this.runCount, 'input', () => this.refreshSeedExplanation());
  }

  reset(experiment: CombatLabExperimentV1): void {
    if (this.running) return;
    const defaults = experiment.batchDefaults;
    this.experimentSeed = experiment.defaults.seed;
    this.runCount.value = String(defaults.runCount);
    this.seedStrategy.value = defaults.seedStrategy.kind;
    if (defaults.seedStrategy.kind === 'fixed') this.seedValue.value = String(defaults.seedStrategy.seed);
    else if (defaults.seedStrategy.kind === 'sequential') this.seedValue.value = String(defaults.seedStrategy.firstSeed);
    else {
      this.seedValue.value = String(experiment.defaults.seed);
      this.explicitSeeds.value = defaults.seedStrategy.seeds.join(', ');
    }
    if (defaults.seedStrategy.kind !== 'explicit') this.explicitSeeds.value = '';
    this.maximumSeconds.value = String(defaults.maximumSimulationSeconds);
    this.workerCount.value = String(defaults.workerCount);
    this.representativeCount.value = String(defaults.representativeRunCount);
    this.refreshSeedExplanation();
  }

  readConfig(experiment: CombatLabExperimentV1): CombatLabBatchConfigV1 {
    const runCount = integerValue(this.runCount, 'Число прогонов');
    const workerCount = integerValue(this.workerCount, 'Число рабочих потоков');
    const representativeRunCount = integerValue(this.representativeCount, 'Число представительных прогонов');
    const maximumSimulationSeconds = finiteValue(this.maximumSeconds, 'Максимальное время');
    const seedStrategy = this.readSeedStrategy(runCount);
    return {
      runCount,
      seedStrategy,
      maximumSimulationSeconds,
      workerCount,
      representativeRunCount,
      metricIds: [...experiment.batchDefaults.metricIds],
    };
  }

  setRunning(running: boolean): void {
    this.running = running;
    for (const control of [
      this.runCount,
      this.seedStrategy,
      this.seedValue,
      this.explicitSeeds,
      this.maximumSeconds,
      this.workerCount,
      this.representativeCount,
    ]) control.disabled = running;
    this.startButton.disabled = running;
    this.cancelButton.disabled = !running;
  }

  setStartBlocked(blocked: boolean): void {
    if (!this.running) this.startButton.disabled = blocked;
  }

  destroy(): void {
    for (const [target, type, listener] of this.listeners) target.removeEventListener(type, listener);
    this.listeners.length = 0;
    this.root.remove();
  }

  private readSeedStrategy(runCount: number): CombatLabSeedStrategyV1 {
    if (this.seedStrategy.value === 'fixed') {
      return { kind: 'fixed', seed: seedValue(this.seedValue, 'Фиксированный seed') };
    }
    if (this.seedStrategy.value === 'explicit') {
      const seeds = parseExplicitSeeds(this.explicitSeeds.value);
      if (seeds.length !== runCount) {
        throw new Error(`Явный список должен содержать ровно ${runCount} seed; сейчас ${seeds.length}.`);
      }
      return { kind: 'explicit', seeds };
    }
    return { kind: 'sequential', firstSeed: seedValue(this.seedValue, 'Первый seed') };
  }

  private refreshSeedExplanation(): void {
    const runCount = Math.max(1, Math.trunc(Number(this.runCount.value) || 1));
    const firstSeed = normalizeSeed(Number(this.seedValue.value) || this.experimentSeed);
    const kind = this.seedStrategy.value;
    this.seedValue.disabled = this.running || kind === 'explicit';
    this.explicitSeeds.disabled = this.running || kind !== 'explicit';
    this.fixedWarning.hidden = kind !== 'fixed';
    if (kind === 'fixed') {
      this.seedHint.textContent = `Все ${runCount} прогонов используют seed ${firstSeed}. Уникальных seed: 1.`;
    } else if (kind === 'explicit') {
      const seeds = parseExplicitSeedsLoose(this.explicitSeeds.value);
      this.seedHint.textContent = `Введено seed: ${seeds.length}; уникальных: ${new Set(seeds).size}; требуется: ${runCount}.`;
    } else {
      const lastSeed = ((firstSeed - 1 + runCount - 1) % MAX_UINT32) + 1;
      this.seedHint.textContent = `Будут использованы ${runCount} уникальных seed: ${firstSeed}…${lastSeed}.`;
    }
  }

  private listen(target: EventTarget, type: string, callback: () => void): void {
    const listener: EventListener = () => callback();
    target.addEventListener(type, listener);
    this.listeners.push([target, type, listener]);
  }
}

function field(label: string, control: HTMLElement): HTMLLabelElement {
  const root = document.createElement('label');
  const text = document.createElement('span');
  text.textContent = label;
  root.append(text, control);
  return root;
}

function appendOption(select: HTMLSelectElement, value: string, label: string): void {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = label;
  select.append(option);
}

function button(text: string, className = ''): HTMLButtonElement {
  const element = document.createElement('button');
  element.type = 'button';
  element.textContent = text;
  if (className) element.className = className;
  return element;
}

function numberInput(): HTMLInputElement {
  const input = document.createElement('input');
  input.type = 'number';
  return input;
}

function integerValue(input: HTMLInputElement, label: string): number {
  const value = Number(input.value);
  if (!Number.isInteger(value)) throw new Error(`${label} должно быть целым числом.`);
  return value;
}

function finiteValue(input: HTMLInputElement, label: string): number {
  const value = Number(input.value);
  if (!Number.isFinite(value)) throw new Error(`${label} должно быть числом.`);
  return value;
}

function seedValue(input: HTMLInputElement, label: string): number {
  const value = Number(input.value);
  if (!Number.isInteger(value) || value < 1 || value > MAX_UINT32) {
    throw new Error(`${label} должен быть целым числом от 1 до ${MAX_UINT32}.`);
  }
  return value;
}

function parseExplicitSeeds(value: string): readonly number[] {
  const tokens = value.split(/[\s,;]+/).filter(Boolean);
  return tokens.map((token, index) => {
    const seed = Number(token);
    if (!Number.isInteger(seed) || seed < 1 || seed > MAX_UINT32) {
      throw new Error(`Seed №${index + 1} должен быть целым числом от 1 до ${MAX_UINT32}.`);
    }
    return seed;
  });
}

function parseExplicitSeedsLoose(value: string): readonly number[] {
  return value.split(/[\s,;]+/).filter(Boolean).map(Number).filter((seed) => Number.isInteger(seed) && seed >= 1 && seed <= MAX_UINT32);
}

function normalizeSeed(value: number): number {
  if (!Number.isFinite(value)) return 1;
  const normalized = Math.trunc(value) >>> 0;
  return normalized === 0 ? 1 : normalized;
}
