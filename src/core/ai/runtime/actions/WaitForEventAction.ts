import { compareAiEventsForDelivery, isAiEventExpired, type AiEvent } from '../../events/AiEvent';
import type { AiNodeLifecycle } from '../AiNodeLifecycle';

export interface WaitForEventActionState {
  readonly kind: 'wait_for_event';
  readonly eventType: string;
  readonly timeoutMs: number;
  readonly consumeEvent: boolean;
}

export const waitForEventActionLifecycle: AiNodeLifecycle<WaitForEventActionState> = {
  start: (context) => tick(context, readState(context.node.parameters)),
  update: (context, state) => tick(context, state),
  cancel: (_context, state, cancellation) => ({
    status: 'cancelled',
    state,
    reason: cancellation.reason,
    reasonRu: cancellation.reasonRu ?? `Ожидание события «${state.eventType}» отменено.`,
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

function tick(
  context: Parameters<AiNodeLifecycle<WaitForEventActionState>['start']>[0],
  state: WaitForEventActionState,
) {
  const event = matchingEvent(context.events ?? [], state.eventType, context.unitId, context.nowMs);
  if (event) {
    return {
      status: 'success' as const,
      state,
      reason: `Event ${event.type} received by ${context.node.id}.`,
      reasonRu: `Нода «${context.node.displayNameRu ?? context.node.displayName ?? context.node.id}» получила событие «${event.type}».`,
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
      reason: `WaitForEvent ${context.node.id} timed out after ${elapsedMs} ms.`,
      reasonRu: `Ожидание события «${state.eventType}» завершилось по тайм-ауту через ${elapsedMs} мс.`,
    };
  }

  return {
    status: 'waiting' as const,
    state,
    reason: `Waiting for event ${state.eventType}.`,
    reasonRu: `Ожидание события «${state.eventType}».`,
  };
}

function matchingEvent(events: readonly AiEvent[], type: string, unitId: string, nowMs: number): AiEvent | undefined {
  return [...events]
    .filter((event) => event.type === type)
    .filter((event) => event.targetId === undefined || event.targetId === unitId)
    .filter((event) => !isAiEventExpired(event, nowMs))
    .sort(compareAiEventsForDelivery)[0];
}

function readState(parameters: unknown): WaitForEventActionState {
  const source = isRecord(parameters) ? parameters : {};
  return {
    kind: 'wait_for_event',
    eventType: typeof source.eventType === 'string' && source.eventType.length > 0 ? source.eventType : 'shot_nearby',
    timeoutMs: toMilliseconds(readNumber(source.timeoutSeconds, 0)),
    consumeEvent: typeof source.consumeEvent === 'boolean' ? source.consumeEvent : true,
  };
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : fallback;
}
function toMilliseconds(seconds: number): number { return Math.round(Math.max(0, seconds) * 1000); }
function isFiniteNonNegative(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value) && value >= 0; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
