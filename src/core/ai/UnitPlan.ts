import type { GridPosition } from '../geometry';
import type { PlayerCommand } from '../orders/PlayerCommand';
import { isGridPositionValue } from './AiBlackboard';
import type { AiGraph, AiNode } from './AiGraph';
import type { AiGraphRuntimeResult } from './AiGraphRuntime';

export type UnitPlanSource = 'player_fallback' | 'ai_graph';
export type UnitPlanStatus = 'active' | 'completed' | 'failed' | 'cancelled';
export type UnitPlanStageStatus = 'completed' | 'active' | 'pending' | 'failed' | 'cancelled';

export interface UnitPlanStage {
  readonly id: string;
  readonly nodeType: string;
  readonly label: string;
  readonly labelRu: string;
  readonly status: UnitPlanStageStatus;
  readonly target: GridPosition | null;
}

export interface UnitPlanState {
  readonly source: UnitPlanSource;
  readonly commandId: string | null;
  readonly branchNodeId: string | null;
  readonly branchLabel: string;
  readonly branchLabelRu: string;
  readonly sequenceNodeId: string | null;
  readonly stages: readonly UnitPlanStage[];
  readonly activeStageIndex: number;
  readonly status: UnitPlanStatus;
  readonly reason: string;
  readonly reasonRu: string;
  readonly revision: number;
  readonly structuralKey: string;
}

export function createDirectPlayerMovePlan(
  previous: UnitPlanState | null,
  command: PlayerCommand,
  resolvedTarget: GridPosition,
): UnitPlanState {
  const status = planStatusFromCommand(command.status);
  const stageStatus = stageStatusFromCommand(command.status);
  const stage: UnitPlanStage = {
    id: `${command.id}:move`,
    nodeType: 'PlayerCommand',
    label: 'Move to commanded position',
    labelRu: 'Двигаться к указанной позиции',
    status: stageStatus,
    target: { ...resolvedTarget },
  };
  const structuralKey = makeStructuralKey({
    source: 'player_fallback',
    commandId: command.id,
    branchNodeId: null,
    sequenceNodeId: null,
    activeStageIndex: 0,
    status,
    stages: [stage],
  });

  return {
    source: 'player_fallback',
    commandId: command.id,
    branchNodeId: null,
    branchLabel: 'Execute player movement command',
    branchLabelRu: 'Выполнить приказ движения',
    sequenceNodeId: null,
    stages: [stage],
    activeStageIndex: 0,
    status,
    reason: command.reason,
    reasonRu: command.reasonRu,
    revision: nextRevision(previous, structuralKey),
    structuralKey,
  };
}

export function updateUnitPlanFromRuntime(
  previous: UnitPlanState | null,
  graph: AiGraph,
  result: AiGraphRuntimeResult,
): UnitPlanState | null {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const branch = nodes.get(result.selectedBranchNodeId);
  if (!branch || branch.type === 'Root') return previous;

  const sequence = resolveSequence(branch, result, nodes);
  const children = sequence?.children ?? [];
  const activeStageIndex = resolveActiveStageIndex(result, children.length);
  const stages = children.length > 0
    ? children.map((childId, index) => buildRuntimeStage(nodes.get(childId), childId, index, activeStageIndex, result))
    : [buildBranchStage(branch, result)];
  const normalizedActiveStageIndex = stages.length === 0
    ? 0
    : Math.max(0, Math.min(stages.length - 1, activeStageIndex));
  const status = planStatusFromRuntime(result.status);
  const structuralKey = makeStructuralKey({
    source: 'ai_graph',
    commandId: previous?.commandId ?? null,
    branchNodeId: branch.id,
    sequenceNodeId: sequence?.id ?? null,
    activeStageIndex: normalizedActiveStageIndex,
    status,
    stages,
  });

  return {
    source: 'ai_graph',
    commandId: previous?.commandId ?? null,
    branchNodeId: branch.id,
    branchLabel: result.selectedBranchName || nodeName(branch),
    branchLabelRu: result.selectedBranchNameRu || nodeNameRu(branch),
    sequenceNodeId: sequence?.id ?? null,
    stages,
    activeStageIndex: normalizedActiveStageIndex,
    status,
    reason: result.explanation,
    reasonRu: result.explanationRu ?? result.explanation,
    revision: nextRevision(previous, structuralKey),
    structuralKey,
  };
}

