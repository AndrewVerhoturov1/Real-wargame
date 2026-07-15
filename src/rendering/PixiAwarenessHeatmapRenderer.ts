import { Container, Graphics, SCALE_MODES, Sprite, Text, Texture } from 'pixi.js';
import {
  buildAwarenessKnowledgeKey,
  buildSoldierAwarenessReport,
  type SoldierAwarenessCell,
} from '../core/knowledge/SoldierAwarenessGrid';
import type { SimulationState } from '../core/simulation/SimulationState';
import { getSimulationLayerState } from '../core/ui/RuntimeUiState';
import type { UnitModel } from '../core/units/UnitModel';

type VisibleAwarenessMode = 'danger' | 'stealth';

export interface AwarenessOverlayDiagnostics {
  representation: 'raster-sprite';
  visible: boolean;
  rebuildCount: number;
  markerUpdateCount: number;
  lastBuildMs: number;
  maxBuildMs: number;
  displayObjectCount: number;
  rasterWidth: number;
  rasterHeight: number;
}

type AwarenessDebugWindow = Window & {
  __realWargameAwarenessDebug?: AwarenessOverlayDiagnostics;
};

const mapIdentity = new WeakMap<object, number>();
let nextMapIdentity = 1;
const LITTLE_ENDIAN = new Uint8Array(new Uint32Array([0x01020304]).buffer)[0] === 0x04;
const DANGER_PIXEL_LUT = buildPixelLut('danger');
const STEALTH_PIXEL_LUT = buildPixelLut('stealth');

export class PixiAwarenessHeatmapRenderer {
  readonly container = new Container();
  private readonly markerGraphics = new Graphics();
  private readonly title = new Text('', {
    fontFamily: 'Arial, sans-serif',
    fontSize: 12,
    fontWeight: '700',
    fill: 0xffffff,
    stroke: 0x111510,
    strokeThickness: 4,
  });
  private lastRasterKey = '';
  private lastMarkerKey = '';
  private rasterPixels: Uint8Array | null = null;
  private rasterPixelWords: Uint32Array | null = null;
  private rasterWidth = 0;
  private rasterHeight = 0;
  private rasterTexture: Texture | null = null;
  private rasterSprite: Sprite | null = null;
  private rebuildCount = 0;
  private markerUpdateCount = 0;
  private lastBuildMs = 0;
  private maxBuildMs = 0;

  constructor() {
    this.title.position.set(8, 8);
    this.container.visible = false;
  }

  render(state: SimulationState): void {
    const simulationLayer = getSimulationLayerState(state);
    const awarenessMode = simulationLayer.mode === 'danger' ? 'danger' : simulationLayer.mode === 'stealth' ? 'stealth' : 'off';
    const unit = state.selectedUnitId ? state.units.find((item) => item.id === state.selectedUnitId) : undefined;
    if (state.editor.enabled || awarenessMode === 'off' || !unit) {
      this.container.visible = false;
      this.lastRasterKey = 'hidden';
      this.lastMarkerKey = 'hidden';
      this.publishDiagnostics();
      return;
    }

    this.container.visible = true;
    // Do not build the expensive full-map report on every animation frame.
    // Orders and movement change often, but they do not change the heatmap pixels themselves.
    const rasterKey = buildAwarenessRenderKey(state, unit, awarenessMode);
    const markerKey = `${rasterKey};unitCell:${Math.floor(unit.position.x)}:${Math.floor(unit.position.y)}`;
    const rasterChanged = rasterKey !== this.lastRasterKey;
    const markerChanged = markerKey !== this.lastMarkerKey;
    if (!rasterChanged && !markerChanged) return;

    const startedAt = rasterChanged ? performance.now() : 0;
    const report = buildSoldierAwarenessReport(state, unit);
    this.ensureRaster(state.map.width, state.map.height, state.map.cellSize);
    if (!this.rasterPixelWords || !this.rasterTexture) return;

    if (rasterChanged) {
      drawAwarenessRasterWords(this.rasterPixelWords, report.cells, awarenessMode);
      this.rasterTexture.baseTexture.update();
      this.title.text = `СЛОЙ БОЙЦА: ${modeLabel(awarenessMode)}`;
      this.lastRasterKey = rasterKey;
      this.rebuildCount += 1;
      this.lastBuildMs = performance.now() - startedAt;
      this.maxBuildMs = Math.max(this.maxBuildMs, this.lastBuildMs);
    }

    if (markerChanged) {
      this.drawSafePositionMarkers(report.bestSafePositions, awarenessMode, state.map.cellSize);
      this.lastMarkerKey = markerKey;
      this.markerUpdateCount += 1;
    }
    this.publishDiagnostics();
  }

  getDiagnostics(): AwarenessOverlayDiagnostics {
    return {
      representation: 'raster-sprite',
      visible: this.container.visible,
      rebuildCount: this.rebuildCount,
      markerUpdateCount: this.markerUpdateCount,
      lastBuildMs: roundMs(this.lastBuildMs),
      maxBuildMs: roundMs(this.maxBuildMs),
      displayObjectCount: this.container.children.length,
      rasterWidth: this.rasterWidth,
      rasterHeight: this.rasterHeight,
    };
  }

