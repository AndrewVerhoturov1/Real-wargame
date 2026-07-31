import {
  digestCombatLabExperiment,
  validateCombatLabBatchRequest,
  type CombatLabBatchIdentityV1,
  type CombatLabBatchRequestV1,
  type CombatLabBatchResultV1,
  type CombatLabExperimentIssueV1,
  type CombatLabExperimentV1,
} from '../../core/testing/combat-lab';
import { CombatLabBatchClient } from '../runtime/CombatLabBatchClient';
import { CombatLabBatchProgressView } from './CombatLabBatchProgressView';
import { CombatLabBatchSetupView } from './CombatLabBatchSetupView';

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
  private readonly setup: CombatLabBatchSetupView;
  private readonly progress: CombatLabBatchProgressView;
  private activeIdentity: CombatLabBatchIdentityV1 | null = null;
  private lastProgressUpdateMs = Number.NEGATIVE_INFINITY;
  private destroyed = false;

  constructor(private readonly options: CombatLabBatchPanelOptions) {
    this.element.className = 'combat-lab-batch-panel';
    options.host.replaceChildren(this.element);
    this.setup = new CombatLabBatchSetupView({
      host: this.element,
      onStart: () => this.start(),
      onCancel: () => this.cancel(),
    });
    this.progress = new CombatLabBatchProgressView(this.element);
    this.setup.reset(options.getExperiment());
    this.refresh();
  }

  refresh(): void {
    if (this.destroyed) return;
    if (!this.activeIdentity) this.setup.reset(this.options.getExperiment());
    this.setup.setStartBlocked(
      this.activeIdentity !== null
      || this.options.getValidationIssues().some((issue) => issue.severity === 'error'),
    );
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.activeIdentity) this.options.client.cancel();
    this.activeIdentity = null;
    this.setup.destroy();
    this.progress.destroy();
    this.element.remove();
  }

  private start(): void {
    if (this.activeIdentity) return;
    const experiment = this.options.getExperiment();
    if (this.options.getValidationIssues().some((issue) => issue.severity === 'error')) {
      this.progress.setError('Исправьте ошибки эксперимента перед запуском серии.');
      this.refresh();
      return;
    }

    let request: CombatLabBatchRequestV1;
    try {
      const batchRunId = createBatchRunId();
      request = {
        schemaVersion: 1,
        batchRunId,
        experiment,
        config: this.setup.readConfig(experiment),
      };
      validateCombatLabBatchRequest(request);
    } catch (error) {
      this.progress.setError(error instanceof Error ? error.message : 'Настройки серии некорректны.');
      this.refresh();
      return;
    }

    const identity = Object.freeze({
      batchRunId: request.batchRunId,
      experimentRevision: experiment.revision,
      sourceDigest: digestCombatLabExperiment(experiment),
    });
    this.activeIdentity = identity;
    this.lastProgressUpdateMs = Number.NEGATIVE_INFINITY;
    this.setup.setRunning(true);
    this.progress.setStarting(request.config.runCount);

    this.options.client.start(request, {
      onProgress: (progress) => {
        if (!this.isActiveIdentity(progress)) return;
        const now = performance.now();
        if (now - this.lastProgressUpdateMs < 100 && progress.completedRuns < progress.totalRuns) return;
        this.lastProgressUpdateMs = now;
        this.progress.renderProgress(progress);
      },
      onComplete: (result) => {
        if (!this.isActiveIdentity(result)) return;
        const current = this.options.getExperiment();
        if (current.revision !== result.experimentRevision || digestCombatLabExperiment(current) !== result.sourceDigest) {
          this.finishActive();
          this.progress.setError('Эксперимент изменился: устаревший результат серии отброшен.');
          return;
        }
        this.finishActive();
        this.progress.setCompleted(result.runCount);
        this.options.onResult(result);
      },
      onCancelled: (completedRuns, totalRuns) => {
        if (!this.activeIdentity || this.activeIdentity.batchRunId !== identity.batchRunId) return;
        this.finishActive();
        this.progress.setCancelled(completedRuns, totalRuns);
      },
      onError: (messageRu, technicalDetail) => {
        if (!this.activeIdentity || this.activeIdentity.batchRunId !== identity.batchRunId) return;
        this.finishActive();
        this.progress.setError(`${messageRu} ${technicalDetail}`.trim());
      },
    });
  }

  private cancel(): void {
    if (!this.activeIdentity) return;
    this.progress.setCancelling();
    this.options.client.cancel();
  }

  private finishActive(): void {
    this.activeIdentity = null;
    this.setup.setRunning(false);
    this.refresh();
  }

  private isActiveIdentity(identity: CombatLabBatchIdentityV1): boolean {
    return this.activeIdentity !== null
      && this.activeIdentity.batchRunId === identity.batchRunId
      && this.activeIdentity.experimentRevision === identity.experimentRevision
      && this.activeIdentity.sourceDigest === identity.sourceDigest;
  }
}

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
          messageRu: `Строка ${lineIndex + 1}, значение ${tokenIndex + 1}: «${token}» не является допустимым seed 1..4294967295.`,
        };
      }
      seeds.push(seed);
    }
  }
  if (seeds.length === 0) return { ok: false, messageRu: 'Явный список seed пуст.' };
  return { ok: true, seeds: Object.freeze(seeds) };
}

function validSeed(seed: number): boolean {
  return Number.isInteger(seed) && seed >= 1 && seed <= MAX_UINT32;
}

function createBatchRunId(): string {
  batchSequence += 1;
  const uuid = globalThis.crypto?.randomUUID?.();
  return uuid ? `combat-lab-batch:${uuid}` : `combat-lab-batch:${Date.now()}:${batchSequence}`;
}
