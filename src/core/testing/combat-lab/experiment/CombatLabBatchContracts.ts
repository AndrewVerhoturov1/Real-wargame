import type { CombatLabBatchConfigV1, CombatLabExperimentV1 } from './CombatLabExperimentContracts';

export const COMBAT_LAB_BATCH_SCHEMA_VERSION = 1 as const;
export const COMBAT_LAB_BATCH_WORKER_PROTOCOL_VERSION = 1 as const;
export const COMBAT_LAB_BATCH_MAX_CHUNK_SIZE = 25;
export const COMBAT_LAB_BATCH_MAX_HISTOGRAM_BUCKETS = 40;

export interface CombatLabExperimentRunRequestV1 {
  readonly schemaVersion: 1;
  readonly experiment: CombatLabExperimentV1;
  readonly seed: number;
  readonly maximumSimulationSeconds: number;
}

export interface CombatLabExperimentRunResultV1 {
  readonly schemaVersion: 1;
  readonly experimentId: string;
  readonly experimentRevision: number;
  readonly sourceDigest: string;
  readonly seed: number;
  readonly completed: boolean;
  readonly success: boolean;
  readonly stopReason: string;
  readonly simulatedSeconds: number;
  readonly metrics: Readonly<Record<string, number>>;
  readonly eventDigest: string;
  readonly finalStateDigest: string;
  readonly stepFailureCode: string | null;
}

export interface CombatLabBatchRequestV1 {
  readonly schemaVersion: 1;
  readonly batchRunId: string;
  readonly experiment: CombatLabExperimentV1;
  readonly config: CombatLabBatchConfigV1;
}

export interface CombatLabBatchIdentityV1 {
  readonly batchRunId: string;
  readonly experimentRevision: number;
  readonly sourceDigest: string;
}

export interface CombatLabBatchProgressV1 extends CombatLabBatchIdentityV1 {
  readonly completedRuns: number;
  readonly totalRuns: number;
}

export interface CombatLabDistributionBucketV1 {
  readonly minimum: number;
  readonly maximum: number;
  readonly count: number;
}

export interface CombatLabDistributionSummaryV1 {
  readonly count: number;
  readonly minimum: number;
  readonly maximum: number;
  readonly mean: number;
  readonly median: number;
  readonly p05: number;
  readonly p95: number;
  readonly histogram: readonly CombatLabDistributionBucketV1[];
}

export interface CombatLabRepresentativeRunV1 {
  readonly runIndex: number;
  readonly seed: number;
  readonly success: boolean;
  readonly stopReason: string;
  readonly simulatedSeconds: number;
  readonly metrics: Readonly<Record<string, number>>;
  readonly eventDigest: string;
  readonly finalStateDigest: string;
}

export interface CombatLabBatchResultV1 extends CombatLabBatchIdentityV1 {
  readonly schemaVersion: 1;
  readonly experimentId: string;
  readonly runCount: number;
  readonly successCount: number;
  readonly failureCount: number;
  readonly successRate: number;
  readonly metrics: Readonly<Record<string, CombatLabDistributionSummaryV1>>;
  readonly failureReasons: Readonly<Record<string, number>>;
  readonly representatives: readonly CombatLabRepresentativeRunV1[];
}

export interface CombatLabBatchRunRecordV1 extends CombatLabRepresentativeRunV1 {}

export interface CombatLabBatchPartialResultV1 extends CombatLabBatchIdentityV1 {
  readonly schemaVersion: 1;
  readonly experimentId: string;
  readonly completedRuns: number;
  readonly successCount: number;
  readonly failureCount: number;
  readonly metricValues: Readonly<Record<string, readonly number[]>>;
  readonly failureReasons: Readonly<Record<string, number>>;
  readonly representativeCandidates: readonly CombatLabBatchRunRecordV1[];
  readonly firstFailures: Readonly<Record<string, CombatLabBatchRunRecordV1>>;
}

export class CombatLabBatchCancelledError extends Error {
  readonly completedRuns: number;
  readonly totalRuns: number;

  constructor(completedRuns: number, totalRuns: number) {
    super(`Combat Lab batch cancelled after ${completedRuns} of ${totalRuns} runs.`);
    this.name = 'CombatLabBatchCancelledError';
    this.completedRuns = completedRuns;
    this.totalRuns = totalRuns;
  }
}

export interface CombatLabBatchWorkerStartMessageV1 extends CombatLabBatchIdentityV1 {
  readonly protocolVersion: 1;
  readonly kind: 'start';
  readonly workerId: number;
  readonly request: CombatLabBatchRequestV1;
  readonly runIndices: readonly number[];
  readonly chunkSize: number;
}

export interface CombatLabBatchWorkerCancelMessageV1 extends CombatLabBatchIdentityV1 {
  readonly protocolVersion: 1;
  readonly kind: 'cancel';
}

export type CombatLabBatchWorkerInboundMessageV1 =
  | CombatLabBatchWorkerStartMessageV1
  | CombatLabBatchWorkerCancelMessageV1;

export interface CombatLabBatchWorkerProgressMessageV1 extends CombatLabBatchProgressV1 {
  readonly protocolVersion: 1;
  readonly kind: 'progress';
  readonly workerId: number;
}

export interface CombatLabBatchWorkerCompleteMessageV1 extends CombatLabBatchIdentityV1 {
  readonly protocolVersion: 1;
  readonly kind: 'complete';
  readonly workerId: number;
  readonly partial: CombatLabBatchPartialResultV1;
}

export interface CombatLabBatchWorkerCancelledMessageV1 extends CombatLabBatchIdentityV1 {
  readonly protocolVersion: 1;
  readonly kind: 'cancelled';
  readonly workerId: number;
  readonly completedRuns: number;
  readonly totalRuns: number;
}

export interface CombatLabBatchWorkerErrorMessageV1 extends CombatLabBatchIdentityV1 {
  readonly protocolVersion: 1;
  readonly kind: 'error';
  readonly workerId: number;
  readonly messageRu: string;
  readonly technicalDetail: string;
}

export type CombatLabBatchWorkerOutboundMessageV1 =
  | CombatLabBatchWorkerProgressMessageV1
  | CombatLabBatchWorkerCompleteMessageV1
  | CombatLabBatchWorkerCancelledMessageV1
  | CombatLabBatchWorkerErrorMessageV1;