function resolveSequence(
  branch: AiNode,
  result: AiGraphRuntimeResult,
  nodes: ReadonlyMap<string, AiNode>,
): AiNode | undefined {
  const runtimeSequenceId = result.executionState?.sequenceNodeId;
  if (runtimeSequenceId) {
    const runtimeSequence = nodes.get(runtimeSequenceId);
    if (runtimeSequence?.type === 'SequenceWithMemory') return runtimeSequence;
  }

  for (const childId of branch.children ?? []) {
    const child = nodes.get(childId);
    if (child?.type === 'SequenceWithMemory') return child;
  }
  return undefined;
}

function resolveActiveStageIndex(result: AiGraphRuntimeResult, stageCount: number): number {
  if (stageCount <= 0) return 0;
  if (result.executionState) return Math.max(0, Math.min(stageCount - 1, result.executionState.childIndex));
  if (result.status === 'success') return stageCount - 1;
  return 0;
}

function buildRuntimeStage(
  node: AiNode | undefined,
  fallbackId: string,
  index: number,
  activeStageIndex: number,
  result: AiGraphRuntimeResult,
): UnitPlanStage {
  return {
    id: node?.id ?? fallbackId,
    nodeType: String(node?.type ?? 'unknown'),
    label: node ? nodeName(node) : fallbackId,
    labelRu: node ? nodeNameRu(node) : fallbackId,
    status: runtimeStageStatus(index, activeStageIndex, result.status),
    target: resolveNodeTarget(node, result),
  };
}

function buildBranchStage(branch: AiNode, result: AiGraphRuntimeResult): UnitPlanStage {
  return {
    id: branch.id,
    nodeType: String(branch.type),
    label: nodeName(branch),
    labelRu: nodeNameRu(branch),
    status: runtimeStageStatus(0, 0, result.status),
    target: resolveNodeTarget(branch, result),
  };
}

function resolveNodeTarget(node: AiNode | undefined, result: AiGraphRuntimeResult): GridPosition | null {
  if (!node || node.type !== 'MoveToBlackboardPosition') return null;
  const targetKey = typeof node.parameters?.targetKey === 'string'
    ? node.parameters.targetKey
    : result.targetKey;
  if (!targetKey) return result.targetPosition ? { ...result.targetPosition } : null;
  const value = result.blackboard[targetKey];
  return isGridPositionValue(value) ? { ...value } : result.targetPosition ? { ...result.targetPosition } : null;
}

function runtimeStageStatus(
  index: number,
  activeStageIndex: number,
  runtimeStatus: AiGraphRuntimeResult['status'],
): UnitPlanStageStatus {
  if (runtimeStatus === 'success') return 'completed';
  if (index < activeStageIndex) return 'completed';
  if (index > activeStageIndex) return 'pending';
  if (runtimeStatus === 'failure') return 'failed';
  if (runtimeStatus === 'cancelled') return 'cancelled';
  return 'active';
}

function planStatusFromRuntime(status: AiGraphRuntimeResult['status']): UnitPlanStatus {
  if (status === 'success') return 'completed';
  if (status === 'failure') return 'failed';
  if (status === 'cancelled') return 'cancelled';
  return 'active';
}

function planStatusFromCommand(status: PlayerCommand['status']): UnitPlanStatus {
  if (status === 'completed') return 'completed';
  if (status === 'blocked') return 'failed';
  if (status === 'cancelled') return 'cancelled';
  return 'active';
}

function stageStatusFromCommand(status: PlayerCommand['status']): UnitPlanStageStatus {
  if (status === 'completed') return 'completed';
  if (status === 'blocked') return 'failed';
  if (status === 'cancelled') return 'cancelled';
  return 'active';
}

function nextRevision(previous: UnitPlanState | null, structuralKey: string): number {
  if (previous?.structuralKey === structuralKey) return previous.revision;
  return (previous?.revision ?? 0) + 1;
}

function makeStructuralKey(value: {
  source: UnitPlanSource;
  commandId: string | null;
  branchNodeId: string | null;
  sequenceNodeId: string | null;
  activeStageIndex: number;
  status: UnitPlanStatus;
  stages: readonly UnitPlanStage[];
}): string {
  return [
    value.source,
    value.commandId ?? '',
    value.branchNodeId ?? '',
    value.sequenceNodeId ?? '',
    value.activeStageIndex,
    value.status,
    ...value.stages.map((stage) => [
      stage.id,
      stage.nodeType,
      stage.status,
      stage.target ? `${round(stage.target.x)}:${round(stage.target.y)}` : '-',
    ].join(':')),
  ].join('|');
}

function nodeName(node: AiNode): string {
  return node.displayName?.trim() || node.id;
}

function nodeNameRu(node: AiNode): string {
  return node.displayNameRu?.trim() || node.displayName?.trim() || node.id;
}

function round(value: number): string {
  return Number.isFinite(value) ? value.toFixed(3) : '0.000';
}
