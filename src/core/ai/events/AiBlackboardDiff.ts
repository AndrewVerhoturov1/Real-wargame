import {
  normalizeAiBlackboardValue,
  type AiBlackboardNormalizedValue,
  type AiBlackboardValue,
} from '../AiBlackboard';
import type { AiGraphRunnerBlackboard } from '../AiGraphRunner';

export interface AiBlackboardRevisionEntry {
  readonly key: string;
  readonly revision: number;
  readonly normalizedValue: AiBlackboardNormalizedValue;
}

export interface AiBlackboardRevisionSnapshotV1 {
  readonly version: 1;
  readonly nextRevision: number;
  readonly entries: Readonly<Record<string, AiBlackboardRevisionEntry>>;
}

export interface AiBlackboardKeyChange {
  readonly key: string;
  readonly previous?: AiBlackboardNormalizedValue;
  readonly current: AiBlackboardNormalizedValue;
  readonly revision: number;
}

export interface AiBlackboardDiffResult {
  readonly snapshot: AiBlackboardRevisionSnapshotV1;
  readonly changes: readonly AiBlackboardKeyChange[];
  readonly checks: number;
}

export function createAiBlackboardRevisionSnapshot(): AiBlackboardRevisionSnapshotV1 {
  return {
    version: 1,
    nextRevision: 1,
    entries: {},
  };
}

export function normalizeAiBlackboardRevisionSnapshot(value: unknown): AiBlackboardRevisionSnapshotV1 {
  if (!isRecord(value) || value.version !== 1 || !isRecord(value.entries)) {
    return createAiBlackboardRevisionSnapshot();
  }
  const entries: Record<string, AiBlackboardRevisionEntry> = {};
  let highestRevision = 0;
  for (const [key, item] of Object.entries(value.entries)) {
    if (!isRecord(item)
      || item.key !== key
      || !Number.isInteger(item.revision)
      || (item.revision as number) < 0) {
      continue;
    }
    const normalizedValue = normalizeStoredNormalizedValue(item.normalizedValue);
    if (!normalizedValue) continue;
    const revision = item.revision as number;
    entries[key] = { key, revision, normalizedValue };
    highestRevision = Math.max(highestRevision, revision);
  }
  const requestedNext = Number.isInteger(value.nextRevision) && (value.nextRevision as number) > 0
    ? value.nextRevision as number
    : 1;
  return {
    version: 1,
    nextRevision: Math.max(requestedNext, highestRevision + 1),
    entries,
  };
}

export function cloneAiBlackboardRevisionSnapshot(
  snapshot: AiBlackboardRevisionSnapshotV1,
): AiBlackboardRevisionSnapshotV1 {
  const entries: Record<string, AiBlackboardRevisionEntry> = {};
  for (const [key, entry] of Object.entries(snapshot.entries)) {
    entries[key] = {
      key,
      revision: entry.revision,
      normalizedValue: cloneNormalizedValue(entry.normalizedValue),
    };
  }
  return {
    version: 1,
    nextRevision: Math.max(1, snapshot.nextRevision),
    entries,
  };
}

export function diffAiBlackboardKeys(
  previous: AiBlackboardRevisionSnapshotV1,
  blackboard: AiGraphRunnerBlackboard,
  keys: readonly string[],
): AiBlackboardDiffResult {
  const snapshot = cloneAiBlackboardRevisionSnapshot(previous);
  const entries: Record<string, AiBlackboardRevisionEntry> = { ...snapshot.entries };
  const changes: AiBlackboardKeyChange[] = [];
  let nextRevision = snapshot.nextRevision;
  const uniqueKeys = [...new Set(keys)].sort();

  for (const key of uniqueKeys) {
    const present = Object.prototype.hasOwnProperty.call(blackboard, key);
    const current = normalizeAiBlackboardValue(key, present ? blackboard[key] : undefined, present);
    const previousEntry = entries[key];
    if (previousEntry && aiBlackboardNormalizedValuesEqual(previousEntry.normalizedValue, current)) continue;
    const revision = nextRevision;
    nextRevision += 1;
    entries[key] = {
      key,
      revision,
      normalizedValue: cloneNormalizedValue(current),
    };
    changes.push({
      key,
      previous: previousEntry ? cloneNormalizedValue(previousEntry.normalizedValue) : undefined,
      current: cloneNormalizedValue(current),
      revision,
    });
  }

  return {
    snapshot: {
      version: 1,
      nextRevision,
      entries,
    },
    changes,
    checks: uniqueKeys.length,
  };
}

export function aiBlackboardNormalizedValuesEqual(
  left: AiBlackboardNormalizedValue,
  right: AiBlackboardNormalizedValue,
): boolean {
  if (left.state !== right.state) return false;
  if (left.state === 'missing' || right.state === 'missing') return true;
  const leftValue = left.value;
  const rightValue = right.value;
  if (isPosition(leftValue) || isPosition(rightValue)) {
    return isPosition(leftValue)
      && isPosition(rightValue)
      && leftValue.x === rightValue.x
      && leftValue.y === rightValue.y;
  }
  return leftValue === rightValue;
}

export function cloneNormalizedValue(value: AiBlackboardNormalizedValue): AiBlackboardNormalizedValue {
  return value.state === 'missing'
    ? { state: 'missing' }
    : {
        state: 'value',
        value: isPosition(value.value) ? { ...value.value } : value.value,
      };
}

function normalizeStoredNormalizedValue(value: unknown): AiBlackboardNormalizedValue | undefined {
  if (!isRecord(value) || !['missing', 'value'].includes(String(value.state))) return undefined;
  if (value.state === 'missing') return { state: 'missing' };
  if (!isBlackboardValue(value.value)) return undefined;
  return {
    state: 'value',
    value: isPosition(value.value) ? { ...value.value } : value.value,
  };
}

function isBlackboardValue(value: unknown): value is AiBlackboardValue {
  return value === null
    || typeof value === 'string'
    || typeof value === 'boolean'
    || (typeof value === 'number' && Number.isFinite(value))
    || isPosition(value);
}

function isPosition(value: unknown): value is { x: number; y: number } {
  return isRecord(value)
    && typeof value.x === 'number'
    && Number.isFinite(value.x)
    && typeof value.y === 'number'
    && Number.isFinite(value.y);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
