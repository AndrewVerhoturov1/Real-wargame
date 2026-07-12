import type { AiNode, AiNodeId } from '../AiGraph';

export type AiCompositeFrame =
  | AiSequenceFrame
  | AiReactiveSequenceFrame
  | AiSelectorFrame
  | AiUtilityExecutionFrame
  | AiActionBranchFrame;

export interface AiSequenceFrame {
  readonly kind: 'sequence';
  readonly nodeId: AiNodeId;
  readonly childIndex: number;
}

export interface AiReactiveSequenceFrame {
  readonly kind: 'reactive_sequence';
  readonly nodeId: AiNodeId;
  readonly childIndex: number;
}

export interface AiSelectorFrame {
  readonly kind: 'selector';
  readonly nodeId: AiNodeId;
  readonly childIndex: number;
}

export interface AiUtilityExecutionFrame {
  readonly kind: 'utility_execution';
  readonly nodeId: AiNodeId;
  readonly selectedBranchNodeId: AiNodeId;
  readonly selectedScoreRevision: number;
}

export interface AiActionBranchFrame {
  readonly kind: 'action_branch';
  readonly nodeId: AiNodeId;
  readonly childIndex: number;
}

export function createCompositeFrame(
  node: AiNode,
  childIndex = 0,
  selectedBranchNodeId?: AiNodeId,
  selectedScoreRevision = 0,
): AiCompositeFrame | null {
  if (node.type === 'SequenceWithMemory' || node.type === 'Sequence' || node.type === 'Root') {
    return { kind: 'sequence', nodeId: node.id, childIndex };
  }
  if (node.type === 'ReactiveSequence') {
    return { kind: 'reactive_sequence', nodeId: node.id, childIndex };
  }
  if (node.type === 'Selector') {
    return { kind: 'selector', nodeId: node.id, childIndex };
  }
  if (node.type === 'ActionBranch') {
    return { kind: 'action_branch', nodeId: node.id, childIndex };
  }
  if (node.type === 'UtilitySelector' && selectedBranchNodeId) {
    return {
      kind: 'utility_execution',
      nodeId: node.id,
      selectedBranchNodeId,
      selectedScoreRevision,
    };
  }
  return null;
}

export function cloneCompositeFrames(frames: readonly AiCompositeFrame[] | undefined): AiCompositeFrame[] {
  return (frames ?? []).map((frame) => ({ ...frame }));
}

export function isAiCompositeFrame(value: unknown): value is AiCompositeFrame {
  if (!isRecord(value) || typeof value.nodeId !== 'string') return false;
  if (value.kind === 'sequence'
    || value.kind === 'reactive_sequence'
    || value.kind === 'selector'
    || value.kind === 'action_branch') {
    return Number.isInteger(value.childIndex) && Number(value.childIndex) >= 0;
  }
  return value.kind === 'utility_execution'
    && typeof value.selectedBranchNodeId === 'string'
    && Number.isInteger(value.selectedScoreRevision)
    && Number(value.selectedScoreRevision) >= 0;
}

export function normalizeCompositeFrames(value: unknown): AiCompositeFrame[] | null {
  if (!Array.isArray(value) || !value.every(isAiCompositeFrame)) return null;
  return cloneCompositeFrames(value);
}

export function frameChildIndex(frame: AiCompositeFrame): number | null {
  return frame.kind === 'utility_execution' ? null : frame.childIndex;
}

export function withFrameChildIndex(frame: AiCompositeFrame, childIndex: number): AiCompositeFrame {
  if (frame.kind === 'utility_execution') return frame;
  return { ...frame, childIndex: Math.max(0, Math.floor(childIndex)) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
