export interface AwarenessMovementDiagnostics extends Record<string, unknown> {
  readonly worldRasterBuilds: number;
  readonly ownMovementLocalUpdates: number;
  readonly safePositionLocalScans: number;
  readonly safePositionCellsScanned: number;
  readonly directionalBasisBuilds: number;
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
  readonly lastLocalUpdateMs: number;
  readonly maxLocalUpdateMs: number;
  readonly lastRequestedRasterKey: string;
  readonly lastAppliedRasterKey: string;
  readonly lastWorkerError: string | null;
}

const EMPTY_DIAGNOSTICS: AwarenessMovementDiagnostics = {
  worldRasterBuilds: 0,
  ownMovementLocalUpdates: 0,
  safePositionLocalScans: 0,
  safePositionCellsScanned: 0,
  directionalBasisBuilds: 0,
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
  lastLocalUpdateMs: 0,
  maxLocalUpdateMs: 0,
  lastRequestedRasterKey: '',
  lastAppliedRasterKey: '',
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
