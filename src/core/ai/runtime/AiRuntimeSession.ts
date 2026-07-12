import type { AiGraphRunnerBlackboard } from '../AiGraphRunner';
import type {
  AiGraphExecutionState,
  AiGraphRuntimeResult,
} from '../AiGraphRuntime';
import {
  cloneCompositeFrames,
  normalizeCompositeFrames,
} from './AiCompositeRuntime';
import { isReloadActionState } from './actions/ReloadAction';

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
  readonly lastTerminal?: AiRuntimeTerminalRecord;
}

export interface CreateAiRuntimeSessionInput {
  readonly graphId: string;
  readonly unitId: string;
  readonly simulationTimeMs?: number;
  readonly executionState?: AiGraphExecutionState;
  readonly blackboardMemory?: AiGraphRunnerBlackboard;
  readonly cooldowns?: Record<string, number>;
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
  options: { readonly keepMemory?: boolean; readonly keepCooldowns?: boolean } = {},
): AiRuntimeSessionSnapshotV1 {
  return createAiRuntimeSession({
    graphId: current.graphId,
    unitId: current.unitId,
    simulationTimeMs: current.simulationTimeMs,
    blackboardMemory: options.keepMemory === false ? {} : current.blackboardMemory,
    cooldowns: options.keepCooldowns ? current.cooldowns : {},
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
    lastTerminal: cloneTerminal(value.lastTerminal),
  };
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
