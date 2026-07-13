import type { AiGraphRunnerBlackboard } from '../AiGraphRunner';
import {
  cloneAiBlackboardObserverRegistry,
  createAiBlackboardObserverRegistry,
  normalizeAiBlackboardObserverRegistry,
  type AiBlackboardObserverRegistrySnapshotV1,
} from '../events/AiBlackboardObserver';
import {
  cloneAiEventQueueSnapshot,
  createAiEventQueue,
  normalizeAiEventQueueSnapshot,
  removeAiEventsById,
  type AiEventQueueSnapshotV1,
} from '../events/AiEventQueue';
import type {
  AiGraphExecutionState,
  AiGraphRuntimeResult,
} from '../AiGraphRuntime';
import { reconcileReactiveObserverRegistry } from '../events/AiReactiveRuntime';
import {
  cloneCompositeFrames,
  normalizeCompositeFrames,
} from './AiCompositeRuntime';
import { isReloadActionState } from './actions/ReloadAction';
import { isWaitForEventActionState } from './actions/WaitForEventAction';
import { cloneAiSubgraphExecutionState, isAiSubgraphExecutionState } from './AiSubgraphRuntime';
import {
  cloneAiMemoryScopes,
  createAiMemoryScopes,
  normalizeAiMemoryScopes,
  type AiMemoryScopesSnapshotV1,
} from '../contracts/AiMemoryScopes';
import { cloneAiStateRuntime, createAiStateRuntime, normalizeAiStateRuntime, type AiStateRuntimeSnapshotV1 } from '../state/AiStateRuntime';
import { cloneAiPlan, type AiPlan } from '../state/AiPlan';
import { normalizeAiPlan } from '../state/AiPlanRuntime';

export type AiRuntimeSessionStatus = 'idle' | 'active' | 'terminal';
export type AiRuntimeTerminalStatus = 'success' | 'failure' | 'cancelled';

export interface AiRuntimeTerminalRecord {
  readonly status: AiRuntimeTerminalStatus;
  readonly atMs: number;
  readonly reason: string;
  readonly reasonRu?: string;
}

export interface AiRuntimeSessionSnapshotV1 {
  readonly version: 1;
  readonly graphId: string;
  readonly unitId: string;
  readonly simulationTimeMs: number;
  readonly status: AiRuntimeSessionStatus;
  readonly executionState?: AiGraphExecutionState;
  readonly blackboardMemory: AiGraphRunnerBlackboard;
  readonly cooldowns: Record<string, number>;
  readonly eventQueue: AiEventQueueSnapshotV1;
  readonly observerRegistry: AiBlackboardObserverRegistrySnapshotV1;
  readonly memoryScopes: AiMemoryScopesSnapshotV1;
  readonly stateRuntime: AiStateRuntimeSnapshotV1;
  readonly activePlan?: AiPlan;
  readonly planHistory: readonly AiPlan[];
  readonly planSequence: number;
  readonly lastTerminal?: AiRuntimeTerminalRecord;
}

export interface CreateAiRuntimeSessionInput {
  readonly graphId: string;
  readonly unitId: string;
  readonly simulationTimeMs?: number;
  readonly executionState?: AiGraphExecutionState;
  readonly blackboardMemory?: AiGraphRunnerBlackboard;
  readonly cooldowns?: Record<string, number>;
  readonly eventQueue?: AiEventQueueSnapshotV1;
  readonly observerRegistry?: AiBlackboardObserverRegistrySnapshotV1;
  readonly memoryScopes?: AiMemoryScopesSnapshotV1;
  readonly stateRuntime?: AiStateRuntimeSnapshotV1;
  readonly activePlan?: AiPlan;
  readonly planHistory?: readonly AiPlan[];
  readonly planSequence?: number;
  readonly lastTerminal?: AiRuntimeTerminalRecord;
}

export interface NormalizeAiRuntimeSessionContext {
  readonly graphId: string;
  readonly unitId: string;
}

export interface NormalizeAiRuntimeSessionResult {
  readonly session: AiRuntimeSessionSnapshotV1;
  readonly resetReason?: string;
  readonly resetReasonRu?: string;
}

export interface LegacyAiRuntimeFields extends CreateAiRuntimeSessionInput {
  readonly aiGraphSimulationTimeMs?: number;
  readonly aiGraphExecutionState?: AiGraphExecutionState;
  readonly aiGraphMemory?: AiGraphRunnerBlackboard;
  readonly aiNodeCooldowns?: Record<string, number>;
}

