export interface AiEvent<TPayload = unknown> {
  readonly version: 1;
  readonly id: string;
  readonly sequence: number;
  readonly type: string;
  readonly sourceId?: string;
  readonly targetId?: string;
  readonly timestampMs: number;
  readonly priority: number;
  readonly expiresAtMs?: number;
  readonly coalesceKey?: string;
  readonly payload: TPayload;
}

export interface AiEventDraft<TPayload = unknown> {
  readonly id: string;
  readonly type: string;
  readonly sourceId?: string;
  readonly targetId?: string;
  readonly timestampMs: number;
  readonly priority?: number;
  readonly expiresAtMs?: number;
  readonly coalesceKey?: string;
  readonly payload: TPayload;
}

export function cloneAiEvent<TPayload>(event: AiEvent<TPayload>): AiEvent<TPayload> {
  return {
    version: 1,
    id: event.id,
    sequence: event.sequence,
    type: event.type,
    sourceId: event.sourceId,
    targetId: event.targetId,
    timestampMs: event.timestampMs,
    priority: event.priority,
    expiresAtMs: event.expiresAtMs,
    coalesceKey: event.coalesceKey,
    payload: cloneSerializableValue(event.payload),
  };
}

export function normalizeAiEvent(value: unknown): AiEvent | undefined {
  if (!isRecord(value)
    || value.version !== 1
    || !isNonEmptyString(value.id)
    || !Number.isInteger(value.sequence)
    || (value.sequence as number) < 0
    || !isNonEmptyString(value.type)
    || !isFiniteNumber(value.timestampMs)
    || !isFiniteNumber(value.priority)
    || !isSerializableValue(value.payload)) {
    return undefined;
  }
  if (value.sourceId !== undefined && typeof value.sourceId !== 'string') return undefined;
  if (value.targetId !== undefined && typeof value.targetId !== 'string') return undefined;
  if (value.expiresAtMs !== undefined && !isFiniteNumber(value.expiresAtMs)) return undefined;
  if (value.coalesceKey !== undefined && typeof value.coalesceKey !== 'string') return undefined;
  return {
    version: 1,
    id: value.id,
    sequence: value.sequence as number,
    type: value.type,
    sourceId: value.sourceId as string | undefined,
    targetId: value.targetId as string | undefined,
    timestampMs: value.timestampMs,
    priority: value.priority,
    expiresAtMs: value.expiresAtMs as number | undefined,
    coalesceKey: value.coalesceKey as string | undefined,
    payload: cloneSerializableValue(value.payload),
  };
}

export function isCriticalAiEvent(event: Pick<AiEvent, 'type' | 'priority'>): boolean {
  return event.priority >= 100 || event.type === 'order_received' || event.type === 'order_cancelled';
}

export function compareAiEventsForDelivery(left: AiEvent, right: AiEvent): number {
  if (left.priority !== right.priority) return right.priority - left.priority;
  if (left.timestampMs !== right.timestampMs) return left.timestampMs - right.timestampMs;
  return left.sequence - right.sequence;
}

export function isAiEventExpired(event: AiEvent, simulationTimeMs: number): boolean {
  return event.expiresAtMs !== undefined && event.expiresAtMs <= simulationTimeMs;
}

function cloneSerializableValue<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => cloneSerializableValue(item)) as T;
  }
  if (isRecord(value)) {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) result[key] = cloneSerializableValue(item);
    return result as T;
  }
  return value;
}

function isSerializableValue(value: unknown, depth = 0): boolean {
  if (depth > 16) return false;
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (isFiniteNumber(value)) return true;
  if (Array.isArray(value)) return value.every((item) => isSerializableValue(item, depth + 1));
  if (!isRecord(value)) return false;
  return Object.values(value).every((item) => isSerializableValue(item, depth + 1));
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
