import type { AiBlackboardValue } from '../AiBlackboard';
import type { AiNode } from '../AiGraph';
import type { AiGraphRunnerBlackboard } from '../AiGraphRunner';
import type { AiGraphExecutionState } from '../AiGraphRuntime';
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
    && value.subgraphId.length > 0
    && typeof value.startedAtMs === 'number'
    && Number.isFinite(value.startedAtMs)
    && isRecord(value.localBlackboard)
    && (value.nestedExecutionState === undefined || isRecord(value.nestedExecutionState));
}

export function createSubgraphLocalBlackboard(
  definition: AiSubgraphDefinition,
  node: AiNode,
  parentBlackboard: AiGraphRunnerBlackboard,
): AiGraphRunnerBlackboard {
  const local = cloneBlackboard({ ...definition.graph.blackboardDefaults, ...definition.localMemoryDefaults });
  for (const input of definition.inputs) {
    const binding = node.inputBindings?.[input.id];
    const value = readInputBinding(binding, parentBlackboard, local);
    if (value !== undefined) local[input.id] = cloneValue(value);
  }
  copyRuntimeValues(parentBlackboard, local);
  return local;
}

export function refreshSubgraphRuntimeValues(parent: AiGraphRunnerBlackboard, local: AiGraphRunnerBlackboard): AiGraphRunnerBlackboard {
  const next = cloneBlackboard(local);
  copyRuntimeValues(parent, next);
  return next;
}

export function applySubgraphOutputs(
  definition: AiSubgraphDefinition,
  node: AiNode,
  local: AiGraphRunnerBlackboard,
  parent: AiGraphRunnerBlackboard,
): AiGraphRunnerBlackboard {
  const next = cloneBlackboard(parent);
  const outputMemory = cloneBlackboard(local);
  if (outputMemory.reached_position === undefined && outputMemory.self_position !== undefined) outputMemory.reached_position = cloneValue(outputMemory.self_position);
  outputMemory.success = true;
  for (const output of definition.outputs) {
    const binding = node.outputBindings?.[output.id];
    const value = outputMemory[output.id];
    if (!binding || value === undefined) continue;
    if (binding.target === 'blackboard') next[binding.key] = cloneValue(value);
    if (binding.target === 'subgraphOutput') next[binding.port] = cloneValue(value);
  }
  return next;
}

export function cloneAiSubgraphExecutionState(value: AiSubgraphExecutionState): AiSubgraphExecutionState {
  return {
    ...value,
    localBlackboard: cloneBlackboard(value.localBlackboard),
    nestedExecutionState: value.nestedExecutionState ? JSON.parse(JSON.stringify(value.nestedExecutionState)) as AiGraphExecutionState : undefined,
  };
}

function readInputBinding(binding: AiInputBinding | undefined, parent: AiGraphRunnerBlackboard, local: AiGraphRunnerBlackboard): AiBlackboardValue | undefined {
  if (!binding) return undefined;
  if (binding.source === 'literal') return binding.value;
  if (binding.source === 'blackboard') return parent[binding.key];
  if (binding.source === 'subgraphInput') return local[binding.port] ?? parent[binding.port];
  return undefined;
}

function copyRuntimeValues(parent: AiGraphRunnerBlackboard, local: AiGraphRunnerBlackboard): void {
  for (const key of ['self_position', 'active_move_source', 'active_move_owner_token', 'active_move_target', 'ammo', 'weaponReady']) {
    if (parent[key] !== undefined) local[key] = cloneValue(parent[key]);
  }
}
function cloneBlackboard(value: AiGraphRunnerBlackboard): AiGraphRunnerBlackboard { const result: AiGraphRunnerBlackboard = {}; for (const [key, item] of Object.entries(value)) result[key] = cloneValue(item); return result; }
function cloneValue(value: AiBlackboardValue): AiBlackboardValue { return typeof value === 'object' && value !== null ? { x: value.x, y: value.y } : value; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
