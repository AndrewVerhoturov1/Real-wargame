import {
  PERFORMANCE_REPORT_CONTRACT_VERSION,
  PERFORMANCE_REPORT_SCHEMA_VERSION,
  PERFORMANCE_REPORT_VERSION,
  buildNumericStats,
  createStableId,
  emptyNumericStats,
  type MemoryDiagnosticsV6,
  type NavigationSearchOutlierV6,
  type PerformanceCauseV6,
  type PerformanceEventPriority,
  type PerformanceEventV6,
  type PerformanceQueueDiagnosticV6,
  type PerformanceReportIdentityV6,
  type PerformanceReportV6,
  type PerformanceTraceFrameV6,
  type ReportHealthV6,
  type ScenePopulationSeriesV6,
  type ScenePopulationSnapshotV6,
  type SceneTimelineEntryV6,
  type SemanticHealthV6,
  type UnitPerformanceOutlierV6,
} from './PerformanceReportV6';
import {
  buildQueues,
  diagnose,
  emptyPopulation,
  emptyQueue,
  finite,
  normalizeWorkers,
  number,
  observeOrder,
  populationOf,
  r1,
  r2,
  r3,
  worstWindows,
} from './PerformanceCaptureAnalysisV6';
import type {
  MutableQueueV6,
  OperationSampleInputV6,
  OrderObservationV6,
  PerformanceCaptureClockV6,
  PerformanceCaptureLimitsV6,
  PerformanceCaptureStatusV6,
  PerformanceCheckpointPayloadV6,
  PerformanceFrameInputV6,
  PerformanceReportBuildInputV6,
  QueueTransitionInputV6,
  SceneStateLikeV6,
  SceneUnitLikeV6,
  TruncationV6,
  UnitStatsV6,
} from './PerformanceCaptureTypesV6';

export type {
  OperationSampleInputV6,
  PerformanceCaptureClockV6,
  PerformanceCaptureLimitsV6,
  PerformanceCaptureStatusV6,
  PerformanceCheckpointPayloadV6,
  PerformanceFrameInputV6,
  PerformanceReportBuildInputV6,
  QueueTransitionInputV6,
  SceneOrderLikeV6,
  SceneStateLikeV6,
  SceneUnitLikeV6,
} from './PerformanceCaptureTypesV6';

const QUEUES = ['routePlanning', 'routeReplanning', 'routeCostWorker', 'pointLos', 'aiWake', 'dangerField', 'backgroundTacticalSnapshots', 'rendererDeferredUpdates'] as const;
const DEFAULT_LIMITS: PerformanceCaptureLimitsV6 = {
  traceRetentionMs: 30_000, maxFrames: 3600, maxSceneTimeline: 1200, maxEvents: 2048,
  maxCriticalEvents: 4096, maxQueueTimeline: 512, maxQueueWaitOutliers: 20,
  maxSlowOperations: 100, maxNavigationSearches: 20, maxTelemetryCostSamples: 2048,
  sceneSampleIntervalMs: 750,
};
const DEFAULT_CLOCK: PerformanceCaptureClockV6 = {
  now: () => performance.now(), wallNow: () => Date.now(), random: () => Math.random(),
};
const FALLBACK_DEEP_SCAN_INTERVAL_MS = 15_000;

export class PerformanceCaptureV6 {
  readonly sessionId: string;
  readonly captureId: string;
  private readonly startedAt: number;
  private readonly limits: PerformanceCaptureLimitsV6;
  private readonly clock: PerformanceCaptureClockV6;
  private frames: PerformanceTraceFrameV6[] = [];
  private frameWriteIndex = 0;
  private timeline: SceneTimelineEntryV6[] = [];
  private events: PerformanceEventV6[] = [];
  private critical: PerformanceEventV6[] = [];
  private operations: Record<string, unknown>[] = [];
  private navigationSearches: NavigationSearchOutlierV6[] = [];
  private queues = new Map<string, MutableQueueV6>();
  private work = new Map<string, Map<string, number>>();
  private units = new Map<string, UnitStatsV6>();
  private orders = new Map<string, OrderObservationV6>();
  private knownUnitIds = new Set<string>();
  private knownObjectIds = new Set<string>();
  private knownZoneIds = new Set<string>();
  private initial: ScenePopulationSnapshotV6 | null = null;
  private minimum: ScenePopulationSnapshotV6 | null = null;
  private maximum: ScenePopulationSnapshotV6 | null = null;
  private final: ScenePopulationSnapshotV6 | null = null;
  private previous: ScenePopulationSnapshotV6 | null = null;
  private lastPaused: boolean | null = null;
  private lastPopulationScanAt = -Infinity;
  private lastOrderScanAt = -Infinity;
  private lastSemanticScanAt = -Infinity;
  private lastTimelineAt = -Infinity;
  private lastFrameAt = 0;
  private lastCheckpointAt = 0;
  private exportStartedAt = 0;
  private eventSequence = 0;
  private samplesRecorded = 0;
  private samplesDropped = 0;
  private eventsRecorded = 0;
  private eventsDropped = 0;
  private truncation = new Map<string, TruncationV6>();
  private costs = { collection: [] as number[], serialization: [] as number[], checkpointWrite: [] as number[], export: [] as number[] };
  private semantic: SemanticHealthV6 = emptySemantic();
  private memory = { supported: false, initial: null as number | null, peak: null as number | null, final: null as number | null, previous: null as number | null, gcCount: 0, maxDrop: 0 };

