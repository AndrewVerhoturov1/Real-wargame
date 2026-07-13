import { evaluateAiConditionBinding } from './AiStateMachine';
import {
  cloneAiPlan,
  getCurrentAiPlanStep,
  type AiPlan,
  type AiPlanKind,
  type AiPlanStep,
  type AiPlanStepFailurePolicy,
  type AiPlanStepStatus,
  type AiPlanStatus,
} from './AiPlan';

export type AiPlanStepExecutionStatus = 'running' | 'waiting' | 'success' | 'failure' | 'cancelled';

export interface AiPlanConditionResult {
  readonly matched: boolean;
  readonly conditionId?: string;
  readonly reason?: string;
  readonly reasonRu?: string;
}

export interface AiPlanRuntimeUpdate {
  readonly plan: AiPlan;
  readonly startedStep?: AiPlanStep;
  readonly completedStep?: AiPlanStep;
  readonly terminal: boolean;
  readonly needsReplan: boolean;
}

export function makeAiPlanId(
  unitId: string,
  kind: AiPlanKind,
  nowMs: number,
  sequence = 0,
): string {
  const safeUnit = unitId.replace(/[^a-zA-Z0-9_-]+/g, '_');
  return `${safeUnit}:${kind}:${Math.max(0, Math.floor(nowMs))}:${Math.max(0, Math.floor(sequence))}`;
}

export function startCurrentAiPlanStep(plan: AiPlan): AiPlanRuntimeUpdate {
  if (plan.status !== 'active') return unchanged(plan);
  const current = getCurrentAiPlanStep(plan);
  if (!current || current.status === 'running') return unchanged(plan);
  if (current.status !== 'pending') return unchanged(plan);
  const started: AiPlanStep = {
    ...current,
    status: 'running',
    attempt: current.attempt + 1,
  };
  const nextPlan = replaceStep(plan, plan.currentStepIndex, started);
  return {
    plan: nextPlan,
    startedStep: started,
    terminal: false,
    needsReplan: false,
  };
}

export function applyAiPlanStepExecution(
  plan: AiPlan,
  status: AiPlanStepExecutionStatus,
  reason?: string,
  reasonRu?: string,
): AiPlanRuntimeUpdate {
  if (plan.status !== 'active') return unchanged(plan);
  const current = getCurrentAiPlanStep(plan);
  if (!current) return terminalPlan(plan, 'failure', reason ?? 'Plan has no current step.', reasonRu ?? 'У плана нет текущего шага.');
  if (status === 'running' || status === 'waiting') return unchanged(plan);
  if (status === 'cancelled') {
    const cancelledStep = { ...current, status: 'cancelled' as const };
    return {
      plan: {
        ...replaceStep(plan, plan.currentStepIndex, cancelledStep),
        status: 'cancelled',
        cancellationReason: reason ?? 'The active step was cancelled.',
        cancellationReasonRu: reasonRu ?? 'Активный шаг отменён.',
      },
      completedStep: cancelledStep,
      terminal: true,
      needsReplan: false,
    };
  }
  if (status === 'success') {
    const succeededStep = { ...current, status: 'success' as const };
    const withSuccess = replaceStep(plan, plan.currentStepIndex, succeededStep);
    const isLast = plan.currentStepIndex >= plan.steps.length - 1;
    return {
      plan: isLast
        ? { ...withSuccess, status: 'success' }
        : { ...withSuccess, currentStepIndex: plan.currentStepIndex + 1 },
      completedStep: succeededStep,
      terminal: isLast,
      needsReplan: false,
    };
  }
  return applyFailure(plan, current, reason, reasonRu);
}

export function cancelAiPlan(
  plan: AiPlan,
  reason: string,
  reasonRu: string,
  status: Extract<AiPlanStatus, 'cancelled' | 'replanning'> = 'cancelled',
): AiPlanRuntimeUpdate {
  const current = getCurrentAiPlanStep(plan);
  const cancelledStep = current && current.status === 'running'
    ? { ...current, status: 'cancelled' as const }
    : current;
  const next = cancelledStep
    ? replaceStep(plan, plan.currentStepIndex, cancelledStep)
    : cloneAiPlan(plan);
  return {
    plan: {
      ...next,
      status,
      cancellationReason: reason,
      cancellationReasonRu: reasonRu,
    },
    completedStep: cancelledStep?.status === 'cancelled' ? cancelledStep : undefined,
    terminal: status === 'cancelled',
    needsReplan: status === 'replanning',
  };
}

