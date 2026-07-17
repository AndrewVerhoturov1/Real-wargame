import { getAiSchedulerPerformanceDiagnostics } from '../ai/AiSchedulerPerformanceDiagnostics';
import { getThreatRelativeCoverFieldDiagnostics } from '../cover/ThreatRelativeCoverField';
import { getAwarenessDynamicRescoreDiagnostics } from '../knowledge/AwarenessDynamicRescore';
import { getAwarenessStaticFieldDiagnostics } from '../knowledge/AwarenessStaticField';
import { getSoldierDangerFieldDiagnostics } from '../knowledge/SoldierDangerField';
import {
  getRouteCostFieldDiagnostics,
  getSharedRouteCostFieldCache,
} from '../navigation/RouteCostField';
import type { SimulationState } from '../simulation/SimulationState';
import { getDirectionalTacticalFieldDiagnostics } from '../terrain/DirectionalTacticalField';
import { getVisibilityGeometryFieldDiagnostics } from '../visibility/VisibilityGeometryField';
import { getPerceptionGeometryPreparationDiagnostics } from '../visibility/PointVisibility';
import { getSimulationLayerState } from '../ui/RuntimeUiState';
import { getAwarenessMovementDiagnostics } from './AwarenessMovementDiagnostics';
import { getRealWargameBuildIdentity, PERFORMANCE_CONTRACT_VERSION } from './BuildIdentity';
import {
  getPerformancePhaseContextualEvents,
  getPerformancePhaseRuntimeDiagnostics,
  type PerformancePhaseContext,
  type PerformancePhaseRuntimeDiagnostic,
} from './PerformancePhases';

export interface PerformanceFrameSample {
  tMs: number;
  frameMs: number | null;
  /** CPU time spent in SimulationTick during the frame. */
  simulationUpdateMs: number;
  /** Simulation plus render-data JavaScript work owned by the application. */
  applicationUpdateMs: number;
  /** Legacy render-data-only sample retained for compatibility. */
  sceneUpdateMs: number;
  /** Legacy alias retained for old report readers. This is not GPU/WebGL render time. */
  renderMs: number;
  zoom: number;
  grid: boolean;
  editorEnabled: boolean;
  layerMode: string;
  mouseCell: string | null;
  hoveredCoverId: string | null;
  objectCount: number;
  unitCount: number;
  zoneCount: number;
  selectedObject: boolean;
  selectedZone: boolean;
}

export interface LongTaskAttributionDiagnostic {
  name: string;
  containerType: string;
  containerName: string;
  containerId: string;
  containerSrc: string;
}

export interface BrowserLongTaskDiagnostic {
  startMs: number;
  durationMs: number;
  scenario: string | null;
  attribution: LongTaskAttributionDiagnostic[];
}

export interface LongAnimationFrameScriptDiagnostic {
  invoker: string;
  invokerType: string;
  sourceUrl: string;
  sourceFunctionName: string;
  charPosition: number;
  durationMs: number;
  forcedStyleAndLayoutDurationMs: number;
  pauseDurationMs: number;
  windowAttribution: string;
}

export interface LongAnimationFrameDiagnostic {
  startMs: number;
  durationMs: number;
  blockingDurationMs: number;
  renderStartMs: number | null;
  styleAndLayoutStartMs: number | null;
  firstUiEventTimestampMs: number | null;
  scenario: string | null;
  scripts: LongAnimationFrameScriptDiagnostic[];
}

export interface PerformancePhaseMeasureDiagnostic {
  name: string;
  startMs: number;
  durationMs: number;
}

export interface PerformancePhaseAggregateDiagnostic extends PerformancePhaseRuntimeDiagnostic {
  readonly longTaskOverlapCount: number;
  readonly longTaskOverlapDurationMs: number;
  readonly longAnimationFrameOverlapCount: number;
  readonly longAnimationFrameOverlapDurationMs: number;
}

export interface ApplicationIntervalAttributionDiagnostic {
  readonly startMs: number;
  readonly durationMs: number;
  readonly scenario: string | null;
  /** True when any measured application phase overlaps the browser window. */
  readonly applicationAttributed: boolean;
  /** True only when measured application phases occupy at least half of the browser window. */
  readonly applicationDominated: boolean;
  readonly applicationOverlapRatio: number;
  readonly overlappingPhases: readonly string[];
  readonly overlapDurationMs: number;
}

