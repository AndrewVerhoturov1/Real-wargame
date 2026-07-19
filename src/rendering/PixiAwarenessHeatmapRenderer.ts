import { BufferImageSource, Container, Sprite, Text, Texture } from 'pixi.js';
import type { GridPosition } from '../core/geometry';
import type { SoldierAwarenessCell } from '../core/knowledge/SoldierAwarenessGrid';
import type { AwarenessWorkerFieldPayload } from '../core/knowledge/AwarenessWorldWorkerProtocol';
import type { SimulationState } from '../core/simulation/SimulationState';
import { getSimulationLayerState } from '../core/ui/RuntimeUiState';
import type { UnitModel } from '../core/units/UnitModel';
import {
  AwarenessWorldRuntime,
  buildAwarenessWorldKey as buildSharedAwarenessWorldKey,
} from '../runtime/AwarenessWorldRuntime';

export type VisibleAwarenessMode = 'danger' | 'stealth';

export interface AwarenessAppliedRasterDiagnostics {
  readonly width: number;
  readonly height: number;
  readonly digest: string;
  readonly fieldIdentity: string;
  readonly threatIds: readonly string[];
}

export interface AwarenessOverlayDiagnostics {
  readonly representation: 'raster-sprite';
  readonly visible: boolean;
  readonly rebuildCount: number;
  readonly lastBuildMs: number;
  readonly maxBuildMs: number;
  readonly displayObjectCount: number;
  readonly rasterWidth: number;
  readonly rasterHeight: number;
  readonly lastRequestedWorldKey: string;
  readonly lastAppliedWorldKey: string;
  readonly lastRequestedCanonicalThreatKey: string;
  readonly lastAppliedCanonicalThreatKey: string;
  readonly lastAppliedFieldIdentity: string;
  readonly lastAppliedJobId: number;
  readonly lastAppliedRaster: AwarenessAppliedRasterDiagnostics | null;
  readonly movement: ReturnType<AwarenessWorldRuntime['getDiagnostics']>;
}

type AwarenessDebugWindow = Window & {
  __realWargameAwarenessDebug?: AwarenessOverlayDiagnostics;
};

const LITTLE_ENDIAN = new Uint8Array(new Uint32Array([0x01020304]).buffer)[0] === 0x04;
const DANGER_PIXEL_LUT = buildPixelLut('danger');
const STEALTH_PIXEL_LUT = buildPixelLut('stealth');

/**
 * Presentation-only raster consumer. Full-map preparation and tactical-position
 * ownership live in AwarenessWorldRuntime, so rendering never becomes gameplay truth.
 */
export class PixiAwarenessHeatmapRenderer {
  readonly container = new Container();
  private readonly title = new Text({ text: '', style: {
    fontFamily: 'Arial, sans-serif', fontSize: 12, fontWeight: '700', fill: 0xffffff,
    stroke: { color: 0x111510, width: 4 },
  } });
  private lastRasterKey = '';
  private lastAppliedWorldKey = '';
  private lastAppliedCanonicalThreatKey = '';
  private lastAppliedFieldIdentity = '';
  private lastAppliedRasterDigest = '';
  private lastAppliedJobId = 0;
  private worldField: AwarenessWorkerFieldPayload | null = null;
  private rasterPixels: Uint8Array | null = null;
  private rasterPixelWords: Uint32Array | null = null;
  private rasterWidth = 0;
  private rasterHeight = 0;
  private rasterTexture: Texture | null = null;
  private rasterSprite: Sprite | null = null;
  private destroyed = false;
  private rebuildCount = 0;
  private lastBuildMs = 0;
  private maxBuildMs = 0;

  constructor(private readonly runtime: AwarenessWorldRuntime) {
    this.title.position.set(8, 8);
    this.container.visible = false;
  }

  render(state: SimulationState): void {
    if (this.destroyed) return;
    const layer = getSimulationLayerState(state);
    const mode: VisibleAwarenessMode | null = layer.mode === 'danger'
      ? 'danger'
      : layer.mode === 'stealth'
        ? 'stealth'
        : null;
    const unit = state.selectedUnitId
      ? state.units.find((candidate) => candidate.id === state.selectedUnitId)
      : undefined;

    if (state.editor.enabled || !mode || !unit) {
      this.container.visible = false;
      this.lastRasterKey = 'hidden';
      this.publishDiagnostics();
      return;
    }

    this.container.visible = true;
    this.ensureRaster(state.map.width, state.map.height, state.map.cellSize);
    const prepared = this.runtime.requestWorldField(state, unit);
    if (!prepared) {
      this.publishDiagnostics();
      return;
    }

    const rasterKey = `${prepared.worldKey};mode:${mode}`;
    if (rasterKey !== this.lastRasterKey || prepared.jobId !== this.lastAppliedJobId) {
      this.worldField = prepared.field;
      this.lastAppliedWorldKey = prepared.worldKey;
      this.lastAppliedCanonicalThreatKey = prepared.canonicalThreatKey;
      this.lastAppliedFieldIdentity = prepared.fieldIdentity;
      this.lastAppliedRasterDigest = prepared.rasterDigest;
      this.lastAppliedJobId = prepared.jobId;
      this.applyRaster(mode, rasterKey);
    }
    this.publishDiagnostics();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.container.removeChildren();
    this.rasterSprite?.destroy();
    this.rasterTexture?.destroy(true);
    this.rasterSprite = null;
    this.rasterTexture = null;
    this.rasterPixelWords = null;
    this.rasterPixels = null;
    this.worldField = null;
    this.title.destroy();
    this.container.destroy();
    delete (window as AwarenessDebugWindow).__realWargameAwarenessDebug;
  }

