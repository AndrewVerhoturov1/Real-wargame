import { BufferImageSource, Container, Sprite, Text, Texture } from 'pixi.js';
import type { SimulationState } from '../core/simulation/SimulationState';
import type { StaticTacticalPositionKind } from '../core/tactical/static/StaticTacticalPositionBasis';
import { getStaticTacticalPositionService } from '../core/tactical/static/StaticTacticalPositionService';
import { getSimulationLayerState, type SimulationLayerMode } from '../core/ui/RuntimeUiState';

export interface StaticTacticalPositionOverlayDiagnostics {
  readonly representation: 'raster-sprite';
  readonly visible: boolean;
  readonly kind: StaticTacticalPositionKind | null;
  readonly basisIdentity: string;
  readonly rebuildCount: number;
  readonly displayObjectCount: number;
  readonly width: number;
  readonly height: number;
}

type StaticTacticalDebugWindow = Window & {
  __realWargameStaticTacticalDebug?: StaticTacticalPositionOverlayDiagnostics;
};

const LITTLE_ENDIAN = new Uint8Array(new Uint32Array([0x01020304]).buffer)[0] === 0x04;
const PIXEL_LUTS: Readonly<Record<StaticTacticalPositionKind, Uint32Array>> = Object.freeze({
  observation: buildPixelLut('observation'),
  defense: buildPixelLut('defense'),
  firing: buildPixelLut('firing'),
});

/**
 * Displays an already published objective tactical basis.
 *
 * This renderer never requests or calculates the basis. Camera, pointer and
 * frame updates only reuse the existing sprite until the exact basis identity
 * or selected tactical layer changes.
 */
export class PixiStaticTacticalPositionRenderer {
  readonly container = new Container();
  private readonly legend = new Text({
    text: '',
    style: {
      fontFamily: 'Arial, sans-serif',
      fontSize: 11,
      fontWeight: '700',
      fill: 0xffffff,
      stroke: { color: 0x101410, width: 4 },
      lineHeight: 14,
    },
  });
  private pixels: Uint8Array | null = null;
  private pixelWords: Uint32Array | null = null;
  private texture: Texture | null = null;
  private sprite: Sprite | null = null;
  private width = 0;
  private height = 0;
  private lastRasterKey = '';
  private lastKind: StaticTacticalPositionKind | null = null;
  private lastBasisIdentity = '';
  private rebuildCount = 0;
  private destroyed = false;

  constructor() {
    this.container.visible = false;
    this.container.eventMode = 'none';
    this.legend.eventMode = 'none';
    this.legend.position.set(12, 12);
  }

  render(state: SimulationState): void {
    if (this.destroyed) return;
    const kind = layerKind(getSimulationLayerState(state).mode);
    if (!kind || state.editor.enabled) {
      this.container.visible = false;
      this.lastKind = null;
      this.publishDiagnostics();
      return;
    }

    const service = getStaticTacticalPositionService(state);
    const basis = service.readAnyReady();
    this.container.visible = true;
    if (!basis) {
      this.hideRaster();
      this.legend.visible = true;
      this.legend.text = `Позиции: ${kindLabelRu(kind)}\nПостоянная карта ещё строится`;
      this.publishDiagnostics();
      return;
    }

    this.ensureRaster(basis.width, basis.height, state.map.cellSize);
    const rasterKey = `${basis.identityKey}|kind:${kind}`;
    if (rasterKey !== this.lastRasterKey) {
      const field = kind === 'observation'
        ? basis.observationPotential
        : kind === 'defense'
          ? basis.defensePotential
          : basis.firingPotential;
      this.applyRaster(field, kind, rasterKey);
    }
    if (this.sprite) this.sprite.visible = true;
    this.legend.visible = true;
    this.legend.text = [
      kindLabelRu(kind),
      'низкий ← потенциал → высокий',
      `кандидатов: ${candidateCount(basis, kind)}`,
    ].join('\n');
    this.lastKind = kind;
    this.lastBasisIdentity = basis.identityKey;
    this.publishDiagnostics();
  }

  getDiagnostics(): StaticTacticalPositionOverlayDiagnostics {
    return {
      representation: 'raster-sprite',
      visible: this.container.visible,
      kind: this.lastKind,
      basisIdentity: this.lastBasisIdentity,
      rebuildCount: this.rebuildCount,
      displayObjectCount: this.container.children.length,
      width: this.width,
      height: this.height,
    };
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.container.removeChildren();
    this.sprite?.destroy();
    this.texture?.destroy(true);
    this.legend.destroy();
    this.sprite = null;
    this.texture = null;
    this.pixelWords = null;
    this.pixels = null;
    this.container.destroy();
    delete (window as StaticTacticalDebugWindow).__realWargameStaticTacticalDebug;
  }

