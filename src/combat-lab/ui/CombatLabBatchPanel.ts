import {
  COMBAT_LAB_METRIC_IDS,
  type CombatLabMetricId,
} from '../../core/testing/combat-lab/CombatLabContracts';
import type {
  CombatLabBatchIdentityV1,
  CombatLabBatchRequestV1,
  CombatLabBatchResultV1,
} from '../../core/testing/combat-lab/experiment/CombatLabBatchContracts';
import type { CombatLabExperimentV1 } from '../../core/testing/combat-lab/experiment/CombatLabExperimentContracts';
import { digestCombatLabExperiment } from '../../core/testing/combat-lab/experiment/CombatLabExperimentDigest';
import type { CombatLabExperimentIssueV1 } from '../../core/testing/combat-lab/experiment/CombatLabExperimentValidation';
import { CombatLabBatchClient, defaultCombatLabWorkerCount } from '../runtime/CombatLabBatchClient';
import { combatLabMetricLabelRu } from './CombatLabMetricLabels';

const MAX_UINT32 = 0xffff_ffff;
let batchSequence = 0;

export interface CombatLabBatchPanelOptions {
  readonly host: HTMLElement;
  readonly client: CombatLabBatchClient;
  readonly getExperiment: () => CombatLabExperimentV1;
  readonly getValidationIssues: () => readonly CombatLabExperimentIssueV1[];
  readonly onResult: (result: CombatLabBatchResultV1) => void;
}

export interface CombatLabExplicitSeedParseSuccessV1 {
  readonly ok: true;
  readonly seeds: readonly number[];
}

export interface CombatLabExplicitSeedParseFailureV1 {
  readonly ok: false;
  readonly messageRu: string;
}

export type CombatLabExplicitSeedParseResultV1 = CombatLabExplicitSeedParseSuccessV1 | CombatLabExplicitSeedParseFailureV1;

export class CombatLabBatchPanel {
  readonly element = document.createElement('section');
  private readonly runCount = numberInput(1, 10_000, 1, 100);
  private readonly seedStrategy = document.createElement('select');
  private readonly seed = numberInput(1, MAX_UINT32, 1, 1);
  private readonly explicitSeeds = document.createElement('textarea');
  private readonly maximumSeconds = numberInput(0.1, 600, 0.1, 16);
  private readonly workerCount = document.createElement('select');
  private readonly metricInputs = new Map<CombatLabMetricId, HTMLInputElement>();
  private readonly startButton = button('Запустить серию');
  private readonly cancelButton = button('Отменить');
  private readonly progress = document.createElement('progress');
  private readonly status = document.createElement('div');
  private activeIdentity: CombatLabBatchIdentityV1 | null = null;
  private lastProgressUpdateMs = Number.NEGATIVE_INFINITY;
  private destroyed = false;