  constructor(limits: Partial<PerformanceCaptureLimitsV6> = {}, clock: PerformanceCaptureClockV6 = DEFAULT_CLOCK) {
    this.limits = { ...DEFAULT_LIMITS, ...limits };
    this.clock = clock;
    this.startedAt = clock.now();
    this.sessionId = createStableId('session', clock.wallNow(), clock.random());
    this.captureId = createStableId('capture', clock.wallNow(), clock.random());
    for (const name of QUEUES) this.queues.set(name, emptyQueue());
  }

  recordFrame(state: SceneStateLikeV6, input: PerformanceFrameInputV6): void {
    const costStart = this.clock.now();
    const initializing = !this.initial;
    const tMs = this.elapsed();
    this.lastFrameAt = tMs;
    this.observePause(state);

    const slow = (input.frameMs ?? 0) >= 50 || input.applicationUpdateMs >= 25;
    const sceneShapeChanged = !this.final
      || state.units.length !== this.final.unitCount
      || state.map.objects.length !== this.final.objectCount
      || state.pressureZones.length !== this.final.pressureZoneCount;
    const shouldScanPopulation = !this.initial || sceneShapeChanged
      || tMs - this.lastPopulationScanAt >= FALLBACK_DEEP_SCAN_INTERVAL_MS;
    const population = shouldScanPopulation
      ? populationOf(state, tMs)
      : (this.final ?? emptyPopulation(tMs));

    if (shouldScanPopulation) {
      if (!this.initial) this.initializeScene(state, population);
      else this.updateScene(state, population);
      this.lastPopulationScanAt = tMs;
      this.previous = population;
      this.final = population;
      this.setQueueDepth('routePlanning', population.unitsWaitingForRoute, 0, 'scene-sample', tMs);
      this.setQueueDepth('routeReplanning', population.unitsWaitingForReplan, 0, 'scene-sample', tMs);
      this.sampleMemory();
    }
    if (tMs - this.lastOrderScanAt >= FALLBACK_DEEP_SCAN_INTERVAL_MS || sceneShapeChanged) {
      this.observeOrders(state, tMs);
      this.lastOrderScanAt = tMs;
    }
    if (tMs - this.lastSemanticScanAt >= FALLBACK_DEEP_SCAN_INTERVAL_MS || sceneShapeChanged) {
      this.scanSemantic(state);
      this.lastSemanticScanAt = tMs;
    }

    const frame: PerformanceTraceFrameV6 = {
      tMs: r1(tMs), frameMs: input.frameMs === null ? null : r2(input.frameMs),
      simulationUpdateMs: r2(input.simulationUpdateMs), applicationUpdateMs: r2(input.applicationUpdateMs),
      sceneUpdateMs: r2(input.sceneUpdateMs), unitCount: state.units.length, movingUnits: population.movingUnits,
      routeQueueDepth: population.unitsWaitingForRoute, replanQueueDepth: population.unitsWaitingForReplan,
      layerMode: input.layerMode, editorEnabled: input.editorEnabled,
    };
    this.pushFrame(frame);
    this.samplesRecorded += 1;

    const changed = sceneShapeChanged;
    const lastTimeline = this.timeline[this.timeline.length - 1];
    const queueSpike = population.unitsWaitingForRoute > (lastTimeline?.unitsWaitingForRoute ?? 0) + 4;
    if (changed || queueSpike || slow || tMs - this.lastTimelineAt >= this.limits.sceneSampleIntervalMs) {
      this.pushTimeline({
        ...population,
        tMs: r1(tMs),
        reason: changed ? 'population-change' : queueSpike ? 'queue-spike' : slow ? 'slow-frame' : 'periodic',
        routeQueueDepth: population.unitsWaitingForRoute, replanQueueDepth: population.unitsWaitingForReplan,
        frameMs: frame.frameMs, applicationUpdateMs: frame.applicationUpdateMs,
        simulationUpdateMs: frame.simulationUpdateMs,
      });
      this.lastTimelineAt = tMs;
    }
    const collectionDurationMs = this.clock.now() - costStart;
    if (initializing) {
      this.recordOperation({
        phase: 'telemetry.capture-initialization',
        durationMs: collectionDurationMs,
        startedAtMs: tMs,
        cause: { source: 'performance-monitor' },
        result: 'initialized',
      });
    } else {
      this.pushCost('collection', collectionDurationMs);
    }
  }

  refreshScene(state: SceneStateLikeV6): void {
    const tMs = this.elapsed();
    const population = populationOf(state, tMs);
    this.observePause(state);
    if (!this.initial) this.initializeScene(state, population);
    else this.updateScene(state, population);
    this.observeOrders(state, tMs);
    this.scanSemantic(state);
    this.sampleMemory();
    this.previous = population;
    this.final = population;
    this.lastPopulationScanAt = tMs;
    this.lastOrderScanAt = tMs;
    this.lastSemanticScanAt = tMs;
  }

  addUserMarker(label: string): PerformanceEventV6 {
    return this.recordEvent('user.marker', { label: label.trim().slice(0, 180) || 'Метка производительности' }, 'critical');
  }

  recordEvent(
    type: string, data: Record<string, unknown> = {}, priority: PerformanceEventPriority = 'normal',
    cause?: PerformanceCauseV6, operationId?: string,
  ): PerformanceEventV6 {
    const event: PerformanceEventV6 = {
      eventId: `${type}-${++this.eventSequence}`, type, tMs: r1(this.elapsed()), priority, operationId,
      cause: cause ? { ...cause } : undefined, data: sanitize(data),
    };
    this.eventsRecorded += 1;
    const target = priority === 'critical' || criticalType(type) ? this.critical : this.events;
    target.push(event);
    const limit = target === this.critical ? this.limits.maxCriticalEvents : this.limits.maxEvents;
    if (target.length > limit) {
      const overflow = target.length - limit;
      target.splice(0, overflow);
      this.eventsDropped += overflow;
      this.noteTruncation(
        target === this.critical ? 'trace.criticalEvents' : 'trace.events', overflow,
        target === this.critical ? 'critical buffer detail limit reached; newest evidence retained' : 'bounded event log dropped oldest normal events',
        true, target !== this.critical, true,
      );
    }
    return event;
  }

