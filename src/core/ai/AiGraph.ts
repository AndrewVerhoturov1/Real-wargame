import type { GridPosition } from '../geometry';
import type { AiBlackboardDefaults, AiBlackboardValue } from './AiBlackboard';
import type { AiNodeType } from './AiNodeTypes';

export type AiGraphVersion = 1;
export type AiNodeId = string;
export type AiNodeParameterValue = AiBlackboardValue;
export type AiNodeParameters = Record<string, AiNodeParameterValue>;

export interface AiGraph {
  readonly version: AiGraphVersion;
  readonly id: string;
  readonly name: string;
  readonly nameRu: string;
  readonly descriptionRu?: string;
  readonly rootNodeId: AiNodeId;
  readonly blackboardDefaults: AiBlackboardDefaults;
  readonly nodes: readonly AiNode[];
}

export interface AiNode {
  readonly id: AiNodeId;
  readonly type: AiNodeType | string;
  readonly displayName?: string;
  readonly displayNameRu?: string;
  readonly descriptionRu?: string;
  readonly children?: readonly AiNodeId[];
  readonly parameters?: AiNodeParameters;
}

export interface ScoreBreakdownItem {
  readonly sourceNodeId: AiNodeId;
  readonly labelRu: string;
  readonly value: number;
  readonly reasonRu: string;
}

export interface AiBranchScore {
  readonly branchNodeId: AiNodeId;
  readonly branchNameRu: string;
  readonly score: number;
  readonly breakdown: readonly ScoreBreakdownItem[];
  readonly vetoed: boolean;
  readonly vetoReasonRu?: string;
}

export type SoldierPostureCommandValue = 'standing' | 'crouched' | 'prone';

export type SoldierCommand =
  | {
      readonly type: 'set_posture';
      readonly posture: SoldierPostureCommandValue;
      readonly reasonRu: string;
    }
  | {
      readonly type: 'move_to';
      readonly target: GridPosition;
      readonly reasonRu: string;
    }
  | {
      readonly type: 'continue_order';
      readonly reasonRu: string;
    }
  | {
      readonly type: 'observe';
      readonly reasonRu: string;
    }
  | {
      readonly type: 'stop';
      readonly reasonRu: string;
    };

export interface SoldierDecisionResult {
  readonly unitId: string;
  readonly graphId: string;
  readonly selectedBranchNodeId: AiNodeId;
  readonly selectedBranchNameRu: string;
  readonly command: SoldierCommand;
  readonly scores: readonly AiBranchScore[];
  readonly explanationRu: string;
}
