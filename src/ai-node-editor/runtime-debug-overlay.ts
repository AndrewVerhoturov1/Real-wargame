const DEBUG_STORAGE_KEY = 'real-wargame.ai-node-editor.debug.v1';
const REFRESH_INTERVAL_MS = 700;
const STALE_AFTER_MS = 10000;

type TraceStatus = 'pass' | 'fail' | 'skip' | 'select' | 'veto';

interface RuntimeTraceItem {
  readonly nodeId: string;
  readonly nodeType: string;
  readonly status: TraceStatus;
  readonly reason: string;
  readonly reasonRu?: string;
}

interface RuntimeScoreBreakdownItem {
  readonly sourceNodeId: string;
  readonly label: string;
  readonly labelRu?: string;
  readonly value: number;
  readonly reason: string;
  readonly reasonRu?: string;
}

interface RuntimeBranchScore {
  readonly branchNodeId: string;
  readonly branchName: string;
  readonly branchNameRu?: string;
  readonly score: number;
  readonly breakdown: readonly RuntimeScoreBreakdownItem[];
  readonly vetoed: boolean;
  readonly vetoReason?: string;
  readonly vetoReasonRu?: string;
}

interface RuntimeDebugPayload {
  readonly version: 1;
  readonly kind: 'ai-graph-runtime-debug';
  readonly graphId: string;
  readonly unitId: string;
  readonly unitLabel?: string;
  readonly selectedBranchNodeId: string;
  readonly selectedBranchName: string;
  readonly selectedBranchNameRu?: string;
  readonly ok: boolean;
  readonly paused: boolean;
  readonly nowMs: number;
  readonly explanation: string;
  readonly explanationRu?: string;
  readonly trace: readonly RuntimeTraceItem[];
  readonly scores: readonly RuntimeBranchScore[];
  readonly effects: readonly unknown[];
}

interface NodeDebugState {
  readonly classes: Set<string>;
  readonly labels: string[];
  readonly title: string;
}

let lastAppliedSignature = '';
let pendingApply = false;

const observer = new MutationObserver(() => scheduleApply());
observer.observe(document.body, { childList: true, subtree: true });
window.addEventListener('storage', (event) => {
  if (event.key === DEBUG_STORAGE_KEY) scheduleApply(true);
});
window.setInterval(() => scheduleApply(), REFRESH_INTERVAL_MS);
scheduleApply(true);

function scheduleApply(force = false): void {
  if (pendingApply && !force) return;
  pendingApply = true;
  window.requestAnimationFrame(() => {
    pendingApply = false;
    applyRuntimeDebugOverlay();
  });
}

function applyRuntimeDebugOverlay(): void {
  const payload = readDebugPayload();
  const signature = payload ? `${payload.unitId}:${payload.nowMs}:${payload.selectedBranchNodeId}:${payload.trace.length}:${payload.scores.length}:${payload.paused ? 'paused' : 'live'}` : 'empty';
  const hasGraphNodes = document.querySelector('.graph-node[data-node-id]') !== null;
  if (!hasGraphNodes) return;
  if (signature === lastAppliedSignature && document.querySelector('.ai-runtime-debug-panel')) return;

  lastAppliedSignature = signature;
  removeExistingNodeDebug();
  renderDebugPanel(payload);

  if (!payload) return;

  const debugByNode = buildNodeDebugMap(payload);
  document.querySelectorAll<HTMLElement>('.graph-node[data-node-id]').forEach((element) => {
    const nodeId = element.dataset.nodeId ?? '';
    const debug = debugByNode.get(nodeId);
    if (!debug) {
      element.classList.add('runtime-debug-idle');
      return;
    }

    element.classList.add(...Array.from(debug.classes));
    element.title = debug.title;
    const badge = document.createElement('span');
    badge.className = 'runtime-debug-badge';
    badge.textContent = debug.labels.slice(0, 3).join(' · ');
    element.appendChild(badge);
  });
}

function buildNodeDebugMap(payload: RuntimeDebugPayload): Map<string, NodeDebugState> {
  const result = new Map<string, { classes: Set<string>; labels: string[]; reasons: string[] }>();
  const ensure = (nodeId: string): { classes: Set<string>; labels: string[]; reasons: string[] } => {
    const existing = result.get(nodeId);
    if (existing) return existing;
    const created = { classes: new Set<string>(), labels: [], reasons: [] };
    result.set(nodeId, created);
    return created;
  };

  for (const item of payload.trace) {
    const node = ensure(item.nodeId);
    node.classes.add(`runtime-debug-${item.status}`);
    node.labels.push(statusLabel(item.status));
    node.reasons.push(item.reasonRu ?? item.reason);
  }

  for (const score of payload.scores) {
    const branch = ensure(score.branchNodeId);
    branch.classes.add('runtime-debug-branch');
    branch.labels.push(`${score.vetoed ? 'VETO' : 'score'} ${roundScore(score.score)}`);
    if (score.vetoed) branch.classes.add('runtime-debug-veto');
    if (score.vetoReason || score.vetoReasonRu) branch.reasons.push(score.vetoReasonRu ?? score.vetoReason ?? 'Veto');

    for (const item of score.breakdown) {
      const node = ensure(item.sourceNodeId);
      node.classes.add('runtime-debug-score');
      node.labels.push(`${item.value >= 0 ? '+' : ''}${roundScore(item.value)}`);
      node.reasons.push(item.reasonRu ?? item.reason);
    }
  }

  const winner = ensure(payload.selectedBranchNodeId);
  winner.classes.add('runtime-debug-winner');
  winner.labels.unshift('Победила');
  winner.reasons.push(payload.explanationRu ?? payload.explanation);

  return new Map(Array.from(result.entries()).map(([nodeId, value]) => [
    nodeId,
    {
      classes: value.classes,
      labels: unique(value.labels),
      title: unique(value.reasons).join('\n'),
    },
  ]));
}

