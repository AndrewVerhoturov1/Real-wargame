import {
  buildNumericStats,
  emptyNumericStats,
  type MemoryDiagnosticsV6,
  type NavigationSearchOutlierV6,
  type PerformanceDiagnosisV6,
  type PerformanceEventV6,
  type PerformanceQueueDiagnosticV6,
  type PerformanceTraceFrameV6,
  type ReportHealthV6,
  type ScenePopulationSnapshotV6,
  type SceneTimelineEntryV6,
  type SemanticHealthV6,
  type WorkerDiagnosticsV6,
  type WorstWindowV6,
} from './PerformanceReportV6';
import type {
  MutableQueueV6,
  OrderObservationV6,
  SceneOrderLikeV6,
  SceneStateLikeV6,
  SceneUnitLikeV6,
} from './PerformanceCaptureTypesV6';

export function populationOf(state: SceneStateLikeV6, tMs: number): ScenePopulationSnapshotV6 {
  const sides: Record<string, number> = {};
  let alive = 0, dead = 0, graph = 0, manual = 0, moving = 0, orders = 0, waiting = 0, active = 0, replans = 0, combat = 0;
  for (const unit of state.units) {
    const side = unit.side ?? 'unknown'; sides[side] = (sides[side] ?? 0) + 1;
    const health = finite(unit.behaviorRuntime?.health) ?? finite(unit.soldier?.condition?.health);
    health !== null && health <= 0 ? dead++ : alive++;
    unit.aiControl === 'manual' ? manual++ : graph++;
    if (unit.order) {
      orders++;
      const length = unit.order.routeCells?.length ?? 0;
      if (!length) waiting++;
      else if ((unit.order.routeCellIndex ?? 0) < length) { active++; moving++; }
      if ((unit.order.replanSearchCount ?? 0) > (unit.order.replanCount ?? 0)) replans++;
    }
    if (/shot|fire|combat|suppression/.test(String(unit.behaviorRuntime?.lastEvent ?? '').toLowerCase())) combat++;
  }
  return {
    tMs: r1(tMs), unitCount: state.units.length, aliveUnitCount: alive, deadUnitCount: dead,
    objectCount: state.map.objects.length, pressureZoneCount: state.pressureZones.length, unitsBySide: sides,
    graphControlledUnits: graph, manualUnits: manual, movingUnits: moving,
    stationaryUnits: Math.max(0, state.units.length - moving), unitsWithOrder: orders,
    unitsWaitingForRoute: waiting, unitsWithActiveRoute: active, unitsWaitingForReplan: replans, unitsInCombat: combat,
  };
}

export function emptyPopulation(tMs: number): ScenePopulationSnapshotV6 {
  return {
    tMs: r1(tMs), unitCount: 0, aliveUnitCount: 0, deadUnitCount: 0, objectCount: 0, pressureZoneCount: 0,
    unitsBySide: {}, graphControlledUnits: 0, manualUnits: 0, movingUnits: 0, stationaryUnits: 0,
    unitsWithOrder: 0, unitsWaitingForRoute: 0, unitsWithActiveRoute: 0, unitsWaitingForReplan: 0, unitsInCombat: 0,
  };
}

export function observeOrder(unit: SceneUnitLikeV6, order: SceneOrderLikeV6, tMs: number): OrderObservationV6 {
  const goal = order.requestedTarget ?? order.target ?? unit.position;
  const issued = order.issuedAtMs ?? tMs;
  const key = `${issued}:${goal.x}:${goal.y}:${order.playerCommandId ?? order.ownerToken ?? ''}`;
  const seed = Math.abs(hash(`${unit.id}:${key}`)).toString(36);
  return {
    key, orderId: order.playerCommandId ?? `order-${seed}`, requestId: `route-${seed}`,
    operationId: `op-route-${seed}`, createdAtMs: tMs,
    start: { x: r3(unit.position.x), y: r3(unit.position.y) }, goal: { x: r3(goal.x), y: r3(goal.y) },
    profileId: order.navigationProfileId ?? null, hadRoute: (order.routeCells?.length ?? 0) > 0,
    replanSearchCount: order.replanSearchCount ?? 0,
  };
}

export function buildQueues(source: Map<string, MutableQueueV6>): Record<string, PerformanceQueueDiagnosticV6> {
  const result: Record<string, PerformanceQueueDiagnosticV6> = {};
  for (const [name, queue] of source) {
    result[name] = {
      created: queue.created, started: queue.started, completed: queue.completed, cancelled: queue.cancelled,
      failed: queue.failed, timedOut: queue.timedOut, stale: queue.stale,
      currentDepth: queue.currentDepth, maximumDepth: queue.maximumDepth,
      currentInFlight: queue.currentInFlight, maximumInFlight: queue.maximumInFlight,
      waitMs: buildNumericStats(queue.waits), timeline: queue.timeline.map((item) => ({ ...item })),
      slowestWaits: queue.slowestWaits.map((item) => ({ ...item })),
    };
  }
  return result;
}

