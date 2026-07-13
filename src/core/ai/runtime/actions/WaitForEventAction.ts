import type { AiEvent } from '../../events/AiEvent';
import type { AiNodeLifecycle } from '../AiNodeLifecycle';

export interface WaitForEventActionState {
  readonly kind: 'wait_for_event';
  readonly eventType: string;
  readonly timeoutMs: number;
  readonly consumeEvent: boolean;
}

export const waitForEventActionLifecycle: AiNodeLifecycle<WaitForEventActionState> = {
  start: (context) => evaluate(context, readState(context.node.parameters)),
  update: (context, state) => evaluate(context, state),
  cancel: (_context, state, cancellation) => ({
    status: 'cancelled',
    state,
    reason: cancellation.reason,
    reasonRu: cancellation.reasonRu ?? `Ожидание события ${state.eventType} отменено.`,
  }),
  cleanup: () => [],
  validateState: isWaitForEventActionState,
};

export function isWaitForEventActionState(value: unknown): value is WaitForEventActionState {
  return isRecord(value)
    && value.kind === 'wait_for_event'
    && typeof value.eventType === 'string'
    && value.eventType.length > 0
    && isFiniteNonNegative(value.timeoutMs)
    && typeof value.consumeEvent === 'boolean';
}

function evaluate(
  context: Parameters<typeof waitForEventActionLifecycle.start>[0],
  state: WaitForEventActionState,
) {
  const event = findMatchingEvent(context.events ?? [], state.eventType, context.unitId, context.nowMs);
  if (event) {
    return {
      status: 'success' as const,
      state,
      reason: `Event ${state.eventType} received by ${context.node.id}.`,
      reasonRu: `Нода «${context.node.displayNameRu ?? context.node.id}» получила событие ${state.eventType}.`,
      details: {
        eventId: event.id,
        eventType: event.type,
        consumedEventIds: state.consumeEvent ? [event.id] : [],
      },
    };
  }
  const elapsedMs = Math.max(0, context.nowMs - context.startedAtMs);
  if (state.timeoutMs > 0 && elapsedMs >= state.timeoutMs) {
    return {
      status: 'failure' as const,
      state,
      reason: `Waiting for ${state.eventType} timed out after ${elapsedMs} ms.`,
      reasonRu: `Ожидание события ${state.eventType} завершилось по тайм-ауту через ${elapsedMs} мс.`,
    };
  }
  return {
    status: 'waiting' as const,
    state,
    reason: `Waiting for event ${state.eventType}.`,
    reasonRu: `Ожидание события ${state.eventType}.`,
    details: { eventType: state.eventType },
  };
}

function findMatchingEvent(
  events: readonly AiEvent[],
  eventType: string,
  unitId: string,
  nowMs: number,
): AiEvent | undefined {
  return [...events]
    .filter((event) => event.type === eventType)
    .filter((event) => event.targetId === undefined || event.targetId === unitId)
    .filter((event) => event.expiresAtMs === undefined || event.expiresAtMs > nowMs)
    .sort((left, right) => right.priority - left.priority || left.sequence - right.sequence)[0];
}

function readState(value: unknown): WaitForEventActionState {
  const parameters = isRecord(value) ? value : {};
  return {
    kind: 'wait_for_event',
    eventType: typeof parameters.eventType === 'string' && parameters.eventType.trim()
      ? parameters.eventType.trim()
      : 'shot_nearby',
    timeoutMs: toMilliseconds(parameters.timeoutSeconds),
    consumeEvent: parameters.consumeEvent !== false,
  };
}

function toMilliseconds(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.round(Math.max(0, value) * 1000)
    : 0;
}
function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
