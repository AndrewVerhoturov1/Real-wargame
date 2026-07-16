import '../tactical-order-radial-menu.css';
import type { GridPosition } from '../core/geometry';
import {
  getTacticalOrderPresetDefinition,
  listTacticalOrderPresetDefinitions,
  type TacticalOrderPresetId,
} from '../core/orders/TacticalOrderIntent';
import {
  clampTacticalOrderMenuCenter,
  TACTICAL_ORDER_OUTER_RADIUS_PX,
  type ScreenPoint,
} from './TacticalOrderRadialGesture';

export class TacticalOrderRadialMenu {
  private readonly root = document.createElement('div');
  private readonly activeHint = document.createElement('div');
  private readonly targetLabel = document.createElement('span');
  private readonly items = new Map<TacticalOrderPresetId, HTMLElement>();
  private highlightedPresetId: TacticalOrderPresetId | null = null;

  constructor() {
    this.root.className = 'tactical-order-radial-menu';
    this.root.dataset.role = 'tactical-order-radial-menu';
    this.root.setAttribute('role', 'menu');
    this.root.setAttribute('aria-label', 'Выбор тактического приказа');
    this.root.hidden = true;

    const ring = document.createElement('div');
    ring.className = 'tactical-order-radial-ring';
    this.root.append(ring);

    for (const definition of listTacticalOrderPresetDefinitions()) {
      const item = document.createElement('div');
      item.className = `tactical-order-radial-sector tactical-order-sector-${definition.id}`;
      item.dataset.presetId = definition.id;
      item.setAttribute('role', 'menuitem');
      item.setAttribute('aria-label', `${definition.nameRu}. ${definition.shortDescriptionRu}`);
      item.innerHTML = `
        <span class="tactical-order-sector-icon" aria-hidden="true">${escapeHtml(definition.icon)}</span>
        <strong>${escapeHtml(definition.nameRu)}</strong>
        <kbd>${definition.id === 'move' ? '1' : definition.id === 'recon' ? '2' : '3'}</kbd>
      `;
      ring.append(item);
      this.items.set(definition.id, item);
    }

    const center = document.createElement('div');
    center.className = 'tactical-order-radial-center';
    center.dataset.role = 'tactical-order-cancel';
    center.setAttribute('role', 'menuitem');
    center.setAttribute('aria-label', 'Отмена приказа');
    center.innerHTML = '<strong>Отмена</strong><small>центр</small>';
    ring.append(center);

    this.activeHint.className = 'tactical-order-active-hint';
    this.root.append(this.activeHint);

    this.targetLabel.className = 'tactical-order-radial-target';
    this.root.append(this.targetLabel);
    document.body.append(this.root);
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  show(anchor: ScreenPoint, target: GridPosition): ScreenPoint {
    const center = clampTacticalOrderMenuCenter(anchor, window.innerWidth, window.innerHeight);
    this.root.style.left = `${center.x}px`;
    this.root.style.top = `${center.y}px`;
    this.root.style.setProperty('--tactical-order-anchor-offset-x', `${anchor.x - center.x}px`);
    this.root.style.setProperty('--tactical-order-anchor-offset-y', `${anchor.y - center.y}px`);
    this.root.dataset.menuCenterX = String(center.x);
    this.root.dataset.menuCenterY = String(center.y);
    this.root.dataset.targetX = String(target.x);
    this.root.dataset.targetY = String(target.y);
    this.targetLabel.textContent = `Цель: ${target.x.toFixed(1)}, ${target.y.toFixed(1)}`;
    this.root.hidden = false;
    this.root.classList.toggle('is-clamped', center.x !== anchor.x || center.y !== anchor.y);
    this.updateHighlighted(null);
    return center;
  }

  updateHighlighted(presetId: TacticalOrderPresetId | null): void {
    this.highlightedPresetId = presetId;
    this.root.dataset.highlightedPreset = presetId ?? 'cancel';
    for (const [id, item] of this.items) {
      const active = id === presetId;
      item.classList.toggle('active', active);
      item.setAttribute('aria-current', active ? 'true' : 'false');
    }
    this.root.classList.toggle('center-active', presetId === null);
    if (presetId) {
      const definition = getTacticalOrderPresetDefinition(presetId);
      this.activeHint.innerHTML = `<strong>${escapeHtml(definition.nameRu)}</strong><span>${escapeHtml(definition.menuHintRu)}</span>`;
    } else {
      this.activeHint.innerHTML = '<strong>Отмена</strong><span>центр или за кольцом</span>';
    }
  }

  getHighlightedPresetId(): TacticalOrderPresetId | null {
    return this.highlightedPresetId;
  }

  hide(): void {
    this.root.hidden = true;
    this.highlightedPresetId = null;
    this.root.dataset.highlightedPreset = '';
    delete this.root.dataset.menuCenterX;
    delete this.root.dataset.menuCenterY;
    delete this.root.dataset.targetX;
    delete this.root.dataset.targetY;
  }

  destroy(): void {
    this.hide();
    this.root.remove();
  }
}

export function tacticalOrderPresetFromKeyboard(key: string): TacticalOrderPresetId | null {
  if (key === '1') return 'move';
  if (key === '2') return 'recon';
  if (key === '3') return 'assault';
  return null;
}

export function tacticalOrderMenuOuterRadiusPx(): number {
  return TACTICAL_ORDER_OUTER_RADIUS_PX;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
