import type { AiBlackboardNormalizedValue } from '../AiBlackboard';
import type { AiGraphRunnerBlackboard } from '../AiGraphRunner';
import type { AiEventDraft } from './AiEvent';
import {
  cloneAiBlackboardRevisionSnapshot,
  cloneNormalizedValue,
  createAiBlackboardRevisionSnapshot,
  diffAiBlackboardKeys,
  normalizeAiBlackboardRevisionSnapshot,
  type AiBlackboardKeyChange,
  type AiBlackboardRevisionSnapshotV1,
} from './AiBlackboardDiff';

export type AiBlackboardObserverKind =
  | 'key_changed'
  | 'bool_changed'
  | 'number_threshold_crossed'
  | 'position_changed';

export type AiBlackboardThresholdComparison = 'above' | 'below';
export type AiBlackboardThresholdDirection = 'entered' | 'exited';

export interface AiBlackboardObserverDefinition {
  readonly observerId: string;
  readonly key: string;
  readonly kind: AiBlackboardObserverKind;
  readonly scopeNodeId?: string;
  readonly sourceNodeId?: string;
  readonly comparison?: AiBlackboardThresholdComparison;
  readonly threshold?: number;
  readonly hysteresisEnter?: number;
  readonly hysteresisExit?: number;
  readonly priority?: number;
}

export interface AiBlackboardObserverState {
  readonly definition: AiBlackboardObserverDefinition;
  readonly lastNormalizedValue: AiBlackboardNormalizedValue;
  readonly thresholdActive?: boolean;
  readonly revision: number;
}

export interface AiBlackboardObserverRegistrySnapshotV1 {
  readonly version: 1;
  readonly revision: number;
  readonly wakeRevision: number;
  readonly observers: Readonly<Record<string, AiBlackboardObserverState>>;
  readonly blackboardRevision: AiBlackboardRevisionSnapshotV1;
  readonly observerChecks: number;
  readonly observerEvents: number;
}

export interface RegisterAiBlackboardObserverResult {
  readonly registry: AiBlackboardObserverRegistrySnapshotV1;
  readonly created: boolean;
}

export interface EvaluateAiBlackboardObserversResult {
  readonly registry: AiBlackboardObserverRegistrySnapshotV1;
  readonly events: readonly AiEventDraft[];
  readonly changedKeys: readonly string[];
  readonly checks: number;
}

export function createAiBlackboardObserverRegistry(): AiBlackboardObserverRegistrySnapshotV1 {
  return {
    version: 1,
    revision: 0,
    wakeRevision: 0,
    observers: {},
    blackboardRevision: createAiBlackboardRevisionSnapshot(),
    observerChecks: 0,
    observerEvents: 0,
  };
}

export function normalizeAiBlackboardObserverRegistry(
  value: unknown,
): AiBlackboardObserverRegistrySnapshotV1 {
  if (!isRecord(value) || value.version !== 1 || !isRecord(value.observers)) {
    return createAiBlackboardObserverRegistry();
  }
  const observers: Record<string, AiBlackboardObserverState> = {};
  for (const [observerId, item] of Object.entries(value.observers)) {
    const normalized = normalizeObserverState(item);
    if (!normalized || normalized.definition.observerId !== observerId) continue;
    observers[observerId] = normalized;
  }
  return {
    version: 1,
    revision: integerNonNegative(value.revision, 0),
    wakeRevision: integerNonNegative(value.wakeRevision, 0),
    observers,
    blackboardRevision: normalizeAiBlackboardRevisionSnapshot(value.blackboardRevision),
    observerChecks: integerNonNegative(value.observerChecks, 0),
    observerEvents: integerNonNegative(value.observerEvents, 0),
  };
}

export function cloneAiBlackboardObserverRegistry(
  registry: AiBlackboardObserverRegistrySnapshotV1,
): AiBlackboardObserverRegistrySnapshotV1 {
  const observers: Record<string, AiBlackboardObserverState> = {};
  for (const [observerId, state] of Object.entries(registry.observers)) {
    observers[observerId] = cloneObserverState(state);
  }
  return {
    version: 1,
    revision: registry.revision,
    wakeRevision: registry.wakeRevision,
    observers,
    blackboardRevision: cloneAiBlackboardRevisionSnapshot(registry.blackboardRevision),
    observerChecks: registry.observerChecks,
    observerEvents: registry.observerEvents,
  };
}