  recordQueueTransition(input: QueueTransitionInputV6): void {
    const queue = this.queue(input.queue);
    queue[input.transition] += 1;
    if (typeof input.waitMs === 'number' && Number.isFinite(input.waitMs)) {
      queue.waits.push(Math.max(0, input.waitMs));
      if (queue.waits.length > 2048) queue.waits.splice(0, queue.waits.length - 2048);
      queue.slowestWaits.push({
        requestId: input.requestId, unitId: input.unitId, orderId: input.orderId,
        createdAtMs: r1(this.elapsed() - input.waitMs),
        startedAtMs: input.transition === 'started' ? r1(this.elapsed()) : null,
        completedAtMs: ['completed', 'cancelled', 'failed', 'timedOut', 'stale'].includes(input.transition) ? r1(this.elapsed()) : null,
        waitMs: r2(input.waitMs), result: input.transition,
      });
      queue.slowestWaits.sort((a, b) => b.waitMs - a.waitMs);
      queue.slowestWaits.length = Math.min(queue.slowestWaits.length, this.limits.maxQueueWaitOutliers);
    }
    if (input.depth !== undefined || input.inFlight !== undefined) {
      this.setQueueDepth(input.queue, input.depth ?? queue.currentDepth, input.inFlight ?? queue.currentInFlight, input.reason ?? input.transition, this.elapsed());
    }
  }

  recordWork(subsystem: string, counters: Record<string, number>): void {
    const target = this.work.get(subsystem) ?? new Map<string, number>();
    this.work.set(subsystem, target);
    for (const [key, value] of Object.entries(counters)) {
      if (Number.isFinite(value)) target.set(key, (target.get(key) ?? 0) + value);
    }
  }

  recordUnitWork(unitId: string, counters: Partial<UnitStatsV6>): void {
    const target = this.unit(unitId);
    for (const [key, value] of Object.entries(counters) as Array<[keyof UnitStatsV6, number | string | null | undefined]>) {
      if (key === 'mainReason') {
        if (typeof value === 'string' || value === null) target.mainReason = value;
      } else if (typeof value === 'number' && Number.isFinite(value)) {
        (target[key] as number) += value;
      }
    }
  }

  recordOperation(input: OperationSampleInputV6): void {
    const operation = {
      phase: input.phase, durationMs: r2(Math.max(0, input.durationMs)),
      startMs: r1(input.startedAtMs ?? Math.max(0, this.elapsed() - input.durationMs)),
      operationId: input.operationId ?? createStableId('op', this.clock.wallNow(), this.clock.random()),
      cause: input.cause ? { ...input.cause } : null, work: input.work ? { ...input.work } : {}, result: input.result ?? 'unknown',
    };
    this.operations.push(operation);
    this.operations.sort((a, b) => number(b.durationMs) - number(a.durationMs));
    this.operations.length = Math.min(this.operations.length, this.limits.maxSlowOperations);
    if (input.durationMs >= 50) {
      this.recordEvent('long-task.detected', { phase: input.phase, durationMs: r2(input.durationMs), work: input.work ?? {} }, 'critical', input.cause, String(operation.operationId));
    }
  }

  recordSemanticViolation(field: keyof Omit<SemanticHealthV6, 'violations'>, data: Record<string, unknown>): void {
    this.semantic[field] += 1;
    const event = this.recordEvent('semantic.violation', { field, ...data }, 'critical');
    this.semantic.violations.push(event);
    if (this.semantic.violations.length > 256) this.semantic.violations.splice(0, this.semantic.violations.length - 256);
  }

  recordCheckpointCost(ms: number, at = this.elapsed()): void { this.lastCheckpointAt = at; this.pushCost('checkpointWrite', ms); }
  recordSerializationCost(ms: number): void { this.pushCost('serialization', ms); }
  recordExportCost(ms: number): void { this.pushCost('export', ms); }
  getTelemetryCostStats(kind: keyof typeof this.costs) { return buildNumericStats(this.costs[kind]); }
  startExport(): void { this.exportStartedAt = this.elapsed(); }

  getStatus(): PerformanceCaptureStatusV6 {
    return {
      version: PERFORMANCE_REPORT_VERSION, runtimeSeconds: r1(this.elapsed() / 1000),
      currentUnitCount: this.final?.unitCount ?? 0, maximumUnitCount: this.maximum?.unitCount ?? 0,
      samplesDropped: Math.max(this.samplesDropped, this.samplesRecorded - this.orderedFrames().length),
      eventsDropped: this.eventsDropped,
      bufferUtilization: r3(this.frames.length / Math.max(1, this.limits.maxFrames)),
    };
  }

  buildReport(input: PerformanceReportBuildInputV6): PerformanceReportV6 {
    return this.buildReportInternal(input, false);
  }

