import { getAiSchedulerPerformanceDiagnostics } from '../ai/AiSchedulerPerformanceDiagnostics';
import { getThreatRelativeCoverFieldDiagnostics } from '../cover/ThreatRelativeCoverField';
import { getAwarenessDynamicRescoreDiagnostics } from '../knowledge/AwarenessDynamicRescore';
import { getAwarenessStaticFieldDiagnostics } from '../knowledge/AwarenessStaticField';
import { getSoldierDangerFieldDiagnostics } from '../knowledge/SoldierDangerField';
import { getRouteCostFieldDiagnostics, getSharedRouteCostFieldCache } from '../navigation/RouteCostField';
import { getRouteCostWorkerDiagnostics } from '../navigation/RouteCostWorkerClient';
import type { SimulationState } from '../simulation/SimulationState';
import { getDirectionalTacticalFieldDiagnostics } from '../terrain/DirectionalTacticalField';
import { getSimulationLayerState } from '../ui/RuntimeUiState';
import { getPerceptionGeometryPreparationDiagnostics } from '../visibility/PointVisibility';
import { getVisibilityGeometryFieldDiagnostics } from '../visibility/VisibilityGeometryField';
import { getAwarenessMovementDiagnostics } from './AwarenessMovementDiagnostics';
import { getRealWargameBuildIdentity } from './BuildIdentity';
import { classifyLongTasks } from './LongTaskClassification';
import { savePerformanceCheckpoint } from './PerformanceCheckpointStore';
import {
  PerformanceCaptureV6,
  type PerformanceCaptureStatusV6,
  type PerformanceReportBuildInputV6,
} from './PerformanceCaptureV6';
import {
  getPerformancePhaseContextualEvents,
  getPerformancePhaseRuntimeDiagnostics,
} from './PerformancePhases';
import { registerActivePerformanceTelemetry } from './PerformanceTelemetryBridge';
import type { PerformanceReportV6 } from './PerformanceReportV6';
export type PerformanceReport = PerformanceReportV6;
import { getSimulationStepPerformanceDiagnostics } from './SimulationStepPerformanceDiagnostics';

export interface PerformanceFrameSample {
  tMs: number;
  frameMs: number | null;
  simulationUpdateMs: number;
  applicationUpdateMs: number;
  sceneUpdateMs: number;
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

export interface ApplicationIntervalAttributionDiagnostic {
  readonly startMs: number;
  readonly durationMs: number;
  readonly scenario: string | null;
  readonly applicationAttributed: boolean;
  readonly applicationDominated: boolean;
  readonly applicationOverlapRatio: number;
  readonly overlappingPhases: readonly string[];
  readonly overlapDurationMs: number;
}

interface LongTaskEntryLike extends PerformanceEntry {
  attribution?: ArrayLike<Partial<LongTaskAttributionDiagnostic>>;
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

type PerformanceScenarioWindow = Window & { __realWargamePerformanceScenario?: string | null };

const MAX_LEGACY_SAMPLES = 3600;
const MAX_BROWSER_WINDOWS = 200;
const CHECKPOINT_INTERVAL_MS = 5000;
const PHASE_MEASURE_PREFIX = 'real-wargame.phase.';

export class PerformanceMonitor {
  private readonly startedAt = performance.now();
  private readonly capture = new PerformanceCaptureV6();
  private readonly samples: PerformanceFrameSample[] = [];
  private sampleWriteIndex = 0;
  private readonly longTasks: BrowserLongTaskDiagnostic[] = [];
  private readonly longAnimationFrames: LongAnimationFrameDiagnostic[] = [];
  private pendingSimulationUpdateMs = 0;
  private lastSampleAt: number | null = null;
  private longTaskObserver: PerformanceObserver | null = null;
  private longAnimationFrameObserver: PerformanceObserver | null = null;
  private lastCheckpointScheduledAt = 0;
  private checkpointPending = false;
  private latestState: SimulationState | null = null;
  private latestZoom = 1;
  private readonly unregisterTelemetry: () => void;
  private destroyed = false;

