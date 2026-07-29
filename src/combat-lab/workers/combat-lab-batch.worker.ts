import {
  COMBAT_LAB_BATCH_MAX_CHUNK_SIZE,
  COMBAT_LAB_BATCH_WORKER_PROTOCOL_VERSION,
  type CombatLabBatchIdentityV1,
  type CombatLabBatchPartialResultV1,
  type CombatLabBatchWorkerInboundMessageV1,
  type CombatLabBatchWorkerOutboundMessageV1,
  type CombatLabBatchWorkerStartMessageV1,
} from '../../core/testing/combat-lab/experiment/CombatLabBatchContracts';
import {
  combineCombatLabBatchPartials,
  runCombatLabBatchPartition,
} from '../../core/testing/combat-lab/experiment/CombatLabBatchRunner';
import { digestCombatLabExperiment } from '../../core/testing/combat-lab/experiment/CombatLabExperimentDigest';

interface WorkerScopeV1 {
  postMessage(message: CombatLabBatchWorkerOutboundMessageV1): void;
  addEventListener(type: 'message', listener: (event: MessageEvent<CombatLabBatchWorkerInboundMessageV1>) => void): void;
}

interface ActiveWorkerBatchV1 {
  readonly start: CombatLabBatchWorkerStartMessageV1;
  readonly partials: CombatLabBatchPartialResultV1[];
  nextOffset: number;
  cancelled: boolean;
}

const scope = globalThis as unknown as WorkerScopeV1;
let active: ActiveWorkerBatchV1 | null = null;

scope.addEventListener('message', (event) => {
  const message = event.data;
  if (message.protocolVersion !== COMBAT_LAB_BATCH_WORKER_PROTOCOL_VERSION) return;
  if (message.kind === 'cancel') {
    if (active && sameIdentity(active.start, message)) active.cancelled = true;
    return;
  }
  if (active) {
    postError(message, 'Серия уже выполняется в worker.', 'A second start message was received before the active batch finished.');
    return;
  }
  try {
    validateStartMessage(message);
    active = {
      start: message,
      partials: [],
      nextOffset: 0,
      cancelled: false,
    };
    scheduleNextChunk();
  } catch (error) {
    postError(message, 'Не удалось запустить серию прогонов.', technicalDetail(error));
  }
});

function scheduleNextChunk(): void {
  setTimeout(runNextChunk, 0);
}

function runNextChunk(): void {
  const current = active;
  if (!current) return;
  const { start } = current;
  if (current.cancelled) {
    scope.postMessage({
      protocolVersion: 1,
      kind: 'cancelled',
      workerId: start.workerId,
      batchRunId: start.batchRunId,
      experimentRevision: start.experimentRevision,
      sourceDigest: start.sourceDigest,
      completedRuns: current.nextOffset,
      totalRuns: start.runIndices.length,
    });
    active = null;
    return;
  }
  if (current.nextOffset >= start.runIndices.length) {
    const partial = combineCombatLabBatchPartials(start.request, current.partials);
    scope.postMessage({
      protocolVersion: 1,
      kind: 'complete',
      workerId: start.workerId,
      batchRunId: start.batchRunId,
      experimentRevision: start.experimentRevision,
      sourceDigest: start.sourceDigest,
      partial,
    });
    active = null;
    return;
  }

  try {
    const endOffset = Math.min(start.runIndices.length, current.nextOffset + start.chunkSize);
    const chunk = start.runIndices.slice(current.nextOffset, endOffset);
    const partial = runCombatLabBatchPartition(start.request, chunk, { chunkSize: chunk.length });
    current.partials.push(partial);
    current.nextOffset = endOffset;
    scope.postMessage({
      protocolVersion: 1,
      kind: 'progress',
      workerId: start.workerId,
      batchRunId: start.batchRunId,
      experimentRevision: start.experimentRevision,
      sourceDigest: start.sourceDigest,
      completedRuns: current.nextOffset,
      totalRuns: start.runIndices.length,
    });
    scheduleNextChunk();
  } catch (error) {
    postError(start, 'Worker серии прогонов завершился с ошибкой.', technicalDetail(error));
    active = null;
  }
}

function validateStartMessage(message: CombatLabBatchWorkerStartMessageV1): void {
  if (!Number.isInteger(message.workerId) || message.workerId < 0 || message.workerId > 3) {
    throw new Error('workerId must be in 0..3.');
  }
  if (!Number.isInteger(message.chunkSize) || message.chunkSize < 1 || message.chunkSize > COMBAT_LAB_BATCH_MAX_CHUNK_SIZE) {
    throw new Error(`chunkSize must be in 1..${COMBAT_LAB_BATCH_MAX_CHUNK_SIZE}.`);
  }
  const digest = digestCombatLabExperiment(message.request.experiment);
  if (message.batchRunId !== message.request.batchRunId
    || message.experimentRevision !== message.request.experiment.revision
    || message.sourceDigest !== digest) {
    throw new Error('Worker start identity does not match the request.');
  }
}

function postError(identity: CombatLabBatchIdentityV1 & { readonly workerId?: number }, messageRu: string, detail: string): void {
  scope.postMessage({
    protocolVersion: 1,
    kind: 'error',
    workerId: identity.workerId ?? 0,
    batchRunId: identity.batchRunId,
    experimentRevision: identity.experimentRevision,
    sourceDigest: identity.sourceDigest,
    messageRu,
    technicalDetail: detail,
  });
}

function sameIdentity(left: CombatLabBatchIdentityV1, right: CombatLabBatchIdentityV1): boolean {
  return left.batchRunId === right.batchRunId
    && left.experimentRevision === right.experimentRevision
    && left.sourceDigest === right.sourceDigest;
}

function technicalDetail(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}\n${error.stack ?? ''}`.trim() : String(error);
}