export function registerAiBlackboardObserver(
  registry: AiBlackboardObserverRegistrySnapshotV1,
  definition: AiBlackboardObserverDefinition,
  blackboard: AiGraphRunnerBlackboard,
): RegisterAiBlackboardObserverResult {
  const normalizedDefinition = normalizeDefinition(definition);
  const currentRegistry = cloneAiBlackboardObserverRegistry(registry);
  const diff = diffAiBlackboardKeys(currentRegistry.blackboardRevision, blackboard, [normalizedDefinition.key]);
  const entry = diff.snapshot.entries[normalizedDefinition.key];
  const baseline = entry?.normalizedValue ?? { state: 'missing' as const };
  const existing = currentRegistry.observers[normalizedDefinition.observerId];
  const unchanged = existing && definitionsEqual(existing.definition, normalizedDefinition);
  if (unchanged) {
    return {
      registry: {
        ...currentRegistry,
        blackboardRevision: diff.snapshot,
        observerChecks: currentRegistry.observerChecks + diff.checks,
      },
      created: false,
    };
  }

  const observers = {
    ...currentRegistry.observers,
    [normalizedDefinition.observerId]: {
      definition: normalizedDefinition,
      lastNormalizedValue: cloneNormalizedValue(baseline),
      thresholdActive: normalizedDefinition.kind === 'number_threshold_crossed'
        ? evaluateInitialThreshold(normalizedDefinition, baseline)
        : undefined,
      revision: currentRegistry.revision + 1,
    },
  };
  return {
    registry: {
      ...currentRegistry,
      revision: currentRegistry.revision + 1,
      observers,
      blackboardRevision: diff.snapshot,
      observerChecks: currentRegistry.observerChecks + diff.checks,
    },
    created: true,
  };
}

export function unregisterAiBlackboardObserver(
  registry: AiBlackboardObserverRegistrySnapshotV1,
  observerId: string,
): AiBlackboardObserverRegistrySnapshotV1 {
  if (!registry.observers[observerId]) return cloneAiBlackboardObserverRegistry(registry);
  const observers = { ...registry.observers };
  delete observers[observerId];
  return {
    ...cloneAiBlackboardObserverRegistry(registry),
    revision: registry.revision + 1,
    observers,
  };
}

export function unregisterAiBlackboardObserverScope(
  registry: AiBlackboardObserverRegistrySnapshotV1,
  scopeNodeId: string,
): AiBlackboardObserverRegistrySnapshotV1 {
  const observers = Object.fromEntries(
    Object.entries(registry.observers)
      .filter(([, state]) => state.definition.scopeNodeId !== scopeNodeId)
      .map(([observerId, state]) => [observerId, cloneObserverState(state)]),
  );
  if (Object.keys(observers).length === Object.keys(registry.observers).length) {
    return cloneAiBlackboardObserverRegistry(registry);
  }
  return {
    ...cloneAiBlackboardObserverRegistry(registry),
    revision: registry.revision + 1,
    observers,
  };
}

export function listObservedBlackboardKeys(
  registry: AiBlackboardObserverRegistrySnapshotV1,
): string[] {
  return [...new Set(Object.values(registry.observers).map((state) => state.definition.key))].sort();
}

export function evaluateAiBlackboardObservers(
  registry: AiBlackboardObserverRegistrySnapshotV1,
  blackboard: AiGraphRunnerBlackboard,
  timestampMs: number,
): EvaluateAiBlackboardObserversResult {
  const currentRegistry = cloneAiBlackboardObserverRegistry(registry);
  const keys = listObservedBlackboardKeys(currentRegistry);
  if (keys.length === 0) {
    return { registry: currentRegistry, events: [], changedKeys: [], checks: 0 };
  }
  const diff = diffAiBlackboardKeys(currentRegistry.blackboardRevision, blackboard, keys);
  if (diff.changes.length === 0) {
    return {
      registry: {
        ...currentRegistry,
        blackboardRevision: diff.snapshot,
        observerChecks: currentRegistry.observerChecks + diff.checks,
      },
      events: [],
      changedKeys: [],
      checks: diff.checks,
    };
  }

  const changeByKey = new Map(diff.changes.map((change) => [change.key, change]));
  const observers: Record<string, AiBlackboardObserverState> = {};
  const events: AiEventDraft[] = [];
  let observerRevision = currentRegistry.revision;
  for (const [observerId, state] of Object.entries(currentRegistry.observers)) {
    const change = changeByKey.get(state.definition.key);
    if (!change) {
      observers[observerId] = cloneObserverState(state);
      continue;
    }
    const evaluated = evaluateObserver(state, change, timestampMs);
    observers[observerId] = evaluated.state;
    if (evaluated.event) {
      events.push(evaluated.event);
      observerRevision += 1;
    }
  }

  return {
    registry: {
      version: 1,
      revision: observerRevision,
      wakeRevision: events.length > 0 ? currentRegistry.wakeRevision + 1 : currentRegistry.wakeRevision,
      observers,
      blackboardRevision: diff.snapshot,
      observerChecks: currentRegistry.observerChecks + diff.checks,
      observerEvents: currentRegistry.observerEvents + events.length,
    },
    events,
    changedKeys: diff.changes.map((change) => change.key),
    checks: diff.checks,
  };
}

