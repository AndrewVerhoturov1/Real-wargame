export const PERFORMANCE_REPORT_VERSION = 'performance-report-v6' as const;
export const PERFORMANCE_REPORT_SCHEMA_VERSION = 6 as const;
export const PERFORMANCE_REPORT_CONTRACT_VERSION = 'performance-contract-v6' as const;

export type PerformanceSeverity = 'info' | 'warning' | 'critical';

export const PERFORMANCE_EVENT_TYPES_V6 = [
  'map.loaded', 'simulation.started', 'simulation.paused', 'simulation.resumed',
  'editor.unit-created', 'editor.units-created', 'editor.unit-removed', 'editor.units-removed',
  'editor.map-changed', 'editor.terrain-painted', 'editor.forest-painted', 'editor.object-added', 'editor.object-removed',
  'order.created', 'order.replaced', 'order.cancelled',
  'route.request-created', 'route.request-queued', 'route.search-started', 'route.search-completed',
  'route.search-failed', 'route.search-cancelled', 'route.result-stale', 'route.result-applied', 'route.replan-requested',
  'ai.mass-wake', 'ai.reactive-wake', 'ai.starvation-detected',
  'perception.contact-created', 'perception.contact-lost', 'los.request-queued', 'los.request-executed',
  'los.request-deferred', 'los.starvation-detected',
  'combat.started', 'combat.shot', 'combat.suppression', 'combat.unit-killed',
  'overlay.enabled', 'overlay.disabled', 'renderer.static-rebuild', 'renderer.chunk-rebuild',
  'long-task.detected', 'worker.error', 'worker.timeout', 'memory.spike', 'semantic.violation',
  'telemetry.truncated', 'user.marker',
] as const;
export type PerformanceEventTypeV6 = typeof PERFORMANCE_EVENT_TYPES_V6[number] | (string & {});
export type PerformanceEventPriority = 'normal' | 'important' | 'critical';

export interface NumericStats {
  count: number; total: number; min: number; avg: number; p50: number; p95: number; p99: number; max: number;
}

export interface PerformanceReportIdentityV6 {
  branch: string; commitSha: string; buildId: string; generatedAt: string;
  reportVersion: typeof PERFORMANCE_REPORT_VERSION;
  contractVersion: typeof PERFORMANCE_REPORT_CONTRACT_VERSION;
  sessionId: string; captureId: string;
  launchSource: 'manual' | 'ci' | 'unknown';
  mode: 'development' | 'production' | 'test' | 'unknown';
  page: string; browser: Record<string, unknown>; platform: string;
  cpuConcurrency: number | null; deviceMemoryGb: number | null;
  viewport: Record<string, unknown>; renderer: Record<string, unknown>;
  featureFlags: Record<string, boolean | string | number | null>;
}

export interface ScenePopulationSnapshotV6 {
  tMs: number; unitCount: number; aliveUnitCount: number; deadUnitCount: number;
  objectCount: number; pressureZoneCount: number; unitsBySide: Record<string, number>;
  graphControlledUnits: number; manualUnits: number; movingUnits: number; stationaryUnits: number;
  unitsWithOrder: number; unitsWaitingForRoute: number; unitsWithActiveRoute: number;
  unitsWaitingForReplan: number; unitsInCombat: number;
}

export interface ScenePopulationSeriesV6 {
  initial: ScenePopulationSnapshotV6; measurementStart: ScenePopulationSnapshotV6;
  minimum: ScenePopulationSnapshotV6; maximum: ScenePopulationSnapshotV6; final: ScenePopulationSnapshotV6;
}

export interface SceneTimelineEntryV6 extends ScenePopulationSnapshotV6 {
  reason: 'periodic' | 'population-change' | 'queue-spike' | 'slow-frame' | 'event' | 'final';
  routeQueueDepth: number; replanQueueDepth: number; frameMs: number | null;
  applicationUpdateMs: number; simulationUpdateMs: number;
}

export interface PerformanceTraceFrameV6 {
  tMs: number; frameMs: number | null; simulationUpdateMs: number; applicationUpdateMs: number;
  sceneUpdateMs: number; unitCount: number; movingUnits: number; routeQueueDepth: number;
  replanQueueDepth: number; layerMode: string; editorEnabled: boolean;
}

export interface PerformanceCauseV6 {
  eventType?: string; eventId?: string; operationId?: string; requestId?: string;
  orderId?: string; routeRequestId?: string; workerRequestId?: string; unitId?: string;
  revision?: number; profileId?: string; source?: string;
}

export interface PerformanceEventV6 {
  eventId: string; type: string; tMs: number; priority: PerformanceEventPriority;
  operationId?: string; cause?: PerformanceCauseV6; data: Record<string, unknown>;
}

export interface QueueWaitOutlierV6 {
  requestId: string; unitId?: string; orderId?: string; createdAtMs: number;
  startedAtMs: number | null; completedAtMs: number | null; waitMs: number; result: string;
}

