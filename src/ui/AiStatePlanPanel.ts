import '../ai-state-plan-panel.css';
import { DEFAULT_AI_STATE_MACHINE } from '../core/ai/state/AiStateMachine';
import type { UnitModel } from '../core/units/UnitModel';

export interface TacticalStatePlanPanelBinding {
  update(unit: UnitModel | undefined): void;
}

export function renderTacticalStatePlanPanelMarkup(): string {
  return `<details class="unit-state-plan" data-role="state-plan-panel">
    <summary><span data-state-plan="summary-state">Состояние: —</span><span data-state-plan="summary-plan">План: —</span></summary>
    <div class="unit-state-plan-popover">
      <dl>
        <div><dt>Состояние</dt><dd data-state-plan="state">—</dd></div>
        <div><dt>Родитель</dt><dd data-state-plan="parent">—</dd></div>
        <div><dt>Предыдущее</dt><dd data-state-plan="previous-state">—</dd></div>
        <div class="wide"><dt>Причина перехода</dt><dd data-state-plan="transition-reason">—</dd></div>
        <div><dt>План</dt><dd data-state-plan="plan">—</dd></div>
        <div><dt>Статус</dt><dd data-state-plan="plan-status">—</dd></div>
        <div class="wide"><dt>Текущий шаг</dt><dd data-state-plan="step">—</dd></div>
      </dl>
      <div class="unit-state-plan-columns">
        <section><h4>Почему выбран</h4><ul data-state-plan-list="reasons"></ul></section>
        <section><h4>Отменить, если</h4><ul data-state-plan-list="abort"></ul></section>
        <section><h4>Перестроить, если</h4><ul data-state-plan-list="replan"></ul></section>
      </div>
      <details class="unit-state-plan-tech"><summary>Технические id</summary><pre data-state-plan="technical">—</pre></details>
    </div>
  </details>`;
}

export function bindTacticalStatePlanPanel(root: HTMLElement): TacticalStatePlanPanelBinding {
  const panel = required<HTMLElement>(root, '[data-role="state-plan-panel"]');
  const fields = {
    summaryState: required<HTMLElement>(panel, '[data-state-plan="summary-state"]'),
    summaryPlan: required<HTMLElement>(panel, '[data-state-plan="summary-plan"]'),
    state: required<HTMLElement>(panel, '[data-state-plan="state"]'),
    parent: required<HTMLElement>(panel, '[data-state-plan="parent"]'),
    previousState: required<HTMLElement>(panel, '[data-state-plan="previous-state"]'),
    transitionReason: required<HTMLElement>(panel, '[data-state-plan="transition-reason"]'),
    plan: required<HTMLElement>(panel, '[data-state-plan="plan"]'),
    planStatus: required<HTMLElement>(panel, '[data-state-plan="plan-status"]'),
    step: required<HTMLElement>(panel, '[data-state-plan="step"]'),
    reasons: required<HTMLUListElement>(panel, '[data-state-plan-list="reasons"]'),
    abort: required<HTMLUListElement>(panel, '[data-state-plan-list="abort"]'),
    replan: required<HTMLUListElement>(panel, '[data-state-plan-list="replan"]'),
    technical: required<HTMLElement>(panel, '[data-state-plan="technical"]'),
  };

  return {
    update(unit): void {
      const session = unit?.behaviorRuntime.aiRuntimeSession;
      if (!unit || !session) {
        panel.classList.add('empty');
        setText(fields.summaryState, 'Состояние: —');
        setText(fields.summaryPlan, 'План: —');
        setText(fields.state, 'Нет runtime-сеанса');
        setText(fields.parent, '—');
        setText(fields.previousState, '—');
        setText(fields.transitionReason, 'Выполните расчёт ИИ для выбранного бойца.');
        setText(fields.plan, '—');
        setText(fields.planStatus, '—');
        setText(fields.step, '—');
        updateList(fields.reasons, []);
        updateList(fields.abort, []);
        updateList(fields.replan, []);
        setText(fields.technical, '—');
        return;
      }

      panel.classList.remove('empty');
      const state = session.stateRuntime;
      const definition = DEFAULT_AI_STATE_MACHINE.states[state.activeStateId];
      const parentId = definition.parentStateId;
      const activePlan = session.activePlan;
      const step = activePlan?.steps[activePlan.currentStepIndex];
      setText(fields.summaryState, `Состояние: ${definition.labelRu}`);
      setText(fields.summaryPlan, `План: ${activePlan?.goalRu ?? 'нет'}`);
      setText(fields.state, definition.labelRu);
      setText(fields.parent, parentId ? DEFAULT_AI_STATE_MACHINE.states[parentId].labelRu : '—');
      setText(fields.previousState, state.previousStateId ? DEFAULT_AI_STATE_MACHINE.states[state.previousStateId].labelRu : '—');
      setText(fields.transitionReason, state.lastTransition?.reasonRu ?? 'Начальное состояние.');
      setText(fields.plan, activePlan?.goalRu ?? 'Нет активного плана');
      setText(fields.planStatus, activePlan ? planStatusLabel(activePlan.status) : '—');
      setText(fields.step, activePlan
        ? `${step?.labelRu ?? step?.id ?? 'Шаг'} · ${Math.min(activePlan.currentStepIndex + 1, activePlan.steps.length)} из ${activePlan.steps.length}`
        : '—');
      updateList(fields.reasons, activePlan?.reasonsRu ?? []);
      updateList(fields.abort, activePlan?.abortConditions.map((item) => item.labelRu) ?? []);
      updateList(fields.replan, activePlan?.replanConditions.map((item) => item.labelRu) ?? []);
      setText(fields.technical, JSON.stringify({
        stateId: state.activeStateId,
        parentStateId: parentId,
        transitionId: state.lastTransition?.transitionId,
        transitionTrigger: state.lastTransition?.trigger,
        planId: activePlan?.id,
        planKind: activePlan?.kind,
        stepId: step?.id,
        subgraphId: step?.subgraphId,
        replacesPlanId: activePlan?.replacesPlanId,
      }, null, 2));
    },
  };
}

function required<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Tactical state-plan element missing: ${selector}`);
  return element;
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
