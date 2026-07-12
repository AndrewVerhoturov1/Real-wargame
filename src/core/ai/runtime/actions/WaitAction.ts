import type { AiNodeLifecycle } from '../AiNodeLifecycle';

export interface WaitActionState {
  readonly kind: 'wait';
  readonly durationMs: number;
  readonly timeoutMs: number;
}

export const waitActionLifecycle: AiNodeLifecycle<WaitActionState> = {
  start: (context) => {
    const state = readStateFromNode(context.node.parameters);
    return {
      status: 'waiting',
      state,
      reason: `Wait ${context.node.id} started for ${state.durationMs} ms.`,
      reasonRu: `Ожидание ${context.node.id} начато на ${state.durationMs} мс.`,
    };
  },
  update: (context, state) => {
    const elapsedMs = Math.max(0, context.nowMs - context.startedAtMs);
    if (elapsedMs >= state.durationMs) {
      return {
        status: 'success',
        state,
        reason: `Wait ${context.node.id} completed after ${elapsedMs} ms.`,
        reasonRu: `Ожидание ${context.node.id} завершено через ${elapsedMs} мс.`,
        progress: 1,
      };
    }
    if (state.timeoutMs > 0 && elapsedMs >= state.timeoutMs) {
      return {
        status: 'failure',
        state,
        reason: `Wait ${context.node.id} timed out after ${elapsedMs} ms.`,
        reasonRu: `Ожидание ${context.node.id} прервано по тайм-ауту через ${elapsedMs} мс.`,
      };
    }
    return {
      status: 'waiting',
      state,
      reason: `Wait ${context.node.id} is still active at ${elapsedMs} ms.`,
      reasonRu: `Ожидание ${context.node.id} продолжается: ${elapsedMs} мс.`,
      progress: state.durationMs > 0 ? Math.min(1, elapsedMs / state.durationMs) : 1,
    };
  },
  cancel: (context, state, cancellation) => ({
    status: 'cancelled',
    state,
    reason: cancellation.reason,
    reasonRu: cancellation.reasonRu ?? `Ожидание ${context.node.id} отменено.`,
  }),
  cleanup: () => [],
  validateState: isWaitActionState,
};

export function createLegacyWaitActionState(parameters: unknown): WaitActionState {
  return readStateFromNode(parameters);
}

function readStateFromNode(parameters: unknown): WaitActionState {
  const source = isRecord(parameters) ? parameters : {};
  return {
    kind: 'wait',
    durationMs: toMilliseconds(readNumber(source.durationSeconds, 2)),
    timeoutMs: toMilliseconds(readNumber(source.timeoutSeconds, 0)),
  };
}

function isWaitActionState(value: unknown): value is WaitActionState {
  return isRecord(value)
    && value.kind === 'wait'
    && isFiniteNonNegative(value.durationMs)
    && isFiniteNonNegative(value.timeoutMs);
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : fallback;
}

function toMilliseconds(seconds: number): number {
  return Math.round(Math.max(0, seconds) * 1000);
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
