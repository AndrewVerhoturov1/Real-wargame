import {
  cloneAiEvent,
  compareAiEventsForDelivery,
  isAiEventExpired,
  isCriticalAiEvent,
  normalizeAiEvent,
  type AiEvent,
  type AiEventDraft,
} from './AiEvent';

export const DEFAULT_AI_EVENT_QUEUE_MAX_SIZE = 64;

export interface AiEventQueueSnapshotV1 {
  readonly version: 1;
  readonly maxSize: number;
  readonly nextSequence: number;
  readonly events: readonly AiEvent[];
  readonly droppedCount: number;
  readonly expiredCount: number;
  readonly coalescedCount: number;
}

export interface AiEventQueuePushResult {
  readonly queue: AiEventQueueSnapshotV1;
  readonly event: AiEvent;
  readonly accepted: boolean;
  readonly coalesced: boolean;
  readonly evictedEvent?: AiEvent;
  readonly criticalOverflow: boolean;
}

export interface AiEventQueueTakeResult {
  readonly queue: AiEventQueueSnapshotV1;
  readonly event?: AiEvent;
}

export interface AiEventQueueDrainResult {
  readonly queue: AiEventQueueSnapshotV1;
  readonly events: readonly AiEvent[];
}

export function createAiEventQueue(maxSize = DEFAULT_AI_EVENT_QUEUE_MAX_SIZE): AiEventQueueSnapshotV1 {
  return {
    version: 1,
    maxSize: normalizeMaxSize(maxSize),
    nextSequence: 0,
    events: [],
    droppedCount: 0,
    expiredCount: 0,
    coalescedCount: 0,
  };
}

export function normalizeAiEventQueueSnapshot(
  value: unknown,
  fallbackMaxSize = DEFAULT_AI_EVENT_QUEUE_MAX_SIZE,
): AiEventQueueSnapshotV1 {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.events)) {
    return createAiEventQueue(fallbackMaxSize);
  }
  const maxSize = normalizeMaxSize(value.maxSize, fallbackMaxSize);
  const normalizedEvents: AiEvent[] = [];
  for (const item of value.events) {
    const event = normalizeAiEvent(item);
    if (event) normalizedEvents.push(event);
  }
  normalizedEvents.sort((left, right) => left.sequence - right.sequence);
  const boundedEvents = normalizedEvents.slice(-maxSize);
  const highestSequence = boundedEvents.reduce((maximum, event) => Math.max(maximum, event.sequence), -1);
  return {
    version: 1,
    maxSize,
    nextSequence: Math.max(
      highestSequence + 1,
      integerNonNegative(value.nextSequence, highestSequence + 1),
    ),
    events: boundedEvents.map(cloneAiEvent),
    droppedCount: integerNonNegative(value.droppedCount, 0),
    expiredCount: integerNonNegative(value.expiredCount, 0),
    coalescedCount: integerNonNegative(value.coalescedCount, 0),
  };
}

export function cloneAiEventQueueSnapshot(queue: AiEventQueueSnapshotV1): AiEventQueueSnapshotV1 {
  return {
    version: 1,
    maxSize: normalizeMaxSize(queue.maxSize),
    nextSequence: integerNonNegative(queue.nextSequence, 0),
    events: queue.events.map(cloneAiEvent),
    droppedCount: integerNonNegative(queue.droppedCount, 0),
    expiredCount: integerNonNegative(queue.expiredCount, 0),
    coalescedCount: integerNonNegative(queue.coalescedCount, 0),
  };
}

export function pushAiEvent<TPayload>(
  queue: AiEventQueueSnapshotV1,
  draft: AiEventDraft<TPayload>,
  simulationTimeMs = draft.timestampMs,
): AiEventQueuePushResult {
  const pruned = pruneExpiredAiEvents(queue, simulationTimeMs);
  const event: AiEvent<TPayload> = {
    version: 1,
    id: draft.id,
    sequence: pruned.nextSequence,
    type: draft.type,
    sourceId: draft.sourceId,
    targetId: draft.targetId,
    timestampMs: finiteOr(draft.timestampMs, simulationTimeMs),
    priority: finiteOr(draft.priority, 0),
    expiresAtMs: finiteOptional(draft.expiresAtMs),
    coalesceKey: draft.coalesceKey,
    payload: clonePayload(draft.payload),
  };
  const nextSequence = event.sequence + 1;
  const coalesceIndex = findCoalesceIndex(pruned.events, event);
  if (coalesceIndex >= 0) {
    const events = pruned.events.map((existing, index) => index === coalesceIndex ? cloneAiEvent(event) : cloneAiEvent(existing));
    return {
      queue: {
        ...pruned,
        nextSequence,
        events,
        coalescedCount: pruned.coalescedCount + 1,
      },
      event: cloneAiEvent(event),
      accepted: true,
      coalesced: true,
      criticalOverflow: false,
    };
  }

  if (pruned.events.length < pruned.maxSize) {
    return {
      queue: {
        ...pruned,
        nextSequence,
        events: [...pruned.events.map(cloneAiEvent), cloneAiEvent(event)],
      },
      event: cloneAiEvent(event),
      accepted: true,
      coalesced: false,
      criticalOverflow: false,
    };
  }

  const evictionIndex = findEvictionIndex(pruned.events, event);
  if (evictionIndex < 0) {
    return {
      queue: {
        ...pruned,
        nextSequence,
        droppedCount: pruned.droppedCount + 1,
      },
      event: cloneAiEvent(event),
      accepted: false,
      coalesced: false,
      criticalOverflow: isCriticalAiEvent(event),
    };
  }

  const evictedEvent = cloneAiEvent(pruned.events[evictionIndex]);
  const events = pruned.events
    .filter((_, index) => index !== evictionIndex)
    .map(cloneAiEvent);
  events.push(cloneAiEvent(event));
  return {
    queue: {
      ...pruned,
      nextSequence,
      events,
      droppedCount: pruned.droppedCount + 1,
    },
    event: cloneAiEvent(event),
    accepted: true,
    coalesced: false,
    evictedEvent,
    criticalOverflow: false,
  };
}