  buildCheckpoint(input: PerformanceReportBuildInputV6): PerformanceCheckpointPayloadV6 {
    const report = this.buildReportInternal({
      ...input, recoveredFromCheckpoint: true, exportCompleted: false,
      possibleMissingTailMs: 0, lastCheckpointAtMs: this.elapsed(),
    }, true);
    return {
      version: PERFORMANCE_REPORT_VERSION, schemaVersion: PERFORMANCE_REPORT_SCHEMA_VERSION,
      sessionId: this.sessionId, captureId: this.captureId,
      savedAtEpochMs: this.clock.wallNow(), savedAtCaptureMs: r1(this.elapsed()), report,
    };
  }

  private buildReportInternal(input: PerformanceReportBuildInputV6, compactCheckpoint: boolean): PerformanceReportV6 {
    const population = this.populationSeries();
    const queues = buildQueues(this.queues);
    const allFrames = this.orderedFrames();
    this.syncFrameTruncation(allFrames.length);
    const allTimeline = this.finalTimeline();
    const allEvents = this.orderedEvents();
    const frames = compactCheckpoint ? allFrames.slice(-240) : allFrames;
    const timeline = compactCheckpoint ? allTimeline.slice(-120) : allTimeline;
    const events = compactCheckpoint ? compactEventsForCheckpoint(allEvents) : allEvents;
    const operations = compactCheckpoint ? this.operations.slice(0, 20) : this.operations;
    const phases = compactCheckpoint ? input.phases.slice(0, 64) : input.phases;
    const health = this.reportHealth(
      input.recoveredFromCheckpoint ?? false, input.possibleMissingTailMs ?? 0,
      input.exportCompleted ?? true, input.lastCheckpointAtMs ?? this.lastCheckpointAt,
    );
    const memory = this.memoryDiagnostics();
    const navigation = this.navigation(queues, input.routeFields ?? {});
    const diagnoses = diagnose(queues, navigation.slowestSearches, this.semantic, memory, health, frames);
    const identity: PerformanceReportIdentityV6 = {
      ...input.identity, reportVersion: PERFORMANCE_REPORT_VERSION,
      contractVersion: PERFORMANCE_REPORT_CONTRACT_VERSION, sessionId: this.sessionId, captureId: this.captureId,
    };
    const verdict = health.recoveredFromCheckpoint || !health.exportCompleted
      ? 'incomplete'
      : diagnoses.some((item) => item.severity === 'critical') ? 'fail' : diagnoses.length ? 'warning' : 'pass';
    const workCounters = this.buildWork();
    for (const [subsystem, counters] of Object.entries(input.workCounters ?? {})) {
      workCounters[subsystem] = { ...(workCounters[subsystem] ?? {}), ...counters };
    }
    return {
      version: PERFORMANCE_REPORT_VERSION,
      schemaVersion: PERFORMANCE_REPORT_SCHEMA_VERSION,
      summary: {
        identity, runtimeSeconds: r1(this.elapsed() / 1000), verdict, scenePopulation: population,
        mainMetrics: { ...input.mainMetrics },
        worstWindows: worstWindows(frames, timeline, events, phases, operations),
        diagnoses, criticalErrors: events.filter((event) => event.priority === 'critical' || criticalType(event.type)),
        reportHealth: health, semanticHealth: cloneSemantic(this.semantic),
      },
      report: {
        phases: phases.map((item) => ({ ...item })), queues, navigation, workCounters,
        unitOutliers: this.unitOutliers(), workerDiagnostics: normalizeWorkers(input.workerDiagnostics ?? {}),
        memory, semanticHealth: cloneSemantic(this.semantic), legacyDiagnostics: { ...input.legacyDiagnostics },
      },
      trace: {
        retentionMs: this.limits.traceRetentionMs, frames, sceneTimeline: timeline, events,
        slowOperations: [...operations, ...(input.slowOperations ?? [])].slice(0, compactCheckpoint ? 20 : this.limits.maxSlowOperations),
        userMarkers: events.filter((event) => event.type === 'user.marker'),
      },
    };
  }

  static recoverCheckpoint(payload: PerformanceCheckpointPayloadV6, nowEpochMs = Date.now()): PerformanceReportV6 {
    const missing = Math.max(0, nowEpochMs - payload.savedAtEpochMs);
    return {
      ...payload.report,
      summary: {
        ...payload.report.summary, verdict: 'incomplete',
        reportHealth: {
          ...payload.report.summary.reportHealth, recoveredFromCheckpoint: true,
          exportCompleted: false, possibleMissingTailMs: r1(missing),
        },
        diagnoses: [
          ...payload.report.summary.diagnoses.filter((item) => item.code !== 'INCOMPLETE_CAPTURE'),
          { severity: 'warning', code: 'INCOMPLETE_CAPTURE', message: 'Recovered from the last checkpoint; the final tail may be missing.', evidence: { possibleMissingTailMs: r1(missing) } },
        ],
      },
    };
  }

  private initializeScene(state: SceneStateLikeV6, population: ScenePopulationSnapshotV6): void {
    this.initial = population; this.minimum = population; this.maximum = population; this.final = population;
    for (const unit of state.units) this.knownUnitIds.add(unit.id);
    for (const [index, object] of state.map.objects.entries()) this.knownObjectIds.add(object.id ?? `object-${index}`);
    for (const [index, zone] of state.pressureZones.entries()) this.knownZoneIds.add(zone.id ?? `zone-${index}`);
    this.recordEvent('map.loaded', { mapWidthCells: state.map.width, mapHeightCells: state.map.height, unitCount: population.unitCount }, 'important');
    this.lastPaused = Boolean(state.paused);
    this.recordEvent('simulation.started', { simulationStep: state.simulationStep, simulationTimeSeconds: state.simulationTimeSeconds, paused: this.lastPaused }, 'important');
  }

