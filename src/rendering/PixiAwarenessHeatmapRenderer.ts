import { BufferImageSource, Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import type { UnitPosture } from '../core/behavior/BehaviorModel';
import type { AwarenessMovementDiagnostics } from '../core/debug/AwarenessMovementDiagnostics';
import type { TacticalPositionCandidateSeed } from '../core/ai/tactical/TacticalQuery';
import type { SoldierAwarenessCell } from '../core/knowledge/SoldierAwarenessGrid';
import type { AwarenessWorkerFieldPayload } from '../core/knowledge/AwarenessWorldWorkerProtocol';
import type { CanonicalWorldThreatSetSnapshot } from '../core/knowledge/CanonicalWorldThreat';
import type { SimulationState } from '../core/simulation/SimulationState';
import {
  clearVisibleTacticalPositions,
  getTacticalPositionPresentation,
  publishVisibleTacticalPositions,
  recommendedPostureOf,
  syncHoveredTacticalPosition,
} from '../core/tactical/SimulationTacticalPositionSelection';
import {
  getTacticalPositionSearchService,
  type TacticalPositionSearchService,
  type TacticalPositionSearchServiceDiagnostics,
} from '../core/tactical/TacticalPositionSearchService';
import { getSimulationLayerState } from '../core/ui/RuntimeUiState';
import { isTacticalPositionWorkspaceTabActive } from '../ui/TacticalPositionWorkspaceTab';
import type { UnitModel } from '../core/units/UnitModel';
import { TacticalPositionInputController } from '../input/TacticalPositionInputController';
import { buildAwarenessWorldKey as buildSharedAwarenessWorldKey } from '../runtime/AwarenessWorldRuntime';

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
  readonly tacticalMarkerRebuildCount: number;
  readonly tacticalMarkerCount: number;
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
  readonly movement: AwarenessMovementDiagnostics | null;
  readonly tacticalSearch: TacticalPositionSearchServiceDiagnostics | null;
}

type AwarenessDebugWindow = Window & {
  __realWargameAwarenessDebug?: AwarenessOverlayDiagnostics;
};

const LITTLE_ENDIAN = new Uint8Array(new Uint32Array([0x01020304]).buffer)[0] === 0x04;
const DANGER_PIXEL_LUT = buildPixelLut('danger');
const STEALTH_PIXEL_LUT = buildPixelLut('stealth');
const MAX_VISIBLE_CANDIDATES = 12;

/**
 * Pure presentation of immutable simulation-owned awareness/search snapshots.
 * Opening a layer, rendering a frame, moving the camera or hovering a marker
 * never creates a field/search request.
 */
export class PixiAwarenessHeatmapRenderer {
  readonly container = new Container();
  private readonly tacticalGraphics = new Graphics();
  private readonly overlayText = new Text({
    text: '',
    style: {
      fontFamily: 'Arial, sans-serif',
      fontSize: 11,
      fontWeight: '700',
      fill: 0xffffff,
      stroke: { color: 0x111510, width: 4 },
      lineHeight: 14,
    },
  });
  private readonly injectedSearchService: TacticalPositionSearchService | null;
  private searchService: TacticalPositionSearchService | null;
  private attachedState: SimulationState | null = null;
  private inputController: TacticalPositionInputController | null = null;
  private lastRasterKey = '';
  private lastDrawKey = '';
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
  private tacticalMarkerRebuildCount = 0;
  private tacticalMarkerCount = 0;
  private lastBuildMs = 0;
  private maxBuildMs = 0;

  constructor(searchService?: TacticalPositionSearchService) {
    this.injectedSearchService = searchService ?? null;
    this.searchService = this.injectedSearchService;
    this.tacticalGraphics.eventMode = 'none';
    this.overlayText.eventMode = 'none';
    this.container.visible = false;
  }

  render(state: SimulationState): void {
    if (this.destroyed) return;
    this.attachState(state);
    const service = this.searchService;
    const layer = getSimulationLayerState(state);
    const positionsActive = layer.mode === 'positions' && isTacticalPositionWorkspaceTabActive(state);
    const mode: VisibleAwarenessMode | null = layer.mode === 'danger' || layer.mode === 'positions'
      ? 'danger'
      : layer.mode === 'stealth'
        ? 'stealth'
        : null;
    const unit = selectedUnit(state);

    if (!service || state.editor.enabled || !mode || !unit) {
      this.container.visible = false;
      this.publishDiagnostics();
      return;
    }

    this.container.visible = true;
    this.ensureRaster(state.map.width, state.map.height, state.map.cellSize);
    const prepared = service.readReadyWorldField(unit.id);
    if (prepared) {
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
    }

    if (positionsActive) this.renderTacticalPositions(state, unit, service);
    else this.hideTacticalMarkers(`layer:${layer.mode}`, mode);
    this.publishDiagnostics();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.inputController?.destroy();
    this.inputController = null;
    this.attachedState = null;
    this.searchService = null;
    this.container.removeChildren();
    this.rasterSprite?.destroy();
    this.rasterTexture?.destroy(true);
    this.rasterSprite = null;
    this.rasterTexture = null;
    this.rasterPixelWords = null;
    this.rasterPixels = null;
    this.worldField = null;
    this.tacticalGraphics.destroy();
    this.overlayText.destroy();
    this.container.destroy();
    delete (window as AwarenessDebugWindow).__realWargameAwarenessDebug;
  }

