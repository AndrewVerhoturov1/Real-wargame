import './state-machine-ui.css';

const DEBUG_STORAGE_KEY = 'real-wargame.ai-node-editor.debug.v1';
const REFRESH_INTERVAL_MS = 500;

interface DebugPlanSummary {
  readonly id: string;
  readonly kind: string;
  readonly goalRu: string;
  readonly status: string;
  readonly currentStepId?: string;
  readonly currentStepLabelRu?: string;
  readonly currentStepIndex: number;
  readonly stepCount: number;
  readonly reasonsRu: readonly string[];
  readonly abortConditionsRu: readonly string[];
  readonly replanConditionsRu: readonly string[];
  readonly activeSubgraphId?: string;
  readonly replacesPlanId?: string;
}

interface DebugPreviousPlanSummary {
  readonly id: string;
  readonly goalRu: string;
  readonly status: string;
  readonly cancellationReasonRu?: string;
}

interface StatePlanDebugPayload {
  readonly stateId: string;
  readonly stateLabelRu: string;
  readonly parentStateId?: string;
  readonly parentStateLabelRu?: string;
  readonly previousStateId?: string;
  readonly previousStateLabelRu?: string;
  readonly transitionReasonRu?: string;
  readonly transitionTrigger?: string;
  readonly transitionAtMs?: number;
  readonly allowedUtilityBranches: readonly string[];
  readonly activePlan?: DebugPlanSummary;
  readonly previousPlan?: DebugPreviousPlanSummary;
  readonly planSequence: number;
}

interface PanelRefs {
  readonly panel: HTMLElement;
  readonly state: HTMLElement;
  readonly parent: HTMLElement;
  readonly previousState: HTMLElement;
  readonly transitionReason: HTMLElement;
  readonly plan: HTMLElement;
  readonly planStatus: HTMLElement;
  readonly step: HTMLElement;
  readonly previousPlan: HTMLElement;
  readonly reasons: HTMLUListElement;
  readonly abort: HTMLUListElement;
  readonly replan: HTMLUListElement;
  readonly technical: HTMLElement;
  readonly openSubgraph: HTMLButtonElement;
}

let refs: PanelRefs | null = null;
let lastSignature = '';
let pending = false;

const observer = new MutationObserver(() => scheduleUpdate());
observer.observe(document.body, { childList: true, subtree: true });
window.addEventListener('storage', (event) => {
  if (event.key === DEBUG_STORAGE_KEY) scheduleUpdate(true);
});
window.setInterval(() => scheduleUpdate(), REFRESH_INTERVAL_MS);
scheduleUpdate(true);

function scheduleUpdate(force = false): void {
  if (pending && !force) return;
  pending = true;
  window.requestAnimationFrame(() => {
    pending = false;
    updatePanel(force);
  });
}

function updatePanel(force: boolean): void {
  const workspace = document.querySelector<HTMLElement>('#graph-workspace');
  if (!workspace) {
    refs = null;
    return;
  }
  const panelRecreated = !refs || !refs.panel.isConnected;
  if (panelRecreated) refs = createPanel(workspace);
  const currentRefs = refs;
  if (!currentRefs) return;
  const payload = readStatePlanPayload();
  const signature = JSON.stringify(payload ?? null);
  if (!force && !panelRecreated && signature === lastSignature) return;
  lastSignature = signature;
  render(currentRefs, payload);
}

function createPanel(workspace: HTMLElement): PanelRefs {
  const panel = document.createElement('section');
  panel.className = 'ai-state-plan-panel';
  panel.innerHTML = `
    <header><div><h3>Состояние и план</h3><span>State → Utility → Plan → Подграф</span></div><span class="state-plan-live">живые данные</span></header>
    <dl class="state-plan-grid">
      <div><dt>Состояние</dt><dd data-state-plan="state">—</dd></div>
      <div><dt>Родитель</dt><dd data-state-plan="parent">—</dd></div>
      <div><dt>Предыдущее</dt><dd data-state-plan="previous-state">—</dd></div>
      <div class="wide"><dt>Причина перехода</dt><dd data-state-plan="transition-reason">—</dd></div>
      <div><dt>План</dt><dd data-state-plan="plan">—</dd></div>
      <div><dt>Статус</dt><dd data-state-plan="plan-status">—</dd></div>
      <div class="wide"><dt>Текущий шаг</dt><dd data-state-plan="step">—</dd></div>
      <div class="wide"><dt>Предыдущий план</dt><dd data-state-plan="previous-plan">—</dd></div>
    </dl>
    <div class="state-plan-lists">
      <section><h4>Почему выбран</h4><ul data-state-plan-list="reasons"></ul></section>
      <section><h4>Отменить, если</h4><ul data-state-plan-list="abort"></ul></section>
      <section><h4>Перестроить, если</h4><ul data-state-plan-list="replan"></ul></section>
    </div>
    <div class="state-plan-actions">
      <button type="button" data-state-plan-action="open-subgraph">Показать активный подграф</button>
      <details><summary>Техническая диагностика</summary><pre data-state-plan="technical">—</pre></details>
    </div>`;
  workspace.appendChild(panel);
  const required = <T extends Element>(selector: string): T => {
    const element = panel.querySelector<T>(selector);
    if (!element) throw new Error(`State-plan panel element missing: ${selector}`);
    return element;
  };
  const result: PanelRefs = {
    panel,
    state: required('[data-state-plan="state"]'),
    parent: required('[data-state-plan="parent"]'),
    previousState: required('[data-state-plan="previous-state"]'),
    transitionReason: required('[data-state-plan="transition-reason"]'),
    plan: required('[data-state-plan="plan"]'),
    planStatus: required('[data-state-plan="plan-status"]'),
    step: required('[data-state-plan="step"]'),
    previousPlan: required('[data-state-plan="previous-plan"]'),
    reasons: required('[data-state-plan-list="reasons"]'),
    abort: required('[data-state-plan-list="abort"]'),
    replan: required('[data-state-plan-list="replan"]'),
    technical: required('[data-state-plan="technical"]'),
    openSubgraph: required('[data-state-plan-action="open-subgraph"]'),
  };
  result.openSubgraph.addEventListener('click', () => {
    const subgraphId = result.openSubgraph.dataset.subgraphId;
    if (!subgraphId) return;
    window.dispatchEvent(new CustomEvent('real-wargame:open-ai-subgraph', { detail: { subgraphId } }));
  });
  return result;
}