export interface PerformanceQueueTimelineEntryV6 { tMs: number; depth: number; inFlight: number; reason: string; }
export interface PerformanceQueueDiagnosticV6 {
  created: number; started: number; completed: number; cancelled: number; failed: number; timedOut: number; stale: number;
  currentDepth: number; maximumDepth: number; currentInFlight: number; maximumInFlight: number;
  waitMs: NumericStats; timeline: PerformanceQueueTimelineEntryV6[]; slowestWaits: QueueWaitOutlierV6[];
}

export interface NavigationSearchOutlierV6 {
  unitId: string; orderId: string; routeRequestId: string; operationId: string;
  start: { x: number; y: number }; goal: { x: number; y: number }; profileId: string | null;
  knownThreatCount: number; visitedCells: number | null; expandedNodes: number | null; openSetPeak: number | null;
  pathLength: number | null; routeCost: number | null; durationMs: number; queueWaitMs: number;
  timings: Record<string, number | null>;
  result: 'found' | 'not_found' | 'budget_exceeded' | 'timed_out' | 'cancelled' | 'stale' | 'unknown';
  durationSource: 'instrumented' | 'observed_order_to_route';
}

export interface UnitPerformanceOutlierV6 {
  unitId: string; routeRequests: number; routeReplans: number; longestRouteWaitMs: number;
  losRequests: number; contactMemorySize: number; collisionCandidates: number;
  eventWakes: number; aiTotalMs: number; mainReason: string | null;
}

export interface NavigationDiagnosticsV6 {
  orders: Record<string, number>; routeQueue: PerformanceQueueDiagnosticV6; replanQueue: PerformanceQueueDiagnosticV6;
  pathfinding: {
    totalRequests: number; tacticalSearches: number; baselineSearches: number; replanSearches: number;
    visitedCells: number; expandedNodes: number; openSetPeak: number; pathLength: number; routeCost: number;
    found: number; notFound: number; budgetExceeded: number; timedOut: number; cancelled: number; stale: number; applied: number;
    timingMs: Record<string, NumericStats>;
  };
  routeFields: Record<string, unknown>; slowestSearches: NavigationSearchOutlierV6[]; unitOutliers: UnitPerformanceOutlierV6[];
}

export interface WorkerDiagnosticsV6 {
  created: number; restarts: number; requests: number; completed: number; failed: number; timedOut: number;
  cancelled: number; staleResults: number; queueMax: number;
  payloadBytes: NumericStats; serializationMs: NumericStats; queueWaitMs: NumericStats;
  computeMs: NumericStats; roundTripMs: NumericStats; applyDelayMs: NumericStats; raw?: Record<string, unknown>;
}

export interface MemoryDiagnosticsV6 {
  supported: boolean; approximate: boolean; initialBytes: number | null; peakBytes: number | null; finalBytes: number | null;
  estimatedSubsystems: Record<string, number>; largeAllocations: Record<string, number>;
  typedArraysCreated: number; typedArraysReused: number; cacheBytes: Record<string, number>;
  workerPayloadBytes: Record<string, number>; possibleGcPauses: { count: number; maxDropBytes: number };
}

export interface SemanticHealthV6 {
  lostOrders: number; staleRoutesApplied: number; routeAppliedToWrongOrder: number;
  schedulerStarvation: number; losStarvation: number; crossUnitKnowledgeLeaks: number;
  duplicateUnitIds: number; invalidPositions: number; nanValues: number;
  workerErrors: number; unhandledRejections: number; violations: PerformanceEventV6[];
}

export interface PerformanceDiagnosisV6 {
  severity: PerformanceSeverity; code: string; message: string; evidence: Record<string, unknown>;
}

export interface WorstWindowV6 {
  durationMs: 1000 | 5000 | 10000; startMs: number; endMs: number;
  frame: Record<string, unknown>; simulation: Record<string, unknown>; scene: SceneTimelineEntryV6 | null;
  queuePeaks: Record<string, number>; topPhases: Record<string, unknown>[]; topOperations: Record<string, unknown>[];
  events: PerformanceEventV6[]; userMarkers: PerformanceEventV6[]; semanticViolations: PerformanceEventV6[];
}

export interface ReportHealthV6 {
  captureStartedAtMs: number; lastSampleAtMs: number; lastCheckpointAtMs: number;
  exportStartedAtMs: number; exportCompleted: boolean;
  samplesRecorded: number; samplesDropped: number; eventsRecorded: number; eventsDropped: number;
  buffers: Record<string, { used: number; limit: number }>;
  truncatedSections: string[]; truncationReasons: string[];
  truncation: Array<{ section: string; lost: number; reason: string; worstSamplesPreserved: boolean; errorsPreserved: boolean; recentTailPreserved: boolean }>;
  telemetryCostMs: Record<'collection' | 'serialization' | 'checkpointWrite' | 'export', NumericStats>;
  estimatedReportBytes: number; recoveredFromCheckpoint: boolean; possibleMissingTailMs: number;
}

