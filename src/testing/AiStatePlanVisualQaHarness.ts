import {
  createAiRuntimeSession,
  normalizeAiRuntimeSession,
  type AiRuntimeSessionSnapshotV1,
} from '../core/ai/runtime/AiRuntimeSession';
import {
  createFollowMoveOrderPlan,
  createTakeCoverPlan,
  type AiPlan,
} from '../core/ai/state/AiPlan';
import { startCurrentAiPlanStep } from '../core/ai/state/AiPlanRuntime';
import {
  createAiStateRuntime,
  type AiStateRuntimeSnapshotV1,
  type AiStateTransitionRecord,
} from '../core/ai/state/AiStateRuntime';
import type { AiStateId, AiTransitionTrigger } from '../core/ai/state/AiStateMachine';
import type { SimulationState } from '../core/simulation/SimulationState';
import { setAiTestPaused } from '../core/testing/AiTestLabRuntime';

export type AiStatePlanVisualScenario = 'following-order' | 'contact-take-cover' | 'suppressed' | 'restored';

export interface AiStatePlanVisualSnapshot {
  readonly scenario: AiStatePlanVisualScenario;
  readonly stateId: AiStateId;
  readonly planId?: string;
  readonly planKind?: string;
  readonly stepId?: string;
  readonly stepAttempt?: number;
  readonly lastEvent: string;
}

export interface AiStatePlanVisualQaApi {
  setScenario(scenario: AiStatePlanVisualScenario): AiStatePlanVisualSnapshot;
  getSnapshot(): AiStatePlanVisualSnapshot | null;
}

declare global {
  interface Window {
    __realWargameAiStatePlanVisualQa?: AiStatePlanVisualQaApi;
  }
}

const GRAPH_ID = 'ai_graph_state_plan_v1';
const FOLLOW_PLAN_ID = 'visual-follow-plan-001';
const CONTACT_PLAN_ID = 'visual-cover-plan-002';
const RESTORED_PLAN_ID = 'visual-restored-cover-plan-003';

export function installAiStatePlanVisualQaHarness(
  state: SimulationState,
  onChanged: () => void,
): void {
  const query = new URLSearchParams(window.location.search);
  if (query.get('visualQa') !== 'ai-state-plan') return;

  let activeScenario: AiStatePlanVisualScenario | null = null;
  setAiTestPaused(state, true);

  window.__realWargameAiStatePlanVisualQa = {
    setScenario(scenario): AiStatePlanVisualSnapshot {
      const unit = state.units[0];
      if (!unit) throw new Error('Visual QA fixture soldier is missing.');
      const fixture = buildFixture(unit.id, scenario);
      unit.behaviorRuntime.aiRuntimeSession = fixture.session;
      unit.behaviorRuntime.aiNodeCooldowns = { ...fixture.session.cooldowns };
      unit.behaviorRuntime.suppression = fixture.suppression;
      unit.behaviorRuntime.currentAction = fixture.action;
      unit.behaviorRuntime.aiGraphReason = fixture.session.activePlan?.goalRu ?? fixture.session.stateRuntime.lastTransition?.reasonRu ?? '';
      unit.behaviorRuntime.reason = unit.behaviorRuntime.aiGraphReason;
      unit.behaviorRuntime.lastEvent = fixture.lastEvent;
      unit.order = null;
      unit.playerCommand = null;
      state.selectedUnitId = unit.id;
      state.selectedUnitIds = [unit.id];
      state.editor.enabled = false;
      state.editor.panelOpen = false;
      setAiTestPaused(state, true);
      activeScenario = scenario;
      onChanged();
      window.dispatchEvent(new CustomEvent('real-wargame:ai-state-plan-visual-qa-updated'));
      return snapshotFromSession(scenario, fixture.session, fixture.lastEvent);
    },
    getSnapshot(): AiStatePlanVisualSnapshot | null {
      const unit = state.units[0];
      const session = unit?.behaviorRuntime.aiRuntimeSession;
      return activeScenario && unit && session
        ? snapshotFromSession(activeScenario, session, unit.behaviorRuntime.lastEvent)
        : null;
    },
  };
}

