import type { SimulationState } from '../simulation/SimulationState';
import { getSimulationLayerState } from '../ui/RuntimeUiState';

export interface PerformanceFrameSample {
  tMs: number;
  frameMs: number | null;
  /** CPU time spent updating render data before Pixi performs its WebGL draw. */
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

export interface PerformanceReport {
  version: string;
  exportedAt: string;
  runtimeSeconds: number;
  browser: Record<string, unknown>;
  viewport: Record<string, unknown>;
  renderer: Record<string, unknown>;
  scene: Record<string, unknown>;
  editor: Record<string, unknown>;
  summary: Record<string, unknown>;
  longTasks: Array<{ startMs: number; durationMs: number }>;
  samples: PerformanceFrameSample[];
}

const MAX_SAMPLES = 3600;
const MAX_LONG_TASKS = 200;

export class PerformanceMonitor {
  private readonly startedAt = performance.now();
  private readonly samples: Array<PerformanceFrameSample | undefined> = new Array(MAX_SAMPLES);
  private readonly longTasks: Array<{ startMs: number; durationMs: number }> = [];
  private writeIndex = 0;
  private storedCount = 0;
  private lastSampleAt: number | null = null;
  private longTaskObserver: PerformanceObserver | null = null;

  constructor() {
    if (typeof PerformanceObserver === 'undefined' || !PerformanceObserver.supportedEntryTypes?.includes('longtask')) return;
    this.longTaskObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        this.longTasks.push({
          startMs: roundOne(entry.startTime - this.startedAt),
          durationMs: roundTwo(entry.duration),
        });
      }
      if (this.longTasks.length > MAX_LONG_TASKS) {
        this.longTasks.splice(0, this.longTasks.length - MAX_LONG_TASKS);
      }
    });
    this.longTaskObserver.observe({ entryTypes: ['longtask'] });
  }

  destroy(): void {
    this.longTaskObserver?.disconnect();
    this.longTaskObserver = null;
  }

  recordFrame(state: SimulationState, zoom: number, sceneUpdateMs: number, grid = false): void {
    const now = performance.now();
    const frameMs = this.lastSampleAt === null ? null : now - this.lastSampleAt;
    this.lastSampleAt = now;
    const layer = getSimulationLayerState(state);
    const mouse = state.mouseGridPosition;

    this.samples[this.writeIndex] = {
      tMs: roundOne(now - this.startedAt),
      frameMs: frameMs === null ? null : roundTwo(frameMs),
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
    const sampledDurationMs = samples.length > 1
      ? samples[samples.length - 1].tMs - samples[0].tMs
      : 0;
    const effectiveFps = sampledDurationMs > 0
      ? (samples.length - 1) * 1000 / sampledDurationMs
      : null;
    const p95FrameMs = percentile(frameValues, 0.95);

    return {
      version: 'performance-report-v2',
      exportedAt: new Date().toISOString(),
      runtimeSeconds: roundOne((performance.now() - this.startedAt) / 1000),
      browser: getBrowserInfo(),
      viewport: getViewportInfo(),
      renderer: {
        ...renderer,
        timingNote: 'sceneUpdateMs/renderMs measure JavaScript scene updates only; effective FPS and browser long tasks reveal whole-frame stalls.',
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
      summary: {
        sampleCount: samples.length,
        sampledDurationSeconds: roundTwo(sampledDurationMs / 1000),
        effectiveFps: effectiveFps === null ? null : roundTwo(effectiveFps),
        fpsAtP95FrameTime: p95FrameMs && p95FrameMs > 0 ? roundTwo(1000 / p95FrameMs) : null,
        frameMs: buildStats(frameValues),
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
        worstFrames: [...samples]
          .filter((sample) => sample.frameMs !== null)
          .sort((left, right) => (right.frameMs ?? 0) - (left.frameMs ?? 0))
          .slice(0, 30),
        worstSceneUpdates: [...samples]
          .sort((left, right) => right.sceneUpdateMs - left.sceneUpdateMs)
          .slice(0, 30),
      },
      longTasks: [...this.longTasks],
      samples,
    };
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
