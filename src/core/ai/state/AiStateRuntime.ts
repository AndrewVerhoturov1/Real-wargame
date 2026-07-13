import {
  DEFAULT_AI_STATE_MACHINE,
  evaluateAiConditionBinding,
  getAiStatePath,
  type AiStateId,
  type AiStateMachineDefinition,
  type AiStateNodeId,
  type AiStateTransition,
  type AiTransitionTrigger,
} from './AiStateMachine';

export interface AiStateTransitionRecord {
  readonly transitionId: string;
  readonly from: AiStateId;
  readonly to: AiStateId;
  readonly trigger: AiTransitionTrigger;
  readonly reason: string;
  readonly reasonRu: string;
  readonly atMs: number;
  readonly exitedStateIds: readonly AiStateNodeId[];
  readonly enteredStateIds: readonly AiStateNodeId[];
}

export interface AiStateRuntimeSnapshotV1 {
  readonly version: 1;
  readonly activeStateId: AiStateId;
  readonly activePath: readonly AiStateNodeId[];
  readonly previousStateId?: AiStateId;
  readonly enteredAtMs: number;
  readonly suppressionBelowSinceMs?: number;
  readonly lastTransition?: AiStateTransitionRecord;
  readonly trace: readonly AiStateTransitionRecord[];
}

export interface CreateAiStateRuntimeInput {
  readonly activeStateId?: AiStateId;
  readonly enteredAtMs?: number;
  readonly previousStateId?: AiStateId;
  readonly suppressionBelowSinceMs?: number;
  readonly lastTransition?: AiStateTransitionRecord;
  readonly trace?: readonly AiStateTransitionRecord[];
  readonly machine?: AiStateMachineDefinition;
}

export interface UpdateAiStateRuntimeInput {
  readonly nowMs: number;
  readonly triggers?: readonly AiTransitionTrigger[];
  readonly values?: Readonly<Record<string, unknown>>;
  readonly suppression?: number;
  readonly suppressionCriticalThreshold?: number;
  readonly suppressionExitThreshold?: number;
  readonly suppressionExitStableMs?: number;
  readonly machine?: AiStateMachineDefinition;
}

export interface UpdateAiStateRuntimeResult {
  readonly runtime: AiStateRuntimeSnapshotV1;
  readonly transition?: AiStateTransitionRecord;
}

const TRACE_LIMIT = 32;

export function createAiStateRuntime(
  input: CreateAiStateRuntimeInput = {},
): AiStateRuntimeSnapshotV1 {
  const machine = input.machine ?? DEFAULT_AI_STATE_MACHINE;
  const activeStateId = input.activeStateId ?? machine.initialStateId;
  return {
    version: 1,
    activeStateId,
    activePath: getAiStatePath(machine, activeStateId),
    previousStateId: input.previousStateId,
    enteredAtMs: finiteNonNegative(input.enteredAtMs, 0),
    suppressionBelowSinceMs: finiteOptional(input.suppressionBelowSinceMs),
    lastTransition: cloneTransitionRecord(input.lastTransition),
    trace: (input.trace ?? []).slice(-TRACE_LIMIT).map(cloneTransitionRecordRequired),
  };
}

