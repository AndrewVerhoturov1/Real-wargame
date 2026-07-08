import type { SimulationState } from '../simulation/SimulationState';

export interface PerformanceFrameSample {
  tMs: number;
  frameMs: number | null;
  renderMs: number;
  zoom: number;
  editorEnabled: boolean;
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
  samples: PerformanceFrameSample[];
}

const MAX_SAMPLES = 1800;

export class PerformanceMonitor {
  private readonly startedAt = performance.now();
  private readonly samples: PerformanceFrameSample[] = [];
  private lastSampleAt: number | null = null;

  recordFrame(state: SimulationState, zoom: number, renderMs: number): void {
    const now = performance.now();
    const frameMs = this.lastSampleAt === null ? null : now - this.lastSampleAt;
    this.lastSampleAt = now;

    this.samples.push({
      tMs: roundOne(now - this.startedAt),
      frameMs: frameMs === null ? null : roundTwo(frameMs),
      renderMs: roundTwo(renderMs),
      zoom: roundThree(zoom),
      editorEnabled: state.editor.enabled,
      objectCount: state.map.objects.length,
      unitCount: state.units.length,
      zoneCount: state.pressureZones.length,
      selectedObject: state.editor.selectedObjectId !== null,
      selectedZone: state.editor.selectedZoneId !== null,
    });

    if (this.samples.length > MAX_SAMPLES) {
      this.samples.splice(0, this.samples.length - MAX_SAMPLES);
    }
  }

  buildReport(state: SimulationState, zoom: number, renderer: Record<string, unknown>): PerformanceReport {
    const frameValues = this.samples
      .map((sample) => sample.frameMs)
      .filter((value): value is number => typeof value === 'number');
    const renderValues = this.samples.map((sample) => sample.renderMs);
    const fpsValues = frameValues
      .filter((value) => value > 0)
      .map((value) => 1000 / value);

    return {
      version: 'performance-report-v1',
      exportedAt: new Date().toISOString(),
      runtimeSeconds: roundOne((performance.now() - this.startedAt) / 1000),
      browser: getBrowserInfo(),
      viewport: getViewportInfo(),
      renderer,
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
        sampleCount: this.samples.length,
        frameMs: buildStats(frameValues),
        fps: buildStats(fpsValues),
        renderMs: buildStats(renderValues),
        worstFrames: [...this.samples]
          .filter((sample) => sample.frameMs !== null)
          .sort((left, right) => (right.frameMs ?? 0) - (left.frameMs ?? 0))
          .slice(0, 20),
        worstRenders: [...this.samples]
          .sort((left, right) => right.renderMs - left.renderMs)
          .slice(0, 20),
      },
      samples: [...this.samples],
    };
  }
}

function getBrowserInfo(): Record<string, unknown> {
  const extendedNavigator = navigator as Navigator & {
    deviceMemory?: number;
  };

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

function buildStats(values: number[]): Record<string, number | null> {
  if (values.length === 0) {
    return {
      min: null,
      avg: null,
      p95: null,
      max: null,
    };
  }

  const sorted = [...values].sort((left, right) => left - right);
  const total = values.reduce((sum, value) => sum + value, 0);

  return {
    min: roundTwo(sorted[0]),
    avg: roundTwo(total / values.length),
    p95: roundTwo(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]),
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
