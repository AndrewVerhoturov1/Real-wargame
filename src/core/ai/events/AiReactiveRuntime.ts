import type { AiGraph, AiNode, AiNodeId } from '../AiGraph';
import {
  runAiGraph,
  type AiGraphRunnerBlackboard,
  type AiGraphTacticalHost,
} from '../AiGraphRunner';
import type { AiGraphExecutionState } from '../AiGraphRuntime';
import type { AiCompositeFrame } from '../runtime/AiCompositeRuntime';
import type { MoveToBlackboardPositionActionState } from '../runtime/actions/MoveToBlackboardPositionAction';
import type { AiEvent } from './AiEvent';
import {
  cloneAiBlackboardObserverRegistry,
  registerAiBlackboardObserver,
  type AiBlackboardObserverDefinition,
  type AiBlackboardObserverRegistrySnapshotV1,
} from './AiBlackboardObserver';

export interface AiReactiveDependency {
  readonly conditionNodeId: AiNodeId;
  readonly key: string;
  readonly observer: AiBlackboardObserverDefinition;
}

export interface AiReactiveDependencySet {
  readonly reactiveNodeId: AiNodeId;
  readonly activeChildIndex: number;
  readonly activeNodeId: AiNodeId;
  readonly conditionNodeIds: readonly AiNodeId[];
  readonly dependencies: readonly AiReactiveDependency[];
}

export interface AiReactiveAbortTrace {
  readonly eventId: string;
  readonly eventType: string;
  readonly observerId?: string;
  readonly abortSourceNodeId: AiNodeId;
  readonly reactiveNodeId: AiNodeId;
  readonly oldBranchNodeId: AiNodeId;
  readonly activeChildNodeId: AiNodeId;
  readonly dependencyNodeIds: readonly AiNodeId[];
  readonly cleanupOutcome: 'pending' | 'completed';
  readonly newBranchNodeId?: AiNodeId;
  readonly reason: string;
  readonly reasonRu: string;
}

export interface EvaluateAiReactiveAbortInput {
  readonly graph: AiGraph;
  readonly executionState: AiGraphExecutionState;
  readonly blackboard: AiGraphRunnerBlackboard;
  readonly events: readonly AiEvent[];
  readonly nowMs: number;
  readonly cooldowns?: Readonly<Record<string, number>>;
  readonly tacticalHost?: AiGraphTacticalHost;
}

export interface EvaluateAiReactiveAbortResult {
  readonly dependencySet?: AiReactiveDependencySet;
  readonly relevantEvent?: AiEvent;
  readonly consumedEventIds: readonly string[];
  readonly shouldAbort: boolean;
  readonly failedConditionNodeId?: AiNodeId;
  readonly reason?: string;
  readonly reasonRu?: string;
  readonly trace?: AiReactiveAbortTrace;
}

export function deriveReactiveDependencySet(
  graph: AiGraph,
  executionState: AiGraphExecutionState,
): AiReactiveDependencySet | undefined {
  const frames = executionState.frames ?? [];
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const reactiveFrame = findDeepestReactiveFrame(frames, nodes);
  if (!reactiveFrame) return undefined;
  const reactiveNode = nodes.get(reactiveFrame.nodeId);
  if (!reactiveNode) return undefined;
  const conditionNodeIds = (reactiveNode.children ?? []).slice(0, reactiveFrame.childIndex);
  const dependencies = conditionNodeIds.flatMap((nodeId) => {
    const node = nodes.get(nodeId);
    return node ? deriveConditionDependencies(reactiveNode.id, node) : [];
  });
  return {
    reactiveNodeId: reactiveNode.id,
    activeChildIndex: reactiveFrame.childIndex,
    activeNodeId: executionState.activeNodeId,
    conditionNodeIds,
    dependencies,
  };
}

export function deriveReactiveObserverDefinitions(
  graph: AiGraph,
  executionState: AiGraphExecutionState,
): AiBlackboardObserverDefinition[] {
  return (deriveReactiveDependencySet(graph, executionState)?.dependencies ?? [])
    .map((dependency) => ({ ...dependency.observer }));
}