  constructor(private readonly options: CombatLabBatchPanelOptions) {
    this.element.className = 'combat-lab-batch-panel';
    this.seedStrategy.append(
      option('fixed', 'Одно начальное число'),
      option('sequential', 'Последовательные начальные числа'),
      option('explicit', 'Явный список начальных чисел'),
    );
    for (let count = 1; count <= 4; count += 1) this.workerCount.append(option(String(count), String(count)));
    this.workerCount.value = String(defaultCombatLabWorkerCount());
    this.explicitSeeds.rows = 4;
    this.explicitSeeds.placeholder = '9041\n9042\n9043';
    this.progress.max = 100;
    this.progress.value = 0;
    this.status.className = 'combat-lab-batch-panel__status';
    this.status.setAttribute('aria-live', 'polite');
    this.cancelButton.disabled = true;

    const metrics = document.createElement('div');
    metrics.className = 'combat-lab-batch-panel__metrics';
    const initialMetrics = new Set(options.getExperiment().batchDefaults.metricIds);
    for (const metricId of COMBAT_LAB_METRIC_IDS) {
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = initialMetrics.has(metricId);
      this.metricInputs.set(metricId, input);
      const label = document.createElement('label');
      label.append(input, document.createTextNode(combatLabMetricLabelRu(metricId)));
      metrics.append(label);
      input.addEventListener('change', () => this.refreshValidation());
    }

    const controls = document.createElement('div');
    controls.className = 'combat-lab-batch-panel__controls';
    controls.append(
      field('Число прогонов', this.runCount),
      field('Способ задания случайности', this.seedStrategy),
      field('Первое или фиксированное начальное число случайности', this.seed),
      field('Явный список начальных чисел случайности', this.explicitSeeds, 'combat-lab-batch-panel__explicit'),
      field('Предельное время, с', this.maximumSeconds),
      field('Параллельные обработчики', this.workerCount),
    );
    const actions = document.createElement('div');
    actions.className = 'combat-lab-batch-panel__actions';
    actions.append(this.startButton, this.cancelButton, this.progress);
    this.element.append(
      heading('Настройки серии прогонов'),
      controls,
      heading('Собираемые показатели', 'h4'),
      metrics,
      actions,
      this.status,
    );
    options.host.replaceChildren(this.element);

    for (const control of [this.runCount, this.seedStrategy, this.seed, this.explicitSeeds, this.maximumSeconds, this.workerCount]) {
      control.addEventListener('input', () => this.refreshValidation());
      control.addEventListener('change', () => this.refreshValidation());
    }
    this.startButton.addEventListener('click', () => this.start());
    this.cancelButton.addEventListener('click', () => this.cancel());
    this.applyExperimentDefaults();
    this.refreshValidation();
  }

