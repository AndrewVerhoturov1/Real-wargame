export {};

const DEBUG_STORAGE_KEY = 'real-wargame.ai-node-editor.debug.v1';
const REFRESH_INTERVAL_MS = 700;
let scheduled = false;
let lastSignature = '';

const observer = new MutationObserver(() => scheduleRender());
observer.observe(document.body, { childList: true, subtree: true });
window.addEventListener('storage', (event) => {
  if (event.key === DEBUG_STORAGE_KEY) scheduleRender(true);
});
window.setInterval(() => scheduleRender(), REFRESH_INTERVAL_MS);
scheduleRender(true);

function scheduleRender(force = false): void {
  if (scheduled && !force) return;
  scheduled = true;
  window.requestAnimationFrame(() => {
    scheduled = false;
    renderMoveDetails();
  });
}

function renderMoveDetails(): void {
  const panel = document.querySelector<HTMLElement>('.ai-runtime-debug-panel');
  if (!panel) return;
  const payload = readPayload();
  const signature = payload
    ? `${payload.nowMs}:${payload.targetKey ?? ''}:${payload.targetPosition?.x ?? ''}:${payload.targetPosition?.y ?? ''}:${payload.distanceRemainingCells ?? ''}`
    : 'empty';
  const existing = panel.querySelector<HTMLElement>('.stateful-move-debug-details');
  if (signature === lastSignature && existing) return;

  existing?.remove();
  lastSignature = signature;
  if (!payload?.targetKey || !payload.targetPosition) return;

  const list = panel.querySelector<HTMLDListElement>('dl');
  if (!list) return;
  const fragment = document.createElement('div');
  fragment.className = 'stateful-move-debug-details';
  fragment.innerHTML = `
    <div><dt>Цель из памяти</dt><dd>${escapeHtml(payload.targetKey)}</dd></div>
    <div><dt>Координаты цели</dt><dd>${formatCoordinate(payload.targetPosition.x)}; ${formatCoordinate(payload.targetPosition.y)}</dd></div>
    ${typeof payload.distanceRemainingCells === 'number'
      ? `<div><dt>Осталось</dt><dd>${payload.distanceRemainingCells.toFixed(1)} клетки</dd></div>`
      : ''}
  `;
  list.appendChild(fragment);
}

interface MoveDebugPayload {
  readonly nowMs: number;
  readonly targetKey?: string;
  readonly targetPosition?: { x: number; y: number };
  readonly distanceRemainingCells?: number;
}

function readPayload(): MoveDebugPayload | null {
  try {
    const raw = window.localStorage.getItem(DEBUG_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (parsed.kind !== 'ai-graph-runtime-debug') return null;
    const target = readPosition(parsed.targetPosition);
    return {
      nowMs: typeof parsed.nowMs === 'number' ? parsed.nowMs : 0,
      targetKey: typeof parsed.targetKey === 'string' ? parsed.targetKey : undefined,
      targetPosition: target ?? undefined,
      distanceRemainingCells: typeof parsed.distanceRemainingCells === 'number' && Number.isFinite(parsed.distanceRemainingCells)
        ? Math.max(0, parsed.distanceRemainingCells)
        : undefined,
    };
  } catch {
    return null;
  }
}

function readPosition(value: unknown): { x: number; y: number } | null {
  if (typeof value !== 'object' || value === null || !('x' in value) || !('y' in value)) return null;
  const x = (value as { x?: unknown }).x;
  const y = (value as { y?: unknown }).y;
  return typeof x === 'number' && Number.isFinite(x) && typeof y === 'number' && Number.isFinite(y)
    ? { x, y }
    : null;
}

function formatCoordinate(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
