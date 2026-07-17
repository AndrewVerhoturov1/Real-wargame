export interface AwarenessMovementDiagnostics extends Record<string, unknown> {
  readonly worldRasterBuilds: number;
  /** Legacy alias retained for existing reports. */
  readonly directionalBasisBuilds: number;
  readonly workerThreatRelativeGeometryBuilds: number;
  readonly workerDirectionalFieldBuilds: number;
  readonly workerDirectionalBasisBuilds: number;
  readonly workerAwarenessGeometryBuilds: number;
  readonly workerAwarenessRescores: number;
  readonly workerJobsStarted: number;
  readonly workerJobsCompleted: number;
  readonly workerJobsCancelled: number;
  readonly workerJobsCoalesced: number;
  readonly workerResultsStaleDropped: number;
  readonly mainThreadRasterSwaps: number;
  /** Cumulative timers that requested an exact final snapshot. Superseded requests may remain unapplied. */
  readonly finalRefreshRequests: number;
  /** Cumulative exact final snapshots that were current when their worker result completed. */
  readonly finalRefreshApplied: number;
  readonly pendingQueueDepth: number;
  readonly maxPendingQueueDepth: number;
  readonly workerInFlight: boolean;
  readonly lastWorkerLatencyMs: number;
  readonly maxWorkerLatencyMs: number;
  readonly lastWorkerComputeMs: number;
  readonly maxWorkerComputeMs: number;
  readonly lastMainThreadApplyMs: number;
  readonly maxMainThreadApplyMs: number;
  readonly lastRequestedRasterKey: string;
  readonly lastAppliedRasterKey: string;
  readonly lastRequestedWorldKey: string;
  readonly lastAppliedWorldKey: string;
  readonly lastRequestedCanonicalThreatKey: string;
  readonly lastAppliedCanonicalThreatKey: string;
  readonly lastCompletedJobId: number;
  readonly lastAppliedJobId: number;
  readonly lastCompletedJobFinalExact: boolean;
  readonly lastFinalRefreshLatencyMs: number;
  readonly maxFinalRefreshLatencyMs: number;
  readonly lastAppliedFieldIdentity: string;
  readonly lastAppliedRasterDigest: string;
  readonly lastWorkerError: string | null;
}

// These counters describe scheduler history; current correctness is established by
// bounded queue state plus equality of requested/applied world and canonical keys.
const EMPTY_DIAGNOSTICS: AwarenessMovementDiagnostics = {
  worldRasterBuilds: 0,
  directionalBasisBuilds: 0,
  workerThreatRelativeGeometryBuilds: 0,
  workerDirectionalFieldBuilds: 0,
  workerDirectionalBasisBuilds: 0,
  workerAwarenessGeometryBuilds: 0,
  workerAwarenessRescores: 0,
  workerJobsStarted: 0,
  workerJobsCompleted: 0,
  workerJobsCancelled: 0,
  workerJobsCoalesced: 0,
  workerResultsStaleDropped: 0,
  mainThreadRasterSwaps: 0,
  finalRefreshRequests: 0,
  finalRefreshApplied: 0,
  pendingQueueDepth: 0,
  maxPendingQueueDepth: 0,
  workerInFlight: false,
  lastWorkerLatencyMs: 0,
  maxWorkerLatencyMs: 0,
  lastWorkerComputeMs: 0,
  maxWorkerComputeMs: 0,
  lastMainThreadApplyMs: 0,
  maxMainThreadApplyMs: 0,
  lastRequestedRasterKey: '',
  lastAppliedRasterKey: '',
  lastRequestedWorldKey: '',
  lastAppliedWorldKey: '',
  lastRequestedCanonicalThreatKey: '',
  lastAppliedCanonicalThreatKey: '',
  lastCompletedJobId: 0,
  lastAppliedJobId: 0,
  lastCompletedJobFinalExact: false,
  lastFinalRefreshLatencyMs: 0,
  maxFinalRefreshLatencyMs: 0,
  lastAppliedFieldIdentity: '',
  lastAppliedRasterDigest: '',
  lastWorkerError: null,
};

let current: AwarenessMovementDiagnostics = EMPTY_DIAGNOSTICS;

export function publishAwarenessMovementDiagnostics(value: AwarenessMovementDiagnostics): void {
  current = { ...value };
}

export function getAwarenessMovementDiagnostics(): AwarenessMovementDiagnostics {
  return { ...current };
}

export function resetAwarenessMovementDiagnostics(): void {
  current = EMPTY_DIAGNOSTICS;
}