function evaluateObserver(
  state: AiBlackboardObserverState,
  change: AiBlackboardKeyChange,
  timestampMs: number,
): { state: AiBlackboardObserverState; event?: AiEventDraft } {
  const definition = state.definition;
  let shouldEmit = false;
  let thresholdActive = state.thresholdActive;
  let direction: AiBlackboardThresholdDirection | undefined;

  if (definition.kind === 'number_threshold_crossed') {
    const thresholdResult = evaluateThresholdTransition(definition, state.thresholdActive ?? false, change.current);
    thresholdActive = thresholdResult.active;
    shouldEmit = thresholdResult.changed;
    direction = thresholdResult.direction;
  } else if (definition.kind === 'bool_changed') {
    shouldEmit = normalizedKind(change.current) === 'boolean'
      || normalizedKind(change.previous) === 'boolean';
  } else if (definition.kind === 'position_changed') {
    shouldEmit = normalizedKind(change.current) === 'position'
      || normalizedKind(change.previous) === 'position';
  } else {
    shouldEmit = true;
  }

  const nextRevision = shouldEmit ? state.revision + 1 : state.revision;
  const nextState: AiBlackboardObserverState = {
    definition: cloneDefinition(definition),
    lastNormalizedValue: cloneNormalizedValue(change.current),
    thresholdActive,
    revision: nextRevision,
  };
  if (!shouldEmit) return { state: nextState };

  return {
    state: nextState,
    event: {
      id: `${definition.observerId}:${Math.max(0, Math.round(timestampMs))}:${nextRevision}`,
      type: 'blackboard_observer_changed',
      sourceId: definition.sourceNodeId,
      targetId: definition.scopeNodeId,
      timestampMs: Math.max(0, timestampMs),
      priority: definition.priority ?? 70,
      coalesceKey: `observer:${definition.observerId}`,
      payload: {
        labelRu: direction ? 'Порог пересечён' : 'Изменение',
        observerLabelRu: 'Наблюдатель',
        keyLabelRu: 'Ключ',
        observerId: definition.observerId,
        key: definition.key,
        kind: definition.kind,
        scopeNodeId: definition.scopeNodeId,
        sourceNodeId: definition.sourceNodeId,
        direction,
        revision: nextRevision,
        keyRevision: change.revision,
        previous: cloneOptionalNormalizedValue(change.previous),
        current: cloneNormalizedValue(change.current),
      },
    },
  };
}

function evaluateThresholdTransition(
  definition: AiBlackboardObserverDefinition,
  active: boolean,
  current: AiBlackboardNormalizedValue,
): { active: boolean; changed: boolean; direction?: AiBlackboardThresholdDirection } {
  const value = normalizedNumber(current);
  if (value === undefined) return { active, changed: false };
  const comparison = definition.comparison ?? 'above';
  const threshold = finiteOr(definition.threshold, 0);
  const enter = finiteOr(definition.hysteresisEnter, threshold);
  const exit = finiteOr(definition.hysteresisExit, threshold);
  const shouldEnter = comparison === 'above' ? value >= enter : value <= enter;
  const shouldExit = comparison === 'above' ? value <= exit : value >= exit;
  if (!active && shouldEnter) return { active: true, changed: true, direction: 'entered' };
  if (active && shouldExit) return { active: false, changed: true, direction: 'exited' };
  return { active, changed: false };
}

function evaluateInitialThreshold(
  definition: AiBlackboardObserverDefinition,
  value: AiBlackboardNormalizedValue,
): boolean {
  const number = normalizedNumber(value);
  if (number === undefined) return false;
  const comparison = definition.comparison ?? 'above';
  const threshold = finiteOr(definition.threshold, 0);
  const enter = finiteOr(definition.hysteresisEnter, threshold);
  return comparison === 'above' ? number >= enter : number <= enter;
}

