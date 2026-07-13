import type { GridPosition } from '../geometry';
import type {
  AiBlackboardDefaults,
  AiBlackboardSchemaEntry,
  AiBlackboardValue,
} from './AiBlackboard';
import type { AiNodeType } from './AiNodeTypes';
import type {
  AiNodeInputBindings,
  AiNodeOutputBindings,
} from './contracts/AiPortTypes';

export type AiGraphVersion = 1 | 2;
export type AiNodeId = string;
export type AiNodeParameterValue = AiBlackboardValue;
export type AiNodeParameters = Record<string, AiNodeParameterValue>;

export interface AiNodeBase {
  readonly id: AiNodeId;
  readonly type: AiNodeType | string;
  readonly displayName?: string;
  readonly displayNameRu?: string;
  readonly description?: string;
  readonly descriptionRu?: string;
  readonly children?: readonly AiNodeId[];
  readonly parameters?: AiNodeParameters;
}

export interface AiNode extends AiNodeBase {
  readonly inputBindings?: AiNodeInputBindings;
  readonly outputBindings?: AiNodeOutputBindings;
  readonly legacyMetadata?: Record<string, unknown>;
}

export interface AiNodeV1 extends AiNode {
  readonly inputBindings?: undefined;
  readonly outputBindings?: undefined;
  readonly legacyMetadata?: undefined;
}

export interface AiNodeV2 extends AiNode {}

export interface AiGraphBase {
  readonly id: string;
  readonly name: string;
  readonly nameRu?: string;
  readonly description?: string;
  readonly descriptionRu?: string;
  readonly rootNodeId: AiNodeId;
  readonly blackboardDefaults: AiBlackboardDefaults;
  readonly nodes: readonly AiNode[];
}

export interface AiGraph extends AiGraphBase {
  readonly version: AiGraphVersion;
  readonly blackboardSchema?: readonly AiBlackboardSchemaEntry[];
  readonly subgraphRefs?: readonly string[];
  readonly legacyMetadata?: Record<string, unknown>;
}

export interface AiGraphV1 extends AiGraph {
  readonly version: 1;
}

export interface AiGraphV2 extends AiGraph {
  readonly version: 2;
  readonly blackboardSchema: readonly AiBlackboardSchemaEntry[];
  readonly nodes: readonly AiNodeV2[];
  readonly subgraphRefs: readonly string[];
}

export function isAiGraphV2(graph: AiGraph | unknown): graph is AiGraphV2 {
  return typeof graph === 'object'
    && graph !== null
    && (graph as { version?: unknown }).version === 2;
}

export interface ScoreBreakdownItem {
  readonly sourceNodeId: AiNodeId;
  readonly label: string;
  readonly labelRu?: string;
  readonly value: number;
  readonly reason: string;
  readonly reasonRu?: string;
}

export interface AiBranchScore {
  readonly branchNodeId: AiNodeId;
  readonly branchName: string;
  readonly branchNameRu?: string;
  readonly score: number;
  readonly breakdown: readonly ScoreBreakdownItem[];
  readonly vetoed: boolean;
  readonly vetoReason?: string;
  readonly vetoReasonRu?: string;
}

export type SoldierPostureCommandValue = 'standing' | 'crouched' | 'prone';

export type SoldierCommand =
  | {
      readonly type: 'set_posture';
      readonly posture: SoldierPostureCommandValue;
      readonly reason: string;
      readonly reasonRu?: string;
    }
  | {
      readonly type: 'move_to';
      readonly target: GridPosition;
      readonly reason: string;
      readonly reasonRu?: string;
    }
  | {
      readonly type: 'continue_order';
      readonly reason: string;
      readonly reasonRu?: string;
    }
  | {
      readonly type: 'observe';
      readonly reason: string;
      readonly reasonRu?: string;
    }
  | {
      readonly type: 'stop';
      readonly reason: string;
      readonly reasonRu?: string;
    };

export interface SoldierDecisionResult {
  readonly unitId: string;
  readonly graphId: string;
  readonly selectedBranchNodeId: AiNodeId;
  readonly selectedBranchName: string;
  readonly selectedBranchNameRu?: string;
  readonly command: SoldierCommand;
  readonly scores: readonly AiBranchScore[];
  readonly explanation: string;
  readonly explanationRu?: string;
}