export interface ContextualPerformancePhaseEventDiagnostic {
  readonly name: string;
  readonly startMs: number;
  readonly durationMs: number;
  readonly context: PerformancePhaseContext | null;
}

export interface PerformanceReport {
  version: typeof PERFORMANCE_CONTRACT_VERSION;
  build: ReturnType<typeof getRealWargameBuildIdentity>;
  exportedAt: string;
  runtimeSeconds: number;
  browser: Record<string, unknown>;
  viewport: Record<string, unknown>;
  renderer: Record<string, unknown>;
  scene: Record<string, unknown>;
  editor: Record<string, unknown>;
  computation: Record<string, unknown>;
  summary: Record<string, unknown>;
  longTasks: BrowserLongTaskDiagnostic[];
  longAnimationFrames: LongAnimationFrameDiagnostic[];
  performancePhaseMeasures: PerformancePhaseMeasureDiagnostic[];
  performancePhaseAggregates: PerformancePhaseAggregateDiagnostic[];
  contextualPerformancePhaseEvents: ContextualPerformancePhaseEventDiagnostic[];
  applicationAttribution: {
    longTasks: ApplicationIntervalAttributionDiagnostic[];
    longAnimationFrames: ApplicationIntervalAttributionDiagnostic[];
    applicationAttributedLongTaskCount: number;
    applicationDominatedLongTaskCount: number;
    partiallyAttributedLongTaskCount: number;
    unattributedLongTaskCount: number;
    applicationAttributedLongAnimationFrameCount: number;
    applicationDominatedLongAnimationFrameCount: number;
    partiallyAttributedLongAnimationFrameCount: number;
  };
  samples: PerformanceFrameSample[];
}

interface LongTaskAttributionEntryLike {
  name?: string;
  containerType?: string;
  containerName?: string;
  containerId?: string;
  containerSrc?: string;
}

interface LongTaskEntryLike extends PerformanceEntry {
  attribution?: ArrayLike<LongTaskAttributionEntryLike>;
}

interface LongAnimationFrameScriptLike {
  invoker?: string;
  invokerType?: string;
  sourceURL?: string;
  sourceFunctionName?: string;
  charPosition?: number;
  duration?: number;
  forcedStyleAndLayoutDuration?: number;
  pauseDuration?: number;
  windowAttribution?: string;
}

interface LongAnimationFrameEntryLike extends PerformanceEntry {
  blockingDuration?: number;
  renderStart?: number;
  styleAndLayoutStart?: number;
  firstUIEventTimestamp?: number;
  scripts?: ArrayLike<LongAnimationFrameScriptLike>;
}

type PerformanceScenarioWindow = Window & {
  __realWargamePerformanceScenario?: string | null;
};

const MAX_SAMPLES = 3600;
const MAX_LONG_TASKS = 200;
const MAX_LONG_ANIMATION_FRAMES = 200;
const PHASE_MEASURE_PREFIX = 'real-wargame.phase.';

export class PerformanceMonitor {
  private readonly startedAt = performance.now();
  private readonly samples: Array<PerformanceFrameSample | undefined> = new Array(MAX_SAMPLES);
  private readonly longTasks: BrowserLongTaskDiagnostic[] = [];
  private readonly longAnimationFrames: LongAnimationFrameDiagnostic[] = [];
  private writeIndex = 0;
  private storedCount = 0;
  private lastSampleAt: number | null = null;
  private longTaskObserver: PerformanceObserver | null = null;
  private longAnimationFrameObserver: PerformanceObserver | null = null;
  private pendingSimulationUpdateMs = 0;

  constructor() {
    this.installLongTaskObserver();
    this.installLongAnimationFrameObserver();
  }

  destroy(): void {
    this.longTaskObserver?.disconnect();
    this.longTaskObserver = null;
    this.longAnimationFrameObserver?.disconnect();
    this.longAnimationFrameObserver = null;
  }