  getDiagnostics(): AwarenessOverlayDiagnostics {
    const service = this.searchService;
    const latest = service && this.attachedState?.selectedUnitId
      ? service.readLatestForUnit(this.attachedState.selectedUnitId)
      : null;
    return {
      representation: 'raster-sprite',
      visible: this.container.visible,
      rebuildCount: this.rebuildCount,
      tacticalMarkerRebuildCount: this.tacticalMarkerRebuildCount,
      tacticalMarkerCount: this.tacticalMarkerCount,
      lastBuildMs: roundMs(this.lastBuildMs),
      maxBuildMs: roundMs(this.maxBuildMs),
      displayObjectCount: this.container.children.length,
      rasterWidth: this.rasterWidth,
      rasterHeight: this.rasterHeight,
      lastRequestedWorldKey: latest?.requestedWorldKey ?? '',
      lastAppliedWorldKey: this.lastAppliedWorldKey,
      lastRequestedCanonicalThreatKey: '',
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
      movement: null,
      tacticalSearch: service?.getDiagnostics() ?? null,
    };
  }

  private attachState(state: SimulationState): void {
    if (this.attachedState === state) return;
    this.inputController?.destroy();
    this.attachedState = state;
    this.searchService = this.injectedSearchService ?? getTacticalPositionSearchService(state);
    this.inputController = new TacticalPositionInputController(state);
    this.inputController.attach();
    this.lastDrawKey = '';
  }

  private renderTacticalPositions(
    state: SimulationState,
    unit: UnitModel,
    service: TacticalPositionSearchService,
  ): void {
    const latest = service.readLatestForUnit(unit.id);
    const result = latest?.status === 'ready' ? latest.result : null;
    const candidates = result?.candidates.slice(0, MAX_VISIBLE_CANDIDATES) ?? [];
    if (candidates.length === 0) {
      clearVisibleTacticalPositions(state);
      this.hideTacticalMarkers(`empty:${latest?.requestId ?? unit.id}`, 'danger');
      return;
    }

    const candidateKey = `${result!.requestId};${result!.fieldIdentity};${candidates.map((candidate) => (
      `${candidate.id}:${recommendedPostureOf(candidate)}`
    )).join('|')}`;
    publishVisibleTacticalPositions(state, unit.id, candidates);
    syncHoveredTacticalPosition(state);
    const presentation = getTacticalPositionPresentation(state);
    const drawKey = [
      candidateKey,
      `cellSize:${state.map.cellSize}`,
      `selected:${presentation.selected?.id ?? 'none'}`,
      `hovered:${presentation.hovered?.id ?? 'none'}`,
    ].join(';');
    if (drawKey === this.lastDrawKey) return;
    this.lastDrawKey = drawKey;

    this.tacticalGraphics.visible = true;
    this.tacticalGraphics.clear();
    for (let index = 0; index < presentation.candidates.length && index < MAX_VISIBLE_CANDIDATES; index += 1) {
      const candidate = presentation.candidates[index]!;
      drawB2TacticalPositionMarker(
        this.tacticalGraphics,
        candidate,
        state.map.cellSize,
        index === 0,
        candidate.id === presentation.selected?.id,
        candidate.id === presentation.hovered?.id,
      );
    }
    this.updateOverlayText(presentation.hovered ?? presentation.selected, state.map.cellSize, 'danger');
    this.tacticalMarkerCount = Math.min(presentation.candidates.length, MAX_VISIBLE_CANDIDATES);
    this.tacticalMarkerRebuildCount += 1;
  }

  private updateOverlayText(
    candidate: TacticalPositionCandidateSeed | null,
    cellSize: number,
    mode: VisibleAwarenessMode,
  ): void {
    if (candidate) {
      this.overlayText.text = `${postureLabel(recommendedPostureOf(candidate))}\nЛКМ: выбрать · ПКМ: отправить`;
      this.overlayText.position.set(candidate.position.x * cellSize + 13, candidate.position.y * cellSize - 18);
    } else {
      this.overlayText.text = `СЛОЙ БОЙЦА: ${modeLabel(mode)}`;
      this.overlayText.position.set(8, 8);
    }
    this.overlayText.visible = true;
  }

  private hideTacticalMarkers(key: string, mode: VisibleAwarenessMode): void {
    if (this.lastDrawKey === key && this.tacticalMarkerCount === 0) return;
    this.lastDrawKey = key;
    this.tacticalGraphics.clear();
    this.tacticalGraphics.visible = false;
    this.updateOverlayText(null, 1, mode);
    this.tacticalMarkerCount = 0;
    this.tacticalMarkerRebuildCount += 1;
  }

