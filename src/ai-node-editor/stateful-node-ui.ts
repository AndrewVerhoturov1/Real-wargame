export {};

const GRAPH_STORAGE_KEY = 'real-wargame.ai-node-editor.graph.v6';
const MOVE_DEFAULTS = {
  targetKey: 'best_cover_position',
  acceptanceRadiusCells: 0.2,
  timeoutSeconds: 15,
  stuckTimeoutSeconds: 2.5,
  minimumProgressCells: 0.05,
  abortOnTargetLost: true,
} as const;
let scheduled = false;

// The palette creates a node synchronously in its click handler. Persist the
// movement defaults in the microtask immediately after that handler finishes,
// before browser automation or another UI action can read the graph.
document.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (!target.closest('button[data-palette-type="MoveToBlackboardPosition"]')) return;
  window.queueMicrotask(() => persistNewMoveNodeDefaults());
}, true);

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
  if (!node || !['Wait', 'SequenceWithMemory', 'MoveToBlackboardPosition'].includes(String(node.type))) {
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
  } else if (node.type === 'Wait') {
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
  } else {
    const targetKey = readTargetKey(node.parameters?.targetKey);
    const radius = readNonNegative(node.parameters?.acceptanceRadiusCells, 0.2);
    const timeout = readNonNegative(node.parameters?.timeoutSeconds, 15);
    const stuckTimeout = readNonNegative(node.parameters?.stuckTimeoutSeconds, 2.5);
    const minimumProgress = readNonNegative(node.parameters?.minimumProgressCells, 0.05);
    const abortOnTargetLost = readBoolean(node.parameters?.abortOnTargetLost, true);
    section.innerHTML = `
      <h4>Длительное движение</h4>
      <p>Боец один раз запоминает цель, движется к ней несколько тиков ИИ и не меняет её до завершения или отмены.</p>
      <label class="human-control wide" data-help="Позиция берётся из выбранной ячейки памяти в момент старта и затем замораживается.">
        <span>Цель из памяти</span>
        <select id="stateful-move-target" class="stateful-move-field" data-param-key="targetKey">
          ${targetOption('best_cover_position', 'Лучшая точка укрытия', targetKey)}
          ${targetOption('order_target_position', 'Точка приказа', targetKey)}
          ${targetOption('retreat_position', 'Точка отхода', targetKey)}
        </select>
      </label>
      <label class="human-control wide" data-help="Нода считается завершённой, когда до цели осталось не больше этого расстояния.">
        <span>Радиус достижения, клеток</span>
        <input id="stateful-move-radius" class="stateful-move-field" data-param-key="acceptanceRadiusCells" type="number" min="0" step="0.05" value="${radius}" />
      </label>
      <label class="human-control wide" data-help="0 — без ограничения. После тайм-аута нода провалится и очистит только собственный приказ ИИ.">
        <span>Максимальное время, секунд</span>
        <input id="stateful-move-timeout" class="stateful-move-field" data-param-key="timeoutSeconds" type="number" min="0" step="0.5" value="${timeout}" />
      </label>
      <label class="human-control wide" data-help="Если расстояние до цели не уменьшается дольше этого времени, маршрут считается заблокированным. 0 — отключить проверку.">
        <span>Считать маршрут заблокированным через, секунд</span>
        <input id="stateful-move-stuck-timeout" class="stateful-move-field" data-param-key="stuckTimeoutSeconds" type="number" min="0" step="0.5" value="${stuckTimeout}" />
      </label>
      <label class="human-control wide" data-help="Насколько должно уменьшиться расстояние, чтобы это считалось настоящим продвижением.">
        <span>Минимальный заметный прогресс, клеток</span>
        <input id="stateful-move-minimum-progress" class="stateful-move-field" data-param-key="minimumProgressCells" type="number" min="0" step="0.01" value="${minimumProgress}" />
      </label>
      <label class="human-control wide" data-help="Если выбранная точка исчезла из памяти бойца, текущее движение будет немедленно отменено.">
        <span>Отменять, если цель исчезла</span>
        <input id="stateful-move-abort-target-lost" class="stateful-move-field" data-param-key="abortOnTargetLost" type="checkbox" ${abortOnTargetLost ? 'checked' : ''} />
      </label>
      <p class="stateful-move-safety-note">Новый приказ игрока имеет приоритет. Застревание и исчезновение цели отменяют только собственный приказ ИИ.</p>
    `;
  }

  const cooldown = humanPanel.querySelector('.human-links');
  const actions = humanPanel.querySelector('.human-actions');
  if (cooldown) humanPanel.insertBefore(section, cooldown);
  else if (actions) humanPanel.insertBefore(section, actions);
  else humanPanel.appendChild(section);

  if (node.type === 'MoveToBlackboardPosition') {
    installMoveParameterSync(section, nodeId, needsMoveDefaults(node.parameters));
  }
}