  recordSimulationUpdate(durationMs: number): void {
    this.pendingSimulationUpdateMs = Math.max(0, durationMs);
  }

  recordFrame(state: SimulationState, zoom: number, sceneUpdateMs: number, grid = false): void {
    const now = performance.now();
    const frameMs = this.lastSampleAt === null ? null : now - this.lastSampleAt;
    this.lastSampleAt = now;
    const layer = getSimulationLayerState(state);
    const mouse = state.mouseGridPosition;

    const simulationUpdateMs = this.pendingSimulationUpdateMs;
    this.pendingSimulationUpdateMs = 0;
    this.samples[this.writeIndex] = {
      tMs: roundOne(now - this.startedAt),
      frameMs: frameMs === null ? null : roundTwo(frameMs),
      simulationUpdateMs: roundTwo(simulationUpdateMs),
      applicationUpdateMs: roundTwo(simulationUpdateMs + sceneUpdateMs),
      sceneUpdateMs: roundTwo(sceneUpdateMs),
      renderMs: roundTwo(sceneUpdateMs),
      zoom: roundThree(zoom),
      grid,
      editorEnabled: state.editor.enabled,
      layerMode: layer.mode,
      mouseCell: mouse ? `${Math.floor(mouse.x)}:${Math.floor(mouse.y)}` : null,
      hoveredCoverId: layer.hoveredCoverId,
      objectCount: state.map.objects.length,
      unitCount: state.units.length,
      zoneCount: state.pressureZones.length,
      selectedObject: state.editor.selectedObjectId !== null,
      selectedZone: state.editor.selectedZoneId !== null,
    };

    this.writeIndex = (this.writeIndex + 1) % MAX_SAMPLES;
    this.storedCount = Math.min(MAX_SAMPLES, this.storedCount + 1);
  }

