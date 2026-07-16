import '../tactical-order-radial-menu.css';
import type { GridPosition } from '../core/geometry';
import {
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
  private readonly targetLabel = document.createElement('span');
  private readonly items = new Map<TacticalOrderPresetId, HTMLElement>();
  private anchor: ScreenPoint | null = null;
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
        <small>${escapeHtml(definition.menuHintRu)}</small>
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
    center.innerHTML = '<strong>Отмена</strong><small>верните курсор в центр</small>';
    ring.append(center);

    this.targetLabel.className = 'tactical-order-radial-target';
    this.root.append(this.targetLabel);
    document.body.append(this.root);
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  show(anchor: ScreenPoint, target: GridPosition): void {
    this.anchor = { ...anchor };
    const center = clampTacticalOrderMenuCenter(anchor, window.innerWidth, window.innerHeight);
    this.root.style.left = `${center.x}px`;
    this.root.style.top = `${center.y}px`;
    this.root.style.setProperty('--tactical-order-anchor-offset-x', `${anchor.x - center.x}px`);
    this.root.style.setProperty('--tactical-order-anchor-offset-y', `${anchor.y - center.y}px`);
    this.targetLabel.textContent = `Цель приказа: ${target.x.toFixed(1)}, ${target.y.toFixed(1)}`;
    this.root.hidden = false;
    this.root.classList.toggle('is-clamped', center.x !== anchor.x || center.y !== anchor.y);
    this.updateHighlighted(null);
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
  }

  selectByKeyboard(presetId: TacticalOrderPresetId): void {
    if (!this.visible) return;
    this.updateHighlighted(presetId);
  }

  getHighlightedPresetId(): TacticalOrderPresetId | null {
    return this.highlightedPresetId;
  }

  hide(): void {
    this.root.hidden = true;
    this.anchor = null;
    this.highlightedPresetId = null;
    this.root.dataset.highlightedPreset = '';
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