  constructor() {
    this.installLongTaskObserver();
    this.installLongAnimationFrameObserver();
    this.unregisterTelemetry = registerActivePerformanceTelemetry({
      addMarker: (label) => { this.capture.addUserMarker(label); },
      getStatus: () => this.capture.getStatus(),
      recordEvent: (type, data, priority, cause, operationId) => {
        this.capture.recordEvent(type, data, priority, cause, operationId);
      },
      recordQueueTransition: (input) => { this.capture.recordQueueTransition(input); },
      recordWork: (subsystem, counters) => { this.capture.recordWork(subsystem, counters); },
      recordOperation: (input) => { this.capture.recordOperation(input); },
    });
    window.addEventListener('unhandledrejection', this.handleUnhandledRejection);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.longTaskObserver?.disconnect();
    this.longTaskObserver = null;
    this.longAnimationFrameObserver?.disconnect();
    this.longAnimationFrameObserver = null;
    window.removeEventListener('unhandledrejection', this.handleUnhandledRejection);
    this.unregisterTelemetry();
  }

  recordSimulationUpdate(durationMs: number): void {
    this.pendingSimulationUpdateMs = Math.max(0, durationMs);
  }

  recordFrame(state: SimulationState, zoom: number, sceneUpdateMs: number, grid = false): void {
    const now = performance.now();
    const frameMs = this.lastSampleAt === null ? null : now - this.lastSampleAt;
    this.lastSampleAt = now;
    const simulationUpdateMs = this.pendingSimulationUpdateMs;
    this.pendingSimulationUpdateMs = 0;
    const applicationUpdateMs = simulationUpdateMs + sceneUpdateMs;
    const layer = getSimulationLayerState(state);
    const mouse = state.mouseGridPosition;
    const sample: PerformanceFrameSample = {
      tMs: roundOne(now - this.startedAt),
      frameMs: frameMs === null ? null : roundTwo(frameMs),
      simulationUpdateMs: roundTwo(simulationUpdateMs),
      applicationUpdateMs: roundTwo(applicationUpdateMs),
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
    this.pushLegacySample(sample);
    this.capture.recordFrame(state, {
      frameMs,
      simulationUpdateMs,
      applicationUpdateMs,
      sceneUpdateMs,
      layerMode: layer.mode,
      editorEnabled: state.editor.enabled,
    });
    this.latestState = state;
    this.latestZoom = zoom;
    this.scheduleCheckpoint(now);
  }

  getStatus(): PerformanceCaptureStatusV6 {
    return this.capture.getStatus();
  }

  buildReport(state: SimulationState, zoom: number, renderer: Record<string, unknown>): PerformanceReportV6 {
    const startedAt = performance.now();
    this.capture.startExport();
    this.capture.refreshScene(state);
    const report = this.capture.buildReport(this.buildInput(state, zoom, renderer, true));
    this.capture.recordExportCost(performance.now() - startedAt);
    report.summary.reportHealth.telemetryCostMs.export = this.capture.getTelemetryCostStats('export');

    // A single export-only sizing pass measures serialization without adding work to the frame path.
    const serializationStartedAt = performance.now();
    const sizingText = JSON.stringify(report);
    this.capture.recordSerializationCost(performance.now() - serializationStartedAt);
    report.summary.reportHealth.telemetryCostMs.serialization = this.capture.getTelemetryCostStats('serialization');
    report.summary.reportHealth.estimatedReportBytes = utf8ByteLength(sizingText);
    return report;
  }

  private buildInput(
    state: SimulationState,
    zoom: number,
    renderer: Record<string, unknown>,
    exportCompleted: boolean,
  ): PerformanceReportBuildInputV6 {
    const build = getRealWargameBuildIdentity();
    const samples = this.getLegacySamples();
    const phaseMeasures = this.getPhaseMeasures();
    const applicationAttribution = buildApplicationIntervalAttribution(this.longTasks, phaseMeasures);
    const longTaskClassification = classifyLongTasks(
      this.longTasks,
      applicationAttribution,
      phaseMeasures,
      this.longAnimationFrames,
      samples,
    );
    const selectedUnit = state.selectedUnitId ? state.units.find((unit) => unit.id === state.selectedUnitId) : undefined;
    const worker = getRouteCostWorkerDiagnostics(state.map);
    const aiScheduler = getAiSchedulerPerformanceDiagnostics();
    const threatRelativeCover = getThreatRelativeCoverFieldDiagnostics(state.map);
    const directionalTactical = getDirectionalTacticalFieldDiagnostics(state.map);
    const visibilityGeometry = getVisibilityGeometryFieldDiagnostics(state.map);
    const perceptionPointProbes = getPerceptionGeometryPreparationDiagnostics(state);
    const routeCostFields = getRouteCostFieldDiagnostics(getSharedRouteCostFieldCache(state.map));
    const simulationSlowestPasses = getSimulationStepPerformanceDiagnostics();
    const soldierDangerField = getSoldierDangerFieldDiagnostics(state.map);
    const awarenessMovement = getAwarenessMovementDiagnostics();
    const runtimeSeconds = Math.max(0, (performance.now() - this.startedAt) / 1000);
    return {
      identity: {
        branch: build.branch,
        commitSha: build.commitSha,
        buildId: build.buildId,
        generatedAt: new Date().toISOString(),
        launchSource: detectLaunchSource(),
        mode: detectMode(),
        page: typeof location === 'undefined' ? 'unknown' : `${location.pathname}${location.search}`,
        browser: getBrowserInfo(),
        platform: navigator.platform || 'unknown',
        cpuConcurrency: Number.isFinite(navigator.hardwareConcurrency) ? navigator.hardwareConcurrency : null,
        deviceMemoryGb: readDeviceMemory(),
        viewport: getViewportInfo(),
        renderer: { ...renderer },
        featureFlags: {
          grid: Boolean(renderer.grid),
          editor: state.editor.enabled,
          routeCostWorker: true,
        },
      },
      mainMetrics: {
        runtimeSeconds: roundOne(runtimeSeconds),
        sampleCount: samples.length,
        effectiveFps: effectiveFps(samples),
        frameMs: stats(samples.flatMap((sample) => sample.frameMs === null ? [] : [sample.frameMs])),
        simulationUpdateMs: stats(samples.map((sample) => sample.simulationUpdateMs)),
        applicationUpdateMs: stats(samples.map((sample) => sample.applicationUpdateMs)),
        longTaskCount: this.longTasks.length,
        longAnimationFrameCount: this.longAnimationFrames.length,
      },
      phases: [
        ...getPerformancePhaseRuntimeDiagnostics(),
        ...phaseMeasures,
        ...getPerformancePhaseContextualEvents().map((event) => ({
          kind: 'contextual-phase',
          name: event.name,
          startMs: roundOne(event.startTimeMs - this.startedAt),
          durationMs: event.durationMs,
          context: event.context,
        })),
      ],
      routeFields: routeCostFields,
      workCounters: {
        ai: collectNumericCounters(aiScheduler),
        perception: collectNumericCounters(perceptionPointProbes),
        collisions: {},
        danger: collectNumericCounters(soldierDangerField),
        rendering: collectNumericCounters(renderer),
        map: collectNumericCounters(renderer.mapRendererDiagnostics),
        navigation: collectNumericCounters(routeCostFields),
      },
      workerDiagnostics: { routeCostWorker: worker as unknown as Record<string, unknown> },
      legacyDiagnostics: {
        browserLongTasks: this.longTasks.map(cloneLongTask),
        applicationAttribution,
        longTaskClassification,
        longAnimationFrames: this.longAnimationFrames.map(cloneLongAnimationFrame),
        performancePhaseMeasures: phaseMeasures,
        computation: {
          aiScheduler,
          threatRelativeCover,
          directionalTactical,
          visibilityGeometry,
          perceptionPointProbes,
          routeCostFields,
          routeCostWorker: worker,
          simulationSlowestPasses,
          awarenessStatic: selectedUnit ? getAwarenessStaticFieldDiagnostics(state.map, selectedUnit.behaviorRuntime.posture) : null,
          awarenessDynamicRescore: selectedUnit ? getAwarenessDynamicRescoreDiagnostics(selectedUnit) : null,
          soldierDangerField,
          awarenessMovement,
        },
        compatibility: {
          v5SceneUnitCount: state.units.length,
          v5Scene: {
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
          v5Samples: samples,
          note: 'Explicit legacy compatibility payload. This file remains performance-report-v6 and must not be parsed as v5.',
        },
        zoom: roundThree(zoom),
      },
      exportCompleted,
    };
  }

  private buildCheckpointInput(state: SimulationState): PerformanceReportBuildInputV6 {
    const build = getRealWargameBuildIdentity();
    const samples = this.getLegacySamples();
    const recentSamples = samples.slice(-300);
    return {
      identity: {
        branch: build.branch,
        commitSha: build.commitSha,
        buildId: build.buildId,
        generatedAt: new Date().toISOString(),
        launchSource: detectLaunchSource(),
        mode: detectMode(),
        page: typeof location === 'undefined' ? 'unknown' : `${location.pathname}${location.search}`,
        browser: getBrowserInfo(),
        platform: navigator.platform || 'unknown',
        cpuConcurrency: Number.isFinite(navigator.hardwareConcurrency) ? navigator.hardwareConcurrency : null,
        deviceMemoryGb: readDeviceMemory(),
        viewport: getViewportInfo(),
        renderer: { checkpoint: true },
        featureFlags: { editor: state.editor.enabled },
      },
      mainMetrics: {
        sampleCount: samples.length,
        currentUnitCount: state.units.length,
        frameMs: stats(recentSamples.flatMap((sample) => sample.frameMs === null ? [] : [sample.frameMs])),
        simulationUpdateMs: stats(recentSamples.map((sample) => sample.simulationUpdateMs)),
      },
      phases: [],
      routeFields: {},
      workerDiagnostics: {},
      legacyDiagnostics: {
        checkpoint: true,
        note: 'Compact checkpoint intentionally omits expensive subsystem snapshots; final export restores them.',
      },
      exportCompleted: false,
    };
  }

  private scheduleCheckpoint(now: number): void {
    if (this.checkpointPending || now - this.lastCheckpointScheduledAt < CHECKPOINT_INTERVAL_MS) return;
    this.lastCheckpointScheduledAt = now;
    this.checkpointPending = true;
    scheduleIdleWork(() => {
      const startedAt = performance.now();
      const state = this.latestState;
      if (!state || this.destroyed) {
        this.checkpointPending = false;
        return;
      }
      this.capture.refreshScene(state);
      const payload = this.capture.buildCheckpoint(this.buildCheckpointInput(state));
      void savePerformanceCheckpoint(payload)
        .catch((error) => {
          this.capture.recordEvent('worker.error', {
            subsystem: 'performance-checkpoint',
            message: error instanceof Error ? error.message : String(error),
          }, 'critical');
        })
        .finally(() => {
          this.capture.recordCheckpointCost(performance.now() - startedAt, payload.savedAtCaptureMs);
          this.checkpointPending = false;
        });
    });
  }

  private pushLegacySample(sample: PerformanceFrameSample): void {
    if (this.samples.length < MAX_LEGACY_SAMPLES) {
      this.samples.push(sample);
      return;
    }
    this.samples[this.sampleWriteIndex] = sample;
    this.sampleWriteIndex = (this.sampleWriteIndex + 1) % MAX_LEGACY_SAMPLES;
  }

  private getLegacySamples(): PerformanceFrameSample[] {
    if (this.samples.length < MAX_LEGACY_SAMPLES || this.sampleWriteIndex === 0) return [...this.samples];
    return [...this.samples.slice(this.sampleWriteIndex), ...this.samples.slice(0, this.sampleWriteIndex)];
  }

  private getPhaseMeasures(): PerformancePhaseMeasureDiagnostic[] {
    return performance.getEntriesByType('measure')
      .filter((entry) => entry.name.startsWith(PHASE_MEASURE_PREFIX))
      .slice(-4096)
      .map((entry) => ({
        name: entry.name,
        startMs: roundOne(entry.startTime - this.startedAt),
        durationMs: roundTwo(entry.duration),
      }));
  }

  private installLongTaskObserver(): void {
    if (typeof PerformanceObserver === 'undefined' || !PerformanceObserver.supportedEntryTypes?.includes('longtask')) return;
    this.longTaskObserver = new PerformanceObserver((list) => {
      for (const rawEntry of list.getEntries()) {
        const entry = rawEntry as LongTaskEntryLike;
        const task: BrowserLongTaskDiagnostic = {
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
        };
        this.longTasks.push(task);
        this.capture.recordOperation({
          phase: 'browser.long-task',
          durationMs: task.durationMs,
          startedAtMs: task.startMs,
          cause: { source: task.scenario ?? 'browser' },
          result: 'blocked-main-thread',
        });
      }
      trimOldest(this.longTasks, MAX_BROWSER_WINDOWS);
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
          scripts: Array.from(entry.scripts ?? []).slice(0, 64).map((script) => ({
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
      trimOldest(this.longAnimationFrames, MAX_BROWSER_WINDOWS);
    });
    this.longAnimationFrameObserver.observe({ entryTypes: ['long-animation-frame'] });
  }

  private readonly handleUnhandledRejection = (event: PromiseRejectionEvent): void => {
    this.capture.recordSemanticViolation('unhandledRejections', {
      message: event.reason instanceof Error ? event.reason.message : String(event.reason),
    });
  };
}



function collectNumericCounters(value: unknown, prefix = '', depth = 0): Record<string, number> {
  const result: Record<string, number> = {};
  if (depth > 3 || typeof value !== 'object' || value === null) return result;
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof nested === 'number' && Number.isFinite(nested)) result[path] = nested;
    else if (typeof nested === 'object' && nested !== null && !Array.isArray(nested)) {
      Object.assign(result, collectNumericCounters(nested, path, depth + 1));
    }
    if (Object.keys(result).length >= 128) break;
  }
  return result;
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
    const overlapDurationMs = unionDuration(overlaps.map((item) => [item.startMs, item.endMs] as const));
    const applicationOverlapRatio = window.durationMs > 0 ? Math.min(1, overlapDurationMs / window.durationMs) : 0;
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

function unionDuration(intervals: ReadonlyArray<readonly [number, number]>): number {
  if (intervals.length === 0) return 0;
  const sorted = [...intervals].sort((left, right) => left[0] - right[0] || left[1] - right[1]);
  let start = sorted[0][0];
  let end = sorted[0][1];
  let total = 0;
  for (let index = 1; index < sorted.length; index += 1) {
    const next = sorted[index];
    if (next[0] <= end) end = Math.max(end, next[1]);
    else { total += end - start; start = next[0]; end = next[1]; }
  }
  return total + end - start;
}

function shortPhaseName(name: string): string {
  return name.startsWith(PHASE_MEASURE_PREFIX) ? name.slice(PHASE_MEASURE_PREFIX.length) : name;
}

function isApplicationPhase(name: string): boolean {
  return /^(ticker|simulation|render|renderer|field|navigation|perception|ai|ui)\./.test(name);
}

function getBrowserInfo(): Record<string, unknown> {
  return {
    userAgent: navigator.userAgent,
    language: navigator.language,
    languages: [...navigator.languages],
    online: navigator.onLine,
    cookieEnabled: navigator.cookieEnabled,
    performanceObserverSupportedEntryTypes: [...(PerformanceObserver.supportedEntryTypes ?? [])],
  };
}

function getViewportInfo(): Record<string, unknown> {
  return {
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio,
    visualViewportWidth: window.visualViewport?.width ?? null,
    visualViewportHeight: window.visualViewport?.height ?? null,
  };
}

function detectLaunchSource(): 'manual' | 'ci' | 'unknown' {
  if (typeof location === 'undefined') return 'unknown';
  return /playwright|ci=1|performance-harness/i.test(`${location.search} ${navigator.userAgent}`) ? 'ci' : 'manual';
}

function detectMode(): 'development' | 'production' | 'test' | 'unknown' {
  const meta = import.meta as ImportMeta & { env?: { MODE?: string; DEV?: boolean } };
  if (meta.env) {
    if (meta.env.MODE === 'test') return 'test';
    return meta.env.DEV ? 'development' : 'production';
  }
  return 'unknown';
}

function readDeviceMemory(): number | null {
  const value = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return Number.isFinite(value) ? value ?? null : null;
}

function currentScenario(): string | null {
  if (typeof window === 'undefined') return null;
  return (window as PerformanceScenarioWindow).__realWargamePerformanceScenario ?? null;
}

function effectiveFps(samples: readonly PerformanceFrameSample[]): number | null {
  if (samples.length < 2) return null;
  const durationMs = samples[samples.length - 1].tMs - samples[0].tMs;
  return durationMs > 0 ? roundTwo((samples.length - 1) * 1000 / durationMs) : null;
}

function stats(values: readonly number[]): Record<string, number> {
  if (values.length === 0) return { count: 0, avg: 0, p50: 0, p95: 0, p99: 0, max: 0 };
  const sorted = [...values].sort((left, right) => left - right);
  const total = sorted.reduce((sum, value) => sum + value, 0);
  return {
    count: sorted.length,
    avg: roundTwo(total / sorted.length),
    p50: roundTwo(percentile(sorted, 0.50)),
    p95: roundTwo(percentile(sorted, 0.95)),
    p99: roundTwo(percentile(sorted, 0.99)),
    max: roundTwo(sorted[sorted.length - 1] ?? 0),
  };
}

function percentile(sorted: readonly number[], fraction: number): number {
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1));
  return sorted[index] ?? 0;
}

function cloneLongTask(task: BrowserLongTaskDiagnostic): BrowserLongTaskDiagnostic {
  return { ...task, attribution: task.attribution.map((item) => ({ ...item })) };
}

function cloneLongAnimationFrame(frame: LongAnimationFrameDiagnostic): LongAnimationFrameDiagnostic {
  return { ...frame, scripts: frame.scripts.map((script) => ({ ...script })) };
}

function trimOldest<T>(items: T[], maximum: number): void {
  if (items.length > maximum) items.splice(0, items.length - maximum);
}

function relativeTimestamp(value: number | undefined, startedAt: number): number | null {
  return Number.isFinite(value) ? roundOne((value as number) - startedAt) : null;
}

function scheduleIdleWork(callback: () => void): void {
  const idleWindow = window as Window & {
    requestIdleCallback?: (handler: () => void, options?: { timeout: number }) => number;
  };
  if (typeof idleWindow.requestIdleCallback === 'function') {
    idleWindow.requestIdleCallback(callback, { timeout: 2000 });
    return;
  }
  window.setTimeout(callback, 0);
}

function utf8ByteLength(value: string): number {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(value).byteLength;
  return value.length * 2;
}

function roundOne(value: number): number { return Math.round(value * 10) / 10; }
function roundTwo(value: number): number { return Math.round(value * 100) / 100; }
function roundThree(value: number): number { return Math.round(value * 1000) / 1000; }