export function removeAiEventsById(
  queue: AiEventQueueSnapshotV1,
  eventIds: readonly string[],
): AiEventQueueSnapshotV1 {
  if (eventIds.length === 0) return cloneAiEventQueueSnapshot(queue);
  const ids = new Set(eventIds);
  return {
    ...cloneAiEventQueueSnapshot(queue),
    events: queue.events.filter((event) => !ids.has(event.id)).map(cloneAiEvent),
  };
}

export function pruneExpiredAiEvents(
  queue: AiEventQueueSnapshotV1,
  simulationTimeMs: number,
): AiEventQueueSnapshotV1 {
  const alive: AiEvent[] = [];
  let expired = 0;
  for (const event of queue.events) {
    if (isAiEventExpired(event, simulationTimeMs)) expired += 1;
    else alive.push(cloneAiEvent(event));
  }
  if (expired === 0) return cloneAiEventQueueSnapshot(queue);
  return {
    ...cloneAiEventQueueSnapshot(queue),
    events: alive,
    expiredCount: queue.expiredCount + expired,
  };
}

export function takeNextAiEvent(
  queue: AiEventQueueSnapshotV1,
  simulationTimeMs: number,
): AiEventQueueTakeResult {
  const pruned = pruneExpiredAiEvents(queue, simulationTimeMs);
  const ordered = [...pruned.events].sort(compareAiEventsForDelivery);
  const event = ordered[0];
  if (!event) return { queue: pruned };
  return {
    event: cloneAiEvent(event),
    queue: {
      ...pruned,
      events: pruned.events.filter((candidate) => candidate.sequence !== event.sequence).map(cloneAiEvent),
    },
  };
}

export function drainAiEventQueue(
  queue: AiEventQueueSnapshotV1,
  simulationTimeMs: number,
  limit = queue.maxSize,
): AiEventQueueDrainResult {
  const pruned = pruneExpiredAiEvents(queue, simulationTimeMs);
  const count = Math.max(0, Math.min(pruned.events.length, Math.floor(finiteOr(limit, pruned.maxSize))));
  const ordered = [...pruned.events].sort(compareAiEventsForDelivery);
  const events = ordered.slice(0, count).map(cloneAiEvent);
  const taken = new Set(events.map((event) => event.sequence));
  return {
    events,
    queue: {
      ...pruned,
      events: pruned.events.filter((event) => !taken.has(event.sequence)).map(cloneAiEvent),
    },
  };
}

function findCoalesceIndex(events: readonly AiEvent[], incoming: AiEvent): number {
  if (!incoming.coalesceKey) return -1;
  return events.findIndex((event) => event.coalesceKey === incoming.coalesceKey
    && event.type === incoming.type
    && event.targetId === incoming.targetId);
}

function findEvictionIndex(events: readonly AiEvent[], incoming: AiEvent): number {
  const incomingCritical = isCriticalAiEvent(incoming);
  const candidates = events
    .map((event, index) => ({ event, index }))
    .filter(({ event }) => !incomingCritical || !isCriticalAiEvent(event))
    .sort((left, right) => {
      if (left.event.priority !== right.event.priority) return left.event.priority - right.event.priority;
      const leftCoalescable = left.event.coalesceKey ? 0 : 1;
      const rightCoalescable = right.event.coalesceKey ? 0 : 1;
      if (leftCoalescable !== rightCoalescable) return leftCoalescable - rightCoalescable;
      if (left.event.timestampMs !== right.event.timestampMs) return left.event.timestampMs - right.event.timestampMs;
      return left.event.sequence - right.event.sequence;
    });
  const candidate = candidates[0];
  if (!candidate) return -1;
  if (incomingCritical) return candidate.index;
  if (candidate.event.coalesceKey || incoming.priority > candidate.event.priority) return candidate.index;
  return -1;
}

function normalizeMaxSize(value: unknown, fallback = DEFAULT_AI_EVENT_QUEUE_MAX_SIZE): number {
  const candidate = Number.isInteger(value) ? value as number : fallback;
  return Math.max(1, Math.min(1024, candidate));
}

function integerNonNegative(value: unknown, fallback: number): number {
  return Number.isInteger(value) && (value as number) >= 0 ? value as number : fallback;
}

function finiteOptional(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clonePayload<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => clonePayload(item)) as T;
  if (isRecord(value)) {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) result[key] = clonePayload(item);
    return result as T;
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