  private observePause(state: SceneStateLikeV6): void {
    const paused = Boolean(state.paused);
    if (this.lastPaused === null) {
      this.lastPaused = paused;
      return;
    }
    if (this.lastPaused !== paused) {
      this.recordEvent(paused ? 'simulation.paused' : 'simulation.resumed', { simulationStep: state.simulationStep, simulationTimeSeconds: state.simulationTimeSeconds }, 'important');
      this.lastPaused = paused;
    }
  }

  private updateScene(state: SceneStateLikeV6, population: ScenePopulationSnapshotV6): void {
    this.detectSceneChanges(state, population);
    if (population.unitCount < (this.minimum?.unitCount ?? Infinity)) this.minimum = population;
    if (population.unitCount > (this.maximum?.unitCount ?? -Infinity)) this.maximum = population;
    this.final = population;
  }

  private detectSceneChanges(state: SceneStateLikeV6, population: ScenePopulationSnapshotV6): void {
    const currentUnits = new Set(state.units.map((unit) => unit.id));
    const created = state.units.filter((unit) => !this.knownUnitIds.has(unit.id));
    const removed = [...this.knownUnitIds].filter((id) => !currentUnits.has(id));
    if (created.length === 1) this.recordEvent('editor.unit-created', { unitId: created[0].id, side: created[0].side ?? 'unknown', unitCount: population.unitCount }, 'important');
    if (created.length > 1) this.recordEvent('editor.units-created', { count: created.length, unitIds: created.slice(0, 100).map((unit) => unit.id), unitCount: population.unitCount }, 'critical');
    if (removed.length === 1) this.recordEvent('editor.unit-removed', { unitId: removed[0], unitCount: population.unitCount }, 'important');
    if (removed.length > 1) this.recordEvent('editor.units-removed', { count: removed.length, unitIds: removed.slice(0, 100), unitCount: population.unitCount }, 'critical');
    this.knownUnitIds = currentUnits;

    const objects = new Set(state.map.objects.map((object, index) => object.id ?? `object-${index}`));
    const objectDelta = objects.size - this.knownObjectIds.size;
    if (objectDelta > 0) this.recordEvent('editor.object-added', { count: objectDelta, objectCount: objects.size }, 'important');
    if (objectDelta < 0) this.recordEvent('editor.object-removed', { count: -objectDelta, objectCount: objects.size }, 'important');
    if (objectDelta) this.recordEvent('editor.map-changed', { objectDelta }, 'important');
    this.knownObjectIds = objects;

    const zones = new Set(state.pressureZones.map((zone, index) => zone.id ?? `zone-${index}`));
    const zoneDelta = zones.size - this.knownZoneIds.size;
    if (zoneDelta) this.recordEvent('editor.map-changed', { pressureZoneDelta: zoneDelta }, 'important');
    this.knownZoneIds = zones;
  }

  private observeOrders(state: SceneStateLikeV6, tMs: number): void {
    for (const unit of state.units) {
      const previous = this.orders.get(unit.id);
      const order = unit.order;
      if (!order) {
        if (previous) {
          this.recordEvent('order.cancelled', { unitId: unit.id, orderId: previous.orderId }, 'important', cause(unit.id, previous));
          this.orders.delete(unit.id);
        }
        continue;
      }
      const fresh = observeOrder(unit, order, tMs);
      const current = previous?.key === fresh.key
        ? { ...fresh, createdAtMs: previous.createdAtMs, orderId: previous.orderId, requestId: previous.requestId, operationId: previous.operationId, start: previous.start }
        : fresh;
      if (!previous || previous.key !== current.key) {
        this.recordEvent(previous ? 'order.replaced' : 'order.created', { unitId: unit.id, orderId: current.orderId, previousOrderId: previous?.orderId, target: current.goal, source: order.source ?? 'unknown' }, 'important', cause(unit.id, current), current.operationId);
        this.recordQueueTransition({ queue: 'routePlanning', transition: 'created', requestId: current.requestId, unitId: unit.id, orderId: current.orderId });
        this.recordEvent('route.request-created', { unitId: unit.id, orderId: current.orderId, routeRequestId: current.requestId }, 'important', cause(unit.id, current), current.operationId);
        this.unit(unit.id).routeRequests += 1;
      }
      if (previous && current.replanSearchCount > previous.replanSearchCount) {
        const delta = current.replanSearchCount - previous.replanSearchCount;
        this.unit(unit.id).routeReplans += delta;
        this.recordEvent('route.replan-requested', { unitId: unit.id, orderId: current.orderId, count: delta, reason: order.lastReplanReason ?? 'unknown' }, 'important', cause(unit.id, current), current.operationId);
      }
      if ((!previous || !previous.hadRoute) && current.hadRoute) this.completeRoute(unit, order, current, tMs);
      this.orders.set(unit.id, current);
    }
  }