  buildReport(state: SimulationState, zoom: number, renderer: Record<string, unknown>): PerformanceReport {
    const samples = this.getSamples();
    const frameValues = samples
      .map((sample) => sample.frameMs)
      .filter((value): value is number => typeof value === 'number');
    const sceneUpdateValues = samples.map((sample) => sample.sceneUpdateMs);
    const simulationUpdateValues = samples.map((sample) => sample.simulationUpdateMs);
    const applicationUpdateValues = samples.map((sample) => sample.applicationUpdateMs);
    const sampledDurationMs = samples.length > 1
      ? samples[samples.length - 1].tMs - samples[0].tMs
      : 0;
    const effectiveFps = sampledDurationMs > 0
      ? (samples.length - 1) * 1000 / sampledDurationMs
      : null;
    const p95FrameMs = percentile(frameValues, 0.95);
    const selectedUnit = state.selectedUnitId
      ? state.units.find((unit) => unit.id === state.selectedUnitId)
      : undefined;
    const exportedAt = new Date().toISOString();
    const performancePhaseMeasures = performance.getEntriesByType('measure')
      .filter((entry) => entry.name.startsWith(PHASE_MEASURE_PREFIX))
      .map((entry) => ({
        name: entry.name,
        startMs: roundOne(entry.startTime - this.startedAt),
        durationMs: roundTwo(entry.duration),
      }));
    const performancePhaseAggregates = buildPerformancePhaseAggregates(
      getPerformancePhaseRuntimeDiagnostics(),
      performancePhaseMeasures,
      this.longTasks,
      this.longAnimationFrames,
    );
    const contextualPerformancePhaseEvents = getPerformancePhaseContextualEvents().map((event) => ({
      name: event.name,
      startMs: roundOne(event.startTimeMs - this.startedAt),
      durationMs: roundTwo(event.durationMs),
      context: event.context ? { ...event.context } : null,
    }));
    const applicationLongTasks = buildApplicationIntervalAttribution(this.longTasks, performancePhaseMeasures);
    const applicationLongAnimationFrames = buildApplicationIntervalAttribution(
      this.longAnimationFrames,
      performancePhaseMeasures,
    );

    return {
      version: PERFORMANCE_CONTRACT_VERSION,
      build: {
        ...getRealWargameBuildIdentity(),
        generatedAt: exportedAt,
      },
      exportedAt,
      runtimeSeconds: roundOne((performance.now() - this.startedAt) / 1000),
      browser: {
        ...getBrowserInfo(),
        performanceObserverSupportedEntryTypes: [...(PerformanceObserver.supportedEntryTypes ?? [])],
      },
      viewport: getViewportInfo(),
      renderer: {
        ...renderer,
        timingNote: 'sceneUpdateMs/renderMs remain render-data-only compatibility metrics. simulationUpdateMs measures SimulationTick; applicationUpdateMs combines simulation and render-data JavaScript work. Nested phase overlap owns application attribution for LongTask and LoAF windows.',
      },
      scene: {
        mapWidthCells: state.map.width,
        mapHeightCells: state.map.height,
        cellSizePx: state.map.cellSize,
        metersPerCell: state.map.metersPerCell,
        terrainCells: state.map.cells.length,
        objectCount: state.map.objects.length,
        unitCount: state.units.length,
        pressureZoneCount: state.pressureZones.length,
        currentZoom: roundThree(zoom),
      },
      editor: {
        enabled: state.editor.enabled,
        tool: state.editor.tool,
        objectsLayer: state.editor.layers.objects,
        unitsLayer: state.editor.layers.units,
        pressureZonesLayer: state.editor.layers.pressureZones,
        selectedObjectId: state.editor.selectedObjectId,
        selectedZoneId: state.editor.selectedZoneId,
        selectedUnitId: state.selectedUnitId,
      },
      computation: {
        aiScheduler: getAiSchedulerPerformanceDiagnostics(),
        threatRelativeCover: getThreatRelativeCoverFieldDiagnostics(state.map),
        directionalTactical: getDirectionalTacticalFieldDiagnostics(state.map),
        visibilityGeometry: getVisibilityGeometryFieldDiagnostics(state.map),
        perceptionPointProbes: getPerceptionGeometryPreparationDiagnostics(state),
        routeCostFields: getRouteCostFieldDiagnostics(getSharedRouteCostFieldCache(state.map)),
        awarenessStatic: selectedUnit
          ? getAwarenessStaticFieldDiagnostics(state.map, selectedUnit.behaviorRuntime.posture)
          : null,
        awarenessDynamicRescore: selectedUnit
          ? getAwarenessDynamicRescoreDiagnostics(selectedUnit)
          : null,
        soldierDangerField: getSoldierDangerFieldDiagnostics(state.map),
        awarenessMovement: {
          ...getAwarenessMovementDiagnostics(),
          mainThreadSoldierDangerField: getSoldierDangerFieldDiagnostics(state.map),
        },
      },
      summary: {
        sampleCount: samples.length,
        sampledDurationSeconds: roundTwo(sampledDurationMs / 1000),
        effectiveFps: effectiveFps === null ? null : roundTwo(effectiveFps),
        fpsAtP95FrameTime: p95FrameMs && p95FrameMs > 0 ? roundTwo(1000 / p95FrameMs) : null,
        frameMs: buildStats(frameValues),
        simulationUpdateMs: buildStats(simulationUpdateValues),
        applicationUpdateMs: buildStats(applicationUpdateValues),
        sceneUpdateMs: buildStats(sceneUpdateValues),
        renderMs: buildStats(sceneUpdateValues),
        jankFrames: {
          over20ms: countOver(frameValues, 20),
          over33ms: countOver(frameValues, 33),
          over50ms: countOver(frameValues, 50),
          over100ms: countOver(frameValues, 100),
        },
        longTaskCount: this.longTasks.length,
        longTaskMs: buildStats(this.longTasks.map((task) => task.durationMs)),
        longAnimationFrameCount: this.longAnimationFrames.length,
        longAnimationFrameMs: buildStats(this.longAnimationFrames.map((frame) => frame.durationMs)),
        longAnimationFrameScriptMs: buildStats(this.longAnimationFrames.flatMap((frame) => frame.scripts.map((script) => script.durationMs))),
        phaseMeasureCount: performancePhaseMeasures.length,
        phaseAggregateCount: performancePhaseAggregates.length,
        applicationAttributedLongTaskCount: applicationLongTasks.filter((item) => item.applicationAttributed).length,
        applicationDominatedLongTaskCount: applicationLongTasks.filter((item) => item.applicationDominated).length,
        partiallyAttributedLongTaskCount: applicationLongTasks
          .filter((item) => item.applicationAttributed && !item.applicationDominated).length,
        unattributedLongTaskCount: applicationLongTasks.filter((item) => !item.applicationAttributed).length,
        worstFrames: [...samples]
          .filter((sample) => sample.frameMs !== null)
          .sort((left, right) => (right.frameMs ?? 0) - (left.frameMs ?? 0))
          .slice(0, 30),
        worstApplicationUpdates: [...samples]
          .sort((left, right) => right.applicationUpdateMs - left.applicationUpdateMs)
          .slice(0, 30),
        worstSimulationUpdates: [...samples]
          .sort((left, right) => right.simulationUpdateMs - left.simulationUpdateMs)
          .slice(0, 30),
        worstSceneUpdates: [...samples]
          .sort((left, right) => right.sceneUpdateMs - left.sceneUpdateMs)
          .slice(0, 30),
      },
      longTasks: this.longTasks.map(cloneLongTask),
      longAnimationFrames: this.longAnimationFrames.map(cloneLongAnimationFrame),
      performancePhaseMeasures,
      performancePhaseAggregates,
      contextualPerformancePhaseEvents,
      applicationAttribution: {
        longTasks: applicationLongTasks,
        longAnimationFrames: applicationLongAnimationFrames,
        applicationAttributedLongTaskCount: applicationLongTasks.filter((item) => item.applicationAttributed).length,
        applicationDominatedLongTaskCount: applicationLongTasks.filter((item) => item.applicationDominated).length,
        partiallyAttributedLongTaskCount: applicationLongTasks
          .filter((item) => item.applicationAttributed && !item.applicationDominated).length,
        unattributedLongTaskCount: applicationLongTasks.filter((item) => !item.applicationAttributed).length,
        applicationAttributedLongAnimationFrameCount: applicationLongAnimationFrames
          .filter((item) => item.applicationAttributed).length,
        applicationDominatedLongAnimationFrameCount: applicationLongAnimationFrames
          .filter((item) => item.applicationDominated).length,
        partiallyAttributedLongAnimationFrameCount: applicationLongAnimationFrames
          .filter((item) => item.applicationAttributed && !item.applicationDominated).length,
      },
      samples,
    };
  }