export function updateAiStateRuntime(
  current: AiStateRuntimeSnapshotV1,
  input: UpdateAiStateRuntimeInput,
): UpdateAiStateRuntimeResult {
  const machine = input.machine ?? DEFAULT_AI_STATE_MACHINE;
  const nowMs = finiteNonNegative(input.nowMs, current.enteredAtMs);
  const suppressionRuntime = updateSuppressionStability(current, input, nowMs);
  const triggers = uniqueTriggers([
    ...(input.triggers ?? []),
    ...suppressionRuntime.derivedTriggers,
  ]);
  const candidates = machine.transitions
    .filter((transition) => transition.to !== current.activeStateId)
    .filter((transition) => transition.from === '*' || transition.from === current.activeStateId)
    .filter((transition) => triggers.includes(transition.trigger))
    .filter((transition) => transition.guards.every((guard) => evaluateAiConditionBinding(guard, input.values ?? {})))
    .filter((transition) => sourceDurationAllows(machine, current, transition, nowMs))
    .slice()
    .sort(compareTransitions);

  const selected = candidates[0];
  if (!selected) {
    return {
      runtime: {
        ...cloneAiStateRuntime(current),
        suppressionBelowSinceMs: suppressionRuntime.suppressionBelowSinceMs,
      },
    };
  }

  const previousPath = current.activePath;
  const nextPath = getAiStatePath(machine, selected.to);
  const sharedPrefixLength = commonPrefixLength(previousPath, nextPath);
  const exitedStateIds = previousPath.slice(sharedPrefixLength).reverse();
  const enteredStateIds = nextPath.slice(sharedPrefixLength);
  const transition: AiStateTransitionRecord = {
    transitionId: selected.id,
    from: current.activeStateId,
    to: selected.to,
    trigger: selected.trigger,
    reason: selected.reason,
    reasonRu: selected.reasonRu,
    atMs: nowMs,
    exitedStateIds,
    enteredStateIds,
  };

  return {
    transition,
    runtime: {
      version: 1,
      activeStateId: selected.to,
      activePath: nextPath,
      previousStateId: current.activeStateId,
      enteredAtMs: nowMs,
      suppressionBelowSinceMs: selected.to === 'Suppressed'
        ? undefined
        : suppressionRuntime.suppressionBelowSinceMs,
      lastTransition: transition,
      trace: [...current.trace, transition].slice(-TRACE_LIMIT),
    },
  };
}

export function normalizeAiStateRuntime(
  value: unknown,
  machine: AiStateMachineDefinition = DEFAULT_AI_STATE_MACHINE,
): AiStateRuntimeSnapshotV1 {
  if (!isRecord(value) || value.version !== 1 || !isAiStateId(value.activeStateId)) {
    return createAiStateRuntime({ machine });
  }
  const previousStateId = isAiStateId(value.previousStateId) ? value.previousStateId : undefined;
  const trace = Array.isArray(value.trace)
    ? value.trace.map(normalizeTransitionRecord).filter((item): item is AiStateTransitionRecord => Boolean(item))
    : [];
  return createAiStateRuntime({
    machine,
    activeStateId: value.activeStateId,
    previousStateId,
    enteredAtMs: finiteNonNegative(value.enteredAtMs, 0),
    suppressionBelowSinceMs: finiteOptional(value.suppressionBelowSinceMs),
    lastTransition: normalizeTransitionRecord(value.lastTransition),
    trace,
  });
}

export function cloneAiStateRuntime(
  value: AiStateRuntimeSnapshotV1,
): AiStateRuntimeSnapshotV1 {
  return {
    version: 1,
    activeStateId: value.activeStateId,
    activePath: [...value.activePath],
    previousStateId: value.previousStateId,
    enteredAtMs: value.enteredAtMs,
    suppressionBelowSinceMs: value.suppressionBelowSinceMs,
    lastTransition: cloneTransitionRecord(value.lastTransition),
    trace: value.trace.map(cloneTransitionRecordRequired),
  };
}

function updateSuppressionStability(
  current: AiStateRuntimeSnapshotV1,
  input: UpdateAiStateRuntimeInput,
  nowMs: number,
): { readonly suppressionBelowSinceMs?: number; readonly derivedTriggers: readonly AiTransitionTrigger[] } {
  if (typeof input.suppression !== 'number' || !Number.isFinite(input.suppression)) {
    return { suppressionBelowSinceMs: current.suppressionBelowSinceMs, derivedTriggers: [] };
  }
  const critical = finiteNonNegative(input.suppressionCriticalThreshold, 70);
  const exit = finiteNonNegative(input.suppressionExitThreshold, 35);
  const stableMs = finiteNonNegative(input.suppressionExitStableMs, 1200);
  if (input.suppression >= critical) {
    return { suppressionBelowSinceMs: undefined, derivedTriggers: ['suppression_critical'] };
  }
  if (current.activeStateId !== 'Suppressed') {
    return { suppressionBelowSinceMs: undefined, derivedTriggers: [] };
  }
  if (input.suppression > exit) {
    return { suppressionBelowSinceMs: undefined, derivedTriggers: [] };
  }
  const belowSince = current.suppressionBelowSinceMs ?? nowMs;
  return {
    suppressionBelowSinceMs: belowSince,
    derivedTriggers: nowMs - belowSince >= stableMs ? ['suppression_stable'] : [],
  };
}