export function reconcileReactiveObserverRegistry(
  registry: AiBlackboardObserverRegistrySnapshotV1,
  definitions: readonly AiBlackboardObserverDefinition[],
  blackboard: AiGraphRunnerBlackboard,
): AiBlackboardObserverRegistrySnapshotV1 {
  const desired = new Map(definitions.map((definition) => [definition.observerId, definition]));
  let next = cloneAiBlackboardObserverRegistry(registry);
  const observers = { ...next.observers };
  let removed = false;
  for (const [observerId, state] of Object.entries(observers)) {
    if (!isReactiveObserverDefinition(state.definition)) continue;
    if (desired.has(observerId)) continue;
    delete observers[observerId];
    removed = true;
  }
  if (removed) next = { ...next, revision: next.revision + 1, observers };
  for (const definition of definitions) {
    next = registerAiBlackboardObserver(next, definition, blackboard).registry;
  }
  return next;
}

export function isReactiveExecutionState(state: AiGraphExecutionState | undefined): boolean {
  return Boolean(state?.frames?.some((frame) => frame.kind === 'reactive_sequence'));
}

export function evaluateAiReactiveAbort(
  input: EvaluateAiReactiveAbortInput,
): EvaluateAiReactiveAbortResult {
  const dependencySet = deriveReactiveDependencySet(input.graph, input.executionState);
  if (!dependencySet || dependencySet.conditionNodeIds.length === 0) {
    return { dependencySet, consumedEventIds: [], shouldAbort: false };
  }
  const activeMove = readActiveMoveState(input.executionState);
  const relevantEvent = [...input.events]
    .sort(compareEvents)
    .find((event) => eventRelevantToDependencies(event, dependencySet, activeMove));
  if (!relevantEvent) {
    return { dependencySet, consumedEventIds: [], shouldAbort: false };
  }

  const nodes = new Map(input.graph.nodes.map((node) => [node.id, node]));
  let blackboard = cloneBlackboard(input.blackboard);
  let failedConditionNodeId: AiNodeId | undefined;
  for (const conditionNodeId of dependencySet.conditionNodeIds) {
    const condition = nodes.get(conditionNodeId);
    if (!condition) {
      failedConditionNodeId = conditionNodeId;
      break;
    }
    const result = runConditionNode(input, condition, blackboard);
    blackboard = cloneBlackboard(result.blackboard);
    if (!result.ok) {
      failedConditionNodeId = condition.id;
      break;
    }
  }

  const routeAbort = isMatchingRouteAbortEvent(relevantEvent, activeMove);
  const shouldAbort = Boolean(failedConditionNodeId || routeAbort);
  const observerId = readPayloadString(relevantEvent, 'observerId');
  const abortSourceNodeId = failedConditionNodeId
    ?? readPayloadString(relevantEvent, 'sourceNodeId')
    ?? dependencySet.reactiveNodeId;
  const reason = routeAbort
    ? readPayloadString(relevantEvent, 'reason') ?? `Reactive route event ${relevantEvent.type} interrupted the active action.`
    : failedConditionNodeId
      ? `Reactive condition ${failedConditionNodeId} became false.`
      : `Reactive dependency changed but conditions still pass.`;
  const reasonRu = routeAbort
    ? readPayloadString(relevantEvent, 'reasonRu') ?? `Событие маршрута «${relevantEvent.type}» прервало активное действие.`
    : failedConditionNodeId
      ? `Реактивное условие «${failedConditionNodeId}» перестало выполняться.`
      : 'Зависимость изменилась, но условия реактивной последовательности всё ещё выполняются.';

  return {
    dependencySet,
    relevantEvent,
    consumedEventIds: [relevantEvent.id],
    shouldAbort,
    failedConditionNodeId,
    reason,
    reasonRu,
    trace: shouldAbort
      ? {
          eventId: relevantEvent.id,
          eventType: relevantEvent.type,
          observerId,
          abortSourceNodeId,
          reactiveNodeId: dependencySet.reactiveNodeId,
          oldBranchNodeId: input.executionState.branchNodeId,
          activeChildNodeId: input.executionState.activeNodeId,
          dependencyNodeIds: dependencySet.conditionNodeIds,
          cleanupOutcome: 'pending',
          reason,
          reasonRu,
        }
      : undefined,
  };
}

