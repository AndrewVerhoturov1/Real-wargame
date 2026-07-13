import type { AiGraph } from '../AiGraph';
import type { AiGraphRunnerBlackboard } from '../AiGraphRunner';
import type { AiEvent } from '../events/AiEvent';
import type { AiGraphExecutionState } from '../AiGraphRuntime';
import {
  createFollowMoveOrderPlan,
  createTakeCoverPlan,
  getCurrentAiPlanStep,
  type AiPlan,
  type AiPlanKind,
} from './AiPlan';
import { makeAiPlanId } from './AiPlanRuntime';
import type { AiStateId, AiTransitionTrigger } from './AiStateMachine';

export interface AiPlanSelectionInput {
  readonly unitId: string;
  readonly stateId: AiStateId;
  readonly nowMs: number;
  readonly sequence: number;
  readonly blackboard: AiGraphRunnerBlackboard;
  readonly replacesPlanId?: string;
}

export interface AiPlanSelectionResult {
  readonly plan?: AiPlan;
  readonly allowedKinds: readonly AiPlanKind[];
  readonly selectedKind?: AiPlanKind;
  readonly explanation: string;
  readonly explanationRu: string;
}

export function deriveAiStateTriggers(
  stateId: AiStateId,
  blackboard: AiGraphRunnerBlackboard,
  events: readonly AiEvent[] = [],
): readonly AiTransitionTrigger[] {
  const eventTypes = new Set(events.map((event) => event.type));
  const result: AiTransitionTrigger[] = [];
  const commandActive = blackboard.player_command_active === true;
  const commandStatus = blackboard.player_command_status;
  const contactVisible = blackboard.enemyVisible === true || blackboard.contact_visible_now === true;
  const contactKnown = blackboard.enemyKnown === true;

  if (stateId === 'Idle' && (commandActive || eventTypes.has('order_received'))) {
    result.push('move_order_received');
  }
  if (stateId === 'FollowingOrder') {
    if (eventTypes.has('order_cancelled') || commandStatus === 'cancelled') result.push('order_cancelled');
    if (eventTypes.has('move_completed') || commandStatus === 'completed') result.push('order_completed');
  }
  if (contactVisible || eventTypes.has('enemy_spotted')) result.push('enemy_spotted');
  else if (contactKnown
    || eventTypes.has('shot_nearby')
    || eventTypes.has('damage_received')
    || eventTypes.has('combat_contact')) {
    result.push('combat_contact');
  }
  return Array.from(new Set(result));
}

export function allowedPlanKindsForState(stateId: AiStateId): readonly AiPlanKind[] {
  if (stateId === 'FollowingOrder') return ['FollowMoveOrder'];
  if (stateId === 'Contact' || stateId === 'Suppressed') return ['TakeCover'];
  return [];
}

export function isAiPlanAllowedInState(plan: AiPlan, stateId: AiStateId): boolean {
  return allowedPlanKindsForState(stateId).includes(plan.kind);
}