function sourceDurationAllows(
  machine: AiStateMachineDefinition,
  current: AiStateRuntimeSnapshotV1,
  transition: AiStateTransition,
  nowMs: number,
): boolean {
  if (transition.emergency) return true;
  const stateMinimum = machine.states[current.activeStateId].minimumDurationMs ?? 0;
  const transitionMinimum = transition.minimumSourceDurationMs ?? 0;
  return nowMs - current.enteredAtMs >= Math.max(stateMinimum, transitionMinimum);
}

function compareTransitions(left: AiStateTransition, right: AiStateTransition): number {
  if (left.priority !== right.priority) return right.priority - left.priority;
  return left.id.localeCompare(right.id);
}

function commonPrefixLength(left: readonly AiStateNodeId[], right: readonly AiStateNodeId[]): number {
  let index = 0;
  while (index < left.length && index < right.length && left[index] === right[index]) index += 1;
  return index;
}

function uniqueTriggers(values: readonly AiTransitionTrigger[]): AiTransitionTrigger[] {
  return Array.from(new Set(values));
}

function normalizeTransitionRecord(value: unknown): AiStateTransitionRecord | undefined {
  if (!isRecord(value)
    || typeof value.transitionId !== 'string'
    || !isAiStateId(value.from)
    || !isAiStateId(value.to)
    || !isAiTransitionTrigger(value.trigger)
    || typeof value.reason !== 'string'
    || typeof value.reasonRu !== 'string'
    || typeof value.atMs !== 'number'
    || !Array.isArray(value.exitedStateIds)
    || !Array.isArray(value.enteredStateIds)) {
    return undefined;
  }
  return {
    transitionId: value.transitionId,
    from: value.from,
    to: value.to,
    trigger: value.trigger,
    reason: value.reason,
    reasonRu: value.reasonRu,
    atMs: finiteNonNegative(value.atMs, 0),
    exitedStateIds: value.exitedStateIds.filter(isAiStateNodeId),
    enteredStateIds: value.enteredStateIds.filter(isAiStateNodeId),
  };
}

function cloneTransitionRecord(value: AiStateTransitionRecord | undefined): AiStateTransitionRecord | undefined {
  return value ? cloneTransitionRecordRequired(value) : undefined;
}

function cloneTransitionRecordRequired(value: AiStateTransitionRecord): AiStateTransitionRecord {
  return {
    ...value,
    exitedStateIds: [...value.exitedStateIds],
    enteredStateIds: [...value.enteredStateIds],
  };
}

function isAiStateId(value: unknown): value is AiStateId {
  return value === 'Idle' || value === 'FollowingOrder' || value === 'Contact' || value === 'Suppressed';
}

function isAiStateNodeId(value: unknown): value is AiStateNodeId {
  return value === 'Normal' || value === 'Combat' || isAiStateId(value);
}

function isAiTransitionTrigger(value: unknown): value is AiTransitionTrigger {
  return value === 'move_order_received'
    || value === 'order_completed'
    || value === 'order_cancelled'
    || value === 'enemy_spotted'
    || value === 'combat_contact'
    || value === 'suppression_critical'
    || value === 'suppression_stable'
    || value === 'manual';
}

function finiteNonNegative(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : fallback;
}

function finiteOptional(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