export function createAiRuntimeSession(input: CreateAiRuntimeSessionInput): AiRuntimeSessionSnapshotV1 {
  const executionState = cloneExecutionState(input.executionState);
  return {
    version: 1,
    graphId: input.graphId,
    unitId: input.unitId,
    simulationTimeMs: finiteNonNegative(input.simulationTimeMs, 0),
    status: executionState ? 'active' : input.lastTerminal ? 'terminal' : 'idle',
    executionState,
    blackboardMemory: cloneBlackboard(input.blackboardMemory ?? {}),
    cooldowns: cloneCooldowns(input.cooldowns ?? {}),
    eventQueue: input.eventQueue
      ? cloneAiEventQueueSnapshot(input.eventQueue)
      : createAiEventQueue(),
    observerRegistry: input.observerRegistry
      ? cloneAiBlackboardObserverRegistry(input.observerRegistry)
      : createAiBlackboardObserverRegistry(),
    memoryScopes: input.memoryScopes
      ? cloneAiMemoryScopes(input.memoryScopes)
      : createAiMemoryScopes({ runtimeSessionMemory: input.blackboardMemory ?? {} }),
    stateRuntime: input.stateRuntime ? cloneAiStateRuntime(input.stateRuntime) : createAiStateRuntime({ enteredAtMs: input.simulationTimeMs }),
    activePlan: input.activePlan ? cloneAiPlan(input.activePlan) : undefined,
    planHistory: (input.planHistory ?? []).slice(-12).map(cloneAiPlan),
    planSequence: Math.max(0, Math.floor(finiteNonNegative(input.planSequence, 0))),
    lastTerminal: cloneTerminal(input.lastTerminal),
  };
}

export function normalizeAiRuntimeSession(
  value: unknown,
  context: NormalizeAiRuntimeSessionContext,
): NormalizeAiRuntimeSessionResult {
  if (!isRecord(value) || value.version !== 1) {
    return resetResult(
      context,
      'Runtime session version is missing or unsupported.',
      'Версия сеанса runtime отсутствует или не поддерживается.',
    );
  }

  if (value.graphId !== context.graphId || value.unitId !== context.unitId) {
    return resetResult(
      context,
      'Runtime session belongs to another graph or soldier.',
      'Сеанс runtime относится к другому графу или бойцу.',
    );
  }

  const executionState = normalizeExecutionState(value.executionState);
  if (value.executionState !== undefined && !executionState) {
    return resetResult(
      context,
      'Runtime execution state is malformed.',
      'Состояние выполнения runtime повреждено.',
    );
  }

  const lastTerminal = normalizeTerminal(value.lastTerminal);
  const requestedStatus = readStatus(value.status);
  const status: AiRuntimeSessionStatus = executionState
    ? 'active'
    : requestedStatus === 'terminal' && lastTerminal
      ? 'terminal'
      : 'idle';

  return {
    session: {
      version: 1,
      graphId: context.graphId,
      unitId: context.unitId,
      simulationTimeMs: finiteNonNegative(value.simulationTimeMs, 0),
      status,
      executionState,
      blackboardMemory: normalizeBlackboard(value.blackboardMemory),
      cooldowns: normalizeCooldowns(value.cooldowns),
      eventQueue: normalizeAiEventQueueSnapshot(value.eventQueue),
      observerRegistry: normalizeAiBlackboardObserverRegistry(value.observerRegistry),
      memoryScopes: normalizeAiMemoryScopes(value.memoryScopes, normalizeBlackboard(value.blackboardMemory)),
      stateRuntime: normalizeAiStateRuntime(value.stateRuntime),
      activePlan: normalizeAiPlan(value.activePlan),
      planHistory: normalizePlanHistory(value.planHistory),
      planSequence: Math.max(0, Math.floor(finiteNonNegative(value.planSequence, 0))),
      lastTerminal: cloneTerminal(lastTerminal),
    },
  };
}

export function migrateLegacyAiRuntimeSession(input: LegacyAiRuntimeFields): AiRuntimeSessionSnapshotV1 {
  return createAiRuntimeSession({
    graphId: input.graphId,
    unitId: input.unitId,
    simulationTimeMs: input.aiGraphSimulationTimeMs ?? input.simulationTimeMs,
    executionState: input.aiGraphExecutionState ?? input.executionState,
    blackboardMemory: input.aiGraphMemory ?? input.blackboardMemory,
    cooldowns: input.aiNodeCooldowns ?? input.cooldowns,
    eventQueue: input.eventQueue,
    observerRegistry: input.observerRegistry,
    memoryScopes: input.memoryScopes,
    stateRuntime: input.stateRuntime,
    activePlan: input.activePlan,
    planHistory: input.planHistory,
    planSequence: input.planSequence,
    lastTerminal: input.lastTerminal,
  });
}

