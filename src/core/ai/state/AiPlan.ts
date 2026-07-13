import type { GridPosition } from '../../geometry';
import type { AiConditionBinding, AiStateId } from './AiStateMachine';

export type AiPlanStatus = 'active' | 'success' | 'failure' | 'cancelled' | 'replanning';
export type AiPlanStepStatus = 'pending' | 'running' | 'success' | 'failure' | 'cancelled';
export type AiPlanStepFailurePolicy = 'fail_plan' | 'retry' | 'replan';
export type AiPlanKind = 'FollowMoveOrder' | 'TakeCover';

export interface AiPlanStep {
  readonly id: string;
  readonly label: string;
  readonly labelRu: string;
  readonly subgraphId: string;
  readonly status: AiPlanStepStatus;
  readonly failurePolicy: AiPlanStepFailurePolicy;
  readonly maxAttempts?: number;
  readonly attempt: number;
  readonly inputKeyOverrides?: Readonly<Record<string, string>>;
}

export interface AiPlanContext {
  readonly orderRevision?: number;
  readonly orderTarget?: GridPosition;
  readonly contactId?: string;
  readonly coverPosition?: GridPosition;
}

export interface AiPlan {
  readonly id: string;
  readonly kind: AiPlanKind;
  readonly goal: string;
  readonly goalRu: string;
  readonly createdAtMs: number;
  readonly createdForState: AiStateId;
  readonly steps: readonly AiPlanStep[];
  readonly currentStepIndex: number;
  readonly status: AiPlanStatus;
  readonly expectedDurationMs?: number;
  readonly riskScore: number;
  readonly score: number;
  readonly reasons: readonly string[];
  readonly reasonsRu: readonly string[];
  readonly abortConditions: readonly AiConditionBinding[];
  readonly replanConditions: readonly AiConditionBinding[];
  readonly replacesPlanId?: string;
  readonly context?: AiPlanContext;
  readonly cancellationReason?: string;
  readonly cancellationReasonRu?: string;
}

export interface CreatePlanInput {
  readonly id: string;
  readonly nowMs: number;
  readonly createdForState: AiStateId;
  readonly replacesPlanId?: string;
  readonly context?: AiPlanContext;
  readonly score?: number;
  readonly riskScore?: number;
  readonly reasons?: readonly string[];
  readonly reasonsRu?: readonly string[];
}

export function createFollowMoveOrderPlan(input: CreatePlanInput): AiPlan {
  return {
    id: input.id,
    kind: 'FollowMoveOrder',
    goal: 'Complete the movement order',
    goalRu: 'Выполнить приказ движения',
    createdAtMs: finiteNonNegative(input.nowMs, 0),
    createdForState: input.createdForState,
    steps: [
      {
        id: 'move_and_observe',
        label: 'Move and observe',
        labelRu: 'Двигаться и наблюдать',
        subgraphId: 'move_and_observe',
        status: 'pending',
        failurePolicy: 'replan',
        maxAttempts: 1,
        attempt: 0,
        inputKeyOverrides: { destination: 'order_target_position' },
      },
    ],
    currentStepIndex: 0,
    status: 'active',
    expectedDurationMs: 20000,
    riskScore: clampScore(input.riskScore ?? 25),
    score: clampScore(input.score ?? 70),
    reasons: input.reasons ?? ['A valid movement order is active.', 'The route target is available.'],
    reasonsRu: input.reasonsRu ?? ['Действует приказ движения.', 'Цель маршрута доступна.'],
    abortConditions: [
      condition('order_missing', 'player_command_active', 'falsy', undefined, 'The order is cancelled.', 'Приказ отменён.'),
      condition('combat_contact', 'enemyKnown', 'truthy', undefined, 'A combat contact appeared.', 'Появился боевой контакт.'),
    ],
    replanConditions: [
      condition('new_order', 'player_command_revision', 'neq', input.context?.orderRevision ?? 0, 'A new order replaced the current order.', 'Получен новый приказ.'),
      condition('route_blocked', 'active_move_path_status', 'eq', 'blocked', 'The route is finally blocked.', 'Маршрут окончательно заблокирован.'),
    ],
    replacesPlanId: input.replacesPlanId,
    context: cloneContext(input.context),
  };
}

