import type { WorldPosition } from '../core/geometry';
import { gridToWorld } from '../core/map/MapModel';
import type { SimulationState } from '../core/simulation/SimulationState';
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

  render(state: SimulationState, locale: Locale): void {
    const visibleKeys = new Set<string>();
    const selectedIds = new Set(state.selectedUnitIds);

    for (const cell of state.map.cells) {
      if (cell.height === 0) {
        continue;
      }

      const key = `height:${cell.x}:${cell.y}`;
      visibleKeys.add(key);
      const label = this.getLabel(key, 'map-height-label');
      const screen = this.projector.worldToScreen({
        x: cell.x * state.map.cellSize + 5,
        y: cell.y * state.map.cellSize + 4,
      });

      label.textContent = cell.height > 0 ? `+${cell.height}` : `${cell.height}`;
      placeLabel(label, screen.x, screen.y);
    }

    for (const object of state.map.objects) {
      if (!object.labels) {
        continue;
      }

      const key = `object:${object.id}`;
      visibleKeys.add(key);
      const label = this.getLabel(key, 'map-object-label');
      const screen = this.projector.worldToScreen({
        x: (object.x + 0.5) * state.map.cellSize,
        y: (object.y + object.heightCells / 2 + 0.65) * state.map.cellSize,
      });

      label.textContent = object.labels[locale];
      placeLabel(label, screen.x, screen.y);
    }

    for (const unit of state.units) {
      const key = `unit:${unit.id}`;
      visibleKeys.add(key);
      const label = this.getLabel(key, selectedIds.has(unit.id) ? 'unit-label unit-label-selected' : 'unit-label');
      const world = gridToWorld(state.map, unit.position);
      const screen = this.projector.worldToScreen({
        x: world.x,
        y: world.y + 22,
      });

      label.textContent = unit.labels[locale];
      placeLabel(label, screen.x, screen.y);
    }

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

function placeLabel(label: HTMLElement, x: number, y: number): void {
  label.style.transform = `translate3d(${x}px, ${y}px, 0)`;
}
