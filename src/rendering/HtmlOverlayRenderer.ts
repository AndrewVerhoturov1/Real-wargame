import type { WorldPosition } from '../core/geometry';
import { getCell, gridToWorld } from '../core/map/MapModel';
import type { SimulationState } from '../core/simulation/SimulationState';
import { getMapObjectSpatialIndex } from '../core/spatial/MapObjectSpatialIndex';
import { sampleSmoothHeightLevel } from '../core/terrain/SmoothTerrain';
import { getVisibilityProbeResult } from '../core/visibility/VisibilityProbeService';
import type { Locale } from '../i18n';

export interface ScreenProjector {
  worldToScreen(world: WorldPosition): WorldPosition;
}

export interface HtmlOverlayDiagnostics {
  activeLabelCount: number;
  heightLabelCount: number;
  objectLabelCount: number;
  visibleCellCount: number;
  heightLabelsCulledByZoom: boolean;
}

type HtmlOverlayDebugWindow = Window & {
  __realWargameHtmlOverlayDebug?: HtmlOverlayDiagnostics;
};

interface VisibleGridBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  zoom: number;
}

const MIN_VISIBLE_SMOOTH_HEIGHT = 0.35;
const MIN_HEIGHT_LABEL_ZOOM = 0.7;
const MAX_HEIGHT_LABELS = 500;
const VIEWPORT_MARGIN_CELLS = 1;

export class HtmlOverlayRenderer {
  private readonly container = document.createElement('div');
  private readonly labels = new Map<string, HTMLDivElement>();
  private readonly diagnostics: HtmlOverlayDiagnostics = {
    activeLabelCount: 0,
    heightLabelCount: 0,
    objectLabelCount: 0,
    visibleCellCount: 0,
    heightLabelsCulledByZoom: false,
  };

  constructor(private readonly root: HTMLElement, private readonly projector: ScreenProjector) {
    this.container.className = 'html-map-overlay';
    this.root.appendChild(this.container);
    this.publishDiagnostics();
  }

  render(state: SimulationState, locale: Locale, showHeightLabels = false): void {
    const visibleKeys = new Set<string>();
    const selectedIds = new Set(state.selectedUnitIds);
    const showObjectLabels = state.editor.layers.objects && state.editor.enabled;
    const showUnitLabels = state.editor.layers.units && !state.editor.enabled;
    const visibleBounds = getVisibleGridBounds(this.root, this.projector, state);
    let heightLabelCount = 0;
    let objectLabelCount = 0;

    this.diagnostics.visibleCellCount = Math.max(0, visibleBounds.maxX - visibleBounds.minX + 1)
      * Math.max(0, visibleBounds.maxY - visibleBounds.minY + 1);
    this.diagnostics.heightLabelsCulledByZoom = showHeightLabels && visibleBounds.zoom < MIN_HEIGHT_LABEL_ZOOM;

    if (showHeightLabels && visibleBounds.zoom >= MIN_HEIGHT_LABEL_ZOOM) {
      outer: for (let y = visibleBounds.minY; y <= visibleBounds.maxY; y += 1) {
        for (let x = visibleBounds.minX; x <= visibleBounds.maxX; x += 1) {
          const cell = getCell(state.map, x, y);
          if (!cell) continue;
          const smoothHeight = sampleSmoothHeightLevel(state.map, x + 0.5, y + 0.5);
          if (Math.abs(smoothHeight) < MIN_VISIBLE_SMOOTH_HEIGHT) continue;

          const key = `height:${x}:${y}`;
          visibleKeys.add(key);
          const label = this.getLabel(key, 'map-height-label');
          const screen = this.projector.worldToScreen({
            x: x * state.map.cellSize + 5,
            y: y * state.map.cellSize + 4,
          });

          updateLabelText(label, formatSmoothHeight(smoothHeight));
          placeLabel(label, screen.x, screen.y);
          heightLabelCount += 1;
          if (heightLabelCount >= MAX_HEIGHT_LABELS) break outer;
        }
      }
    }

    if (showObjectLabels) {
      const objects = getMapObjectSpatialIndex(state.map).queryRect({
        minX: visibleBounds.minX,
        minY: visibleBounds.minY,
        maxX: visibleBounds.maxX + 1,
        maxY: visibleBounds.maxY + 1,
      });
      for (const object of objects) {
        if (!object.labels) continue;

        const key = `object:${object.id}`;
        visibleKeys.add(key);
        const label = this.getLabel(key, 'map-object-label');
        const screen = this.projector.worldToScreen({
          x: (object.x + 0.5) * state.map.cellSize,
          y: (object.y + object.heightCells / 2 + 0.65) * state.map.cellSize,
        });

        updateLabelText(label, object.labels[locale]);
        placeLabel(label, screen.x, screen.y);
        objectLabelCount += 1;
      }
    }

    if (showUnitLabels) {
      for (const unit of state.units) {
        const world = gridToWorld(state.map, unit.position);
        const screen = this.projector.worldToScreen({ x: world.x, y: world.y + 22 });
        if (!isNearViewport(this.root, screen)) continue;

        const key = `unit:${unit.id}`;
        visibleKeys.add(key);
        const label = this.getLabel(key, selectedIds.has(unit.id) ? 'unit-label unit-label-selected' : 'unit-label');
        updateLabelText(label, unit.labels[locale]);
        placeLabel(label, screen.x, screen.y);
      }
    }

    this.renderAiSpeechLabels(state, locale, visibleKeys);
    this.renderVisibilityProbeLabel(state, visibleKeys);

    for (const [key, label] of this.labels) {
      if (!visibleKeys.has(key)) {
        label.remove();
        this.labels.delete(key);
      }
    }

    this.diagnostics.activeLabelCount = this.labels.size;
    this.diagnostics.heightLabelCount = heightLabelCount;
    this.diagnostics.objectLabelCount = objectLabelCount;
    this.publishDiagnostics();
  }