function render(target: PanelRefs, payload: StatePlanDebugPayload | null): void {
  if (!payload) {
    target.panel.classList.add('empty');
    setText(target.state, 'Нет живого расчёта');
    setText(target.parent, '—');
    setText(target.previousState, '—');
    setText(target.transitionReason, 'Открой игру, выбери бойца и выполни один расчёт ИИ.');
    setText(target.plan, '—');
    setText(target.planStatus, '—');
    setText(target.step, '—');
    setText(target.previousPlan, '—');
    updateList(target.reasons, []);
    updateList(target.abort, []);
    updateList(target.replan, []);
    target.openSubgraph.disabled = true;
    delete target.openSubgraph.dataset.subgraphId;
    setText(target.technical, 'Нет данных.');
    return;
  }
  target.panel.classList.remove('empty');
  const plan = payload.activePlan;
  setText(target.state, payload.stateLabelRu || payload.stateId);
  setText(target.parent, payload.parentStateLabelRu ?? payload.parentStateId ?? '—');
  setText(target.previousState, payload.previousStateLabelRu ?? payload.previousStateId ?? '—');
  setText(target.transitionReason, payload.transitionReasonRu ?? 'Начальное состояние.');
  setText(target.plan, plan?.goalRu ?? 'Нет активного плана');
  setText(target.planStatus, plan ? planStatusLabel(plan.status) : '—');
  setText(target.step, plan
    ? `${plan.currentStepLabelRu ?? plan.currentStepId ?? 'Шаг'} · ${Math.min(plan.currentStepIndex + 1, plan.stepCount)} из ${plan.stepCount}`
    : '—');
  setText(target.previousPlan, payload.previousPlan
    ? `${payload.previousPlan.goalRu} · ${planStatusLabel(payload.previousPlan.status)}${payload.previousPlan.cancellationReasonRu ? ` · ${payload.previousPlan.cancellationReasonRu}` : ''}`
    : '—');
  updateList(target.reasons, plan?.reasonsRu ?? []);
  updateList(target.abort, plan?.abortConditionsRu ?? []);
  updateList(target.replan, plan?.replanConditionsRu ?? []);
  target.openSubgraph.disabled = !plan?.activeSubgraphId;
  if (plan?.activeSubgraphId) target.openSubgraph.dataset.subgraphId = plan.activeSubgraphId;
  else delete target.openSubgraph.dataset.subgraphId;
  setText(target.technical, JSON.stringify({
    stateId: payload.stateId,
    parentStateId: payload.parentStateId,
    transitionTrigger: payload.transitionTrigger,
    transitionAtMs: payload.transitionAtMs,
    planId: plan?.id,
    planKind: plan?.kind,
    activeSubgraphId: plan?.activeSubgraphId,
    replacesPlanId: plan?.replacesPlanId,
    allowedUtilityBranches: payload.allowedUtilityBranches,
    planSequence: payload.planSequence,
  }, null, 2));
}

function readStatePlanPayload(): StatePlanDebugPayload | null {
  try {
    const raw = window.localStorage.getItem(DEBUG_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { statePlan?: unknown };
    if (!isRecord(parsed.statePlan) || typeof parsed.statePlan.stateId !== 'string' || typeof parsed.statePlan.stateLabelRu !== 'string') return null;
    return parsed.statePlan as unknown as StatePlanDebugPayload;
  } catch {
    return null;
  }
}

function updateList(target: HTMLUListElement, values: readonly string[]): void {
  const signature = values.join('\u0000');
  if (target.dataset.signature === signature) return;
  target.dataset.signature = signature;
  target.replaceChildren(...(values.length > 0 ? values : ['—']).map((value) => {
    const item = document.createElement('li');
    item.textContent = value;
    return item;
  }));
}

function setText(target: HTMLElement, value: string): void {
  if (target.textContent !== value) target.textContent = value;
}

function planStatusLabel(value: string): string {
  return ({ active: 'Выполняется', success: 'Выполнен', failure: 'Не выполнен', cancelled: 'Отменён', replanning: 'Перестраивается' } as Record<string, string>)[value] ?? value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
