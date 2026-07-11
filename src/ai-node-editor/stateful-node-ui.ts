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
  const existing = document.querySelector<HTMLElement>('.stateful-node-human-panel');
  const selected = document.querySelector<HTMLElement>('.graph-node.selected[data-node-id], .graph-node.is-selected[data-node-id]');
  const nodeId = selected?.dataset.nodeId;
  if (!nodeId) {
    existing?.remove();
    return;
  }

  const node = readGraphNode(nodeId);
  if (!node || (node.type !== 'Wait' && node.type !== 'SequenceWithMemory')) {
    existing?.remove();
    return;
  }

  const humanPanel = document.querySelector<HTMLElement>('.human-node-panel');
  if (!humanPanel) return;
  if (existing?.dataset.nodeId === nodeId && existing.dataset.nodeType === node.type && humanPanel.contains(existing)) return;
  existing?.remove();

  const section = document.createElement('section');
  section.className = 'stateful-node-human-panel';
  section.dataset.nodeId = nodeId;
  section.dataset.nodeType = node.type;

  if (node.type === 'SequenceWithMemory') {
    section.innerHTML = `
      <h4>Последовательность с памятью</h4>
      <p>Запускает шаги по порядку и продолжает с активного шага на следующем тике ИИ. Никаких кодовых параметров для неё не требуется.</p>
    `;
  } else {
    const duration = readWholeSeconds(node.parameters?.durationSeconds, 2);
    const timeout = readWholeSeconds(node.parameters?.timeoutSeconds, 0);
    section.innerHTML = `
      <h4>Длительное ожидание</h4>
      <p>Боец остаётся на этой ноде между тиками ИИ. Нода подсвечивается синим, пока ожидание не закончится.</p>
      <label class="human-control wide" data-help="Через сколько секунд ожидание считается успешно завершённым.">
        <span>Длительность, секунд</span>
        <input id="stateful-wait-duration" class="human-field" data-param-key="durationSeconds" data-kind="number" type="number" min="0" step="1" value="${duration}" />
      </label>
      <label class="human-control wide" data-help="0 — без тайм-аута. Если тайм-аут меньше длительности, ожидание завершится провалом.">
        <span>Тайм-аут, секунд</span>
        <input id="stateful-wait-timeout" class="human-field" data-param-key="timeoutSeconds" data-kind="number" type="number" min="0" step="1" value="${timeout}" />
      </label>
    `;
  }

  const cooldown = humanPanel.querySelector('.human-links');
  const actions = humanPanel.querySelector('.human-actions');
  if (cooldown) humanPanel.insertBefore(section, cooldown);
  else if (actions) humanPanel.insertBefore(section, actions);
  else humanPanel.appendChild(section);
}

function readGraphNode(nodeId: string): { type?: string; parameters?: Record<string, unknown> } | null {
  try {
    const raw = window.localStorage.getItem(GRAPH_STORAGE_KEY);
    if (!raw) return null;
    const graph = JSON.parse(raw) as { nodes?: Array<{ id?: string; type?: string; parameters?: Record<string, unknown> }> };
    return graph.nodes?.find((node) => node.id === nodeId) ?? null;
  } catch {
    return null;
  }
}

function readWholeSeconds(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.round(value)) : fallback;
}