  private completeRoute(unit: SceneUnitLikeV6, order: NonNullable<SceneUnitLikeV6['order']>, item: OrderObservationV6, tMs: number): void {
    const duration = Math.max(0, tMs - item.createdAtMs);
    this.recordQueueTransition({ queue: 'routePlanning', transition: 'started', requestId: item.requestId, unitId: unit.id, orderId: item.orderId, waitMs: duration });
    this.recordQueueTransition({ queue: 'routePlanning', transition: 'completed', requestId: item.requestId, unitId: unit.id, orderId: item.orderId, waitMs: duration });
    this.recordEvent('route.search-completed', { unitId: unit.id, orderId: item.orderId, routeRequestId: item.requestId, durationMs: r2(duration), visitedCells: finite(order.pathVisitedCells), routeCost: finite(order.pathCost), pathLength: order.routeCells?.length ?? 0, durationSource: 'observed_order_to_route' }, duration >= 50 ? 'critical' : 'important', cause(unit.id, item), item.operationId);
    this.recordEvent('route.result-applied', { unitId: unit.id, orderId: item.orderId, routeRequestId: item.requestId, routeRevision: order.routeRevision ?? 0 }, 'important', cause(unit.id, item), item.operationId);
    const outlier: NavigationSearchOutlierV6 = {
      unitId: unit.id, orderId: item.orderId, routeRequestId: item.requestId, operationId: item.operationId,
      start: item.start, goal: item.goal, profileId: item.profileId,
      knownThreatCount: unit.tacticalKnowledge?.threats?.length ?? 0,
      visitedCells: finite(order.pathVisitedCells), expandedNodes: null, openSetPeak: null,
      pathLength: order.routeCells?.length ?? null, routeCost: finite(order.pathCost),
      durationMs: r2(duration), queueWaitMs: r2(duration),
      timings: { queueWaitMs: r2(duration), fieldPreparationMs: null, workerTransferMs: null, searchMs: null, reconstructionMs: null, simplificationMs: null, validationMs: null, applicationMs: null },
      result: 'found', durationSource: 'observed_order_to_route',
    };
    this.navigationSearches.push(outlier);
    this.navigationSearches.sort((a, b) => b.durationMs - a.durationMs);
    this.navigationSearches.length = Math.min(this.navigationSearches.length, this.limits.maxNavigationSearches);
    this.unit(unit.id).longestRouteWaitMs = Math.max(this.unit(unit.id).longestRouteWaitMs, duration);
    this.recordWork('navigation', { totalRequests: 1, found: 1, applied: 1, visitedCells: order.pathVisitedCells ?? 0, pathLength: order.routeCells?.length ?? 0, routeCost: order.pathCost ?? 0 });
  }

  private scanSemantic(state: SceneStateLikeV6): void {
    const ids = new Set<string>();
    let duplicates = 0, invalid = 0, nan = 0;
    for (const unit of state.units) {
      if (ids.has(unit.id)) duplicates++;
      ids.add(unit.id);
      if (!Number.isFinite(unit.position.x) || !Number.isFinite(unit.position.y)) {
        invalid++;
        if (Number.isNaN(unit.position.x) || Number.isNaN(unit.position.y)) nan++;
      } else if (unit.position.x < 0 || unit.position.y < 0 || unit.position.x > state.map.width || unit.position.y > state.map.height) invalid++;
      this.unit(unit.id).contactMemorySize = Math.max(unit.tacticalKnowledge?.threats?.length ?? 0, unit.perceptionKnowledge?.contacts?.length ?? 0);
    }
    this.raiseSemantic('duplicateUnitIds', duplicates);
    this.raiseSemantic('invalidPositions', invalid);
    this.raiseSemantic('nanValues', nan);
  }

  private raiseSemantic(field: 'duplicateUnitIds' | 'invalidPositions' | 'nanValues', value: number): void {
    if (value <= this.semantic[field]) return;
    this.semantic[field] = value;
    const event = this.recordEvent('semantic.violation', { field, count: value }, 'critical');
    this.semantic.violations.push(event);
  }

  private pushFrame(frame: PerformanceTraceFrameV6): void {
    if (this.frames.length < this.limits.maxFrames) {
      this.frames.push(frame);
      return;
    }
    this.frames[this.frameWriteIndex] = frame;
    this.frameWriteIndex = (this.frameWriteIndex + 1) % this.limits.maxFrames;
    this.samplesDropped += 1;
  }

  private orderedFrames(): PerformanceTraceFrameV6[] {
    const ordered = this.frames.length < this.limits.maxFrames || this.frameWriteIndex === 0
      ? [...this.frames]
      : [...this.frames.slice(this.frameWriteIndex), ...this.frames.slice(0, this.frameWriteIndex)];
    const minTime = this.lastFrameAt - this.limits.traceRetentionMs;
    return ordered.filter((frame) => frame.tMs >= minTime);
  }

  private syncFrameTruncation(retainedCount: number): void {
    const lost = Math.max(0, this.samplesRecorded - retainedCount);
    if (lost === 0) return;
    this.truncation.set('trace.frames', {
      section: 'trace.frames',
      lost,
      reason: 'recent ring buffer retained only the configured time window and frame limit',
      worstSamplesPreserved: true,
      errorsPreserved: true,
      recentTailPreserved: true,
    });
  }

  private pushTimeline(entry: SceneTimelineEntryV6): void {
    this.timeline.push(entry);
    if (this.timeline.length > this.limits.maxSceneTimeline) {
      const lost = this.timeline.length - this.limits.maxSceneTimeline;
      this.timeline.splice(0, lost);
      this.noteTruncation('trace.sceneTimeline', lost, 'scene timeline retained newest aggregate snapshots', true, true, true);
    }
  }

  private setQueueDepth(name: string, depth: number, inFlight: number, reason: string, tMs: number): void {
    const queue = this.queue(name);
    queue.currentDepth = Math.max(0, depth); queue.currentInFlight = Math.max(0, inFlight);
    queue.maximumDepth = Math.max(queue.maximumDepth, queue.currentDepth);
    queue.maximumInFlight = Math.max(queue.maximumInFlight, queue.currentInFlight);
    const last = queue.timeline[queue.timeline.length - 1];
    if (!last || last.depth !== queue.currentDepth || last.inFlight !== queue.currentInFlight) {
      queue.timeline.push({ tMs: r1(tMs), depth: queue.currentDepth, inFlight: queue.currentInFlight, reason });
    }
    if (queue.timeline.length > this.limits.maxQueueTimeline) queue.timeline.splice(0, queue.timeline.length - this.limits.maxQueueTimeline);
  }