export interface PerformanceReportV6 {
  version: typeof PERFORMANCE_REPORT_VERSION; schemaVersion: typeof PERFORMANCE_REPORT_SCHEMA_VERSION;
  summary: {
    identity: PerformanceReportIdentityV6; runtimeSeconds: number; verdict: 'pass' | 'warning' | 'fail' | 'incomplete';
    scenePopulation: ScenePopulationSeriesV6; mainMetrics: Record<string, unknown>; worstWindows: WorstWindowV6[];
    diagnoses: PerformanceDiagnosisV6[]; criticalErrors: PerformanceEventV6[];
    reportHealth: ReportHealthV6; semanticHealth: SemanticHealthV6;
  };
  report: {
    phases: Record<string, unknown>[]; queues: Record<string, PerformanceQueueDiagnosticV6>;
    navigation: NavigationDiagnosticsV6; workCounters: Record<string, Record<string, number>>;
    unitOutliers: UnitPerformanceOutlierV6[]; workerDiagnostics: Record<string, WorkerDiagnosticsV6>;
    memory: MemoryDiagnosticsV6; semanticHealth: SemanticHealthV6; legacyDiagnostics: Record<string, unknown>;
  };
  trace: {
    retentionMs: number; frames: PerformanceTraceFrameV6[]; sceneTimeline: SceneTimelineEntryV6[];
    events: PerformanceEventV6[]; slowOperations: Record<string, unknown>[]; userMarkers: PerformanceEventV6[];
  };
}

export interface PerformanceReportValidationResult { ok: boolean; errors: string[]; }
export interface LegacyPerformanceReportView {
  sourceVersion: string; schemaVersion: number | null; dynamicPopulationAvailable: false;
  maximumUnitCount: null; finalUnitCount: number | null; warning: string; raw: Record<string, unknown>;
}

export function validatePerformanceReportV6(value: unknown): PerformanceReportValidationResult {
  const errors: string[] = [];
  if (!record(value)) return { ok: false, errors: ['Report root must be an object.'] };
  if (value.version !== PERFORMANCE_REPORT_VERSION) errors.push(`version must be ${PERFORMANCE_REPORT_VERSION}.`);
  if (value.schemaVersion !== 6) errors.push('schemaVersion must be 6.');
  for (const key of ['summary', 'report', 'trace']) if (!record(value[key])) errors.push(`${key} must be an object.`);
  if (record(value.summary)) {
    for (const key of ['identity', 'scenePopulation', 'reportHealth', 'semanticHealth']) if (!record(value.summary[key])) errors.push(`summary.${key} must be an object.`);
    for (const key of ['worstWindows', 'diagnoses']) if (!Array.isArray(value.summary[key])) errors.push(`summary.${key} must be an array.`);
  }
  if (record(value.report)) for (const key of ['queues', 'navigation', 'memory']) if (!record(value.report[key])) errors.push(`report.${key} must be an object.`);
  if (record(value.trace)) for (const key of ['frames', 'sceneTimeline', 'events']) if (!Array.isArray(value.trace[key])) errors.push(`trace.${key} must be an array.`);
  return { ok: errors.length === 0, errors };
}

export function normalizeLegacyPerformanceReport(value: unknown): LegacyPerformanceReportView {
  if (!record(value)) throw new Error('Legacy performance report must be an object.');
  if (value.version === PERFORMANCE_REPORT_VERSION || value.schemaVersion === 6) throw new Error('A v6 report must be read with the v6 reader.');
  const scene = record(value.scene) ? value.scene : {};
  return {
    sourceVersion: typeof value.version === 'string' ? value.version : 'unknown-legacy',
    schemaVersion: finite(value.schemaVersion), dynamicPopulationAvailable: false, maximumUnitCount: null,
    finalUnitCount: finite(scene.unitCount),
    warning: 'Legacy reports do not contain reliable initial/minimum/maximum/final population; missing values remain unavailable.',
    raw: value,
  };
}

export function emptyNumericStats(): NumericStats { return { count: 0, total: 0, min: 0, avg: 0, p50: 0, p95: 0, p99: 0, max: 0 }; }
export function buildNumericStats(values: readonly number[]): NumericStats {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return emptyNumericStats();
  const total = sorted.reduce((sum, value) => sum + value, 0);
  const at = (p: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1))] ?? 0;
  return { count: sorted.length, total: r2(total), min: r2(sorted[0] ?? 0), avg: r2(total / sorted.length), p50: r2(at(.5)), p95: r2(at(.95)), p99: r2(at(.99)), max: r2(sorted.at(-1) ?? 0) };
}
export function createStableId(prefix: string, now = Date.now(), random = Math.random()): string {
  return `${prefix}-${Math.floor(now).toString(36)}-${Math.floor(random * 0xffffff).toString(36).padStart(5, '0')}`;
}
export function estimateReportBytes(report: PerformanceReportV6): number {
  const text = JSON.stringify(report); return typeof Blob === 'undefined' ? text.length * 2 : new Blob([text]).size;
}
function record(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function finite(value: unknown): number | null { return typeof value === 'number' && Number.isFinite(value) ? value : null; }
function r2(value: number): number { return Math.round(value * 100) / 100; }
