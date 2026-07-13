import type { AiBlackboardValue } from '../AiBlackboard';

export type AiMemoryScopeName =
  | 'persistentSoldierMemory'
  | 'runtimeSessionMemory'
  | 'activeStateMemory'
  | 'subgraphLocalMemory'
  | 'nodeLocalState';

export type AiMemoryRecord = Readonly<Record<string, AiBlackboardValue>>;

export interface AiMemoryScopesSnapshotV1 {
  readonly version: 1;
  readonly persistentSoldierMemory: AiMemoryRecord;
  readonly runtimeSessionMemory: AiMemoryRecord;
  readonly activeStateMemory: AiMemoryRecord;
  readonly subgraphLocalMemory: Readonly<Record<string, AiMemoryRecord>>;
  readonly nodeLocalState: Readonly<Record<string, AiMemoryRecord>>;
}

export interface CreateAiMemoryScopesInput {
  readonly persistentSoldierMemory?: AiMemoryRecord;
  readonly runtimeSessionMemory?: AiMemoryRecord;
  readonly activeStateMemory?: AiMemoryRecord;
  readonly subgraphLocalMemory?: Readonly<Record<string, AiMemoryRecord>>;
  readonly nodeLocalState?: Readonly<Record<string, AiMemoryRecord>>;
}

export function createAiMemoryScopes(input: CreateAiMemoryScopesInput = {}): AiMemoryScopesSnapshotV1 {
  return {
    version: 1,
    persistentSoldierMemory: cloneMemory(input.persistentSoldierMemory),
    runtimeSessionMemory: cloneMemory(input.runtimeSessionMemory),
    activeStateMemory: cloneMemory(input.activeStateMemory),
    subgraphLocalMemory: cloneNestedMemory(input.subgraphLocalMemory),
    nodeLocalState: cloneNestedMemory(input.nodeLocalState),
  };
}

export function normalizeAiMemoryScopes(
  value: unknown,
  legacyRuntimeMemory: AiMemoryRecord = {},
): AiMemoryScopesSnapshotV1 {
  if (!isRecord(value) || value.version !== 1) {
    return createAiMemoryScopes({ runtimeSessionMemory: legacyRuntimeMemory });
  }
  return createAiMemoryScopes({
    persistentSoldierMemory: normalizeMemory(value.persistentSoldierMemory),
    runtimeSessionMemory: normalizeMemory(value.runtimeSessionMemory),
    activeStateMemory: normalizeMemory(value.activeStateMemory),
    subgraphLocalMemory: normalizeNestedMemory(value.subgraphLocalMemory),
    nodeLocalState: normalizeNestedMemory(value.nodeLocalState),
  });
}

export function cloneAiMemoryScopes(value: AiMemoryScopesSnapshotV1): AiMemoryScopesSnapshotV1 {
  return createAiMemoryScopes(value);
}

export function readAiMemoryValue(
  scopes: AiMemoryScopesSnapshotV1,
  scope: AiMemoryScopeName,
  key: string,
  ownerId?: string,
): AiBlackboardValue | undefined {
  const value = scope === 'subgraphLocalMemory'
    ? ownerId ? scopes.subgraphLocalMemory[ownerId]?.[key] : undefined
    : scope === 'nodeLocalState'
      ? ownerId ? scopes.nodeLocalState[ownerId]?.[key] : undefined
      : scopes[scope][key];
  return value === undefined ? undefined : cloneValue(value);
}