  private queue(name: string): MutableQueueV6 {
    const existing = this.queues.get(name);
    if (existing) return existing;
    const created = emptyQueue(); this.queues.set(name, created); return created;
  }

  private unit(id: string): UnitStatsV6 {
    const existing = this.units.get(id);
    if (existing) return existing;
    const created: UnitStatsV6 = { routeRequests: 0, routeReplans: 0, longestRouteWaitMs: 0, losRequests: 0, contactMemorySize: 0, collisionCandidates: 0, eventWakes: 0, aiTotalMs: 0, mainReason: null };
    this.units.set(id, created);
    return created;
  }

  private buildWork(): Record<string, Record<string, number>> {
    const result: Record<string, Record<string, number>> = {};
    for (const name of ['ai', 'perception', 'collisions', 'danger', 'rendering', 'map', 'navigation']) result[name] = {};
    for (const [name, counters] of this.work) result[name] = Object.fromEntries(counters);
    return result;
  }

  private unitOutliers(): UnitPerformanceOutlierV6[] {
    return [...this.units.entries()].map(([unitId, stats]) => ({ unitId, ...stats }))
      .sort((a, b) => (b.longestRouteWaitMs + b.routeRequests * 10 + b.routeReplans * 20 + b.aiTotalMs) - (a.longestRouteWaitMs + a.routeRequests * 10 + a.routeReplans * 20 + a.aiTotalMs))
      .slice(0, 30);
  }

  private navigation(queues: Record<string, PerformanceQueueDiagnosticV6>, routeFields: Record<string, unknown>) {
    const counters = this.work.get('navigation') ?? new Map<string, number>();
    const searches = this.navigationSearches;
    return {
      orders: { created: countEvents(this.orderedEvents(), 'order.created'), replaced: countEvents(this.orderedEvents(), 'order.replaced'), cancelled: countEvents(this.orderedEvents(), 'order.cancelled') },
      routeQueue: queues.routePlanning, replanQueue: queues.routeReplanning,
      pathfinding: {
        totalRequests: counters.get('totalRequests') ?? queues.routePlanning.created,
        tacticalSearches: counters.get('tacticalSearches') ?? 0, baselineSearches: counters.get('baselineSearches') ?? 0,
        replanSearches: counters.get('replanSearches') ?? queues.routeReplanning.created,
        visitedCells: counters.get('visitedCells') ?? 0, expandedNodes: counters.get('expandedNodes') ?? 0,
        openSetPeak: counters.get('openSetPeak') ?? 0, pathLength: counters.get('pathLength') ?? 0,
        routeCost: counters.get('routeCost') ?? 0, found: counters.get('found') ?? searches.length,
        notFound: counters.get('notFound') ?? 0, budgetExceeded: counters.get('budgetExceeded') ?? 0,
        timedOut: counters.get('timedOut') ?? 0, cancelled: counters.get('cancelled') ?? queues.routePlanning.cancelled,
        stale: counters.get('stale') ?? queues.routePlanning.stale,
        applied: counters.get('applied') ?? countEvents(this.orderedEvents(), 'route.result-applied'),
        timingMs: {
          queueWait: queues.routePlanning.waitMs, fieldPreparation: emptyNumericStats(), workerTransfer: emptyNumericStats(),
          search: buildNumericStats(searches.map((item) => item.durationMs)), reconstruction: emptyNumericStats(),
          simplification: emptyNumericStats(), validation: emptyNumericStats(), application: emptyNumericStats(),
        },
      },
      routeFields: { ...routeFields }, slowestSearches: [...searches], unitOutliers: this.unitOutliers(),
    };
  }

  private populationSeries(): ScenePopulationSeriesV6 {
    const fallback = emptyPopulation(this.elapsed());
    return {
      initial: this.initial ?? fallback, measurementStart: this.initial ?? fallback,
      minimum: this.minimum ?? this.initial ?? fallback, maximum: this.maximum ?? this.initial ?? fallback,
      final: this.final ?? this.initial ?? fallback,
    };
  }

  private finalTimeline(): SceneTimelineEntryV6[] {
    const final = this.final;
    if (!final) return [...this.timeline];
    const frames = this.orderedFrames();
    const last = frames[frames.length - 1];
    const entry: SceneTimelineEntryV6 = {
      ...final, reason: 'final', routeQueueDepth: final.unitsWaitingForRoute,
      replanQueueDepth: final.unitsWaitingForReplan, frameMs: last?.frameMs ?? null,
      applicationUpdateMs: last?.applicationUpdateMs ?? 0, simulationUpdateMs: last?.simulationUpdateMs ?? 0,
    };
    return [...this.timeline, entry].slice(-this.limits.maxSceneTimeline);
  }

  private orderedEvents(): PerformanceEventV6[] {
    return [...this.events, ...this.critical].sort((a, b) => a.tMs - b.tMs || a.eventId.localeCompare(b.eventId));
  }

  private memoryDiagnostics(): MemoryDiagnosticsV6 {
    const telemetryBytes = this.orderedFrames().length * 100 + this.timeline.length * 350
      + (this.events.length + this.critical.length) * 320 + this.operations.length * 450;
    return {
      supported: this.memory.supported, approximate: true, initialBytes: this.memory.initial,
      peakBytes: this.memory.peak, finalBytes: this.memory.final,
      estimatedSubsystems: { telemetryBuffers: telemetryBytes }, largeAllocations: {},
      typedArraysCreated: 0, typedArraysReused: 0, cacheBytes: {}, workerPayloadBytes: {},
      possibleGcPauses: { count: this.memory.gcCount, maxDropBytes: this.memory.maxDrop },
    };
  }