function buildFixture(
  unitId: string,
  scenario: AiStatePlanVisualScenario,
): {
  readonly session: AiRuntimeSessionSnapshotV1;
  readonly suppression: number;
  readonly action: 'waiting' | 'moving';
  readonly lastEvent: string;
} {
  if (scenario === 'following-order') {
    const stateRuntime = stateFixture('FollowingOrder', 'Idle', 'move_order_received', 'Получен приказ движения.', 1000);
    const plan = runningPlan(createFollowMoveOrderPlan({
      id: FOLLOW_PLAN_ID,
      nowMs: 1000,
      createdForState: 'FollowingOrder',
      context: { orderRevision: 1, orderTarget: { x: 12, y: 8 } },
      reasonsRu: ['Получен действующий приказ движения.', 'Маршрут к цели доступен.', 'На марше продолжается наблюдение.'],
    }));
    return {
      session: createAiRuntimeSession({ graphId: GRAPH_ID, unitId, simulationTimeMs: 1400, stateRuntime, activePlan: plan, planSequence: 1 }),
      suppression: 10,
      action: 'moving',
      lastEvent: 'ai_state_Idle_to_FollowingOrder',
    };
  }

  const cancelledFollow = {
    ...runningPlan(createFollowMoveOrderPlan({
      id: FOLLOW_PLAN_ID,
      nowMs: 1000,
      createdForState: 'FollowingOrder',
      context: { orderRevision: 1, orderTarget: { x: 12, y: 8 } },
    })),
    status: 'cancelled' as const,
    steps: [{
      ...runningPlan(createFollowMoveOrderPlan({ id: 'throwaway', nowMs: 0, createdForState: 'FollowingOrder' })).steps[0],
      status: 'cancelled' as const,
    }],
    cancellationReason: 'Enemy spotted.',
    cancellationReasonRu: 'Замечен противник.',
  } satisfies AiPlan;

  if (scenario === 'contact-take-cover') {
    const stateRuntime = stateFixture('Contact', 'FollowingOrder', 'enemy_spotted', 'Замечен противник.', 2200);
    const plan = runningPlan(createTakeCoverPlan({
      id: CONTACT_PLAN_ID,
      nowMs: 2200,
      createdForState: 'Contact',
      replacesPlanId: FOLLOW_PLAN_ID,
      context: { contactId: 'visual_enemy_1', coverPosition: { x: 9, y: 10 } },
      reasonsRu: ['Замечен противник.', 'Рядом найдено укрытие.', 'Путь к укрытию доступен.'],
    }));
    return {
      session: createAiRuntimeSession({
        graphId: GRAPH_ID,
        unitId,
        simulationTimeMs: 2500,
        stateRuntime,
        activePlan: plan,
        planHistory: [cancelledFollow],
        planSequence: 2,
      }),
      suppression: 48,
      action: 'moving',
      lastEvent: 'ai_state_FollowingOrder_to_Contact',
    };
  }

  const suppressedState = stateFixture('Suppressed', 'Contact', 'suppression_critical', 'Подавление достигло критического порога.', 3200);
  const suppressedPlan = runningPlan(createTakeCoverPlan({
    id: scenario === 'restored' ? RESTORED_PLAN_ID : CONTACT_PLAN_ID,
    nowMs: 3200,
    createdForState: 'Suppressed',
    replacesPlanId: FOLLOW_PLAN_ID,
    context: { contactId: 'visual_enemy_1', coverPosition: { x: 9, y: 10 } },
    reasonsRu: ['Сильное подавление требует самосохранения.', 'Рядом найдено укрытие.', 'Обычный приказ временно не допускается состоянием.'],
  }));
  const source = createAiRuntimeSession({
    graphId: GRAPH_ID,
    unitId,
    simulationTimeMs: 3600,
    stateRuntime: suppressedState,
    activePlan: suppressedPlan,
    planHistory: [cancelledFollow],
    planSequence: scenario === 'restored' ? 3 : 2,
  });
  const session = scenario === 'restored'
    ? normalizeAiRuntimeSession(JSON.parse(JSON.stringify(source)), { graphId: GRAPH_ID, unitId }).session
    : source;
  return {
    session,
    suppression: 88,
    action: 'moving',
    lastEvent: scenario === 'restored' ? 'ai_runtime_scene_restored' : 'ai_state_Contact_to_Suppressed',
  };
}

function runningPlan(plan: AiPlan): AiPlan {
  return startCurrentAiPlanStep(plan).plan;
}

function stateFixture(
  activeStateId: AiStateId,
  previousStateId: AiStateId,
  trigger: AiTransitionTrigger,
  reasonRu: string,
  enteredAtMs: number,
): AiStateRuntimeSnapshotV1 {
  const transition: AiStateTransitionRecord = {
    transitionId: `visual_${previousStateId}_to_${activeStateId}`,
    from: previousStateId,
    to: activeStateId,
    trigger,
    reason: reasonRu,
    reasonRu,
    atMs: enteredAtMs,
    exitedStateIds: previousStateId === 'Idle' && activeStateId === 'FollowingOrder'
      ? ['Idle']
      : [previousStateId],
    enteredStateIds: [activeStateId],
  };
  return createAiStateRuntime({
    activeStateId,
    previousStateId,
    enteredAtMs,
    lastTransition: transition,
    trace: [transition],
  });
}

function snapshotFromSession(
  scenario: AiStatePlanVisualScenario,
  session: AiRuntimeSessionSnapshotV1,
  lastEvent: string,
): AiStatePlanVisualSnapshot {
  const plan = session.activePlan;
  const step = plan?.steps[plan.currentStepIndex];
  return {
    scenario,
    stateId: session.stateRuntime.activeStateId,
    planId: plan?.id,
    planKind: plan?.kind,
    stepId: step?.id,
    stepAttempt: step?.attempt,
    lastEvent,
  };
}