  getDiagnostics(): AwarenessOverlayDiagnostics {
    const movement = this.runtime.getDiagnostics();
    return {
      representation: 'raster-sprite',
      visible: this.container.visible,
      rebuildCount: this.rebuildCount,
      lastBuildMs: roundMs(this.lastBuildMs),
      maxBuildMs: roundMs(this.maxBuildMs),
      displayObjectCount: this.container.children.length,
      rasterWidth: this.rasterWidth,
      rasterHeight: this.rasterHeight,
      lastRequestedWorldKey: movement.lastRequestedWorldKey,
      lastAppliedWorldKey: this.lastAppliedWorldKey,
      lastRequestedCanonicalThreatKey: movement.lastRequestedCanonicalThreatKey,
      lastAppliedCanonicalThreatKey: this.lastAppliedCanonicalThreatKey,
      lastAppliedFieldIdentity: this.lastAppliedFieldIdentity,
      lastAppliedJobId: this.lastAppliedJobId,
      lastAppliedRaster: this.worldField && this.lastAppliedRasterDigest
        ? {
            width: this.worldField.width,
            height: this.worldField.height,
            digest: this.lastAppliedRasterDigest,
            fieldIdentity: this.lastAppliedFieldIdentity,
            threatIds: [...this.worldField.threatIds],
          }
        : null,
      movement,
    };
  }

  private applyRaster(mode: VisibleAwarenessMode, rasterKey: string): void {
    if (!this.worldField || !this.rasterPixelWords || !this.rasterTexture) return;
    const startedAt = performance.now();
    const source = mode === 'danger'
      ? this.worldField.dangerPixels
      : this.worldField.stealthPixels;
    this.rasterPixelWords.set(source.subarray(0, this.rasterPixelWords.length));
    if (source.length < this.rasterPixelWords.length) this.rasterPixelWords.fill(0, source.length);
    this.rasterTexture.source.update();
    this.title.text = `СЛОЙ БОЙЦА: ${modeLabel(mode)}`;
    this.lastRasterKey = rasterKey;
    this.rebuildCount += 1;
    const elapsed = performance.now() - startedAt;
    this.lastBuildMs = elapsed;
    this.maxBuildMs = Math.max(this.maxBuildMs, elapsed);
    this.runtime.recordMainThreadRasterSwap(elapsed);
  }

  private ensureRaster(width: number, height: number, cellSize: number): void {
    const needsNewRaster = !this.rasterPixels
      || this.rasterWidth !== width
      || this.rasterHeight !== height;
    if (needsNewRaster) {
      this.container.removeChildren();
      this.rasterSprite?.destroy();
      this.rasterTexture?.destroy(true);
      this.rasterSprite = null;
      this.rasterTexture = null;
      this.lastRasterKey = '';
      this.rasterWidth = width;
      this.rasterHeight = height;
      this.rasterPixels = new Uint8Array(width * height * 4);
      this.rasterPixelWords = new Uint32Array(this.rasterPixels.buffer);
      this.rasterTexture = new Texture({
        source: new BufferImageSource({
          resource: this.rasterPixels,
          width,
          height,
          format: 'rgba8unorm',
          scaleMode: 'nearest',
        }),
      });
      this.rasterSprite = new Sprite(this.rasterTexture);
      this.container.addChild(this.rasterSprite, this.title);
    }
    this.rasterSprite?.scale.set(cellSize, cellSize);
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
  return `${buildSharedAwarenessWorldKey(state, unit)};mode:${mode}`;
}

export function buildAwarenessWorldKey(
  state: SimulationState,
  unit: UnitModel,
): string {
  return buildSharedAwarenessWorldKey(state, unit);
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
    pixels[cellIndex] = lut[Math.max(0, Math.min(100, Math.round(value)))] ?? 0;
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

function modeLabel(mode: VisibleAwarenessMode): string {
  return mode === 'danger' ? 'опасность' : 'скрытность';
}

function roundMs(value: number): number {
  return Math.round(value * 100) / 100;
}
