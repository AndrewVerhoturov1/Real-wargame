import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { PerceptionContactMemory } from '../core/perception/PerceptionContact';
import { getSelectedUnit, type SimulationState } from '../core/simulation/SimulationState';
import { getAttentionOverlayState } from '../core/ui/RuntimeUiState';
const UNSEEN_OVERLAY_COLOR = 0x101820;
const UNSEEN_OVERLAY_ALPHA = 0.52;

import {
  getSelectedUnitVisibilityField,
  getVisibilityFieldDiagnostics,
  type SelectedUnitVisibilityField,
} from '../core/visibility/SelectedUnitVisibilityField';

export interface ViewMemoryOverlayDiagnostics {
  representation: 'raster-sprite';
  visible: boolean;
  textureUploadCount: number;
  markerUpdateCount: number;
  markerCount: number;
  displayObjectCount: number;
  fieldRevision: number;
  fieldRebuildCount: number;
  fieldCacheHitCount: number;
  rasterWidth: number;
  rasterHeight: number;
  cachedFieldCount: number;
}

type ViewMemoryDebugWindow = Window & {
  __realWargameViewMemoryDebug?: ViewMemoryOverlayDiagnostics;
  __realWargameAttentionOverlayDebug?: ViewMemoryOverlayDiagnostics;
};

export class PixiVisibilityHeatmapRenderer {
  readonly container = new Container();
  private readonly markerGraphics = new Graphics();
  private rasterCanvas: HTMLCanvasElement | null = null;
  private rasterContext: CanvasRenderingContext2D | null = null;
  private rasterTexture: Texture | null = null;
  private rasterSprite: Sprite | null = null;
  private lastFieldRevision = -1;
  private lastMarkerKey = '';
  private textureUploadCount = 0;
  private markerUpdateCount = 0;
  private markerCount = 0;
  private destroyed = false;

  constructor() {
    this.container.eventMode = 'none';
    this.container.interactiveChildren = false;
    this.markerGraphics.eventMode = 'none';
    this.container.visible = false;
    this.publishDiagnostics(null);
  }

  render(state: SimulationState): void {
    if (this.destroyed) return;
    const overlay = getAttentionOverlayState(state);
    const unit = getSelectedUnit(state);
    if (!overlay.active || !unit || state.editor.enabled) {
      this.container.visible = false;
      this.publishDiagnostics(state);
      return;
    }

    this.container.visible = true;
    const field = overlay.showCurrentView ? getSelectedUnitVisibilityField(state) : null;
    if (field) {
      this.ensureRaster(state.map.width, state.map.height);
      if (field.revision !== this.lastFieldRevision && this.rasterContext && this.rasterTexture && this.rasterSprite) {
        drawVisibilityRaster(this.rasterContext, field, state.map.width, state.map.height);
        this.rasterTexture.source.update();
        this.rasterSprite.position.set(0, 0);
        this.rasterSprite.scale.set(state.map.cellSize, state.map.cellSize);
        this.rasterSprite.visible = true;
        this.lastFieldRevision = field.revision;
        this.textureUploadCount += 1;
      }
    } else if (this.rasterSprite) {
      this.rasterSprite.visible = false;
    }

    const markerKey = [
      unit.id,
      unit.perceptionKnowledge.revision,
      overlay.showMemoryMarkers ? 1 : 0,
      overlay.showCurrentContacts ? 1 : 0,
      overlay.showUncertainty ? 1 : 0,
      overlay.selectedContactId ?? 'none',
      state.map.cellSize,
    ].join(':');
    if (markerKey !== this.lastMarkerKey) {
      this.drawMarkers(state, unit.perceptionKnowledge.contacts);
      this.lastMarkerKey = markerKey;
      this.markerUpdateCount += 1;
    }
    this.publishDiagnostics(state);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.container.removeChildren();
    this.rasterSprite?.destroy();
    this.rasterTexture?.destroy(true);
    this.markerGraphics.destroy();
    this.rasterCanvas = null;
    this.rasterContext = null;
    this.rasterTexture = null;
    this.rasterSprite = null;
    this.container.destroy();
    delete (window as ViewMemoryDebugWindow).__realWargameViewMemoryDebug;
    delete (window as ViewMemoryDebugWindow).__realWargameAttentionOverlayDebug;
  }

  getDiagnostics(state: SimulationState | null): ViewMemoryOverlayDiagnostics {
    const fieldDiagnostics = state ? getVisibilityFieldDiagnostics(state) : null;
    return {
      representation: 'raster-sprite',
      visible: this.container.visible,
      textureUploadCount: this.textureUploadCount,
      markerUpdateCount: this.markerUpdateCount,
      markerCount: this.markerCount,
      displayObjectCount: this.container.children.length,
      fieldRevision: this.lastFieldRevision,
      fieldRebuildCount: fieldDiagnostics?.rebuildCount ?? 0,
      fieldCacheHitCount: fieldDiagnostics?.cacheHitCount ?? 0,
      rasterWidth: this.rasterCanvas?.width ?? 0,
      rasterHeight: this.rasterCanvas?.height ?? 0,
      cachedFieldCount: fieldDiagnostics?.cachedFieldCount ?? 0,
    };
  }

