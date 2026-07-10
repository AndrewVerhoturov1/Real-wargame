import type { WorldPosition } from '../core/geometry';
import { gridToWorld } from '../core/map/MapModel';
import { getSelectedUnit, type SimulationState } from '../core/simulation/SimulationState';
import { getVisibilityProbeState } from '../core/ui/RuntimeUiState';
import { computeLineOfSight } from '../core/visibility/LineOfSight';
import type { Locale } from '../i18n';

export interface ScreenProjector {
  worldToScreen(world: WorldPosition): WorldPosition;
}

export class HtmlOverlayRenderer {
  private readonly container = document.createElement('div');
  private readonly labels = new Map<string, HTMLDivElement>();

  constructor(private readonly root: HTMLElement, private readonly projector: ScreenProjector) {
    this.container.className = 'html-map-overlay';
    this.root.appendChild(this.container);
  }

  render(state: SimulationState, locale: Locale, showHeightLabels = false): void {
    const visibleKeys = new Set<string>();
    const selectedIds = new Set(state.selectedUnitIds);
    const showObjectLabels = state.editor.layers.objects && state.editor.enabled;
    const showUnitLabels = state.editor.layers.units && !state.editor.enabled;

    if (showHeightLabels) {
      for (const cell of state.map.cells) {
        if (cell.height === 0) continue;

        const key = `height:${cell.x}:${cell.y}`;
        visibleKeys.add(key);
        const label = this.getLabel(key, 'map-height-label');
        const screen = this.projector.worldToScreen({
          x: cell.x * state.map.cellSize + 5,
          y: cell.y * state.map.cellSize + 4,
        });

        updateLabelText(label, cell.height > 0 ? `+${cell.height}` : `${cell.height}`);
        placeLabel(label, screen.x, screen.y);
      }
    }

    if (showObjectLabels) {
      for (const object of state.map.objects) {
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
      }
    }

    if (showUnitLabels) {
      for (const unit of state.units) {
        const key = `unit:${unit.id}`;
        visibleKeys.add(key);
        const label = this.getLabel(key, selectedIds.has(unit.id) ? 'unit-label unit-label-selected' : 'unit-label');
        const world = gridToWorld(state.map, unit.position);
        const screen = this.projector.worldToScreen({
          x: world.x,
          y: world.y + 22,
        });

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
  }

  destroy(): void {
    this.container.remove();
    this.labels.clear();
  }

  private renderAiSpeechLabels(state: SimulationState, locale: Locale, visibleKeys: Set<string>): void {
    const nowMs = Date.now();

    for (const unit of state.units) {
      if (unit.behaviorRuntime.aiSpeechUntilMs <= nowMs) continue;

      const text = locale === 'ru'
        ? unit.behaviorRuntime.aiSpeechRu ?? unit.behaviorRuntime.aiSpeech
        : unit.behaviorRuntime.aiSpeech ?? unit.behaviorRuntime.aiSpeechRu;

      if (!text) continue;

      const key = `unit-speech:${unit.id}`;
      visibleKeys.add(key);
      const label = this.getLabel(key, 'unit-speech-label');
      const world = gridToWorld(state.map, unit.position);
      const screen = this.projector.worldToScreen({
        x: world.x,
        y: world.y - 28,
      });

      updateLabelText(label, text);
      placeLabel(label, screen.x, screen.y);
    }
  }

  private renderVisibilityProbeLabel(state: SimulationState, visibleKeys: Set<string>): void {
    const probe = getVisibilityProbeState(state);
    const unit = getSelectedUnit(state);

    if (!probe.active || !probe.target || !unit) return;

    const key = 'line-of-sight:label';
    visibleKeys.add(key);
    const result = computeLineOfSight(state.map, unit, probe.target);
    const label = this.getLabel(key, 'los-probe-label');
    const screen = this.projector.worldToScreen({
      x: probe.target.x * state.map.cellSize,
      y: probe.target.y * state.map.cellSize,
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
