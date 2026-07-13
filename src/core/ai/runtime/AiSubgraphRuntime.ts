import type { AiBlackboardValue } from '../AiBlackboard';
import type { AiGraphExecutionState } from '../AiGraphRuntime';
import type { AiGraphRunnerBlackboard } from '../AiGraphRunner';
import type { AiNode } from '../AiGraph';
import type { AiSubgraphDefinition } from '../contracts/AiSubgraphRegistry';
import type { AiInputBinding } from '../contracts/AiPortTypes';

export interface AiSubgraphExecutionState {
  readonly kind: 'subgraph';
  readonly subgraphId: string;
  readonly startedAtMs: number;
  readonly localBlackboard: AiGraphRunnerBlackboard;
  readonly nestedExecutionState?: AiGraphExecutionState;
}

export function isAiSubgraphExecutionState(value: unknown): value is AiSubgraphExecutionState {
  return isRecord(value)
    && value.kind === 'subgraph'
    && typeof value.subgraphId === 'string'
    && typeof value.startedAtMs === 'number'
    && Number.isFinite(value.startedAtMs)
    && value.startedAtMs >= 0
    && isRecord(value.localBlackboard)
    && (value.nestedExecutionState === undefined || isRecord(value.nestedExecutionState));
}

export function cloneAiSubgraphExecutionState(value: AiSubgraphExecutionState): AiSubgraphExecutionState {
  return {
    kind: 'subgraph',
    subgraphId: value.subgraphId,
    startedAtMs: value.startedAtMs,
    localBlackboard: cloneBlackboard(value.localBlackboard),
    nestedExecutionState: value.nestedExecutionState
      ? JSON.parse(JSON.stringify(value.nestedExecutionState)) as AiGraphExecutionState
      : undefined,
  };
}

export function createAiSubgraphBlackboard(
  definition: AiSubgraphDefinition,
  node: AiNode,
  parentBlackboard: AiGraphRunnerBlackboard,
): AiGraphRunnerBlackboard {
  const local = cloneBlackboard(definition.graph.blackboardDefaults);
  Object.assign(local, cloneBlackboard(definition.localMemoryDefaults));
  for (const input of definition.inputs) {
    const binding = node.inputBindings?.[input.id];
    const value = binding ? readBinding(binding, parentBlackboard) : undefined;
    if (value !== undefined) local[input.memoryKey] = cloneValue(value);
  }
  copyRuntimeBridgeValues(parentBlackboard, local);
  return local;
}

export function refreshAiSubgraphRuntimeInputs(
  state: AiSubgraphExecutionState,
  parentBlackboard: AiGraphRunnerBlackboard,
): AiGraphRunnerBlackboard {
  const local = cloneBlackboard(state.localBlackboard);
  copyRuntimeBridgeValues(parentBlackboard, local);
  return local;
}

export function applyAiSubgraphOutputs(
  definition: AiSubgraphDefinition,
  node: AiNode,
  localBlackboard: AiGraphRunnerBlackboard,
  parentBlackboard: AiGraphRunnerBlackboard,
): AiGraphRunnerBlackboard {
  const next = cloneBlackboard(parentBlackboard);
  for (const output of definition.outputs) {
    const binding = node.outputBindings?.[output.id];
    if (binding?.target !== 'blackboard') continue;
    const value = localBlackboard[output.memoryKey];
    if (value !== undefined) next[binding.key] = cloneValue(value);
  }
  return next;
}

export function prefixAiSubgraphTracePath(parentGraphId: string, subgraphId: string, nodeId: string, existing?: string): string {
  const child = existing ? existing.split(' / ').slice(1).join(' / ') : nodeId;
  return `${parentGraphId} / ${subgraphId} / ${child}`;
}

function readBinding(binding: AiInputBinding, blackboard: AiGraphRunnerBlackboard): AiBlackboardValue | undefined {
  if (binding.source === 'literal') return binding.value;
  if (binding.source === 'blackboard') return blackboard[binding.key];
  return undefined;
}

function copyRuntimeBridgeValues(source: AiGraphRunnerBlackboard, target: AiGraphRunnerBlackboard): void {
  for (const key of ['self_position', 'active_move_source', 'active_move_owner_token', 'route_status', 'route_blocked', 'route_arrived']) {
    if (source[key] !== undefined) target[key] = cloneValue(source[key]);
  }
}

function cloneBlackboard(value: AiGraphRunnerBlackboard): AiGraphRunnerBlackboard {
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneValue(item)]));
}

function cloneValue<T>(value: T): T {
  if (typeof value === 'object' && value !== null) return { ...value } as T;
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
