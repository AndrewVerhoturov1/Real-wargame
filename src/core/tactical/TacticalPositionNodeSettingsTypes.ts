export type TacticalPositionNodeKind = 'observation' | 'defense' | 'firing';
export type TacticalPositionNodeObjective = 'balanced' | 'advance_to_threat' | 'withdraw_from_threat' | 'continue_order';
export type TacticalPositionNodePosture = 'standing' | 'crouched' | 'prone';
export type TacticalPositionNodeParameterValue = string | number | boolean | null | { readonly x: number; readonly y: number };
export type TacticalPositionNodeParameters = Record<string, TacticalPositionNodeParameterValue>;

export interface TacticalPositionRankingWeights {
  readonly staticPotential: number;
  readonly directionalFit: number;
  readonly lineQuality: number;
  readonly rangeFit: number;
  readonly desiredDistance: number;
  readonly protection: number;
  readonly concealment: number;
  readonly danger: number;
  readonly routeDanger: number;
  readonly routeCost: number;
  readonly certainty: number;
  readonly orderAlignment: number;
  readonly withdrawal: number;
  readonly postureFit: number;
}
export interface TacticalPositionRankingSettings {
  readonly tacticalQualityWeight: number;
  readonly movementObjectiveWeight: number;
  readonly weights: TacticalPositionRankingWeights;
}
export interface TacticalPositionMovementObjectiveSettings {
  readonly balancedInfluence: number;
  readonly advanceToThreatInfluence: number;
  readonly withdrawFromThreatInfluence: number;
  readonly continueOrderInfluence: number;
  readonly wrongDirectionPenalty: number;
  readonly distanceToleranceMeters: number;
}
export interface TacticalPositionConstraintSettings {
  readonly maxPositionDanger: number;
  readonly maxRouteDanger: number;
  readonly minimumProtection: number;
  readonly minimumConcealment: number;
  readonly minimumDirectionalFit: number;
  readonly minimumLineQuality: number;
  readonly minimumTargetDistanceMeters: number;
  readonly maximumTargetDistanceMeters: number;
  readonly desiredDistanceMeters: number;
  readonly desiredDistanceToleranceMeters: number;
  readonly allowedPostures: Readonly<Record<TacticalPositionNodePosture, boolean>>;
  readonly requireVisualLine: boolean;
  readonly requireBallisticLine: boolean;
}
export interface TacticalPositionPostureSettings {
  readonly transitionPenaltyStanding: number;
  readonly transitionPenaltyCrouched: number;
  readonly transitionPenaltyProne: number;
  readonly dangerExposureWeight: number;
}
export interface TacticalPositionSearchBudgetSettings {
  readonly maxCandidates: number;
  readonly candidateScanLimit: number;
  readonly preliminaryCandidates: number;
  readonly exactCandidates: number;
  readonly exactRayLimit: number;
  readonly maxRouteExpansions: number;
  readonly maximumRouteCost: number;
  readonly objectiveCandidatePool: number;
  readonly minimumSeparationMeters: number;
}
export interface TacticalPositionSearchSettings {
  readonly version: 1;
  readonly ranking: TacticalPositionRankingSettings;
  readonly movementObjective: TacticalPositionMovementObjectiveSettings;
  readonly constraints: TacticalPositionConstraintSettings;
  readonly posture: TacticalPositionPostureSettings;
  readonly searchBudget: TacticalPositionSearchBudgetSettings;
}
export interface TacticalPositionNodeSettings {
  readonly version: 1;
  readonly queryKey: string;
  readonly kind: TacticalPositionNodeKind;
  readonly objective: TacticalPositionNodeObjective;
  readonly target: {
    readonly mode: 'automatic' | 'order_point' | 'facing_sector';
    readonly point: { readonly x: number; readonly y: number } | null;
    readonly sectorCenterDegrees: number;
    readonly sectorArcDegrees: number;
  };
  readonly searchRadiusMeters: number;
  readonly maxCalculationMs: number;
  readonly search: TacticalPositionSearchSettings;
  readonly ranking: TacticalPositionRankingSettings;
  readonly movementObjective: TacticalPositionMovementObjectiveSettings;
  readonly constraints: TacticalPositionConstraintSettings;
  readonly posture: TacticalPositionPostureSettings;
  readonly searchBudget: TacticalPositionSearchBudgetSettings;
}

export type TacticalPositionNodeParameterGroup = 'main' | 'ranking' | 'movement' | 'constraints' | 'posture' | 'performance';
export interface TacticalPositionNodeParameterDescriptor {
  readonly id: string;
  readonly kind: 'number' | 'boolean' | 'string' | 'enum' | 'position';
  readonly group: TacticalPositionNodeParameterGroup;
  readonly label: string;
  readonly labelRu: string;
  readonly description: string;
  readonly descriptionRu: string;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly step?: number;
  readonly unit?: string;
  readonly advanced?: boolean;
  readonly slider?: boolean;
  readonly options?: readonly { readonly value: string; readonly label: string; readonly labelRu: string }[];
}
export interface TacticalPositionNodeParameterGroupDescriptor {
  readonly id: TacticalPositionNodeParameterGroup;
  readonly label: string;
  readonly labelRu: string;
  readonly descriptionRu: string;
  readonly collapsedByDefault: boolean;
}