export function applyRuntimeResultToSession(
  current: AiRuntimeSessionSnapshotV1,
  result: AiGraphRuntimeResult,
  simulationTimeMs: number,
): AiRuntimeSessionSnapshotV1 {
  const executionState = cloneExecutionState(result.executionState);
  const terminalStatus = toTerminalStatus(result.status);
  const eventQueue = removeAiEventsById(current.eventQueue, result.consumedEventIds ?? []);
  const observerRegistry = reconcileReactiveObserverRegistry(
    current.observerRegistry,
    result.reactiveObserverDefinitions ?? [],
    result.blackboard,
  );
  return {
    version: 1,
    graphId: result.graphId,
    unitId: result.unitId,
    simulationTimeMs: finiteNonNegative(simulationTimeMs, current.simulationTimeMs),
    status: executionState || result.status === 'running' || result.status === 'waiting'
      ? 'active'
      : terminalStatus
        ? 'terminal'
        : 'idle',
    executionState,
    blackboardMemory: cloneBlackboard(current.blackboardMemory),
    cooldowns: cloneCooldowns(result.cooldowns),
    eventQueue,
    observerRegistry,
    memoryScopes: executionState
      ? cloneAiMemoryScopes(current.memoryScopes)
      : { ...cloneAiMemoryScopes(current.memoryScopes), activeStateMemory: {}, nodeLocalState: {} },
    stateRuntime: cloneAiStateRuntime(current.stateRuntime),
    activePlan: current.activePlan ? cloneAiPlan(current.activePlan) : undefined,
    planHistory: current.planHistory.map(cloneAiPlan),
    planSequence: current.planSequence,
    lastTerminal: terminalStatus
      ? {
          status: terminalStatus,
          atMs: finiteNonNegative(simulationTimeMs, current.simulationTimeMs),
          reason: result.explanation,
          reasonRu: result.explanationRu,
        }
      : cloneTerminal(current.lastTerminal),
  };
}

export function resetAiRuntimeSession(
  current: AiRuntimeSessionSnapshotV1,
  options: { readonly keepMemory?: boolean; readonly keepCooldowns?: boolean; readonly keepEvents?: boolean; readonly keepObservers?: boolean } = {},
): AiRuntimeSessionSnapshotV1 {
  return createAiRuntimeSession({
    graphId: current.graphId,
    unitId: current.unitId,
    simulationTimeMs: current.simulationTimeMs,
    blackboardMemory: options.keepMemory === false ? {} : current.blackboardMemory,
    cooldowns: options.keepCooldowns ? current.cooldowns : {},
    eventQueue: options.keepEvents ? current.eventQueue : createAiEventQueue(current.eventQueue.maxSize),
    observerRegistry: options.keepObservers
      ? current.observerRegistry
      : createAiBlackboardObserverRegistry(),
    memoryScopes: createAiMemoryScopes({
      persistentSoldierMemory: current.memoryScopes.persistentSoldierMemory,
      runtimeSessionMemory: options.keepMemory === false ? {} : current.memoryScopes.runtimeSessionMemory,
    }),
  });
}

export function cloneAiRuntimeSession(value: AiRuntimeSessionSnapshotV1): AiRuntimeSessionSnapshotV1 {
  return {
    version: 1,
    graphId: value.graphId,
    unitId: value.unitId,
    simulationTimeMs: value.simulationTimeMs,
    status: value.status,
    executionState: cloneExecutionState(value.executionState),
    blackboardMemory: cloneBlackboard(value.blackboardMemory),
    cooldowns: cloneCooldowns(value.cooldowns),
    eventQueue: cloneAiEventQueueSnapshot(value.eventQueue),
    observerRegistry: cloneAiBlackboardObserverRegistry(value.observerRegistry),
    memoryScopes: cloneAiMemoryScopes(value.memoryScopes),
    stateRuntime: cloneAiStateRuntime(value.stateRuntime),
    activePlan: value.activePlan ? cloneAiPlan(value.activePlan) : undefined,
    planHistory: value.planHistory.map(cloneAiPlan),
    planSequence: value.planSequence,
    lastTerminal: cloneTerminal(value.lastTerminal),
  };
}

function normalizePlanHistory(value: unknown): AiPlan[] {
  if (!Array.isArray(value)) return [];
  return value.map(normalizeAiPlan).filter((item): item is AiPlan => Boolean(item)).slice(-12);
}