function normalizeDefinition(definition: AiBlackboardObserverDefinition): AiBlackboardObserverDefinition {
  if (!definition.observerId.trim()) throw new Error('Blackboard observerId must not be empty.');
  if (!definition.key.trim()) throw new Error('Blackboard observer key must not be empty.');
  const kind = isObserverKind(definition.kind) ? definition.kind : 'key_changed';
  const comparison = definition.comparison === 'below' ? 'below' : 'above';
  const threshold = finiteOr(definition.threshold, 0);
  const hysteresisEnter = finiteOr(definition.hysteresisEnter, threshold);
  const hysteresisExit = finiteOr(definition.hysteresisExit, threshold);
  return {
    observerId: definition.observerId,
    key: definition.key,
    kind,
    scopeNodeId: definition.scopeNodeId,
    sourceNodeId: definition.sourceNodeId,
    comparison: kind === 'number_threshold_crossed' ? comparison : undefined,
    threshold: kind === 'number_threshold_crossed' ? threshold : undefined,
    hysteresisEnter: kind === 'number_threshold_crossed' ? hysteresisEnter : undefined,
    hysteresisExit: kind === 'number_threshold_crossed' ? hysteresisExit : undefined,
    priority: finiteOr(definition.priority, 70),
  };
}

function normalizeObserverState(value: unknown): AiBlackboardObserverState | undefined {
  if (!isRecord(value) || !isRecord(value.definition) || !isRecord(value.lastNormalizedValue)) return undefined;
  const definitionValue = value.definition;
  if (typeof definitionValue.observerId !== 'string'
    || typeof definitionValue.key !== 'string'
    || typeof definitionValue.kind !== 'string') return undefined;
  let definition: AiBlackboardObserverDefinition;
  try {
    definition = normalizeDefinition(definitionValue as unknown as AiBlackboardObserverDefinition);
  } catch {
    return undefined;
  }
  const lastNormalizedValue = normalizeStoredValue(value.lastNormalizedValue);
  if (!lastNormalizedValue) return undefined;
  return {
    definition,
    lastNormalizedValue,
    thresholdActive: typeof value.thresholdActive === 'boolean' ? value.thresholdActive : undefined,
    revision: integerNonNegative(value.revision, 0),
  };
}

function normalizeStoredValue(value: Record<string, unknown>): AiBlackboardNormalizedValue | undefined {
  if (value.state === 'missing') return { state: 'missing' };
  if (value.state !== 'value') return undefined;
  const candidate = value.value;
  if (candidate === null || typeof candidate === 'string' || typeof candidate === 'boolean') {
    return { state: 'value', value: candidate };
  }
  if (typeof candidate === 'number' && Number.isFinite(candidate)) return { state: 'value', value: candidate };
  if (isRecord(candidate)
    && typeof candidate.x === 'number'
    && Number.isFinite(candidate.x)
    && typeof candidate.y === 'number'
    && Number.isFinite(candidate.y)) {
    return { state: 'value', value: { x: candidate.x, y: candidate.y } };
  }
  return undefined;
}

function cloneObserverState(state: AiBlackboardObserverState): AiBlackboardObserverState {
  return {
    definition: cloneDefinition(state.definition),
    lastNormalizedValue: cloneNormalizedValue(state.lastNormalizedValue),
    thresholdActive: state.thresholdActive,
    revision: state.revision,
  };
}

function cloneDefinition(definition: AiBlackboardObserverDefinition): AiBlackboardObserverDefinition {
  return { ...definition };
}

function definitionsEqual(left: AiBlackboardObserverDefinition, right: AiBlackboardObserverDefinition): boolean {
  return left.observerId === right.observerId
    && left.key === right.key
    && left.kind === right.kind
    && left.scopeNodeId === right.scopeNodeId
    && left.sourceNodeId === right.sourceNodeId
    && left.comparison === right.comparison
    && left.threshold === right.threshold
    && left.hysteresisEnter === right.hysteresisEnter
    && left.hysteresisExit === right.hysteresisExit
    && left.priority === right.priority;
}

function normalizedKind(value: AiBlackboardNormalizedValue | undefined): 'missing' | 'null' | 'boolean' | 'number' | 'position' | 'string' {
  if (!value || value.state === 'missing') return 'missing';
  if (value.value === null) return 'null';
  if (typeof value.value === 'boolean') return 'boolean';
  if (typeof value.value === 'number') return 'number';
  if (typeof value.value === 'string') return 'string';
  return 'position';
}

function normalizedNumber(value: AiBlackboardNormalizedValue): number | undefined {
  return value.state === 'value' && typeof value.value === 'number' ? value.value : undefined;
}

function cloneOptionalNormalizedValue(value: AiBlackboardNormalizedValue | undefined): AiBlackboardNormalizedValue | undefined {
  return value ? cloneNormalizedValue(value) : undefined;
}

function isObserverKind(value: unknown): value is AiBlackboardObserverKind {
  return ['key_changed', 'bool_changed', 'number_threshold_crossed', 'position_changed'].includes(String(value));
}

function integerNonNegative(value: unknown, fallback: number): number {
  return Number.isInteger(value) && (value as number) >= 0 ? value as number : fallback;
}

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