function renderDebugPanel(payload: RuntimeDebugPayload | null): void {
  document.querySelector('.ai-runtime-debug-panel')?.remove();
  const workspace = document.querySelector<HTMLElement>('#graph-workspace');
  if (!workspace) return;

  const panel = document.createElement('section');
  panel.className = 'ai-runtime-debug-panel';

  if (!payload) {
    panel.innerHTML = '<h3>След ИИ</h3><p>Пока нет живого решения. Открой игру, выбери бойца и дождись одного тика ИИ.</p>';
    workspace.appendChild(panel);
    return;
  }

  const ageMs = Date.now() - payload.nowMs;
  const stale = ageMs > STALE_AFTER_MS;
  const scoreRows = payload.scores.length > 0
    ? payload.scores.map((score) => `<li class="${score.branchNodeId === payload.selectedBranchNodeId ? 'winner' : ''} ${score.vetoed ? 'veto' : ''}"><b>${escapeHtml(score.branchNameRu ?? score.branchName)}</b><span>${score.vetoed ? 'запрещена' : `${roundScore(score.score)} очков`}</span></li>`).join('')
    : '<li><b>Очков нет</b><span>нет UtilitySelector или score-нод</span></li>';

  panel.innerHTML = `
    <h3>След ИИ ${payload.paused ? '· пауза' : ''}</h3>
    <p class="${stale ? 'stale' : ''}">${escapeHtml(stale ? 'Показан старый последний расчёт.' : 'Показан последний расчёт выбранного бойца.')}</p>
    <dl>
      <div><dt>Боец</dt><dd>${escapeHtml(payload.unitLabel ?? payload.unitId)}</dd></div>
      <div><dt>Победила</dt><dd>${escapeHtml(payload.selectedBranchNameRu ?? payload.selectedBranchName)}</dd></div>
      <div><dt>Итог</dt><dd>${escapeHtml(payload.explanationRu ?? payload.explanation)}</dd></div>
    </dl>
    <ul>${scoreRows}</ul>
  `;
  workspace.appendChild(panel);
}

function removeExistingNodeDebug(): void {
  document.querySelectorAll<HTMLElement>('.graph-node[data-node-id]').forEach((element) => {
    element.classList.remove(
      'runtime-debug-idle',
      'runtime-debug-pass',
      'runtime-debug-fail',
      'runtime-debug-skip',
      'runtime-debug-select',
      'runtime-debug-veto',
      'runtime-debug-score',
      'runtime-debug-branch',
      'runtime-debug-winner',
    );
    element.querySelector('.runtime-debug-badge')?.remove();
  });
}

function readDebugPayload(): RuntimeDebugPayload | null {
  try {
    const raw = window.localStorage.getItem(DEBUG_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RuntimeDebugPayload>;
    if (parsed.kind !== 'ai-graph-runtime-debug' || parsed.version !== 1 || typeof parsed.unitId !== 'string') return null;
    return {
      version: 1,
      kind: 'ai-graph-runtime-debug',
      graphId: String(parsed.graphId ?? ''),
      unitId: parsed.unitId,
      unitLabel: typeof parsed.unitLabel === 'string' ? parsed.unitLabel : undefined,
      selectedBranchNodeId: String(parsed.selectedBranchNodeId ?? ''),
      selectedBranchName: String(parsed.selectedBranchName ?? parsed.selectedBranchNodeId ?? ''),
      selectedBranchNameRu: typeof parsed.selectedBranchNameRu === 'string' ? parsed.selectedBranchNameRu : undefined,
      ok: Boolean(parsed.ok),
      paused: Boolean(parsed.paused),
      nowMs: typeof parsed.nowMs === 'number' ? parsed.nowMs : 0,
      explanation: String(parsed.explanation ?? ''),
      explanationRu: typeof parsed.explanationRu === 'string' ? parsed.explanationRu : undefined,
      trace: Array.isArray(parsed.trace) ? parsed.trace.filter(isTraceItem) : [],
      scores: Array.isArray(parsed.scores) ? parsed.scores.filter(isBranchScore) : [],
      effects: Array.isArray(parsed.effects) ? parsed.effects : [],
    };
  } catch {
    return null;
  }
}

function isTraceItem(value: unknown): value is RuntimeTraceItem {
  if (!isRecord(value)) return false;
  return typeof value.nodeId === 'string'
    && typeof value.nodeType === 'string'
    && ['pass', 'fail', 'skip', 'select', 'veto'].includes(String(value.status))
    && typeof value.reason === 'string';
}

function isBranchScore(value: unknown): value is RuntimeBranchScore {
  if (!isRecord(value)) return false;
  return typeof value.branchNodeId === 'string'
    && typeof value.branchName === 'string'
    && typeof value.score === 'number'
    && Array.isArray(value.breakdown);
}

function statusLabel(status: TraceStatus): string {
  if (status === 'pass') return 'прошла';
  if (status === 'fail') return 'провал';
  if (status === 'skip') return 'пауза/cooldown';
  if (status === 'select') return 'выбрана';
  return 'запрет';
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function roundScore(value: number): number {
  return Math.round(value * 100) / 100;
}

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