  private installLongTaskObserver(): void {
    if (typeof PerformanceObserver === 'undefined' || !PerformanceObserver.supportedEntryTypes?.includes('longtask')) return;
    this.longTaskObserver = new PerformanceObserver((list) => {
      for (const rawEntry of list.getEntries()) {
        const entry = rawEntry as LongTaskEntryLike;
        this.longTasks.push({
          startMs: roundOne(entry.startTime - this.startedAt),
          durationMs: roundTwo(entry.duration),
          scenario: currentScenario(),
          attribution: Array.from(entry.attribution ?? []).map((item) => ({
            name: item.name ?? '',
            containerType: item.containerType ?? '',
            containerName: item.containerName ?? '',
            containerId: item.containerId ?? '',
            containerSrc: item.containerSrc ?? '',
          })),
        });
      }
      trimOldest(this.longTasks, MAX_LONG_TASKS);
    });
    this.longTaskObserver.observe({ entryTypes: ['longtask'] });
  }

  private installLongAnimationFrameObserver(): void {
    if (typeof PerformanceObserver === 'undefined' || !PerformanceObserver.supportedEntryTypes?.includes('long-animation-frame')) return;
    this.longAnimationFrameObserver = new PerformanceObserver((list) => {
      for (const rawEntry of list.getEntries()) {
        const entry = rawEntry as LongAnimationFrameEntryLike;
        this.longAnimationFrames.push({
          startMs: roundOne(entry.startTime - this.startedAt),
          durationMs: roundTwo(entry.duration),
          blockingDurationMs: roundTwo(entry.blockingDuration ?? 0),
          renderStartMs: relativeTimestamp(entry.renderStart, this.startedAt),
          styleAndLayoutStartMs: relativeTimestamp(entry.styleAndLayoutStart, this.startedAt),
          firstUiEventTimestampMs: relativeTimestamp(entry.firstUIEventTimestamp, this.startedAt),
          scenario: currentScenario(),
          scripts: Array.from(entry.scripts ?? []).map((script) => ({
            invoker: script.invoker ?? '',
            invokerType: script.invokerType ?? '',
            sourceUrl: script.sourceURL ?? '',
            sourceFunctionName: script.sourceFunctionName ?? '',
            charPosition: Number.isFinite(script.charPosition) ? script.charPosition ?? 0 : 0,
            durationMs: roundTwo(script.duration ?? 0),
            forcedStyleAndLayoutDurationMs: roundTwo(script.forcedStyleAndLayoutDuration ?? 0),
            pauseDurationMs: roundTwo(script.pauseDuration ?? 0),
            windowAttribution: script.windowAttribution ?? '',
          })),
        });
      }
      trimOldest(this.longAnimationFrames, MAX_LONG_ANIMATION_FRAMES);
    });
    this.longAnimationFrameObserver.observe({ entryTypes: ['long-animation-frame'] });
  }

