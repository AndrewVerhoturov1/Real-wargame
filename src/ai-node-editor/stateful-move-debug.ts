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
    ? [
        payload.nowMs,
        payload.targetKey ?? '',
        payload.targetPosition?.x ?? '',
        payload.targetPosition?.y ?? '',
        payload.distanceRemainingCells ?? '',
        payload.routeStatus ?? '',
        payload.routeNoProgressMs ?? '',
        payload.routeAbortCode ?? '',
        payload.routeAbortReasonRu ?? '',
      ].join(':')
    : 'empty';
  const existingRows = Array.from(panel.querySelectorAll<HTMLElement>('.stateful-move-debug-row'));
  if (signature === lastSignature && existingRows.length > 0) return;

  existingRows.forEach((row) => row.remove());
  lastSignature = signature;
  if (!payload) return;

  const list = panel.querySelector<HTMLDListElement>('dl');
  if (!list) return;

  if (payload.targetKey && payload.targetPosition) {
    list.appendChild(makeRow('Цель из памяти', payload.targetKey));
    list.appendChild(makeRow(
      'Координаты цели',
      `${formatCoordinate(payload.targetPosition.x)}; ${formatCoordinate(payload.targetPosition.y)}`,
    ));
    if (typeof payload.distanceRemainingCells === 'number') {
      list.appendChild(makeRow('Осталось', `${payload.distanceRemainingCells.toFixed(1)} клетки`));
    }
  }

  if (payload.routeStatus) {
    list.appendChild(makeRow('Маршрут', routeStatusLabel(payload.routeStatus)));
    if (typeof payload.routeNoProgressMs === 'number') {
      list.appendChild(makeRow('Без прогресса', `${(payload.routeNoProgressMs / 1000).toFixed(1)} сек.`));
    }
    if (payload.routeAbortReasonRu) {
      list.appendChild(makeRow('Причина прерывания', payload.routeAbortReasonRu));
    }
  }
}

function makeRow(label: string, value: string): HTMLDivElement {
  const row = document.createElement('div');
  row.className = 'stateful-move-debug-row';
  const term = document.createElement('dt');
  term.textContent = label;
  const description = document.createElement('dd');
  description.textContent = value;
  row.append(term, description);
  return row;
}

interface MoveDebugPayload {
  readonly nowMs: number;
  readonly targetKey?: string;
  readonly targetPosition?: { x: number; y: number };
  readonly distanceRemainingCells?: number;
  readonly routeStatus?: string;
  readonly routeNoProgressMs?: number;
  readonly routeAbortCode?: string;
  readonly routeAbortReasonRu?: string;
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
      distanceRemainingCells: readNonNegativeNumber(parsed.distanceRemainingCells),
      routeStatus: typeof parsed.routeStatus === 'string' ? parsed.routeStatus : undefined,
      routeNoProgressMs: readNonNegativeNumber(parsed.routeNoProgressMs),
      routeAbortCode: typeof parsed.routeAbortCode === 'string' ? parsed.routeAbortCode : undefined,
      routeAbortReasonRu: typeof parsed.routeAbortReasonRu === 'string' ? parsed.routeAbortReasonRu : undefined,
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

function readNonNegativeNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, value)
    : undefined;
}

function routeStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    idle: 'Нет маршрута',
    moving: 'Движение',
    stalled: 'Нет прогресса',
    blocked: 'Заблокирован',
    arrived: 'Цель достигнута',
    player_override: 'Новый приказ игрока',
    target_lost: 'Цель потеряна',
    order_missing: 'Приказ движения исчез',
    cancelled: 'Отменён',
  };
  return labels[status] ?? status;
}

function formatCoordinate(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
