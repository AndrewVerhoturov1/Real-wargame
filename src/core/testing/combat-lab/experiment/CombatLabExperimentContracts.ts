import type { ExportedSceneData } from '../../../simulation/SceneSnapshot';
import type {
  CombatLabAccuracyOverridesV1,
  CombatLabMetricId,
  CombatLabRoleV1,
  CombatLabScenarioId,
  CombatLabScriptCommandV1,
} from '../CombatLabContracts';

export const COMBAT_LAB_EXPERIMENT_SCHEMA_VERSION = 1 as const;

export const COMBAT_LAB_EXPERIMENT_LIMITS_V1 = Object.freeze({
  maximumTracks: 64,
  maximumSteps: 512,
  maximumMarkers: 256,
  maximumUndoStates: 100,
  minimumRunCount: 1,
  maximumRunCount: 10_000,
  minimumWorkerCount: 1,
  maximumWorkerCount: 4,
  minimumRepresentativeRuns: 1,
  maximumRepresentativeRuns: 20,
  minimumSimulationSeconds: 0.1,
  maximumSimulationSeconds: 600,
  minimumRepeatAttempts: 1,
  maximumRepeatAttempts: 1_000,
} as const);

export type CombatLabFailurePolicyV1 = 'stop_experiment' | 'wait' | 'skip_step';
export type CombatLabPostureV1 = Extract<CombatLabScriptCommandV1, { readonly kind: 'posture' }>['targetPosture'];
export type CombatLabFireModeV1 = Extract<CombatLabScriptCommandV1, { readonly kind: 'fire' }>['mode'];
export type CombatLabFirstAidZoneV1 = Extract<CombatLabScriptCommandV1, { readonly kind: 'first_aid' }>['zone'];
export type CombatLabTacticalOrderPresetV1 = 'move' | 'recon' | 'assault';
export type CombatLabCancelActionTargetV1 = 'movement' | 'fire' | 'reload' | 'deployment' | 'transfer' | 'first_aid';

export interface CombatLabExperimentV1 {
  readonly schemaVersion: 1;
  readonly experimentId: string;
  readonly revision: number;
  readonly titleRu: string;
  readonly descriptionRu: string;
  readonly baseScenarioId: CombatLabScenarioId | null;
  readonly sceneSnapshot: ExportedSceneData;
  readonly roles: readonly CombatLabExperimentRoleV1[];
  readonly markers: readonly CombatLabMarkerV1[];
  readonly tracks: readonly CombatLabTrackV1[];
  readonly defaults: CombatLabExperimentDefaultsV1;
  readonly successCondition: CombatLabConditionV1;
  readonly stopCondition: CombatLabExperimentStopConditionV1;
  readonly batchDefaults: CombatLabBatchConfigV1;
}

export interface CombatLabParticipantParametersV1 {
  readonly schemaVersion: 1;
  readonly accuracy: CombatLabAccuracyOverridesV1 | null;
}

export interface CombatLabExperimentRoleV1 {
  readonly roleId: string;
  readonly unitId: string;
  readonly titleRu: string;
  readonly parameters: CombatLabParticipantParametersV1;
  /** Legacy import-only capability list. It never determines action availability. */
  readonly selectableAs?: CombatLabRoleV1['selectableAs'];
}

export interface CombatLabPointMarkerV1 {
  readonly markerId: string;
  readonly kind: 'point';
  readonly titleRu: string;
  readonly xMetres: number;
  readonly yMetres: number;
  readonly zMetres: number;
}

export interface CombatLabCircleMarkerV1 {
  readonly markerId: string;
  readonly kind: 'circle';
  readonly titleRu: string;
  readonly xMetres: number;
  readonly yMetres: number;
  readonly zMetres: number;
  readonly radiusMetres: number;
}

export type CombatLabMarkerV1 = CombatLabPointMarkerV1 | CombatLabCircleMarkerV1;

export interface CombatLabTrackV1 {
  readonly trackId: string;
  readonly titleRu: string;
  readonly actorRoleId: string;
  readonly enabled: boolean;
  readonly steps: readonly CombatLabScenarioStepV1[];
}

export interface CombatLabScenarioStepV1 {
  readonly stepId: string;
  readonly titleRu: string;
  readonly enabled: boolean;
  readonly breakpointBefore: boolean;
  readonly startCondition: CombatLabConditionV1;
  readonly action: CombatLabActionV1;
  readonly completion: CombatLabCompletionV1;
  readonly repeat: CombatLabRepeatPolicyV1;
  readonly timeoutSeconds: number;
  readonly failurePolicy: CombatLabFailurePolicyV1;
  readonly accuracyOverrides: CombatLabAccuracyOverridesV1 | null;
}

export type CombatLabTargetReferenceV1 =
  | { readonly kind: 'role'; readonly roleId: string }
  | { readonly kind: 'marker'; readonly markerId: string };

