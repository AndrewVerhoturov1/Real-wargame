import {
  COMBAT_LAB_BATCH_MAX_CHUNK_SIZE,
  COMBAT_LAB_BATCH_WORKER_PROTOCOL_VERSION,
  type CombatLabBatchIdentityV1,
  type CombatLabBatchPartialResultV1,
  type CombatLabBatchProgressV1,
  type CombatLabBatchRequestV1,
  type CombatLabBatchResultV1,
  type CombatLabBatchWorkerInboundMessageV1,
  type CombatLabBatchWorkerOutboundMessageV1,
} from '../../core/testing/combat-lab/experiment/CombatLabBatchContracts';
import {
  mergeCombatLabBatchPartials,
  validateCombatLabBatchRequest,
} from '../../core/testing/combat-lab/experiment/CombatLabBatchRunner';
import { digestCombatLabExperiment } from '../../core/testing/combat-lab/experiment/CombatLabExperimentDigest';

const PROGRESS_INTERVAL_MS = 100;

export interface CombatLabBatchClientCallbacks {
  readonly onProgress: (progress: CombatLabBatchProgressV1) => void;
  readonly onComplete: (result: CombatLabBatchResultV1) => void;
  readonly onCancelled: (completedRuns: number, totalRuns: number) => void;
  readonly onError: (messageRu: string, technicalDetail: string) => void;
}

export type CombatLabBatchWorkerFactoryV1 = (workerId: number) => Worker;

interface ActiveClientBatchV1 {
  readonly request: CombatLabBatchRequestV1;
  readonly identity: CombatLabBatchIdentityV1;
  readonly callbacks: CombatLabBatchClientCallbacks;
  readonly workers: Worker[];
  readonly assignedRuns: readonly (readonly number[])[];
  readonly completedByWorker: number[];
  readonly partialsByWorker: Array<CombatLabBatchPartialResultV1 | null>;
  lastProgressAtMs: number;
  progressTimer: ReturnType<typeof setTimeout> | null;
  completionPending: boolean;
}

export class CombatLabBatchClient {
  private active: ActiveClientBatchV1 | null = null;
  private destroyed = false;

  constructor(private readonly workerFactory: CombatLabBatchWorkerFactoryV1 = createDefaultWorker) {}

  start(request: CombatLabBatchRequestV1, callbacks: CombatLabBatchClientCallbacks): void {
    if (this.destroyed) {
      callbacks.onError('Клиент серии прогонов уже уничтожен.', 'CombatLabBatchClient.start() called after destroy().');
      return;
    }
    if (this.active) {
      callbacks.onError('Сначала отмените текущую серию прогонов.', 'A second batch cannot start while another batch is active.');
      return;
    }
    try {
      validateCombatLabBatchRequest(request);
      const sourceDigest = digestCombatLabExperiment(request.experiment);
      const identity = Object.freeze({
        batchRunId: request.batchRunId,
        experimentRevision: request.experiment.revision,
        sourceDigest,
      });
      const workerCount = Math.min(request.config.workerCount, request.config.runCount);
      const assignedRuns = partitionRunIndices(request.config.runCount, workerCount);
      const workers: Worker[] = [];
      const active: ActiveClientBatchV1 = {
        request,
        identity,
        callbacks,
        workers,
        assignedRuns,
        completedByWorker: Array.from({ length: workerCount }, () => 0),
        partialsByWorker: Array.from({ length: workerCount }, () => null),
        lastProgressAtMs: Number.NEGATIVE_INFINITY,
        progressTimer: null,
        completionPending: false,
      };
      this.active = active;

      for (let workerId = 0; workerId < workerCount; workerId += 1) {
        const worker = this.workerFactory(workerId);
        workers.push(worker);
        worker.addEventListener('message', (event: MessageEvent<CombatLabBatchWorkerOutboundMessageV1>) => {
          this.handleWorkerMessage(workerId, event.data);
        });
        worker.addEventListener('error', (event) => {
          this.failActive('Worker серии прогонов завершился с ошибкой.', event.message || 'Unknown Worker error.');
        });
        const message: CombatLabBatchWorkerInboundMessageV1 = {
          protocolVersion: COMBAT_LAB_BATCH_WORKER_PROTOCOL_VERSION,
          kind: 'start',
          workerId,
          ...identity,
          request,
          runIndices: assignedRuns[workerId]!,
          chunkSize: COMBAT_LAB_BATCH_MAX_CHUNK_SIZE,
        };
        worker.postMessage(message);
      }
    } catch (error) {
      this.terminateActiveWorkers();
      this.active = null;
      callbacks.onError('Не удалось запустить серию прогонов.', technicalDetail(error));
    }
  }

