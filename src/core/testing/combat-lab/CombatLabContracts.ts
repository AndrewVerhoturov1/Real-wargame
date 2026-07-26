import type { UnitPosture } from '../../behavior/BehaviorModel';
import type { HitZone } from '../../combat/UnitHitShapes';
import type { FireMode } from '../../infantry-combat/catalogs/CombatCatalogTypes';
import type { SimulationState } from '../../simulation/SimulationState';

export const COMBAT_LAB_SCHEMA_VERSION = 1 as const;
export const COMBAT_LAB_FIXED_STEP_SECONDS = 1 / 30;

export const COMBAT_LAB_METRIC_IDS = [
  'shotsCommitted',
  'roundsConsumed',
  'projectilesCreated',
  'hits',
  'misses',
  'bodyImpacts',
  'woundsByZone.head',
  'woundsByZone.torso',
  'woundsByZone.arms',
  'woundsByZone.legs',
  'woundsBySeverity.light',
  'woundsBySeverity.moderate',
  'woundsBySeverity.severe',
  'woundsBySeverity.critical',
  'suppressionEvents',
  'maximumSuppression',
  'actionCompletionSeconds',
  'reloadCompletionSeconds',
  'deployCompletionSeconds',
  'transferRounds',
  'bloodLost',
  'firstAidStagesCompleted',
  'overflowCount',
  'bufferResizeCount',
] as const;

export type CombatLabMetricId = (typeof COMBAT_LAB_METRIC_IDS)[number];
export type CombatLabScenarioId =
  | 'rifle-distance-baseline'
  | 'rifle-moving-target'
  | 'ppsh-burst-recoil'
  | 'dp27-portable-deployed'
  | 'dp27-assistant-ammo'
  | 'wounds-first-aid'
  | 'suppression-events'
  | 'combat-save-load-boundaries';

export type CombatLabDiagnosticLayerId =
  | 'active_projectiles'
  | 'projectile_trails'
  | 'impacts'
  | 'last_hit_zone'
  | 'aim_direction'
  | 'target_point'
  | 'dp27_sector'
  | 'dp27_anchor'
  | 'suppression_events'
  | 'distances'
  | 'unit_ids';

export interface CombatLabVisualPresetV1 {
  readonly schemaVersion: 1;
  readonly recommendedLayerIds: readonly CombatLabDiagnosticLayerId[];
  readonly focusUnitId: string;
  readonly mapPaddingMetres: number;
}

export interface CombatLabStopConditionV1 {
  readonly kind: 'time' | 'program_complete';
  readonly maximumSimulationSeconds: number;
}

export interface CombatLabRoleV1 {
  readonly roleId: string;
  readonly unitId: string;
  readonly titleRu: string;
  readonly selectableAs: readonly ('shooter' | 'target' | 'assistant' | 'first_aid_actor' | 'first_aid_target' | 'ammo_source' | 'ammo_target')[];
}

export interface CombatLabControlDistanceV1 {
  readonly labelRu: string;
  readonly fromUnitId: string;
  readonly toUnitId: string;
  readonly metres: number;
}

export type CombatLabScriptCommandV1 =
  | {
      readonly kind: 'fire';
      readonly shooterUnitId: string;
      readonly targetUnitId: string | null;
      readonly targetPointMetres: { readonly xMetres: number; readonly yMetres: number; readonly zMetres: number } | null;
      readonly mode: FireMode;
      readonly targetRadiusMetres: number;
      readonly minimumSolutionQuality: number;
    }
  | {
      readonly kind: 'cancel_fire';
      readonly unitId: string;
    }
  | {
      readonly kind: 'posture';
      readonly unitId: string;
      readonly targetPosture: UnitPosture;
    }
  | {
      readonly kind: 'move';
      readonly unitId: string;
      readonly targetGrid: { readonly x: number; readonly y: number };
    }
  | {
      readonly kind: 'reload';
      readonly unitId: string;
      readonly helperUnitId: string | null;
    }
  | {
      readonly kind: 'deploy' | 'undeploy';
      readonly unitId: string;
      readonly helperUnitId: string | null;
    }
  | {
      readonly kind: 'transfer';
      readonly sourceUnitId: string;
      readonly targetUnitId: string;
      readonly requestedRounds: number;
    }
  | {
      readonly kind: 'first_aid';
      readonly actorUnitId: string;
      readonly targetUnitId: string;
      readonly zone: HitZone | null;
    };

export interface CombatLabScriptStepV1 {
  readonly stepId: string;
  readonly atSimulationSeconds: number;
  readonly command: CombatLabScriptCommandV1;
}

export interface CombatLabScenarioDefinitionV1 {
  readonly schemaVersion: 1;
  readonly scenarioId: CombatLabScenarioId;
  readonly revision: number;
  readonly titleRu: string;
  readonly descriptionRu: string;
  readonly category: string;
  readonly defaultSeed: number;
  readonly stateFactoryId: string;
  readonly defaultStopCondition: CombatLabStopConditionV1;
  readonly supportedMetrics: readonly CombatLabMetricId[];
  readonly visualPreset: CombatLabVisualPresetV1;
  readonly roles: readonly CombatLabRoleV1[];
  readonly controlDistances: readonly CombatLabControlDistanceV1[];
  readonly manualStepsRu: readonly string[];
  readonly defaultProgram: readonly CombatLabScriptStepV1[];
}

export interface CombatLabRunRequestV1 {
  readonly schemaVersion: 1;
  readonly scenarioId: string;
  readonly scenarioRevision: number;
  readonly seed: number;
  readonly maximumSimulationSeconds: number;
  readonly stopCondition: CombatLabStopConditionV1;
  readonly mode: 'headless' | 'visual';
}

export interface CombatLabRunResultV1 {
  readonly schemaVersion: 1;
  readonly scenarioId: string;
  readonly scenarioRevision: number;
  readonly seed: number;
  readonly completed: boolean;
  readonly stopReason: string;
  readonly simulatedSeconds: number;
  readonly metrics: Record<string, number>;
  readonly eventDigest: string;
  readonly finalStateDigest: string;
}

export interface CombatLabCommandResultV1 {
  readonly accepted: boolean;
  readonly reasonCode: string;
  readonly reasonRu: string;
  readonly ownerToken: string | null;
}

export interface CombatLabBuiltScenarioV1 {
  readonly definition: CombatLabScenarioDefinitionV1;
  readonly state: SimulationState;
  readonly roles: readonly CombatLabRoleV1[];
  readonly controlDistances: readonly CombatLabControlDistanceV1[];
  readonly seed: number;
}

export interface CombatLabProgramRuntimeV1 {
  readonly appliedStepIds: Set<string>;
  nextStepIndex: number;
  lastCommandResult: CombatLabCommandResultV1 | null;
}