  private getSamples(): PerformanceFrameSample[] {
    if (this.storedCount < MAX_SAMPLES) {
      return this.samples.slice(0, this.storedCount).filter(isFrameSample);
    }
    return [
      ...this.samples.slice(this.writeIndex),
      ...this.samples.slice(0, this.writeIndex),
    ].filter(isFrameSample);
  }
}


function buildPerformancePhaseAggregates(
  runtime: readonly PerformancePhaseRuntimeDiagnostic[],
  measures: readonly PerformancePhaseMeasureDiagnostic[],
  longTasks: readonly BrowserLongTaskDiagnostic[],
  longAnimationFrames: readonly LongAnimationFrameDiagnostic[],
): PerformancePhaseAggregateDiagnostic[] {
  return runtime.map((phase) => {
    const phaseMeasures = measures.filter((measure) => shortPhaseName(measure.name) === phase.name);
    const longTaskOverlap = phaseWindowOverlap(phaseMeasures, longTasks);
    const longAnimationFrameOverlap = phaseWindowOverlap(phaseMeasures, longAnimationFrames);
    return {
      ...phase,
      longTaskOverlapCount: longTaskOverlap.count,
      longTaskOverlapDurationMs: roundTwo(longTaskOverlap.durationMs),
      longAnimationFrameOverlapCount: longAnimationFrameOverlap.count,
      longAnimationFrameOverlapDurationMs: roundTwo(longAnimationFrameOverlap.durationMs),
    };
  });
}

function buildApplicationIntervalAttribution(
  windows: ReadonlyArray<{ startMs: number; durationMs: number; scenario: string | null }>,
  measures: readonly PerformancePhaseMeasureDiagnostic[],
): ApplicationIntervalAttributionDiagnostic[] {
  const applicationMeasures = measures.filter((measure) => isApplicationPhase(shortPhaseName(measure.name)));
  return windows.map((window) => {
    const windowEnd = window.startMs + window.durationMs;
    const overlaps = applicationMeasures
      .map((measure) => ({
        name: shortPhaseName(measure.name),
        startMs: Math.max(window.startMs, measure.startMs),
        endMs: Math.min(windowEnd, measure.startMs + measure.durationMs),
      }))
      .filter((item) => item.endMs > item.startMs);
    const overlapDurationMs = unionDuration(overlaps.map((item) => [item.startMs, item.endMs]));
    const applicationOverlapRatio = window.durationMs > 0
      ? Math.min(1, overlapDurationMs / window.durationMs)
      : 0;
    return {
      startMs: window.startMs,
      durationMs: window.durationMs,
      scenario: window.scenario,
      applicationAttributed: overlapDurationMs > 0,
      applicationDominated: applicationOverlapRatio >= 0.5,
      applicationOverlapRatio: roundThree(applicationOverlapRatio),
      overlappingPhases: [...new Set(overlaps.map((item) => item.name))].sort(),
      overlapDurationMs: roundTwo(overlapDurationMs),
    };
  });
}