  cancel(): void {
    const active = this.active;
    if (!active) return;
    const completedRuns = totalCompleted(active);
    for (const worker of active.workers) {
      const message: CombatLabBatchWorkerInboundMessageV1 = {
        protocolVersion: COMBAT_LAB_BATCH_WORKER_PROTOCOL_VERSION,
        kind: 'cancel',
        ...active.identity,
      };
      worker.postMessage(message);
      worker.terminate();
    }
    if (active.progressTimer !== null) clearTimeout(active.progressTimer);
    this.active = null;
    active.callbacks.onCancelled(completedRuns, active.request.config.runCount);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    const active = this.active;
    if (active && active.progressTimer !== null) clearTimeout(active.progressTimer);
    this.terminateActiveWorkers();
    this.active = null;
  }

  private handleWorkerMessage(workerId: number, message: CombatLabBatchWorkerOutboundMessageV1): void {
    const active = this.active;
    if (!active || message.protocolVersion !== COMBAT_LAB_BATCH_WORKER_PROTOCOL_VERSION) return;
    if (!sameIdentity(active.identity, message) || message.workerId !== workerId) return;

    if (message.kind === 'progress') {
      active.completedByWorker[workerId] = Math.min(active.assignedRuns[workerId]!.length, message.completedRuns);
      this.scheduleProgress(false);
      return;
    }
    if (message.kind === 'cancelled') {
      active.completedByWorker[workerId] = Math.min(active.assignedRuns[workerId]!.length, message.completedRuns);
      this.cancel();
      return;
    }
    if (message.kind === 'error') {
      this.failActive(message.messageRu, message.technicalDetail);
      return;
    }

    active.completedByWorker[workerId] = active.assignedRuns[workerId]!.length;
    active.partialsByWorker[workerId] = message.partial;
    active.workers[workerId]?.terminate();
    if (active.partialsByWorker.every((partial) => partial !== null)) {
      active.completionPending = true;
      this.scheduleProgress(true);
    } else {
      this.scheduleProgress(false);
    }
  }

  private scheduleProgress(completionPending: boolean): void {
    const active = this.active;
    if (!active) return;
    active.completionPending ||= completionPending;
    if (active.progressTimer !== null) return;
    const elapsed = nowMs() - active.lastProgressAtMs;
    const delay = Math.max(0, PROGRESS_INTERVAL_MS - elapsed);
    active.progressTimer = setTimeout(() => this.flushProgress(), delay);
  }

  private flushProgress(): void {
    const active = this.active;
    if (!active) return;
    active.progressTimer = null;
    active.lastProgressAtMs = nowMs();
    active.callbacks.onProgress(Object.freeze({
      ...active.identity,
      completedRuns: totalCompleted(active),
      totalRuns: active.request.config.runCount,
    }));
    if (!active.completionPending) return;

    try {
      const partials = active.partialsByWorker.filter((partial): partial is CombatLabBatchPartialResultV1 => partial !== null);
      const result = mergeCombatLabBatchPartials(active.request, partials);
      this.active = null;
      active.callbacks.onComplete(result);
    } catch (error) {
      this.failActive('Не удалось объединить результаты workers.', technicalDetail(error));
    }
  }

  private failActive(messageRu: string, detail: string): void {
    const active = this.active;
    if (!active) return;
    if (active.progressTimer !== null) clearTimeout(active.progressTimer);
    this.terminateActiveWorkers();
    this.active = null;
    active.callbacks.onError(messageRu, detail);
  }

  private terminateActiveWorkers(): void {
    for (const worker of this.active?.workers ?? []) worker.terminate();
  }
}

export function defaultCombatLabWorkerCount(hardwareConcurrency = globalThis.navigator?.hardwareConcurrency): number {
  if (!Number.isFinite(hardwareConcurrency)) return 1;
  return Math.min(4, Math.max(1, Math.trunc(hardwareConcurrency as number) - 1));
}

function createDefaultWorker(_workerId: number): Worker {
  return new Worker(new URL('../workers/combat-lab-batch.worker.ts', import.meta.url), {
    type: 'module',
  });
}

function partitionRunIndices(runCount: number, workerCount: number): readonly (readonly number[])[] {
  const partitions = Array.from({ length: workerCount }, () => [] as number[]);
  for (let runIndex = 0; runIndex < runCount; runIndex += 1) partitions[runIndex % workerCount]!.push(runIndex);
  return Object.freeze(partitions.map((partition) => Object.freeze(partition)));
}

function totalCompleted(active: ActiveClientBatchV1): number {
  return active.completedByWorker.reduce((sum, count) => sum + count, 0);
}

function sameIdentity(left: CombatLabBatchIdentityV1, right: CombatLabBatchIdentityV1): boolean {
  return left.batchRunId === right.batchRunId
    && left.experimentRevision === right.experimentRevision
    && left.sourceDigest === right.sourceDigest;
}

function nowMs(): number {
  return globalThis.performance?.now() ?? Date.now();
}

function technicalDetail(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}\n${error.stack ?? ''}`.trim() : String(error);
}