  private sampleMemory(): void {
    const value = browserHeap();
    if (value === null) return;
    this.memory.supported = true;
    this.memory.initial ??= value;
    this.memory.peak = Math.max(this.memory.peak ?? 0, value);
    this.memory.final = value;
    if (this.memory.previous !== null && this.memory.previous - value > 4 * 1024 * 1024) {
      this.memory.gcCount += 1;
      this.memory.maxDrop = Math.max(this.memory.maxDrop, this.memory.previous - value);
    }
    this.memory.previous = value;
  }

  private reportHealth(recovered: boolean, missing: number, completed: boolean, checkpointAt: number): ReportHealthV6 {
    const truncation = [...this.truncation.values()];
    return {
      captureStartedAtMs: 0, lastSampleAtMs: r1(this.lastFrameAt), lastCheckpointAtMs: r1(checkpointAt),
      exportStartedAtMs: r1(this.exportStartedAt), exportCompleted: completed,
      samplesRecorded: this.samplesRecorded, samplesDropped: this.samplesDropped,
      eventsRecorded: this.eventsRecorded, eventsDropped: this.eventsDropped,
      buffers: {
        frames: { used: this.orderedFrames().length, limit: this.limits.maxFrames },
        sceneTimeline: { used: this.timeline.length, limit: this.limits.maxSceneTimeline },
        events: { used: this.events.length, limit: this.limits.maxEvents },
        criticalEvents: { used: this.critical.length, limit: this.limits.maxCriticalEvents },
        slowOperations: { used: this.operations.length, limit: this.limits.maxSlowOperations },
        navigationSearches: { used: this.navigationSearches.length, limit: this.limits.maxNavigationSearches },
      },
      truncatedSections: truncation.map((item) => item.section),
      truncationReasons: truncation.map((item) => `${item.section}: ${item.reason}`), truncation,
      telemetryCostMs: {
        collection: buildNumericStats(this.costs.collection), serialization: buildNumericStats(this.costs.serialization),
        checkpointWrite: buildNumericStats(this.costs.checkpointWrite), export: buildNumericStats(this.costs.export),
      },
      estimatedReportBytes: this.orderedFrames().length * 100 + this.timeline.length * 350 + (this.events.length + this.critical.length) * 320 + 24_000,
      recoveredFromCheckpoint: recovered, possibleMissingTailMs: r1(Math.max(0, missing)),
    };
  }

  private noteTruncation(section: string, lost: number, reason: string, worst: boolean, errors: boolean, tail: boolean): void {
    const old = this.truncation.get(section);
    this.truncation.set(section, {
      section, lost: (old?.lost ?? 0) + lost, reason,
      worstSamplesPreserved: worst, errorsPreserved: errors, recentTailPreserved: tail,
    });
  }

  private pushCost(kind: keyof typeof this.costs, value: number): void {
    if (!Number.isFinite(value)) return;
    this.costs[kind].push(Math.max(0, value));
    if (this.costs[kind].length > this.limits.maxTelemetryCostSamples) {
      this.costs[kind].splice(0, this.costs[kind].length - this.limits.maxTelemetryCostSamples);
    }
  }

  private elapsed(): number { return Math.max(0, this.clock.now() - this.startedAt); }
}

function cause(unitId: string, item: OrderObservationV6): PerformanceCauseV6 {
  return { unitId, orderId: item.orderId, routeRequestId: item.requestId, operationId: item.operationId, profileId: item.profileId ?? undefined };
}
function emptySemantic(): SemanticHealthV6 {
  return { lostOrders: 0, staleRoutesApplied: 0, routeAppliedToWrongOrder: 0, schedulerStarvation: 0, losStarvation: 0, crossUnitKnowledgeLeaks: 0, duplicateUnitIds: 0, invalidPositions: 0, nanValues: 0, workerErrors: 0, unhandledRejections: 0, violations: [] };
}
function cloneSemantic(value: SemanticHealthV6): SemanticHealthV6 { return { ...value, violations: [...value.violations] }; }
function countEvents(events: PerformanceEventV6[], type: string): number { return events.filter((event) => event.type === type).length; }
function sanitize(data: Record<string, unknown>): Record<string, unknown> { return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, sanitizeValue(value)])); }
function sanitizeValue(value: unknown): unknown {
  if (typeof value === 'string') return value.slice(0, 500);
  if (Array.isArray(value)) return value.slice(0, 100).map(sanitizeValue);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value as Record<string, unknown>).slice(0, 100).map(([key, nested]) => [key, sanitizeValue(nested)]));
  return value;
}
function compactEventsForCheckpoint(events: PerformanceEventV6[]): PerformanceEventV6[] {
  const protectedEvents = events.filter((event) => event.priority === 'critical' || criticalType(event.type)).slice(-256);
  const recentNormal = events.filter((event) => event.priority !== 'critical' && !criticalType(event.type)).slice(-128);
  return [...protectedEvents, ...recentNormal]
    .sort((left, right) => left.tMs - right.tMs || left.eventId.localeCompare(right.eventId));
}

function criticalType(type: string): boolean { return /^(long-task\.detected|worker\.(error|timeout)|semantic\.violation|telemetry\.truncated|user\.marker|memory\.spike)$/.test(type); }
function browserHeap(): number | null {
  const value = (performance as Performance & { memory?: { usedJSHeapSize?: number } }).memory?.usedJSHeapSize;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