  refresh(): void {
    if (this.destroyed) return;
    this.refreshValidation();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.activeIdentity) this.options.client.cancel();
    this.activeIdentity = null;
    this.element.remove();
  }

  private applyExperimentDefaults(): void {
    const experiment = this.options.getExperiment();
    const config = experiment.batchDefaults;
    this.runCount.value = String(Number.isInteger(config.runCount) ? config.runCount : 100);
    this.maximumSeconds.value = String(config.maximumSimulationSeconds);
    this.workerCount.value = String(Math.min(4, Math.max(1, config.workerCount || defaultCombatLabWorkerCount())));
    this.seedStrategy.value = config.seedStrategy.kind;
    if (config.seedStrategy.kind === 'fixed') this.seed.value = String(config.seedStrategy.seed);
    else if (config.seedStrategy.kind === 'sequential') this.seed.value = String(config.seedStrategy.firstSeed);
    else {
      this.explicitSeeds.value = config.seedStrategy.seeds.join('\n');
      this.seed.value = String(config.seedStrategy.seeds[0] ?? experiment.defaults.seed);
    }
  }

  private start(): void {
    const validation = this.validateControls();
    if (!validation.ok) {
      this.status.textContent = validation.messageRu;
      this.refreshValidation();
      return;
    }
    const experiment = this.options.getExperiment();
    const sourceDigest = digestCombatLabExperiment(experiment);
    const batchRunId = createBatchRunId();
    const request: CombatLabBatchRequestV1 = {
      schemaVersion: 1,
      batchRunId,
      experiment,
      config: {
        runCount: validation.runCount,
        seedStrategy: validation.seedStrategy,
        maximumSimulationSeconds: validation.maximumSimulationSeconds,
        workerCount: validation.workerCount,
        representativeRunCount: Math.min(20, Math.max(1, experiment.batchDefaults.representativeRunCount)),
        metricIds: validation.metricIds,
      },
    };
    const identity = Object.freeze({
      batchRunId,
      experimentRevision: experiment.revision,
      sourceDigest,
    });
    this.activeIdentity = identity;
    this.lastProgressUpdateMs = Number.NEGATIVE_INFINITY;
    this.progress.max = validation.runCount;
    this.progress.value = 0;
    this.status.textContent = 'Серия запущена.';
    this.updateButtons();

    this.options.client.start(request, {
      onProgress: (progress) => {
        if (!this.isActiveIdentity(progress)) return;
        const now = performance.now();
        if (now - this.lastProgressUpdateMs < 100 && progress.completedRuns < progress.totalRuns) return;
        this.lastProgressUpdateMs = now;
        this.progress.max = progress.totalRuns;
        this.progress.value = progress.completedRuns;
        this.status.textContent = `Выполнено ${progress.completedRuns} из ${progress.totalRuns}.`;
      },
      onComplete: (result) => {
        if (!this.isActiveIdentity(result)) return;
        const current = this.options.getExperiment();
        if (current.revision !== result.experimentRevision || digestCombatLabExperiment(current) !== result.sourceDigest) {
          this.finishActive('Эксперимент изменился: устаревший результат серии отброшен.');
          return;
        }
        this.progress.value = result.runCount;
        this.finishActive(`Серия завершена: ${result.runCount} прогонов.`);
        this.options.onResult(result);
      },
      onCancelled: (completedRuns, totalRuns) => {
        if (!this.activeIdentity || this.activeIdentity.batchRunId !== identity.batchRunId) return;
        this.progress.max = totalRuns;
        this.progress.value = completedRuns;
        this.finishActive(`Серия отменена после ${completedRuns} из ${totalRuns}. Частичный результат не принят как итоговый.`);
      },
      onError: (messageRu, technicalDetail) => {
        if (!this.activeIdentity || this.activeIdentity.batchRunId !== identity.batchRunId) return;
        this.finishActive(`${messageRu} ${technicalDetail}`.trim());
      },
    });
  }

  private cancel(): void {
    if (!this.activeIdentity) return;
    this.options.client.cancel();
  }

  private refreshValidation(): void {
    const result = this.validateControls();
    const hasExperimentErrors = this.options.getValidationIssues().some((issue) => issue.severity === 'error');
    this.startButton.disabled = this.activeIdentity !== null || hasExperimentErrors || !result.ok;
    this.cancelButton.disabled = this.activeIdentity === null;
    this.explicitSeeds.closest('label')?.classList.toggle('is-hidden', this.seedStrategy.value !== 'explicit');
    if (!this.activeIdentity) {
      this.status.textContent = hasExperimentErrors
        ? 'Исправьте ошибки эксперимента перед запуском серии.'
        : result.ok ? 'Серия готова к запуску.' : result.messageRu;
    }
  }

  private updateButtons(): void {
    this.startButton.disabled = this.activeIdentity !== null;
    this.cancelButton.disabled = this.activeIdentity === null;
  }

  private finishActive(messageRu: string): void {
    this.activeIdentity = null;
    this.refreshValidation();
    this.status.textContent = messageRu;
  }

  private isActiveIdentity(identity: CombatLabBatchIdentityV1): boolean {
    return this.activeIdentity !== null
      && this.activeIdentity.batchRunId === identity.batchRunId
      && this.activeIdentity.experimentRevision === identity.experimentRevision
      && this.activeIdentity.sourceDigest === identity.sourceDigest;
  }

  private validateControls(): ControlValidationResult {
    const runCount = Number(this.runCount.value);
    if (!Number.isInteger(runCount) || runCount < 1 || runCount > 10_000) return failure('Число прогонов должно быть от 1 до 10 000.');
    const seed = Number(this.seed.value);
    if (!validSeed(seed)) return failure('Начальное число случайности должно быть целым числом от 1 до 4294967295.');
    const maximumSimulationSeconds = Number(this.maximumSeconds.value);
    if (!Number.isFinite(maximumSimulationSeconds) || maximumSimulationSeconds < 0.1 || maximumSimulationSeconds > 600) {
      return failure('Предельное время должно быть от 0,1 до 600 секунд.');
    }
    const workerCount = Number(this.workerCount.value);
    if (!Number.isInteger(workerCount) || workerCount < 1 || workerCount > 4) {
      return failure('Число параллельных обработчиков должно быть от 1 до 4.');
    }
    const metricIds = [...this.metricInputs.entries()]
      .filter(([, input]) => input.checked)
      .map(([metricId]) => metricId);
    if (metricIds.length === 0) return failure('Выберите хотя бы один показатель.');

    let seedStrategy: CombatLabExperimentV1['batchDefaults']['seedStrategy'];
    if (this.seedStrategy.value === 'fixed') seedStrategy = { kind: 'fixed', seed };
    else if (this.seedStrategy.value === 'sequential') seedStrategy = { kind: 'sequential', firstSeed: seed };
    else {
      const parsed = parseCombatLabExplicitSeeds(this.explicitSeeds.value);
      if (!parsed.ok) return failure(parsed.messageRu);
      if (parsed.seeds.length !== runCount) {
        return failure(`В явном списке ${parsed.seeds.length} начальных чисел, а прогонов указано ${runCount}.`);
      }
      seedStrategy = { kind: 'explicit', seeds: parsed.seeds };
    }
    return {
      ok: true,
      runCount,
      seedStrategy,
      maximumSimulationSeconds,
      workerCount,
      metricIds,
    };
  }
}

