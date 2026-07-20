import type { UnitPosture } from '../behavior/BehaviorModel';
import type { GridPosition } from '../geometry';
import type { MovementProfile } from '../movement/MovementProfileTypes';
import type { TacticalPostureEvaluationDetail } from '../tactical/TacticalPostureEvaluation';
import type { TacticalPositionSettings } from '../tactical/TacticalPositionSettings';
import type { TacticalTraversalFieldView } from './TacticalTraversalFieldView';
import type { TacticalTraversalReferenceThreat } from './TacticalTraversalFacing';
import type { TacticalTraversalProfile } from './TacticalTraversalProfile';

export interface TacticalTraversalPlannerInput {
  readonly routeCells: readonly GridPosition[];
  readonly routeRevision: number;
  readonly commandId: string | null;
  readonly commandRevision: number;
  readonly worldKey: string;
  readonly fieldIdentity: string;
  readonly knowledgeRevision: number;
  readonly tacticalPositionSettingsRevision: number;
  readonly movementProfileRevision: number;
  readonly intentVersion: number;
  readonly currentPosture: UnitPosture;
  readonly intentPresetId: string;
  readonly baseMovementProfileId: string;
  readonly referenceThreat: TacticalTraversalReferenceThreat | null;
  readonly profile: TacticalTraversalProfile;
  readonly postureSettings: TacticalPositionSettings;
  readonly field: TacticalTraversalFieldView;
  readonly movementProfiles?: readonly MovementProfile[];
}

export interface SampledTraversalRouteCell {
  readonly routeIndex: number;
  readonly position: GridPosition;
  readonly fieldIndex: number;
}

export interface TacticalTraversalCandidateState {
  readonly profile: MovementProfile;
  readonly posture: UnitPosture;
  readonly postureEvaluation: TacticalPostureEvaluationDetail;
  readonly edgeSeconds: number;
  readonly dangerExposure: number;
  readonly suppressionExposure: number;
  readonly staminaCost: number;
  readonly localCost: number;
  readonly reasonCodes: readonly string[];
}

export interface TacticalTraversalDpCell {
  readonly cost: number;
  readonly previousStateIndex: number;
  readonly state: TacticalTraversalCandidateState;
  readonly transitionCost: number;
}

export interface TacticalTraversalAssignment {
  readonly profile: MovementProfile;
  readonly posture: UnitPosture;
  readonly transitionCost: number;
  readonly reasonCodes: readonly string[];
}

export interface MutableTacticalTraversalSegment {
  start: number;
  end: number;
  assignment: TacticalTraversalAssignment;
}