export function normalizeWorkers(input: Record<string, Record<string, unknown>>): Record<string, WorkerDiagnosticsV6> {
  const result: Record<string, WorkerDiagnosticsV6> = {};
  for (const [name, raw] of Object.entries(input)) {
    result[name] = {
      created: int(raw.created), restarts: int(raw.restarts), requests: int(raw.requests), completed: int(raw.completed),
      failed: int(raw.failed), timedOut: int(raw.timedOut), cancelled: int(raw.cancelled),
      staleResults: int(raw.staleResults ?? raw.stale), queueMax: int(raw.queueMax ?? raw.maximumDepth),
      payloadBytes: stats(raw.payloadBytes), serializationMs: stats(raw.serializationMs), queueWaitMs: stats(raw.queueWaitMs),
      computeMs: stats(raw.computeMs), roundTripMs: stats(raw.roundTripMs), applyDelayMs: stats(raw.applyDelayMs), raw: { ...raw },
    };
  }
  result.routeCostWorker ??= {
    created: 0, restarts: 0, requests: 0, completed: 0, failed: 0, timedOut: 0, cancelled: 0,
    staleResults: 0, queueMax: 0, payloadBytes: emptyNumericStats(), serializationMs: emptyNumericStats(),
    queueWaitMs: emptyNumericStats(), computeMs: emptyNumericStats(), roundTripMs: emptyNumericStats(), applyDelayMs: emptyNumericStats(),
  };
  return result;
}

export function diagnose(
  queues: Record<string, PerformanceQueueDiagnosticV6>, searches: NavigationSearchOutlierV6[], semantic: SemanticHealthV6,
  memory: MemoryDiagnosticsV6, health: ReportHealthV6, frames: PerformanceTraceFrameV6[],
): PerformanceDiagnosisV6[] {
  const out: PerformanceDiagnosisV6[] = [];
  const route = queues.routePlanning;
  if (route && (route.maximumDepth >= 32 || route.waitMs.p95 >= 500)) {
    out.push({
      severity: route.maximumDepth >= 64 || route.waitMs.p95 >= 2000 ? 'critical' : 'warning',
      code: 'ROUTE_QUEUE_OVERLOAD', message: 'Mass route planning overloaded the route queue.',
      evidence: { maximumDepth: route.maximumDepth, p95WaitMs: route.waitMs.p95, created: route.created },
    });
  }
  const slow = searches.find((item) => item.durationMs >= 50);
  if (slow) out.push({
    severity: slow.durationMs >= 200 ? 'critical' : 'warning', code: 'ROUTE_RESULT_LATENCY',
    message: 'Observed order-to-route latency exceeded the diagnostic threshold; this does not by itself prove main-thread pathfinding.',
    evidence: { routeRequestId: slow.routeRequestId, unitId: slow.unitId, durationMs: slow.durationMs, durationSource: slow.durationSource },
  });
  const semanticTotal = Object.entries(semantic)
    .filter(([key, value]) => key !== 'violations' && typeof value === 'number')
    .reduce((sum, [, value]) => sum + Number(value), 0);
  if (semanticTotal) out.push({ severity: 'critical', code: 'SEMANTIC_FAILURE', message: 'Gameplay correctness violations were observed.', evidence: { total: semanticTotal } });
  if (health.samplesDropped || health.eventsDropped) out.push({ severity: 'warning', code: 'TELEMETRY_DATA_LOSS', message: 'Bounded buffers dropped ordinary history.', evidence: { samplesDropped: health.samplesDropped, eventsDropped: health.eventsDropped, truncatedSections: health.truncatedSections } });
  if (health.telemetryCostMs.collection.p95 > .1 || health.telemetryCostMs.collection.max > 1) out.push({ severity: health.telemetryCostMs.collection.max > 4 ? 'critical' : 'warning', code: 'TELEMETRY_OVERHEAD', message: 'Telemetry collection exceeded its normal frame-path target.', evidence: { p95Ms: health.telemetryCostMs.collection.p95, maxMs: health.telemetryCostMs.collection.max } });
  if (memory.initialBytes !== null && memory.peakBytes !== null && memory.peakBytes - memory.initialBytes >= 128 * 1024 * 1024) out.push({ severity: 'warning', code: 'MEMORY_GROWTH', message: 'Observed heap growth exceeded the diagnostic threshold.', evidence: { growthBytes: memory.peakBytes - memory.initialBytes } });
  const maxUpdate = Math.max(0, ...frames.map((frame) => frame.applicationUpdateMs));
  if (maxUpdate >= 50) out.push({ severity: maxUpdate >= 200 ? 'critical' : 'warning', code: 'APPLICATION_LONG_UPDATE', message: 'Application-owned update work exceeded a LongTask threshold.', evidence: { maximumApplicationUpdateMs: r2(maxUpdate) } });
  return out.slice(0, 32);
}