  private ensureRaster(width: number, height: number, cellSize: number): void {
    if (!this.pixels || this.width !== width || this.height !== height) {
      this.container.removeChildren();
      this.sprite?.destroy();
      this.texture?.destroy(true);
      this.width = width;
      this.height = height;
      this.pixels = new Uint8Array(width * height * 4);
      this.pixelWords = new Uint32Array(this.pixels.buffer);
      this.texture = new Texture({
        source: new BufferImageSource({
          resource: this.pixels,
          width,
          height,
          format: 'rgba8unorm',
          scaleMode: 'nearest',
        }),
      });
      this.sprite = new Sprite(this.texture);
      this.container.addChild(this.sprite, this.legend);
      this.lastRasterKey = '';
    }
    this.sprite?.scale.set(cellSize, cellSize);
  }

  private applyRaster(field: Uint8Array, kind: StaticTacticalPositionKind, rasterKey: string): void {
    if (!this.pixelWords || !this.texture) return;
    const lut = PIXEL_LUTS[kind];
    const length = Math.min(field.length, this.pixelWords.length);
    for (let cellIndex = 0; cellIndex < length; cellIndex += 1) {
      this.pixelWords[cellIndex] = lut[field[cellIndex] ?? 0] ?? 0;
    }
    if (length < this.pixelWords.length) this.pixelWords.fill(0, length);
    this.texture.source.update();
    this.lastRasterKey = rasterKey;
    this.rebuildCount += 1;
  }

  private hideRaster(): void {
    if (this.sprite) this.sprite.visible = false;
  }

  private publishDiagnostics(): void {
    (window as StaticTacticalDebugWindow).__realWargameStaticTacticalDebug = this.getDiagnostics();
  }
}

export function staticTacticalLayerKind(mode: SimulationLayerMode): StaticTacticalPositionKind | null {
  return layerKind(mode);
}

function layerKind(mode: SimulationLayerMode): StaticTacticalPositionKind | null {
  if (mode === 'observation_positions') return 'observation';
  if (mode === 'defense_positions') return 'defense';
  if (mode === 'firing_positions') return 'firing';
  return null;
}

function candidateCount(
  basis: NonNullable<ReturnType<ReturnType<typeof getStaticTacticalPositionService>['readAnyReady']>>,
  kind: StaticTacticalPositionKind,
): number {
  if (kind === 'observation') return basis.candidateIndex.observation.cellIndices.length;
  if (kind === 'defense') return basis.candidateIndex.defense.cellIndices.length;
  return basis.candidateIndex.firing.cellIndices.length;
}

function buildPixelLut(kind: StaticTacticalPositionKind): Uint32Array {
  const result = new Uint32Array(256);
  for (let value = 0; value < result.length; value += 1) {
    if (value <= 5) continue;
    const normalized = value / 255;
    const [low, middle, high] = gradient(kind);
    const mix = normalized < 0.5
      ? interpolate(low, middle, normalized * 2)
      : interpolate(middle, high, (normalized - 0.5) * 2);
    const alpha = Math.round(Math.min(0.62, 0.06 + normalized * 0.56) * 255);
    result[value] = packRgba(mix[0], mix[1], mix[2], alpha);
  }
  return result;
}

function gradient(kind: StaticTacticalPositionKind): readonly [readonly number[], readonly number[], readonly number[]] {
  if (kind === 'observation') return [[42, 72, 92], [54, 160, 184], [184, 244, 255]];
  if (kind === 'defense') return [[76, 58, 36], [151, 116, 48], [249, 218, 111]];
  return [[80, 34, 34], [181, 66, 51], [255, 168, 92]];
}

function interpolate(left: readonly number[], right: readonly number[], amount: number): [number, number, number] {
  return [
    Math.round((left[0] ?? 0) + ((right[0] ?? 0) - (left[0] ?? 0)) * amount),
    Math.round((left[1] ?? 0) + ((right[1] ?? 0) - (left[1] ?? 0)) * amount),
    Math.round((left[2] ?? 0) + ((right[2] ?? 0) - (left[2] ?? 0)) * amount),
  ];
}

function packRgba(red: number, green: number, blue: number, alpha: number): number {
  return LITTLE_ENDIAN
    ? (red | green << 8 | blue << 16 | alpha << 24) >>> 0
    : (red << 24 | green << 16 | blue << 8 | alpha) >>> 0;
}

function kindLabelRu(kind: StaticTacticalPositionKind): string {
  if (kind === 'observation') return 'Наблюдательные позиции';
  if (kind === 'defense') return 'Оборонительные позиции';
  return 'Огневые позиции';
}