export type CombatLabActionV1 =
  | {
      readonly kind: 'fire';
      readonly actorRoleId: string;
      readonly target: CombatLabTargetReferenceV1;
      readonly mode: CombatLabFireModeV1;
      readonly targetRadiusMetres: number;
      readonly minimumSolutionQuality: number;
      readonly minimumPerceptionQuality: number;
      readonly forceFire: boolean;
    }
  /** Legacy import-only alias. New authoring uses cancel_action/fire. */
  | { readonly kind: 'stop_fire'; readonly actorRoleId: string }
  | {
      readonly kind: 'move';
      readonly actorRoleId: string;
      readonly markerId: string;
      readonly tacticalOrderPresetId?: CombatLabTacticalOrderPresetV1;
      readonly finalFacingMarkerId?: string | null;
    }
  | { readonly kind: 'face'; readonly actorRoleId: string; readonly markerId: string }
  | { readonly kind: 'cancel_action'; readonly actorRoleId: string; readonly target: CombatLabCancelActionTargetV1 }
  | { readonly kind: 'posture'; readonly actorRoleId: string; readonly targetPosture: CombatLabPostureV1 }
  | { readonly kind: 'wait'; readonly durationSeconds: number | null }
  | { readonly kind: 'reload'; readonly actorRoleId: string; readonly helperRoleId: string | null }
  | { readonly kind: 'deploy'; readonly actorRoleId: string; readonly helperRoleId: string | null }
  | { readonly kind: 'undeploy'; readonly actorRoleId: string; readonly helperRoleId: string | null }
  | { readonly kind: 'transfer'; readonly sourceRoleId: string; readonly targetRoleId: string; readonly requestedRounds: number }
  | { readonly kind: 'first_aid'; readonly actorRoleId: string; readonly targetRoleId: string; readonly zone: CombatLabFirstAidZoneV1 };

export type CombatLabStepDependencyStateV1 = 'started' | 'completed' | 'failed';
export type CombatLabRoleStatePredicateV1 =
  | 'capable'
  | 'incapacitated'
  | 'can_fire'
  | 'cannot_fire'
  | 'can_move'
  | 'cannot_move';

export type CombatLabConditionV1 =
  | { readonly kind: 'always' }
  | { readonly kind: 'elapsed'; readonly anchor: 'experiment_start' | 'step_start'; readonly seconds: number }
  | { readonly kind: 'step_state'; readonly trackId: string; readonly stepId: string; readonly state: CombatLabStepDependencyStateV1 }
  | { readonly kind: 'role_state'; readonly roleId: string; readonly state: CombatLabRoleStatePredicateV1 }
  | { readonly kind: 'contact'; readonly observerRoleId: string; readonly targetRoleId: string; readonly present: boolean }
  | { readonly kind: 'ammo'; readonly roleId: string; readonly comparison: 'empty' }
  | { readonly kind: 'ammo'; readonly roleId: string; readonly comparison: 'at_most' | 'at_least'; readonly rounds: number }
  | { readonly kind: 'suppression'; readonly roleId: string; readonly comparison: 'at_most' | 'at_least'; readonly value: number };

export type CombatLabCompletionV1 =
  | { readonly kind: 'production_action' }
  | { readonly kind: 'shot_resolved' }
  | { readonly kind: 'condition'; readonly condition: CombatLabConditionV1 };

export type CombatLabRepeatPolicyV1 =
  | { readonly kind: 'once'; readonly maximumAttempts: 1; readonly retryDelaySeconds: 0 }
  | {
      readonly kind: 'until_condition';
      readonly condition: CombatLabConditionV1;
      readonly maximumAttempts: number;
      readonly retryDelaySeconds: number;
    };

export interface CombatLabExperimentDefaultsV1 {
  readonly seed: number;
  readonly stepTimeoutSeconds: number;
  readonly failurePolicy: CombatLabFailurePolicyV1;
  readonly repeat: CombatLabRepeatPolicyV1;
  readonly accuracyOverrides: CombatLabAccuracyOverridesV1 | null;
}

export type CombatLabExperimentStopConditionV1 =
  | { readonly kind: 'time'; readonly maximumSimulationSeconds: number }
  | { readonly kind: 'program_complete'; readonly maximumSimulationSeconds: number }
  | { readonly kind: 'condition'; readonly maximumSimulationSeconds: number; readonly condition: CombatLabConditionV1 };

export type CombatLabSeedStrategyV1 =
  | { readonly kind: 'fixed'; readonly seed: number }
  | { readonly kind: 'sequential'; readonly firstSeed: number }
  | { readonly kind: 'explicit'; readonly seeds: readonly number[] };

export interface CombatLabBatchConfigV1 {
  readonly runCount: number;
  readonly seedStrategy: CombatLabSeedStrategyV1;
  readonly maximumSimulationSeconds: number;
  readonly workerCount: number;
  readonly representativeRunCount: number;
  readonly metricIds: readonly CombatLabMetricId[];
}

export type CombatLabStepRuntimeState =
  | 'pending'
  | 'waiting'
  | 'running'
  | 'completed'
  | 'failed'
  | 'skipped'
  | 'paused_at_breakpoint';

export interface CombatLabStepRuntimeSnapshotV1 {
  readonly trackId: string;
  readonly stepId: string;
  readonly state: CombatLabStepRuntimeState;
  readonly attempt: number;
  readonly ownerToken: string | null;
  readonly startedSeconds: number | null;
  readonly completedSeconds: number | null;
  readonly nextRetrySeconds: number | null;
  readonly reasonCode: string | null;
  readonly reasonRu: string | null;
}

export type CombatLabScenarioRuntimeStatusV1 = 'idle' | 'running' | 'completed' | 'failed' | 'stopped';

export interface CombatLabScenarioRuntimeSnapshotV1 {
  readonly schemaVersion: 1;
  readonly experimentId: string;
  readonly experimentRevision: number;
  readonly status: CombatLabScenarioRuntimeStatusV1;
  readonly simulatedSeconds: number;
  readonly success: boolean | null;
  readonly stopReasonCode: string | null;
  readonly stopReasonRu: string | null;
  readonly steps: readonly CombatLabStepRuntimeSnapshotV1[];
}
