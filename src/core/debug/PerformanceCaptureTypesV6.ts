import type {
  PerformanceCauseV6,
  PerformanceQueueDiagnosticV6,
  PerformanceReportIdentityV6,
  PerformanceReportV6,
  ScenePopulationSnapshotV6,
  UnitPerformanceOutlierV6,
} from './PerformanceReportV6';

export interface PerformanceCaptureClockV6 { now(): number; wallNow(): number; random(): number; }
export interface PerformanceCaptureLimitsV6 {
  traceRetentionMs: number; maxFrames: number; maxSceneTimeline: number; maxEvents: number;
  maxCriticalEvents: number; maxQueueTimeline: number; maxQueueWaitOutliers: number;
  maxSlowOperations: number; maxNavigationSearches: number; maxTelemetryCostSamples: number;
  sceneSampleIntervalMs: number;
}
export interface PointV6 { x: number; y: number; }
export interface SceneOrderLikeV6 {
  issuedAtMs?: number; ownerToken?: string; playerCommandId?: string; target?: PointV6; requestedTarget?: PointV6;
  routeCells?: readonly PointV6[]; routeCellIndex?: number; routeRevision?: number; routeStatus?: string;
  pathCost?: number; pathDistanceMeters?: number; pathVisitedCells?: number; pathReason?: string;
  navigationProfileId?: string; knowledgeRevision?: number; replanSearchCount?: number; replanCount?: number;
  lastReplanReason?: string; source?: string;
}
export interface SceneUnitLikeV6 {
  id: string; side?: string; aiControl?: string; position: PointV6; order?: SceneOrderLikeV6 | null; plan?: unknown;
  tacticalKnowledge?: { threats?: readonly unknown[]; revision?: number };
  perceptionKnowledge?: { contacts?: readonly unknown[]; revision?: number };
  behaviorRuntime?: { health?: number; lastEvent?: unknown }; soldier?: { condition?: { health?: number } };
}
export interface SceneStateLikeV6 {
  units: readonly SceneUnitLikeV6[]; map: { width: number; height: number; objects: readonly { id?: string }[] };
  pressureZones: readonly { id?: string }[]; editor: { enabled: boolean };
  simulationTimeSeconds: number; simulationStep: number; paused?: boolean;
}
export interface PerformanceFrameInputV6 {
  frameMs: number | null; simulationUpdateMs: number; applicationUpdateMs: number;
  sceneUpdateMs: number; layerMode: string; editorEnabled: boolean;
}
export interface QueueTransitionInputV6 {
  queue: string; transition: 'created' | 'started' | 'completed' | 'cancelled' | 'failed' | 'timedOut' | 'stale';
  requestId: string; unitId?: string; orderId?: string; waitMs?: number; depth?: number; inFlight?: number; reason?: string;
}
export interface OperationSampleInputV6 {
  phase: string; durationMs: number; startedAtMs?: number; operationId?: string;
  cause?: PerformanceCauseV6; work?: Record<string, number>; result?: string;
}
export interface PerformanceReportBuildInputV6 {
  identity: Omit<PerformanceReportIdentityV6, 'reportVersion' | 'contractVersion' | 'sessionId' | 'captureId'>;
  mainMetrics: Record<string, unknown>; phases: Record<string, unknown>[]; legacyDiagnostics: Record<string, unknown>;
  routeFields?: Record<string, unknown>; workerDiagnostics?: Record<string, Record<string, unknown>>;
  slowOperations?: Record<string, unknown>[]; workCounters?: Record<string, Record<string, number>>;
  recoveredFromCheckpoint?: boolean; possibleMissingTailMs?: number; exportCompleted?: boolean; lastCheckpointAtMs?: number;
}
export interface PerformanceCaptureStatusV6 {
  version: 'performance-report-v6'; runtimeSeconds: number; currentUnitCount: number;
  maximumUnitCount: number; samplesDropped: number; eventsDropped: number; bufferUtilization: number;
}
export interface PerformanceCheckpointPayloadV6 {
  version: 'performance-report-v6'; schemaVersion: 6; sessionId: string; captureId: string;
  savedAtEpochMs: number; savedAtCaptureMs: number; report: PerformanceReportV6;
}
export interface MutableQueueV6 extends Omit<PerformanceQueueDiagnosticV6, 'waitMs'> { waits: number[]; }
export interface UnitStatsV6 extends Omit<UnitPerformanceOutlierV6, 'unitId'> {}
export interface OrderObservationV6 {
  key: string; orderId: string; requestId: string; operationId: string; createdAtMs: number;
  start: PointV6; goal: PointV6; profileId: string | null; hadRoute: boolean; replanSearchCount: number;
}
export interface TruncationV6 {
  section: string; lost: number; reason: string;
  worstSamplesPreserved: boolean; errorsPreserved: boolean; recentTailPreserved: boolean;
}
export interface SceneCaptureStateV6 {
  initial: ScenePopulationSnapshotV6 | null; minimum: ScenePopulationSnapshotV6 | null;
  maximum: ScenePopulationSnapshotV6 | null; final: ScenePopulationSnapshotV6 | null;
}
