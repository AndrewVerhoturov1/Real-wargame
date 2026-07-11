export {};

const GRAPH_STORAGE_KEY = 'real-wargame.ai-node-editor.graph.v6';
let scheduled = false;

const observer = new MutationObserver(() => scheduleEnhance());
observer.observe(document.body, { childList: true, subtree: true });
scheduleEnhance();

function scheduleEnhance(): void {
  if (scheduled) return;
  scheduled = true;
  window.requestAnimationFrame(() => {
    scheduled = false;
    enhanceSelectedStatefulNode();
  });
}

function enhanceSelectedStatefulNode(): void {
  document.querySelector('.stateful-node-human-panel')?.remove();
  const selected = document.querySelector<HTMLElement>('.graph-node.selected[data-node-id], .graph-node.is-selected[data-node-id]');
  const nodeId = selected?.dataset.nodeId;
  if (!nodeId) return;
  const node = readGraphNode(nodeId);
  if (!node || (node.type !== 'Wait' && node.type !== 'SequenceWithMemory')) return;

  const parametersArea = document.querySelector<HTMLTextAreaElement>('#node-parameters');
  const saveButton = document.querySelector<HTMLButtonElement>('#save-node');
  const inspector = saveButton?.closest<HTMLElement>('.inspector-card');
  if (!parametersArea || !saveButton || !inspector) return;

  const panel = document.createElement('section');
  panel.className = 'stateful-node-human-panel';

  if (node.type === 'SequenceWithMemory') {
    panel.innerHTML = `
      <h4>Последовательность с памятью</h4>
      <p>Запускает шаги по порядку и продолжает с активного шага на следующем тике ИИ. Никаких кодовых параметров для неё не требуется.</p>
    `;
    inspector.insertBefore(panel, saveButton);
    return;
  }

  const parameters = readParameters(parametersArea.value);
  const duration = readNonNegative(parameters.durationSeconds, 2);
  const timeout = readNonNegative(parameters.timeoutSeconds, 0);
  parameters.durationSeconds = duration;
  parameters.timeoutSeconds = timeout;
  parametersArea.value = JSON.stringify(parameters, null, 2);

  panel.innerHTML = `
    <h4>Длительное ожидание</h4>
    <p>Боец остаётся на этой ноде между тиками ИИ. Нода подсвечивается синим, пока ожидание не закончится.</p>
    <label class="inspector-field">
      Длительность, секунд
      <input id="stateful-wait-duration" type="number" min="0" step="0.1" value="${duration}" />
      <small>Через сколько секунд нода считается успешно завершённой.</small>
    </label>
    <label class="inspector-field">
      Тайм-аут, секунд
      <input id="stateful-wait-timeout" type="number" min="0" step="0.1" value="${timeout}" />
      <small>0 — без тайм-аута. Если тайм-аут меньше длительности, ожидание завершится провалом.</small>
    </label>
  `;
  inspector.insertBefore(panel, saveButton);

  const sync = (): void => {
    const next = readParameters(parametersArea.value);
    next.durationSeconds = readInput('#stateful-wait-duration', 2);
    next.timeoutSeconds = readInput('#stateful-wait-timeout', 0);
    parametersArea.value = JSON.stringify(next, null, 2);
  };
  panel.querySelectorAll('input').forEach((input) => input.addEventListener('input', sync));
  saveButton.addEventListener('click', sync, { capture: true, once: true });
}

function readGraphNode(nodeId: string): { type?: string } | null {
  try {
    const raw = window.localStorage.getItem(GRAPH_STORAGE_KEY);
    if (!raw) return null;
    const graph = JSON.parse(raw) as { nodes?: Array<{ id?: string; type?: string }> };
    return graph.nodes?.find((node) => node.id === nodeId) ?? null;
  } catch {
    return null;
  }
}

function readParameters(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function readInput(selector: string, fallback: number): number {
  const value = Number(document.querySelector<HTMLInputElement>(selector)?.value ?? fallback);
  return Number.isFinite(value) ? Math.max(0, value) : fallback;
}

function readNonNegative(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : fallback;
}