function phaseWindowOverlap(
  measures: readonly PerformancePhaseMeasureDiagnostic[],
  windows: ReadonlyArray<{ startMs: number; durationMs: number }>,
): { count: number; durationMs: number } {
  let count = 0;
  let durationMs = 0;
  for (const window of windows) {
    const windowEnd = window.startMs + window.durationMs;
    const intervals: Array<[number, number]> = [];
    for (const measure of measures) {
      const startMs = Math.max(window.startMs, measure.startMs);
      const endMs = Math.min(windowEnd, measure.startMs + measure.durationMs);
      if (endMs > startMs) intervals.push([startMs, endMs]);
    }
    if (intervals.length === 0) continue;
    count += 1;
    durationMs += unionDuration(intervals);
  }
  return { count, durationMs };
}

function unionDuration(intervals: ReadonlyArray<readonly [number, number]>): number {
  if (intervals.length === 0) return 0;
  const sorted = [...intervals].sort((left, right) => left[0] - right[0] || left[1] - right[1]);
  let start = sorted[0][0];
  let end = sorted[0][1];
  let total = 0;
  for (let index = 1; index < sorted.length; index += 1) {
    const next = sorted[index];
    if (next[0] <= end) {
      end = Math.max(end, next[1]);
      continue;
    }
    total += end - start;
    start = next[0];
    end = next[1];
  }
  return total + end - start;
}

function shortPhaseName(name: string): string {
  return name.startsWith(PHASE_MEASURE_PREFIX) ? name.slice(PHASE_MEASURE_PREFIX.length) : name;
}

function isApplicationPhase(name: string): boolean {
  return /^(ticker|simulation|field|ui|renderer)\./.test(name);
}

function currentScenario(): string | null {
  return (window as PerformanceScenarioWindow).__realWargamePerformanceScenario ?? null;
}

function relativeTimestamp(value: number | undefined, startedAt: number): number | null {
  if (!Number.isFinite(value) || !value || value <= 0) return null;
  return roundOne(value - startedAt);
}

function trimOldest<T>(items: T[], maximum: number): void {
  if (items.length > maximum) items.splice(0, items.length - maximum);
}

function cloneLongTask(task: BrowserLongTaskDiagnostic): BrowserLongTaskDiagnostic {
  return {
    ...task,
    attribution: task.attribution.map((item) => ({ ...item })),
  };
}

function cloneLongAnimationFrame(frame: LongAnimationFrameDiagnostic): LongAnimationFrameDiagnostic {
  return {
    ...frame,
    scripts: frame.scripts.map((script) => ({ ...script })),
  };
}

function isFrameSample(value: PerformanceFrameSample | undefined): value is PerformanceFrameSample {
  return value !== undefined;
}

function getBrowserInfo(): Record<string, unknown> {
  const extendedNavigator = navigator as Navigator & { deviceMemory?: number };
  return {
    userAgent: navigator.userAgent,
    language: navigator.language,
    hardwareConcurrency: navigator.hardwareConcurrency,
    deviceMemoryGb: extendedNavigator.deviceMemory ?? null,
    platform: navigator.platform,
  };
}

function getViewportInfo(): Record<string, unknown> {
  return {
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio,
    screenWidth: window.screen.width,
    screenHeight: window.screen.height,
  };
}

function countOver(values: number[], threshold: number): number {
  return values.filter((value) => value > threshold).length;
}

function percentile(values: number[], fraction: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1));
  return sorted[index];
}

function buildStats(values: number[]): Record<string, number | null> {
  if (values.length === 0) {
    return { min: null, avg: null, p95: null, max: null };
  }
  const sorted = [...values].sort((left, right) => left - right);
  const total = values.reduce((sum, value) => sum + value, 0);
  return {
    min: roundTwo(sorted[0]),
    avg: roundTwo(total / values.length),
    p95: roundTwo(percentile(sorted, 0.95) ?? 0),
    max: roundTwo(sorted[sorted.length - 1]),
  };
}

function roundOne(value: number): number {
  return Math.round(value * 10) / 10;
}

function roundTwo(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundThree(value: number): number {
  return Math.round(value * 1000) / 1000;
}