function resetResult(
  context: NormalizeAiRuntimeSessionContext,
  resetReason: string,
  resetReasonRu: string,
): NormalizeAiRuntimeSessionResult {
  return {
    session: createAiRuntimeSession(context),
    resetReason,
    resetReasonRu,
  };
}

function normalizeExecutionState(value: unknown): AiGraphExecutionState | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)
    || value.version !== 1
    || typeof value.graphId !== 'string'
    || typeof value.unitId !== 'string'
    || typeof value.branchNodeId !== 'string'
    || typeof value.sequenceNodeId !== 'string'
    || !Number.isInteger(value.childIndex)
    || typeof value.activeNodeId !== 'string'
    || !isFiniteNumber(value.activeNodeStartedAtMs)
    || !isFiniteNumber(value.lastUpdatedAtMs)
    || !['running', 'waiting'].includes(String(value.status))) {
    return undefined;
  }
  const frames = value.frames === undefined ? undefined : normalizeCompositeFrames(value.frames) ?? undefined;
  if (value.frames !== undefined && !frames) return undefined;
  return cloneExecutionState({
    ...(value as unknown as AiGraphExecutionState),
    frames,
  });
}

function cloneExecutionState(value: AiGraphExecutionState | undefined): AiGraphExecutionState | undefined {
  if (!value) return undefined;
  return {
    ...value,
    activeData: value.activeData?.kind === 'move_to_blackboard_position'
      ? {
          ...value.activeData,
          target: { ...value.activeData.target },
        }
      : isReloadActionState(value.activeData)
        ? { ...value.activeData }
        : isWaitForEventActionState(value.activeData)
          ? { ...value.activeData }
          : isAiSubgraphExecutionState(value.activeData)
            ? cloneAiSubgraphExecutionState(value.activeData)
            : undefined,
    frames: value.frames === undefined ? undefined : cloneCompositeFrames(value.frames),
  };
}

function normalizeBlackboard(value: unknown): AiGraphRunnerBlackboard {
  if (!isRecord(value)) return {};
  const result: AiGraphRunnerBlackboard = {};
  for (const [key, item] of Object.entries(value)) {
    if (isBlackboardValue(item)) result[key] = cloneBlackboardValue(item);
  }
  return result;
}

function cloneBlackboard(value: AiGraphRunnerBlackboard): AiGraphRunnerBlackboard {
  const result: AiGraphRunnerBlackboard = {};
  for (const [key, item] of Object.entries(value)) result[key] = cloneBlackboardValue(item);
  return result;
}

function cloneBlackboardValue(value: AiGraphRunnerBlackboard[string]): AiGraphRunnerBlackboard[string] {
  return typeof value === 'object' && value !== null ? { x: value.x, y: value.y } : value;
}

function isBlackboardValue(value: unknown): value is AiGraphRunnerBlackboard[string] {
  return value === null
    || typeof value === 'string'
    || typeof value === 'boolean'
    || isFiniteNumber(value)
    || (isRecord(value) && isFiniteNumber(value.x) && isFiniteNumber(value.y));
}

function normalizeCooldowns(value: unknown): Record<string, number> {
  if (!isRecord(value)) return {};
  const result: Record<string, number> = {};
  for (const [key, item] of Object.entries(value)) {
    if (isFiniteNumber(item) && item >= 0) result[key] = item;
  }
  return result;
}

function cloneCooldowns(value: Record<string, number>): Record<string, number> {
  return { ...value };
}

function normalizeTerminal(value: unknown): AiRuntimeTerminalRecord | undefined {
  if (!isRecord(value)
    || !['success', 'failure', 'cancelled'].includes(String(value.status))
    || !isFiniteNumber(value.atMs)
    || typeof value.reason !== 'string') {
    return undefined;
  }
  return {
    status: value.status as AiRuntimeTerminalStatus,
    atMs: Math.max(0, value.atMs),
    reason: value.reason,
    reasonRu: typeof value.reasonRu === 'string' ? value.reasonRu : undefined,
  };
}

function cloneTerminal(value: AiRuntimeTerminalRecord | undefined): AiRuntimeTerminalRecord | undefined {
  return value ? { ...value } : undefined;
}

function readStatus(value: unknown): AiRuntimeSessionStatus | undefined {
  return ['idle', 'active', 'terminal'].includes(String(value))
    ? value as AiRuntimeSessionStatus
    : undefined;
}

function toTerminalStatus(value: AiGraphRuntimeResult['status']): AiRuntimeTerminalStatus | undefined {
  return value === 'success' || value === 'failure' || value === 'cancelled' ? value : undefined;
}

function finiteNonNegative(value: unknown, fallback: number): number {
  return isFiniteNumber(value) ? Math.max(0, value) : fallback;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