export function selectAiPlanForState(input: AiPlanSelectionInput): AiPlanSelectionResult {
  const allowedKinds = allowedPlanKindsForState(input.stateId);
  if (input.stateId === 'FollowingOrder' && input.blackboard.player_command_active === true) {
    const plan = createFollowMoveOrderPlan({
      id: makeAiPlanId(input.unitId, 'FollowMoveOrder', input.nowMs, input.sequence),
      nowMs: input.nowMs,
      createdForState: input.stateId,
      replacesPlanId: input.replacesPlanId,
      context: {
        orderRevision: readNumber(input.blackboard.player_command_revision, 0),
        orderTarget: readPosition(input.blackboard.order_target_position)
          ?? readPosition(input.blackboard.player_command_target_position)
          ?? undefined,
      },
    });
    return {
      plan,
      allowedKinds,
      selectedKind: plan.kind,
      explanation: 'The movement-order plan is the highest allowed candidate in FollowingOrder.',
      explanationRu: 'В состоянии «Выполнение приказа» выбран допустимый план выполнения движения.',
    };
  }
  if ((input.stateId === 'Contact' || input.stateId === 'Suppressed')
    && readPosition(input.blackboard.best_cover_position)) {
    const plan = createTakeCoverPlan({
      id: makeAiPlanId(input.unitId, 'TakeCover', input.nowMs, input.sequence),
      nowMs: input.nowMs,
      createdForState: input.stateId,
      replacesPlanId: input.replacesPlanId,
      context: {
        contactId: readString(input.blackboard.visible_enemy_id) ?? undefined,
        coverPosition: readPosition(input.blackboard.best_cover_position) ?? undefined,
      },
      score: input.stateId === 'Suppressed' ? 100 : 90,
      riskScore: readNumber(input.blackboard.suppression, input.stateId === 'Suppressed' ? 85 : 60),
    });
    return {
      plan,
      allowedKinds,
      selectedKind: plan.kind,
      explanation: 'TakeCover is the highest allowed self-preservation candidate.',
      explanationRu: 'Выбран самый приоритетный допустимый план самосохранения — занять укрытие.',
    };
  }
  return {
    allowedKinds,
    explanation: 'No valid plan candidate is available for the current state.',
    explanationRu: 'Для текущего состояния нет подходящего допустимого плана.',
  };
}

export function buildAiPlanStepGraph(plan: AiPlan): AiGraph | undefined {
  const step = getCurrentAiPlanStep(plan);
  if (!step) return undefined;
  const inputBindings = Object.fromEntries(
    Object.entries(step.inputKeyOverrides ?? {}).map(([port, key]) => [port, { source: 'blackboard' as const, key }]),
  );
  return {
    version: 2,
    id: `ai_plan_step:${plan.id}:${step.id}`,
    name: `${plan.goal} / ${step.label}`,
    nameRu: `${plan.goalRu} / ${step.labelRu}`,
    description: 'Generated plan-step graph that delegates execution to an existing reusable subgraph.',
    descriptionRu: 'Служебный граф шага плана, который передаёт выполнение существующему подграфу.',
    rootNodeId: 'root',
    blackboardSchema: [],
    blackboardDefaults: {},
    subgraphRefs: [step.subgraphId],
    nodes: [
      { id: 'root', type: 'Root', children: ['plan_branch'] },
      {
        id: 'plan_branch',
        type: 'ActionBranch',
        displayName: plan.goal,
        displayNameRu: plan.goalRu,
        children: ['plan_step_subgraph'],
      },
      {
        id: 'plan_step_subgraph',
        type: 'Subgraph',
        displayName: step.label,
        displayNameRu: step.labelRu,
        children: [],
        parameters: { subgraphId: step.subgraphId, cancelPolicy: 'cancel_child' },
        inputBindings,
      },
    ],
  };
}

export function buildAiPlanConditionValues(
  blackboard: AiGraphRunnerBlackboard,
  plan: AiPlan,
): Readonly<Record<string, unknown>> {
  return {
    ...blackboard,
    best_cover_position_revision: positionsEqual(
      readPosition(blackboard.best_cover_position),
      plan.context?.coverPosition,
    ) ? 0 : 1,
    suppression_band: readNumber(blackboard.suppression, 0) >= 70 ? 'Suppressed' : 'Contact',
  };
}

export function readAiExecutionOwnerToken(
  executionState: AiGraphExecutionState | undefined,
): string | undefined {
  const data = executionState?.activeData;
  if (!data) return undefined;
  if (data.kind === 'move_to_blackboard_position') return data.actionToken;
  if (data.kind === 'subgraph') return readAiExecutionOwnerToken(data.nestedExecutionState);
  return undefined;
}

function positionsEqual(
  left: { x: number; y: number } | null,
  right: { x: number; y: number } | undefined,
): boolean {
  return Boolean(left && right && left.x === right.x && left.y === right.y);
}

function readPosition(value: unknown): { x: number; y: number } | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const point = value as { x?: unknown; y?: unknown };
  return typeof point.x === 'number' && Number.isFinite(point.x)
    && typeof point.y === 'number' && Number.isFinite(point.y)
    ? { x: point.x, y: point.y }
    : null;
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}