  private applyRaster(mode: VisibleAwarenessMode, rasterKey: string): void {
    if (!this.worldField || !this.rasterPixelWords || !this.rasterTexture) return;
    const startedAt = performance.now();
    const source = mode === 'danger' ? this.worldField.dangerPixels : this.worldField.stealthPixels;
    this.rasterPixelWords.set(source.subarray(0, this.rasterPixelWords.length));
    if (source.length < this.rasterPixelWords.length) this.rasterPixelWords.fill(0, source.length);
    this.rasterTexture.source.update();
    this.lastRasterKey = rasterKey;
    this.rebuildCount += 1;
    const elapsed = performance.now() - startedAt;
    this.lastBuildMs = elapsed;
    this.maxBuildMs = Math.max(this.maxBuildMs, elapsed);
  }

  private ensureRaster(width: number, height: number, cellSize: number): void {
    const needsNewRaster = !this.rasterPixels || this.rasterWidth !== width || this.rasterHeight !== height;
    if (needsNewRaster) {
      this.container.removeChildren();
      this.rasterSprite?.destroy();
      this.rasterTexture?.destroy(true);
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
      this.container.addChild(this.rasterSprite, this.tacticalGraphics, this.overlayText);
      this.lastRasterKey = '';
      this.lastDrawKey = '';
    }
    this.rasterSprite?.scale.set(cellSize, cellSize);
  }

  private publishDiagnostics(): void {
    (window as AwarenessDebugWindow).__realWargameAwarenessDebug = this.getDiagnostics();
  }
}

function selectedUnit(state: SimulationState): UnitModel | undefined {
  return state.selectedUnitId
    ? state.units.find((candidate) => candidate.id === state.selectedUnitId)
    : undefined;
}

function drawB2TacticalPositionMarker(
  graphics: Graphics,
  candidate: TacticalPositionCandidateSeed,
  cellSize: number,
  winner: boolean,
  selected: boolean,
  hovered: boolean,
): void {
  const x = candidate.position.x * cellSize;
  const y = candidate.position.y * cellSize;
  const radius = winner ? 9 : 7;
  const color = winner ? 0x65f08a : 0xf4da66;
  drawDiamond(graphics, x, y, radius)
    .fill({ color, alpha: winner ? 0.34 : hovered ? 0.28 : 0.18 })
    .stroke({ width: winner ? 3 : 2, color, alpha: winner || hovered ? 1 : 0.84 });
  if (selected) drawDiamond(graphics, x, y, radius + 5).stroke({ width: 2.5, color: 0xffffff, alpha: 0.98 });
  else if (hovered) drawDiamond(graphics, x, y, radius + 3).stroke({ width: 1.5, color: 0xffffff, alpha: 0.72 });
  drawB2PostureGlyph(graphics, x, y, recommendedPostureOf(candidate), color);
}

function drawDiamond(graphics: Graphics, x: number, y: number, radius: number): Graphics {
  return graphics.moveTo(x, y - radius)
    .lineTo(x + radius, y)
    .lineTo(x, y + radius)
    .lineTo(x - radius, y)
    .closePath();
}

function drawB2PostureGlyph(graphics: Graphics, x: number, y: number, posture: UnitPosture, color: number): void {
  if (posture === 'standing') graphics.moveTo(x, y - 4).lineTo(x, y + 4);
  else if (posture === 'crouched') graphics.moveTo(x - 4, y - 2).lineTo(x, y + 3).lineTo(x + 4, y - 2);
  else graphics.moveTo(x - 4, y).lineTo(x + 4, y);
  graphics.stroke({ width: 2, color, alpha: 1 });
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
  canonicalThreatKey?: string | CanonicalWorldThreatSetSnapshot,
): string {
  const key = typeof canonicalThreatKey === 'string' ? canonicalThreatKey : canonicalThreatKey?.key;
  return buildSharedAwarenessWorldKey(state, unit, key);
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
    const cell = cells[cellIndex]!;
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
      if (value >= 70) { red = 0xe8; green = 0x3d; blue = 0x32; }
      else if (value >= 40) { red = 0xff; green = 0x7a; blue = 0x31; }
      else { red = 0xf2; green = 0xc8; blue = 0x4b; }
    } else if (value >= 75) { red = 0x1c; green = 0x6b; blue = 0x45; }
    else if (value >= 50) { red = 0x3d; green = 0xa8; blue = 0x5f; }
    else if (value >= 25) { red = 0xd7; green = 0xb9; blue = 0x4b; }
    else { red = 0xd9; green = 0x77; blue = 0x32; }
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

function postureLabel(posture: UnitPosture): string {
  if (posture === 'standing') return 'СТОЯ';
  if (posture === 'crouched') return 'СИДЯ';
  return 'ЛЁЖА';
}

function roundMs(value: number): number {
  return Math.round(value * 100) / 100;
}