export function createTakeCoverPlan(input: CreatePlanInput): AiPlan {
  const suppressionReason = input.createdForState === 'Suppressed'
    ? 'Suppression makes self-preservation the highest-priority allowed branch.'
    : 'A combat contact makes cover the best allowed response.';
  const suppressionReasonRu = input.createdForState === 'Suppressed'
    ? 'Подавление делает самосохранение самым приоритетным допустимым действием.'
    : 'При боевом контакте занятие укрытия — лучший допустимый ответ.';
  return {
    id: input.id,
    kind: 'TakeCover',
    goal: 'Take cover',
    goalRu: 'Занять укрытие',
    createdAtMs: finiteNonNegative(input.nowMs, 0),
    createdForState: input.createdForState,
    steps: [
      {
        id: 'take_cover',
        label: 'Move to cover',
        labelRu: 'Движение к укрытию',
        subgraphId: 'take_cover',
        status: 'pending',
        failurePolicy: 'replan',
        maxAttempts: 1,
        attempt: 0,
        inputKeyOverrides: { cover_position: 'best_cover_position' },
      },
      {
        id: 'observe_after_cover',
        label: 'Observe after taking position',
        labelRu: 'Наблюдать после занятия позиции',
        subgraphId: 'move_and_observe',
        status: 'pending',
        failurePolicy: 'fail_plan',
        maxAttempts: 1,
        attempt: 0,
        inputKeyOverrides: { destination: 'self_position' },
      },
    ],
    currentStepIndex: 0,
    status: 'active',
    expectedDurationMs: 18000,
    riskScore: clampScore(input.riskScore ?? (input.createdForState === 'Suppressed' ? 85 : 60)),
    score: clampScore(input.score ?? (input.createdForState === 'Suppressed' ? 100 : 90)),
    reasons: input.reasons ?? [suppressionReason, 'A cover position was found.', 'The route is available.'],
    reasonsRu: input.reasonsRu ?? [suppressionReasonRu, 'Рядом найдено укрытие.', 'Путь доступен.'],
    abortConditions: [
      condition('cover_missing', 'best_cover_position', 'falsy', undefined, 'The cover position is no longer available.', 'Укрытие стало недоступно.'),
      condition('route_blocked', 'active_move_path_status', 'eq', 'blocked', 'The route to cover is blocked.', 'Маршрут к укрытию заблокирован.'),
    ],
    replanConditions: [
      condition('cover_changed', 'best_cover_position_revision', 'neq', 0, 'A safer cover position was found.', 'Найдено более безопасное укрытие.'),
      condition('suppression_changed', 'suppression_band', 'neq', input.createdForState, 'Suppression changed significantly.', 'Подавление заметно изменилось.'),
    ],
    replacesPlanId: input.replacesPlanId,
    context: cloneContext(input.context),
  };
}

export function cloneAiPlan(plan: AiPlan): AiPlan {
  return {
    ...plan,
    steps: plan.steps.map((step) => ({
      ...step,
      inputKeyOverrides: step.inputKeyOverrides ? { ...step.inputKeyOverrides } : undefined,
    })),
    reasons: [...plan.reasons],
    reasonsRu: [...plan.reasonsRu],
    abortConditions: plan.abortConditions.map((item) => ({ ...item })),
    replanConditions: plan.replanConditions.map((item) => ({ ...item })),
    context: cloneContext(plan.context),
  };
}

export function getCurrentAiPlanStep(plan: AiPlan): AiPlanStep | undefined {
  return plan.steps[plan.currentStepIndex];
}

function condition(
  id: string,
  key: string,
  operator: AiConditionBinding['operator'],
  value: AiConditionBinding['value'],
  label: string,
  labelRu: string,
): AiConditionBinding {
  return { id, key, operator, value, label, labelRu };
}

function cloneContext(value: AiPlanContext | undefined): AiPlanContext | undefined {
  return value
    ? {
        ...value,
        orderTarget: value.orderTarget ? { ...value.orderTarget } : undefined,
        coverPosition: value.coverPosition ? { ...value.coverPosition } : undefined,
      }
    : undefined;
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
}

function finiteNonNegative(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : fallback;
}