  destroy(): void {
    this.container.remove();
    this.labels.clear();
    delete (window as HtmlOverlayDebugWindow).__realWargameHtmlOverlayDebug;
  }

  private renderAiSpeechLabels(state: SimulationState, locale: Locale, visibleKeys: Set<string>): void {
    const nowMs = Date.now();

    for (const unit of state.units) {
      if (unit.behaviorRuntime.aiSpeechUntilMs <= nowMs) continue;

      const text = locale === 'ru'
        ? unit.behaviorRuntime.aiSpeechRu ?? unit.behaviorRuntime.aiSpeech
        : unit.behaviorRuntime.aiSpeech ?? unit.behaviorRuntime.aiSpeechRu;
      if (!text) continue;

      const world = gridToWorld(state.map, unit.position);
      const screen = this.projector.worldToScreen({ x: world.x, y: world.y - 28 });
      if (!isNearViewport(this.root, screen)) continue;

      const key = `unit-speech:${unit.id}`;
      visibleKeys.add(key);
      const label = this.getLabel(key, 'unit-speech-label');
      updateLabelText(label, text);
      placeLabel(label, screen.x, screen.y);
    }
  }

  private renderVisibilityProbeLabel(state: SimulationState, visibleKeys: Set<string>): void {
    const result = getVisibilityProbeResult(state);
    if (!result) return;

    const key = 'line-of-sight:label';
    visibleKeys.add(key);
    const label = this.getLabel(key, 'los-probe-label');
    const screen = this.projector.worldToScreen({
      x: result.target.x * state.map.cellSize,
      y: result.target.y * state.map.cellSize,
    });
    const text = result.blocked
      ? `До курсора: ${Math.round(result.totalDistanceMeters)} м\nВидно: ${Math.round(result.visibleDistanceMeters)} м\nПреграда: ${result.blockerReasonRu}`
      : `До курсора: ${Math.round(result.totalDistanceMeters)} м\nПрямая видимость есть`;
    const position = getProbeLabelPosition(this.root, screen.x, screen.y);

    updateLabelText(label, text);
    placeLabel(label, position.x, position.y);
  }