interface ControlValidationSuccess {
  readonly ok: true;
  readonly runCount: number;
  readonly seedStrategy: CombatLabExperimentV1['batchDefaults']['seedStrategy'];
  readonly maximumSimulationSeconds: number;
  readonly workerCount: number;
  readonly metricIds: readonly CombatLabMetricId[];
}
interface ControlValidationFailure { readonly ok: false; readonly messageRu: string }
type ControlValidationResult = ControlValidationSuccess | ControlValidationFailure;

export function parseCombatLabExplicitSeeds(text: string): CombatLabExplicitSeedParseResultV1 {
  const seeds: number[] = [];
  const lines = text.split(/\r?\n/);
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const tokens = lines[lineIndex]!.split(/[\s,;]+/).filter(Boolean);
    for (let tokenIndex = 0; tokenIndex < tokens.length; tokenIndex += 1) {
      const token = tokens[tokenIndex]!;
      const seed = Number(token);
      if (!validSeed(seed)) {
        return {
          ok: false,
          messageRu: `Строка ${lineIndex + 1}, значение ${tokenIndex + 1}: «${token}» не является допустимым начальным числом 1..4294967295.`,
        };
      }
      seeds.push(seed);
    }
  }
  if (seeds.length === 0) return { ok: false, messageRu: 'Явный список начальных чисел пуст.' };
  return { ok: true, seeds: Object.freeze(seeds) };
}

function validSeed(seed: number): boolean {
  return Number.isInteger(seed) && seed >= 1 && seed <= MAX_UINT32;
}
function failure(messageRu: string): ControlValidationFailure { return { ok: false, messageRu }; }
function createBatchRunId(): string {
  batchSequence += 1;
  const uuid = globalThis.crypto?.randomUUID?.();
  return uuid ? `combat-lab-batch:${uuid}` : `combat-lab-batch:${Date.now()}:${batchSequence}`;
}
function numberInput(min: number, max: number, step: number, value: number): HTMLInputElement {
  const input = document.createElement('input');
  input.type = 'number';
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(value);
  return input;
}
function option(value: string, label: string): HTMLOptionElement {
  const item = document.createElement('option');
  item.value = value;
  item.textContent = label;
  return item;
}
function button(label: string): HTMLButtonElement {
  const control = document.createElement('button');
  control.type = 'button';
  control.textContent = label;
  return control;
}
function field(labelRu: string, control: HTMLElement, className = ''): HTMLLabelElement {
  const label = document.createElement('label');
  label.className = className;
  label.append(document.createTextNode(labelRu), control);
  return label;
}
function heading(text: string, tag: 'h3' | 'h4' = 'h3'): HTMLHeadingElement {
  const headingElement = document.createElement(tag);
  headingElement.textContent = text;
  return headingElement;
}