export function evaluateAiPlanAbort(
  plan: AiPlan,
  values: Readonly<Record<string, unknown>>,
): AiPlanConditionResult {
  for (const condition of plan.abortConditions) {
    if (evaluateAiConditionBinding(condition, values)) {
      return {
        matched: true,
        conditionId: condition.id,
        reason: condition.label,
        reasonRu: condition.labelRu,
      };
    }
  }
  return { matched: false };
}

export function evaluateAiPlanReplan(
  plan: AiPlan,
  values: Readonly<Record<string, unknown>>,
): AiPlanConditionResult {
  for (const condition of plan.replanConditions) {
    if (evaluateAiConditionBinding(condition, values)) {
      return {
        matched: true,
        conditionId: condition.id,
        reason: condition.label,
        reasonRu: condition.labelRu,
      };
    }
  }
  return { matched: false };
}

export function normalizeAiPlan(value: unknown): AiPlan | undefined {
  if (!isRecord(value)
    || typeof value.id !== 'string'
    || !isPlanKind(value.kind)
    || typeof value.goal !== 'string'
    || typeof value.goalRu !== 'string'
    || typeof value.createdAtMs !== 'number'
    || !isStateId(value.createdForState)
    || !Array.isArray(value.steps)
    || !isPlanStatus(value.status)) {
    return undefined;
  }
  const steps = value.steps.map(normalizeStep);
  if (steps.some((step) => !step)) return undefined;
  const currentStepIndex = Number.isInteger(value.currentStepIndex)
    ? Math.max(0, Math.min(steps.length, Number(value.currentStepIndex)))
    : 0;
  return {
    id: value.id,
    kind: value.kind,
    goal: value.goal,
    goalRu: value.goalRu,
    createdAtMs: finiteNonNegative(value.createdAtMs, 0),
    createdForState: value.createdForState,
    steps: steps as AiPlanStep[],
    currentStepIndex,
    status: value.status,
    expectedDurationMs: finiteOptional(value.expectedDurationMs),
    riskScore: clampScore(value.riskScore),
    score: clampScore(value.score),
    reasons: stringArray(value.reasons),
    reasonsRu: stringArray(value.reasonsRu),
    abortConditions: conditionArray(value.abortConditions),
    replanConditions: conditionArray(value.replanConditions),
    replacesPlanId: typeof value.replacesPlanId === 'string' ? value.replacesPlanId : undefined,
    context: isRecord(value.context)
      ? {
          orderRevision: finiteOptional(value.context.orderRevision),
          orderTarget: position(value.context.orderTarget),
          contactId: typeof value.context.contactId === 'string' ? value.context.contactId : undefined,
          coverPosition: position(value.context.coverPosition),
        }
      : undefined,
    cancellationReason: typeof value.cancellationReason === 'string' ? value.cancellationReason : undefined,
    cancellationReasonRu: typeof value.cancellationReasonRu === 'string' ? value.cancellationReasonRu : undefined,
  };
}

function applyFailure(
  plan: AiPlan,
  current: AiPlanStep,
  reason?: string,
  reasonRu?: string,
): AiPlanRuntimeUpdate {
  const maxAttempts = Math.max(1, current.maxAttempts ?? 1);
  if (current.failurePolicy === 'retry' && current.attempt < maxAttempts) {
    const pending = { ...current, status: 'pending' as const };
    return {
      plan: replaceStep(plan, plan.currentStepIndex, pending),
      completedStep: { ...current, status: 'failure' },
      terminal: false,
      needsReplan: false,
    };
  }
  const failed = { ...current, status: 'failure' as const };
  const withFailure = replaceStep(plan, plan.currentStepIndex, failed);
  if (current.failurePolicy === 'replan') {
    return {
      plan: {
        ...withFailure,
        status: 'replanning',
        cancellationReason: reason ?? 'The plan step failed and requires replanning.',
        cancellationReasonRu: reasonRu ?? 'Шаг плана завершился неудачей и требует перестроения.',
      },
      completedStep: failed,
      terminal: false,
      needsReplan: true,
    };
  }
  return {
    plan: {
      ...withFailure,
      status: 'failure',
      cancellationReason: reason ?? 'The plan step failed.',
      cancellationReasonRu: reasonRu ?? 'Шаг плана завершился неудачей.',
    },
    completedStep: failed,
    terminal: true,
    needsReplan: false,
  };
}