  private ensureRaster(width: number, height: number): void {
    const needsNew = !this.rasterCanvas || this.rasterCanvas.width !== width || this.rasterCanvas.height !== height;
    if (!needsNew) return;
    this.container.removeChildren();
    this.rasterSprite?.destroy();
    this.rasterTexture?.destroy(true);
    this.rasterSprite = null;
    this.rasterTexture = null;
    this.rasterCanvas = document.createElement('canvas');
    this.rasterCanvas.width = width;
    this.rasterCanvas.height = height;
    this.rasterContext = this.rasterCanvas.getContext('2d', { alpha: true });
    this.rasterTexture = Texture.from({ resource: this.rasterCanvas, scaleMode: 'nearest' });
    this.rasterSprite = new Sprite(this.rasterTexture);
    this.container.addChild(this.rasterSprite, this.markerGraphics);
    this.lastFieldRevision = -1;
    this.lastMarkerKey = '';
  }

  private drawMarkers(state: SimulationState, contacts: PerceptionContactMemory[]): void {
    const overlay = getAttentionOverlayState(state);
    const cellSize = state.map.cellSize;
    this.markerGraphics.clear();
    this.markerCount = 0;
    for (const contact of contacts) {
      const current = contact.visibleNow || contact.observedNow;
      if (current && !overlay.showCurrentContacts) continue;
      if (!current && !overlay.showMemoryMarkers) continue;
      drawContactMarker(
        this.markerGraphics,
        contact,
        cellSize,
        contact.id === overlay.selectedContactId,
        overlay.showUncertainty,
      );
      this.markerCount += 1;
    }
  }

  private publishDiagnostics(state: SimulationState | null): void {
    if (typeof window === 'undefined') return;
    const diagnostics = this.getDiagnostics(state);
    (window as ViewMemoryDebugWindow).__realWargameViewMemoryDebug = diagnostics;
    (window as ViewMemoryDebugWindow).__realWargameAttentionOverlayDebug = diagnostics;
  }
}

export function drawVisibilityRaster(
  context: CanvasRenderingContext2D,
  field: SelectedUnitVisibilityField,
  mapWidth = field.width,
  mapHeight = field.height,
): void {
  const image = context.createImageData(mapWidth, mapHeight);
  const unseenRed = (UNSEEN_OVERLAY_COLOR >> 16) & 0xff;
  const unseenGreen = (UNSEEN_OVERLAY_COLOR >> 8) & 0xff;
  const unseenBlue = UNSEEN_OVERLAY_COLOR & 0xff;
  for (let pixel = 0; pixel < image.data.length; pixel += 4) {
    image.data[pixel] = unseenRed;
    image.data[pixel + 1] = unseenGreen;
    image.data[pixel + 2] = unseenBlue;
    image.data[pixel + 3] = Math.round(UNSEEN_OVERLAY_ALPHA * 255);
  }
  for (let index = 0; index < field.quality.length; index += 1) {
    const localX = index % field.width;
    const localY = Math.floor(index / field.width);
    const mapX = field.minCellX + localX;
    const mapY = field.minCellY + localY;
    if (mapX < 0 || mapY < 0 || mapX >= mapWidth || mapY >= mapHeight) continue;
    const quality = field.quality[index] / 255;
    if (quality <= 0.01) continue;
    const color = heatmapColor(quality);
    const pixel = (mapY * mapWidth + mapX) * 4;
    image.data[pixel] = (color >> 16) & 0xff;
    image.data[pixel + 1] = (color >> 8) & 0xff;
    image.data[pixel + 2] = color & 0xff;
    image.data[pixel + 3] = Math.round((0.12 + quality * 0.48) * 255);
  }
  context.putImageData(image, 0, 0);
}

function heatmapColor(quality: number): number {
  if (quality >= 0.82) return 0xffe88a;
  if (quality >= 0.58) return 0x69d7a2;
  if (quality >= 0.32) return 0x4aa9b8;
  return 0x315a78;
}

function drawContactMarker(
  graphics: Graphics,
  contact: PerceptionContactMemory,
  cellSize: number,
  selected: boolean,
  showUncertainty: boolean,
): void {
  const x = contact.lastKnownPosition.x * cellSize;
  const y = contact.lastKnownPosition.y * cellSize;
  const uncertainty = Math.max(5, contact.uncertaintyCells * cellSize);
  const color = contact.visibleNow ? 0xff664f : contact.source === 'sound' ? 0x8ec6ff : 0xf2aa62;
  const alpha = Math.max(0.22, Math.min(0.95, contact.confidence / 100));
  const size = selected ? 10 : 7;
  const stroke = { width: selected ? 3 : 2, color, alpha };
  if (showUncertainty && contact.stage !== 'confirmed') graphics.circle(x, y, uncertainty).stroke(stroke);
  if (contact.stage === 'cue') {
    graphics.circle(x, y, size).stroke(stroke);
    return;
  }
  if (contact.stage === 'suspicion') {
    graphics.circle(x, y, size * 0.65).stroke(stroke);
    return;
  }
  graphics.moveTo(x, y - size);
  graphics.lineTo(x + size, y);
  graphics.lineTo(x, y + size);
  graphics.lineTo(x - size, y);
  graphics.lineTo(x, y - size).stroke(stroke);
  if (contact.stage === 'identified' || contact.stage === 'confirmed') {
    graphics.moveTo(x, y - size + 1).lineTo(x + size - 1, y).lineTo(x, y + size - 1)
      .lineTo(x - size + 1, y).closePath().fill({ color, alpha: alpha * 0.65 });
  }
  if (contact.stage === 'confirmed') {
    graphics.circle(x, y, 2.5).fill({ color: 0xffffff, alpha: 0.95 });
  }
}