  private getLabel(key: string, className: string): HTMLDivElement {
    const current = this.labels.get(key);
    if (current) {
      current.className = className;
      return current;
    }

    const label = document.createElement('div');
    label.className = className;
    this.container.appendChild(label);
    this.labels.set(key, label);
    return label;
  }

  private publishDiagnostics(): void {
    (window as HtmlOverlayDebugWindow).__realWargameHtmlOverlayDebug = { ...this.diagnostics };
  }
}

function getVisibleGridBounds(
  root: HTMLElement,
  projector: ScreenProjector,
  state: SimulationState,
): VisibleGridBounds {
  const origin = projector.worldToScreen({ x: 0, y: 0 });
  const unit = projector.worldToScreen({ x: 1, y: 1 });
  const scaleX = unit.x - origin.x;
  const scaleY = unit.y - origin.y;
  const zoom = Math.max(0.0001, (Math.abs(scaleX) + Math.abs(scaleY)) / 2);
  if (Math.abs(scaleX) < 0.0001 || Math.abs(scaleY) < 0.0001) {
    return { minX: 0, minY: 0, maxX: state.map.width - 1, maxY: state.map.height - 1, zoom };
  }

  const rootWidth = root.clientWidth || window.innerWidth;
  const rootHeight = root.clientHeight || window.innerHeight;
  const worldX1 = (0 - origin.x) / scaleX;
  const worldX2 = (rootWidth - origin.x) / scaleX;
  const worldY1 = (0 - origin.y) / scaleY;
  const worldY2 = (rootHeight - origin.y) / scaleY;
  const minX = Math.floor(Math.min(worldX1, worldX2) / state.map.cellSize) - VIEWPORT_MARGIN_CELLS;
  const maxX = Math.ceil(Math.max(worldX1, worldX2) / state.map.cellSize) + VIEWPORT_MARGIN_CELLS;
  const minY = Math.floor(Math.min(worldY1, worldY2) / state.map.cellSize) - VIEWPORT_MARGIN_CELLS;
  const maxY = Math.ceil(Math.max(worldY1, worldY2) / state.map.cellSize) + VIEWPORT_MARGIN_CELLS;

  return {
    minX: clampInt(minX, 0, state.map.width - 1),
    minY: clampInt(minY, 0, state.map.height - 1),
    maxX: clampInt(maxX, 0, state.map.width - 1),
    maxY: clampInt(maxY, 0, state.map.height - 1),
    zoom,
  };
}

function isNearViewport(root: HTMLElement, screen: WorldPosition): boolean {
  const margin = 80;
  const width = root.clientWidth || window.innerWidth;
  const height = root.clientHeight || window.innerHeight;
  return screen.x >= -margin && screen.y >= -margin && screen.x <= width + margin && screen.y <= height + margin;
}

function formatSmoothHeight(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  const normalized = Math.abs(rounded) < 0.05 ? 0 : rounded;
  return `${normalized > 0 ? '+' : ''}${normalized.toFixed(1)}`;
}

function updateLabelText(label: HTMLElement, text: string): void {
  if (label.textContent !== text) label.textContent = text;
}

function placeLabel(label: HTMLElement, x: number, y: number): void {
  const nextTransform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  if (label.style.transform !== nextTransform) label.style.transform = nextTransform;
}

function getProbeLabelPosition(root: HTMLElement, x: number, y: number): WorldPosition {
  const rightPanelWidth = 370;
  const labelWidth = 270;
  const labelHeight = 72;
  const margin = 14;
  const rootWidth = root.clientWidth || window.innerWidth;
  const rootHeight = root.clientHeight || window.innerHeight;
  const rightSafeLimit = Math.max(margin, rootWidth - rightPanelWidth - labelWidth);
  const preferredX = x > rightSafeLimit ? x - labelWidth - margin : x + 10;
  const preferredY = y + 10;

  return {
    x: clamp(preferredX, margin, Math.max(margin, rootWidth - labelWidth - margin)),
    y: clamp(preferredY, margin, Math.max(margin, rootHeight - labelHeight - margin)),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clampInt(value: number, min: number, max: number): number {
  return Math.round(clamp(value, min, max));
}