function terminalPlan(
  plan: AiPlan,
  status: Extract<AiPlanStatus, 'failure' | 'cancelled'>,
  reason: string,
  reasonRu: string,
): AiPlanRuntimeUpdate {
  return {
    plan: {
      ...cloneAiPlan(plan),
      status,
      cancellationReason: reason,
      cancellationReasonRu: reasonRu,
    },
    terminal: true,
    needsReplan: false,
  };
}

function unchanged(plan: AiPlan): AiPlanRuntimeUpdate {
  return {
    plan: cloneAiPlan(plan),
    terminal: plan.status === 'success' || plan.status === 'failure' || plan.status === 'cancelled',
    needsReplan: plan.status === 'replanning',
  };
}

function replaceStep(plan: AiPlan, index: number, step: AiPlanStep): AiPlan {
  return {
    ...cloneAiPlan(plan),
    steps: plan.steps.map((candidate, candidateIndex) => candidateIndex === index ? { ...step } : { ...candidate }),
  };
}

function normalizeStep(value: unknown): AiPlanStep | undefined {
  if (!isRecord(value)
    || typeof value.id !== 'string'
    || typeof value.label !== 'string'
    || typeof value.labelRu !== 'string'
    || typeof value.subgraphId !== 'string'
    || !isStepStatus(value.status)
    || !isFailurePolicy(value.failurePolicy)) {
    return undefined;
  }
  return {
    id: value.id,
    label: value.label,
    labelRu: value.labelRu,
    subgraphId: value.subgraphId,
    status: value.status,
    failurePolicy: value.failurePolicy,
    maxAttempts: finiteOptional(value.maxAttempts),
    attempt: Math.max(0, Math.floor(finiteNonNegative(value.attempt, 0))),
    inputKeyOverrides: isRecord(value.inputKeyOverrides)
      ? Object.fromEntries(Object.entries(value.inputKeyOverrides).filter((item): item is [string, string] => typeof item[1] === 'string'))
      : undefined,
  };
}

function conditionArray(value: unknown): AiPlan['abortConditions'] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).flatMap((item) => {
    if (typeof item.id !== 'string'
      || typeof item.key !== 'string'
      || typeof item.operator !== 'string'
      || typeof item.label !== 'string'
      || typeof item.labelRu !== 'string') return [];
    if (!['truthy', 'falsy', 'eq', 'neq', 'gt', 'gte', 'lt', 'lte'].includes(item.operator)) return [];
    return [{
      id: item.id,
      key: item.key,
      operator: item.operator as AiPlan['abortConditions'][number]['operator'],
      value: item.value as AiPlan['abortConditions'][number]['value'],
      label: item.label,
      labelRu: item.labelRu,
    }];
  });
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function position(value: unknown): { x: number; y: number } | undefined {
  return isRecord(value) && typeof value.x === 'number' && typeof value.y === 'number'
    ? { x: value.x, y: value.y }
    : undefined;
}

function isPlanKind(value: unknown): value is AiPlanKind {
  return value === 'FollowMoveOrder' || value === 'TakeCover';
}

function isPlanStatus(value: unknown): value is AiPlanStatus {
  return value === 'active' || value === 'success' || value === 'failure' || value === 'cancelled' || value === 'replanning';
}

function isStepStatus(value: unknown): value is AiPlanStepStatus {
  return value === 'pending' || value === 'running' || value === 'success' || value === 'failure' || value === 'cancelled';
}

function isFailurePolicy(value: unknown): value is AiPlanStepFailurePolicy {
  return value === 'fail_plan' || value === 'retry' || value === 'replan';
}

function isStateId(value: unknown): value is AiPlan['createdForState'] {
  return value === 'Idle' || value === 'FollowingOrder' || value === 'Contact' || value === 'Suppressed';
}

function finiteOptional(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : undefined;
}

function finiteNonNegative(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : fallback;
}

function clampScore(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
