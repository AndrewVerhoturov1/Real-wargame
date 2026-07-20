import type { SimulationState } from '../core/simulation/SimulationState';
import {
  buildCellInspectorContent,
  resolveCellInspectorLayer,
  type CellInspectorContent,
} from './CellInspectorContent';
import { buildCachedMemoryCellInspectorContent } from './CellInspectorMemoryContent';
import { resolveCellInspectorTarget } from './CellInspectorTarget';

const REFRESH_INTERVAL_MS = 250;
const POINTER_OFFSET_X = 18;
const POINTER_OFFSET_Y = 18;
const VIEWPORT_MARGIN = 12;

export function installCellInspector(state: SimulationState): () => void {
  const canvas = document.querySelector<HTMLCanvasElement>('canvas');
  if (!canvas) return () => undefined;

  const popover = document.createElement('aside');
  popover.className = 'cell-inspector-popover';
  popover.dataset.role = 'cell-inspector';
  popover.setAttribute('aria-live', 'polite');
  popover.hidden = true;
  document.body.append(popover);

  let controlHeld = false;
  let pointerInside = false;
  let pointerClientX = 0;
  let pointerClientY = 0;
  let refreshTimer = 0;
  let lastRenderKey = '';
  let snappedUnitId: string | null = null;

  const hide = (): void => {
    popover.hidden = true;
    lastRenderKey = '';
    snappedUnitId = null;
    delete popover.dataset.snappedUnitId;
  };

  const stopRefreshTimer = (): void => {
    if (refreshTimer === 0) return;
    window.clearInterval(refreshTimer);
    refreshTimer = 0;
  };

  const refresh = (): void => {
    if (!controlHeld || !pointerInside || state.editor.enabled || !state.mouseGridPosition) {
      hide();
      return;
    }

    const target = resolveCellInspectorTarget(state, state.mouseGridPosition, snappedUnitId);
    snappedUnitId = target.snappedUnitId;
    const layer = resolveCellInspectorLayer(state);
    const rawContent = layer === 'memory'
      ? buildCachedMemoryCellInspectorContent(state, target.cellX, target.cellY)
      : buildCellInspectorContent(state, layer, target.cellX, target.cellY);
    if (!rawContent) {
      hide();
      return;
    }

    const content = target.snappedUnitLabel
      ? withSnapContext(rawContent, target.snappedUnitLabel)
      : rawContent;
    if (target.snappedUnitId) popover.dataset.snappedUnitId = target.snappedUnitId;
    else delete popover.dataset.snappedUnitId;

    const renderKey = JSON.stringify(content);
    if (renderKey !== lastRenderKey) {
      popover.dataset.layer = content.layer;
      popover.innerHTML = renderContent(content);
      lastRenderKey = renderKey;
    }
    popover.hidden = false;
    positionPopover(popover, pointerClientX, pointerClientY);
  };

  const startRefreshTimer = (): void => {
    if (refreshTimer !== 0) return;
    refreshTimer = window.setInterval(refresh, REFRESH_INTERVAL_MS);
  };

  const handlePointerMove = (event: PointerEvent): void => {
    pointerInside = true;
    pointerClientX = event.clientX;
    pointerClientY = event.clientY;
    if (controlHeld) refresh();
  };

  const handlePointerLeave = (): void => {
    pointerInside = false;
    hide();
  };

  const handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Control' || event.repeat || controlHeld) return;
    controlHeld = true;
    startRefreshTimer();
    refresh();
  };

  const handleKeyUp = (event: KeyboardEvent): void => {
    if (event.key !== 'Control') return;
    controlHeld = false;
    stopRefreshTimer();
    hide();
  };

  const handleBlur = (): void => {
    controlHeld = false;
    stopRefreshTimer();
    hide();
  };

  canvas.addEventListener('pointermove', handlePointerMove);
  canvas.addEventListener('pointerleave', handlePointerLeave);
  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('keyup', handleKeyUp);
  window.addEventListener('blur', handleBlur);

  return () => {
    stopRefreshTimer();
    snappedUnitId = null;
    canvas.removeEventListener('pointermove', handlePointerMove);
    canvas.removeEventListener('pointerleave', handlePointerLeave);
    window.removeEventListener('keydown', handleKeyDown);
    window.removeEventListener('keyup', handleKeyUp);
    window.removeEventListener('blur', handleBlur);
    popover.remove();
  };
}

function withSnapContext(content: CellInspectorContent, unitLabel: string): CellInspectorContent {
  const snapNote = `Привязано к бойцу «${unitLabel}»: показана клетка, в которой он находится.`;
  return {
    ...content,
    note: content.note ? `${content.note} ${snapNote}` : snapNote,
  };
}

function renderContent(content: CellInspectorContent): string {
  const reasons = content.reasons.length > 0
    ? `<div class="cell-inspector-reasons">${content.reasons.map((reason) => `<p>${escapeHtml(reason)}</p>`).join('')}</div>`
    : '';
  const metrics = content.metrics.length > 0
    ? `<dl class="cell-inspector-metrics">${content.metrics.map((metric) => (
      `<div><dt>${escapeHtml(metric.label)}</dt><dd>${escapeHtml(metric.value)}</dd></div>`
    )).join('')}</dl>`
    : '';
  const note = content.note ? `<p class="cell-inspector-note">${escapeHtml(content.note)}</p>` : '';
  return `
    <header class="cell-inspector-header">
      <span>${escapeHtml(content.title)}</span>
      <strong>${escapeHtml(content.value)}</strong>
      <em>${escapeHtml(content.level)}</em>
    </header>
    ${reasons}
    ${metrics}
    ${note}
  `;
}

function positionPopover(popover: HTMLElement, clientX: number, clientY: number): void {
  const width = popover.offsetWidth || 300;
  const height = popover.offsetHeight || 160;
  let left = clientX + POINTER_OFFSET_X;
  let top = clientY + POINTER_OFFSET_Y;
  if (left + width + VIEWPORT_MARGIN > window.innerWidth) left = clientX - width - POINTER_OFFSET_X;
  if (top + height + VIEWPORT_MARGIN > window.innerHeight) top = clientY - height - POINTER_OFFSET_Y;
  popover.style.left = `${Math.max(VIEWPORT_MARGIN, left)}px`;
  popover.style.top = `${Math.max(VIEWPORT_MARGIN, top)}px`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[character] ?? character));
}