export function writeAiMemoryValue(
  scopes: AiMemoryScopesSnapshotV1,
  scope: AiMemoryScopeName,
  ownerIdOrKey: string,
  keyOrValue: string | AiBlackboardValue,
  maybeValue?: AiBlackboardValue,
): AiMemoryScopesSnapshotV1 {
  if (scope === 'subgraphLocalMemory' || scope === 'nodeLocalState') {
    const ownerId = ownerIdOrKey;
    const key = String(keyOrValue);
    const value = maybeValue;
    if (value === undefined) throw new Error(`${scope} write requires ownerId, key and value.`);
    const nested = cloneNestedMemory(scopes[scope]);
    nested[ownerId] = { ...(nested[ownerId] ?? {}), [key]: cloneValue(value) };
    return { ...cloneAiMemoryScopes(scopes), [scope]: nested };
  }
  const key = ownerIdOrKey;
  const value = keyOrValue as AiBlackboardValue;
  return {
    ...cloneAiMemoryScopes(scopes),
    [scope]: { ...scopes[scope], [key]: cloneValue(value) },
  };
}

export function mapAiSubgraphOutputsToParent(
  scopes: AiMemoryScopesSnapshotV1,
  subgraphId: string,
  outputs: Readonly<Record<string, string>>,
): AiMemoryScopesSnapshotV1 {
  const local = scopes.subgraphLocalMemory[subgraphId] ?? {};
  let next = cloneAiMemoryScopes(scopes);
  for (const [localKey, parentKey] of Object.entries(outputs)) {
    const value = local[localKey];
    if (value !== undefined) next = writeAiMemoryValue(next, 'runtimeSessionMemory', parentKey, value);
  }
  return next;
}

export function resetAiMemoryScope(
  scopes: AiMemoryScopesSnapshotV1,
  scope: AiMemoryScopeName,
  ownerId?: string,
): AiMemoryScopesSnapshotV1 {
  const next = cloneAiMemoryScopes(scopes);
  if (scope === 'subgraphLocalMemory' || scope === 'nodeLocalState') {
    if (!ownerId) return { ...next, [scope]: {} };
    const nested = cloneNestedMemory(next[scope]);
    delete nested[ownerId];
    return { ...next, [scope]: nested };
  }
  return { ...next, [scope]: {} };
}

export const AI_MEMORY_SCOPE_LABELS_RU: Readonly<Record<AiMemoryScopeName, string>> = {
  persistentSoldierMemory: 'Постоянная память бойца',
  runtimeSessionMemory: 'Память runtime session',
  activeStateMemory: 'Память активного состояния',
  subgraphLocalMemory: 'Локальная память подграфа',
  nodeLocalState: 'Локальное состояние ноды',
};

function normalizeMemory(value: unknown): AiMemoryRecord {
  if (!isRecord(value)) return {};
  const result: Record<string, AiBlackboardValue> = {};
  for (const [key, item] of Object.entries(value)) {
    if (isValue(item)) result[key] = cloneValue(item);
  }
  return result;
}

function normalizeNestedMemory(value: unknown): Readonly<Record<string, AiMemoryRecord>> {
  if (!isRecord(value)) return {};
  const result: Record<string, AiMemoryRecord> = {};
  for (const [ownerId, item] of Object.entries(value)) result[ownerId] = normalizeMemory(item);
  return result;
}

function cloneMemory(value: AiMemoryRecord | undefined): Record<string, AiBlackboardValue> {
  const result: Record<string, AiBlackboardValue> = {};
  for (const [key, item] of Object.entries(value ?? {})) result[key] = cloneValue(item);
  return result;
}

function cloneNestedMemory(
  value: Readonly<Record<string, AiMemoryRecord>> | undefined,
): Record<string, AiMemoryRecord> {
  const result: Record<string, AiMemoryRecord> = {};
  for (const [ownerId, item] of Object.entries(value ?? {})) result[ownerId] = cloneMemory(item);
  return result;
}

function cloneValue(value: AiBlackboardValue): AiBlackboardValue {
  return typeof value === 'object' && value !== null ? { x: value.x, y: value.y } : value;
}

function isValue(value: unknown): value is AiBlackboardValue {
  return value === null
    || typeof value === 'string'
    || typeof value === 'boolean'
    || (typeof value === 'number' && Number.isFinite(value))
    || (isRecord(value)
      && typeof value.x === 'number' && Number.isFinite(value.x)
      && typeof value.y === 'number' && Number.isFinite(value.y));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