function installMoveParameterSync(section: HTMLElement, nodeId: string, persistDefaults: boolean): void {
  const sync = (): Record<string, unknown> | null => {
    const parametersArea = document.querySelector<HTMLTextAreaElement>('#node-parameters');
    if (!parametersArea) return null;
    const parameters = readParameters(parametersArea.value);
    parameters.targetKey = document.querySelector<HTMLSelectElement>('#stateful-move-target')?.value ?? MOVE_DEFAULTS.targetKey;
    parameters.acceptanceRadiusCells = readInputNumber('#stateful-move-radius', MOVE_DEFAULTS.acceptanceRadiusCells);
    parameters.timeoutSeconds = readInputNumber('#stateful-move-timeout', MOVE_DEFAULTS.timeoutSeconds);
    parameters.stuckTimeoutSeconds = readInputNumber('#stateful-move-stuck-timeout', MOVE_DEFAULTS.stuckTimeoutSeconds);
    parameters.minimumProgressCells = readInputNumber('#stateful-move-minimum-progress', MOVE_DEFAULTS.minimumProgressCells);
    parameters.abortOnTargetLost = document.querySelector<HTMLInputElement>('#stateful-move-abort-target-lost')?.checked ?? MOVE_DEFAULTS.abortOnTargetLost;
    parametersArea.value = JSON.stringify(parameters, null, 2);
    return parameters;
  };

  section.querySelectorAll<HTMLInputElement | HTMLSelectElement>('.stateful-move-field')
    .forEach((field) => field.addEventListener('input', sync));
  document.querySelector<HTMLButtonElement>('.human-save-node')?.addEventListener('click', sync, { capture: true });
  const parameters = sync();

  if (persistDefaults && parameters) {
    persistMoveNodeParameters(nodeId, parameters);
    // Keep the editor's in-memory graph synchronized as well. This is now
    // synchronous; no requestAnimationFrame race is involved.
    document.querySelector<HTMLButtonElement>('#save-node')?.click();
  }
}

function persistNewMoveNodeDefaults(): void {
  try {
    const raw = window.localStorage.getItem(GRAPH_STORAGE_KEY);
    if (!raw) return;
    const graph = JSON.parse(raw) as {
      nodes?: Array<{ id?: string; type?: string; parameters?: Record<string, unknown> }>;
    };
    if (!Array.isArray(graph.nodes)) return;
    const selectedId = document.querySelector<HTMLElement>('.graph-node.selected[data-node-id], .graph-node.is-selected[data-node-id]')?.dataset.nodeId;
    const node = (selectedId
      ? graph.nodes.find((candidate) => candidate.id === selectedId)
      : undefined)
      ?? [...graph.nodes].reverse().find((candidate) => (
        candidate.type === 'MoveToBlackboardPosition' && needsMoveDefaults(candidate.parameters)
      ));
    if (!node || node.type !== 'MoveToBlackboardPosition') return;
    const parameters = withMoveDefaults(node.parameters);
    node.parameters = parameters;
    window.localStorage.setItem(GRAPH_STORAGE_KEY, JSON.stringify(graph));

    const parametersArea = document.querySelector<HTMLTextAreaElement>('#node-parameters');
    if (selectedId === node.id && parametersArea) {
      parametersArea.value = JSON.stringify(parameters, null, 2);
    }
  } catch {
    // Default persistence is best-effort and must not break the editor.
  }
}

function persistMoveNodeParameters(nodeId: string, parameters: Record<string, unknown>): void {
  try {
    const raw = window.localStorage.getItem(GRAPH_STORAGE_KEY);
    if (!raw) return;
    const graph = JSON.parse(raw) as {
      nodes?: Array<{ id?: string; parameters?: Record<string, unknown> }>;
    };
    const node = graph.nodes?.find((candidate) => candidate.id === nodeId);
    if (!node) return;
    node.parameters = { ...parameters };
    window.localStorage.setItem(GRAPH_STORAGE_KEY, JSON.stringify(graph));
  } catch {
    // The normal editor save path remains available if storage is malformed.
  }
}

function withMoveDefaults(parameters: Record<string, unknown> | undefined): Record<string, unknown> {
  return {
    ...(parameters ?? {}),
    targetKey: readTargetKey(parameters?.targetKey),
    acceptanceRadiusCells: readNonNegative(parameters?.acceptanceRadiusCells, MOVE_DEFAULTS.acceptanceRadiusCells),
    timeoutSeconds: readNonNegative(parameters?.timeoutSeconds, MOVE_DEFAULTS.timeoutSeconds),
    stuckTimeoutSeconds: readNonNegative(parameters?.stuckTimeoutSeconds, MOVE_DEFAULTS.stuckTimeoutSeconds),
    minimumProgressCells: readNonNegative(parameters?.minimumProgressCells, MOVE_DEFAULTS.minimumProgressCells),
    abortOnTargetLost: readBoolean(parameters?.abortOnTargetLost, MOVE_DEFAULTS.abortOnTargetLost),
  };
}

function needsMoveDefaults(parameters: Record<string, unknown> | undefined): boolean {
  return !parameters
    || !Object.prototype.hasOwnProperty.call(parameters, 'targetKey')
    || !Object.prototype.hasOwnProperty.call(parameters, 'acceptanceRadiusCells')
    || !Object.prototype.hasOwnProperty.call(parameters, 'timeoutSeconds')
    || !Object.prototype.hasOwnProperty.call(parameters, 'stuckTimeoutSeconds')
    || !Object.prototype.hasOwnProperty.call(parameters, 'minimumProgressCells')
    || !Object.prototype.hasOwnProperty.call(parameters, 'abortOnTargetLost');
}

function targetOption(value: string, label: string, selected: string): string {
  return `<option value="${value}" ${value === selected ? 'selected' : ''}>${label} · ${value}</option>`;
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

function readParameters(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function readInputNumber(selector: string, fallback: number): number {
  const value = Number(document.querySelector<HTMLInputElement>(selector)?.value ?? fallback);
  return Number.isFinite(value) ? Math.max(0, value) : fallback;
}

function readTargetKey(value: unknown): string {
  return value === 'order_target_position' || value === 'retreat_position'
    ? value
    : MOVE_DEFAULTS.targetKey;
}

function readWholeSeconds(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.round(value)) : fallback;
}

function readNonNegative(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : fallback;
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}