function isReactiveObserverDefinition(definition: AiBlackboardObserverDefinition): boolean {
  return Boolean(
    definition.scopeNodeId
    && definition.sourceNodeId
    && definition.observerId === `${definition.scopeNodeId}:${definition.sourceNodeId}:${definition.key}`,
  );
}

function deriveConditionDependencies(
  reactiveNodeId: string,
  condition: AiNode,
): AiReactiveDependency[] {
  const parameters = condition.parameters ?? {};
  const make = (
    key: string,
    observer: Omit<AiBlackboardObserverDefinition, 'observerId' | 'key' | 'scopeNodeId' | 'sourceNodeId'>,
  ): AiReactiveDependency => ({
    conditionNodeId: condition.id,
    key,
    observer: {
      observerId: `${reactiveNodeId}:${condition.id}:${key}`,
      key,
      scopeNodeId: reactiveNodeId,
      sourceNodeId: condition.id,
      priority: 80,
      ...observer,
    },
  });

  if (condition.type === 'FlagCheck') {
    return [make(readString(parameters.flagKey, ''), { kind: 'bool_changed' })].filter(hasDependencyKey);
  }
  if (condition.type === 'BlackboardValueAbove') {
    const threshold = readNumber(parameters.threshold, 50);
    return [make(readString(parameters.sourceKey, 'danger'), {
      kind: 'number_threshold_crossed',
      comparison: readString(parameters.comparison, 'above') === 'below' ? 'below' : 'above',
      threshold,
      hysteresisEnter: threshold,
      hysteresisExit: threshold,
    })];
  }
  if (condition.type === 'StableThreshold') {
    const enter = readNumber(parameters.enterThreshold, 70);
    const exit = readNumber(parameters.exitThreshold, 45);
    return [make(readString(parameters.sourceKey, 'danger'), {
      kind: 'number_threshold_crossed',
      comparison: 'above',
      threshold: enter,
      hysteresisEnter: enter,
      hysteresisExit: exit,
    })];
  }
  if (condition.type === 'DistanceCheck') {
    return [...new Set([
      distanceKey(readString(parameters.from, 'self')),
      distanceKey(readString(parameters.to, 'cover')),
    ])].filter(Boolean).map((key) => make(key, { kind: key.endsWith('_position') ? 'position_changed' : 'key_changed' }));
  }
  if (condition.type === 'TacticalCheck') {
    return tacticalCheckKeys(readString(parameters.checkKind, 'cover_exists'))
      .map((key) => make(key, { kind: key.endsWith('_position') ? 'position_changed' : 'key_changed' }));
  }
  return [];
}

function runConditionNode(
  input: EvaluateAiReactiveAbortInput,
  condition: AiNode,
  blackboard: AiGraphRunnerBlackboard,
) {
  return runAiGraph({
    graph: {
      version: input.graph.version,
      id: `${input.graph.id}:reactive:${condition.id}`,
      name: `${input.graph.name} reactive ${condition.id}`,
      nameRu: input.graph.nameRu,
      rootNodeId: condition.id,
      blackboardDefaults: input.graph.blackboardDefaults,
      nodes: [{ ...condition, children: [] }],
    },
    unitId: input.executionState.unitId,
    blackboard,
    cooldowns: { ...(input.cooldowns ?? {}) },
    nowMs: input.nowMs,
    tacticalHost: input.tacticalHost,
  });
}