  private ensureRaster(width: number, height: number, cellSize: number): void {
    const needsNewRaster = !this.rasterPixels
      || this.rasterWidth !== width
      || this.rasterHeight !== height;

    if (needsNewRaster) {
      this.container.removeChildren();
      this.rasterSprite?.destroy();
      this.rasterTexture?.destroy(true);
      this.rasterWidth = width;
      this.rasterHeight = height;
      this.rasterPixels = new Uint8Array(width * height * 4);
      this.rasterPixelWords = new Uint32Array(this.rasterPixels.buffer);
      this.rasterTexture = Texture.fromBuffer(this.rasterPixels, width, height, {
        scaleMode: SCALE_MODES.NEAREST,
      });
      this.rasterSprite = new Sprite(this.rasterTexture);
      this.container.addChild(this.rasterSprite, this.markerGraphics, this.title);
    }

    this.rasterSprite?.scale.set(cellSize, cellSize);
  }

  private drawSafePositionMarkers(
    positions: ReturnType<typeof buildSoldierAwarenessReport>['bestSafePositions'],
    mode: VisibleAwarenessMode,
    cellSize: number,
  ): void {
    this.markerGraphics.clear();
    if (mode !== 'danger') return;
    for (const [index, best] of positions.slice(0, 5).entries()) {
      const x = best.position.x * cellSize;
      const y = best.position.y * cellSize;
      this.markerGraphics.lineStyle(index === 0 ? 4 : 2, 0xefff9a, 0.95);
      this.markerGraphics.beginFill(0x4ce78a, index === 0 ? 0.45 : 0.2);
      this.markerGraphics.drawCircle(x, y, index === 0 ? 12 : 8);
      this.markerGraphics.endFill();
    }
  }

  private publishDiagnostics(): void {
    (window as AwarenessDebugWindow).__realWargameAwarenessDebug = this.getDiagnostics();
  }
}

export function buildAwarenessRenderKey(
  state: SimulationState,
  unit: UnitModel,
  mode: VisibleAwarenessMode,
): string {
  return [
    `mode:${mode}`,
    `map:${getMapIdentity(state.map)}`,
    `size:${state.map.width}x${state.map.height}`,
    `cellSize:${state.map.cellSize}`,
    `unit:${unit.id}`,
    `posture:${unit.behaviorRuntime.posture}`,
    `knowledge:${buildAwarenessKnowledgeKey(unit)}`,
  ].join(';');
}

export function createAwarenessTexture(
  cells: SoldierAwarenessCell[],
  mode: VisibleAwarenessMode,
  width: number,
  height: number,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { alpha: true });
  if (context) drawAwarenessRaster(context, cells, mode, width, height);
  return canvas;
}

export function drawAwarenessRaster(
  context: CanvasRenderingContext2D,
  cells: SoldierAwarenessCell[],
  mode: VisibleAwarenessMode,
  width: number,
  height: number,
): void {
  const image = context.createImageData(width, height);
  drawAwarenessRasterWords(new Uint32Array(image.data.buffer), cells, mode);
  context.putImageData(image, 0, 0);
}

export function drawAwarenessRasterWords(
  pixels: Uint32Array,
  cells: SoldierAwarenessCell[],
  mode: VisibleAwarenessMode,
): void {
  const length = Math.min(cells.length, pixels.length);
  const lut = mode === 'danger' ? DANGER_PIXEL_LUT : STEALTH_PIXEL_LUT;
  const dangerMode = mode === 'danger';
  for (let cellIndex = 0; cellIndex < length; cellIndex += 1) {
    const cell = cells[cellIndex];
    const value = dangerMode ? cell.danger : cell.concealment;
    pixels[cellIndex] = lut[Math.max(0, Math.min(100, value))] ?? 0;
  }
  if (length < pixels.length) pixels.fill(0, length);
}

function buildPixelLut(mode: VisibleAwarenessMode): Uint32Array {
  const result = new Uint32Array(101);
  for (let value = 0; value <= 100; value += 1) {
    if (value <= 2) continue;
    let red: number;
    let green: number;
    let blue: number;
    if (mode === 'danger') {
      if (value >= 70) {
        red = 0xe8;
        green = 0x3d;
        blue = 0x32;
      } else if (value >= 40) {
        red = 0xff;
        green = 0x7a;
        blue = 0x31;
      } else {
        red = 0xf2;
        green = 0xc8;
        blue = 0x4b;
      }
    } else if (value >= 75) {
      red = 0x1c;
      green = 0x6b;
      blue = 0x45;
    } else if (value >= 50) {
      red = 0x3d;
      green = 0xa8;
      blue = 0x5f;
    } else if (value >= 25) {
      red = 0xd7;
      green = 0xb9;
      blue = 0x4b;
    } else {
      red = 0xd9;
      green = 0x77;
      blue = 0x32;
    }
    const alpha = Math.round(Math.min(0.55, 0.08 + value / 100 * 0.46) * 255);
    result[value] = packRgba(red, green, blue, alpha);
  }
  return result;
}

function packRgba(red: number, green: number, blue: number, alpha: number): number {
  return LITTLE_ENDIAN
    ? (red | green << 8 | blue << 16 | alpha << 24) >>> 0
    : (red << 24 | green << 16 | blue << 8 | alpha) >>> 0;
}

function getMapIdentity(map: object): number {
  const existing = mapIdentity.get(map);
  if (existing !== undefined) return existing;
  const identity = nextMapIdentity;
  nextMapIdentity += 1;
  mapIdentity.set(map, identity);
  return identity;
}

function modeLabel(mode: VisibleAwarenessMode): string {
  return mode === 'danger' ? 'опасность' : 'скрытность';
}

function roundMs(value: number): number {
  return Math.round(value * 100) / 100;
}