export function worstWindows(
  frames: PerformanceTraceFrameV6[], timeline: SceneTimelineEntryV6[], events: PerformanceEventV6[],
  phases: object[], operations: Record<string, unknown>[],
): WorstWindowV6[] {
  return ([1000, 5000, 10000] as const).map((durationMs) => {
    const { startIndex, endIndex } = findWorstFrameWindow(frames, durationMs);
    const selected = frames.slice(startIndex, endIndex);
    const start = selected[0]?.tMs ?? frames[0]?.tMs ?? 0;
    const end = start + durationMs;
    const windowEvents = events.filter((event) => event.tMs >= start && event.tMs <= end).slice(-100);
    return {
      durationMs, startMs: r1(start), endMs: r1(end),
      frame: { sampleCount: selected.length, frameMs: buildNumericStats(selected.flatMap((frame) => frame.frameMs === null ? [] : [frame.frameMs])), jankFramesOver50Ms: selected.filter((frame) => (frame.frameMs ?? 0) >= 50).length },
      simulation: { simulationUpdateMs: buildNumericStats(selected.map((frame) => frame.simulationUpdateMs)), applicationUpdateMs: buildNumericStats(selected.map((frame) => frame.applicationUpdateMs)) },
      scene: latestTimelineAtOrBefore(timeline, end),
      queuePeaks: { routePlanning: Math.max(0, ...selected.map((frame) => frame.routeQueueDepth)), routeReplanning: Math.max(0, ...selected.map((frame) => frame.replanQueueDepth)) },
      topPhases: phases.filter((item) => overlaps(item as Record<string, unknown>, start, end)).sort((a, b) => number((b as Record<string, unknown>).durationMs) - number((a as Record<string, unknown>).durationMs)).slice(0, 10).map((item) => ({ ...(item as Record<string, unknown>) })),
      topOperations: operations.filter((item) => overlaps(item, start, end)).sort((a, b) => number(b.durationMs) - number(a.durationMs)).slice(0, 10),
      events: windowEvents, userMarkers: windowEvents.filter((event) => event.type === 'user.marker'),
      semanticViolations: windowEvents.filter((event) => event.type === 'semantic.violation'),
    };
  });
}

function findWorstFrameWindow(frames: PerformanceTraceFrameV6[], durationMs: number): { startIndex: number; endIndex: number } {
  if (frames.length === 0) return { startIndex: 0, endIndex: 0 };
  let endIndex = 0;
  let score = 0;
  let bestScore = -Infinity;
  let bestStart = 0;
  let bestEnd = 0;
  for (let startIndex = 0; startIndex < frames.length; startIndex += 1) {
    const endMs = frames[startIndex].tMs + durationMs;
    while (endIndex < frames.length && frames[endIndex].tMs <= endMs) {
      score += framePressure(frames[endIndex]);
      endIndex += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      bestStart = startIndex;
      bestEnd = endIndex;
    }
    score -= framePressure(frames[startIndex]);
    if (endIndex < startIndex + 1) endIndex = startIndex + 1;
  }
  return { startIndex: bestStart, endIndex: bestEnd };
}

function framePressure(frame: PerformanceTraceFrameV6): number {
  return frame.applicationUpdateMs + Math.max(0, (frame.frameMs ?? 0) - 16.67);
}

function latestTimelineAtOrBefore(timeline: SceneTimelineEntryV6[], tMs: number): SceneTimelineEntryV6 | null {
  for (let index = timeline.length - 1; index >= 0; index -= 1) {
    const entry = timeline[index];
    if (entry.tMs <= tMs) return entry;
  }
  return null;
}

export function emptyQueue(): MutableQueueV6 {
  return { created: 0, started: 0, completed: 0, cancelled: 0, failed: 0, timedOut: 0, stale: 0, currentDepth: 0, maximumDepth: 0, currentInFlight: 0, maximumInFlight: 0, waits: [], timeline: [], slowestWaits: [] };
}
export function finite(value: unknown): number | null { return typeof value === 'number' && Number.isFinite(value) ? value : null; }
export function number(value: unknown): number { return typeof value === 'number' && Number.isFinite(value) ? value : 0; }
export function r1(value: number): number { return Math.round(value * 10) / 10; }
export function r2(value: number): number { return Math.round(value * 100) / 100; }
export function r3(value: number): number { return Math.round(value * 1000) / 1000; }

function stats(value: unknown) {
  if (Array.isArray(value)) return buildNumericStats(value.filter((item): item is number => typeof item === 'number'));
  return typeof value === 'number' ? buildNumericStats([value]) : emptyNumericStats();
}
function int(value: unknown): number { return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0; }
function overlaps(item: Record<string, unknown>, start: number, end: number): boolean {
  const itemStart = number(item.startMs ?? item.startTimeMs); const duration = number(item.durationMs);
  return itemStart <= end && itemStart + duration >= start;
}
function hash(value: string): number { let result = 0; for (let i = 0; i < value.length; i++) result = ((result << 5) - result + value.charCodeAt(i)) | 0; return result; }