function eventRelevantToDependencies(
  event: AiEvent,
  dependencySet: AiReactiveDependencySet,
  activeMove: MoveToBlackboardPositionActionState | undefined,
): boolean {
  if (isMatchingRouteAbortEvent(event, activeMove)) return true;
  const dependencyKeys = new Set(dependencySet.dependencies.map((dependency) => dependency.key));
  if (event.type === 'blackboard_observer_changed') {
    const observerId = readPayloadString(event, 'observerId');
    const key = readPayloadString(event, 'key');
    return dependencySet.dependencies.some((dependency) => dependency.observer.observerId === observerId)
      || Boolean(key && dependencyKeys.has(key));
  }
  return eventKeys(event.type).some((key) => dependencyKeys.has(key));
}

function isMatchingRouteAbortEvent(
  event: AiEvent,
  activeMove: MoveToBlackboardPositionActionState | undefined,
): boolean {
  if (!activeMove || (event.type !== 'route_blocked' && event.type !== 'target_lost')) return false;
  const ownerToken = readPayloadString(event, 'ownerToken');
  return !ownerToken || ownerToken === activeMove.actionToken;
}

function eventKeys(type: string): string[] {
  switch (type) {
    case 'order_received':
    case 'order_cancelled':
      return ['player_command_active', 'player_command_status', 'player_command_revision', 'player_command_target_position'];
    case 'ammo_empty': return ['ammo'];
    case 'weapon_ready_changed': return ['weaponReady'];
    case 'suppression_threshold_crossed': return ['suppression', 'underFire'];
    case 'move_completed': return ['active_move_source', 'active_move_owner_token', 'active_move_target', 'order_target_position'];
    case 'route_blocked': return ['active_move_path_status'];
    case 'target_lost': return ['best_cover_position', 'order_target_position', 'active_move_target'];
    default: return [];
  }
}

function distanceKey(value: string): string {
  switch (value) {
    case 'self': return 'self_position';
    case 'cover': return 'best_cover_position';
    case 'order': return 'order_target_position';
    case 'target': return 'current_target';
    case 'remembered_enemy': return 'remembered_enemy_position';
    default: return value.endsWith('_position') ? value : '';
  }
}

function tacticalCheckKeys(kind: string): string[] {
  switch (kind) {
    case 'ammo_available': return ['ammo', 'weaponReady'];
    case 'cover_exists': return ['best_cover_position'];
    case 'path_exists': return ['active_move_path_status'];
    case 'line_of_sight': return ['enemyVisible'];
    case 'line_of_fire': return ['enemyVisible', 'weaponReady'];
    default: return [];
  }
}

function findDeepestReactiveFrame(
  frames: readonly AiCompositeFrame[],
  nodes: Map<AiNodeId, AiNode>,
): Extract<AiCompositeFrame, { kind: 'reactive_sequence' }> | undefined {
  for (let index = frames.length - 1; index >= 0; index -= 1) {
    const frame = frames[index];
    if (frame.kind === 'reactive_sequence' && nodes.get(frame.nodeId)?.type === 'ReactiveSequence') return frame;
  }
  return undefined;
}

function readActiveMoveState(
  state: AiGraphExecutionState,
): MoveToBlackboardPositionActionState | undefined {
  return state.activeData?.kind === 'move_to_blackboard_position' ? state.activeData : undefined;
}

function compareEvents(left: AiEvent, right: AiEvent): number {
  if (left.priority !== right.priority) return right.priority - left.priority;
  if (left.timestampMs !== right.timestampMs) return left.timestampMs - right.timestampMs;
  return left.sequence - right.sequence;
}

function readPayloadString(event: AiEvent, key: string): string | undefined {
  const payload = event.payload;
  return isRecord(payload) && typeof payload[key] === 'string' ? payload[key] as string : undefined;
}

function hasDependencyKey(value: AiReactiveDependency): boolean {
  return value.key.length > 0;
}

function readString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function cloneBlackboard(value: AiGraphRunnerBlackboard): AiGraphRunnerBlackboard {
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key,
    isRecord(item) && typeof item.x === 'number' && typeof item.y === 'number'
      ? { x: item.x, y: item.y }
      : item,
  ]));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
