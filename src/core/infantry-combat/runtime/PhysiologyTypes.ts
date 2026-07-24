import type { PhysicalActionHandleV1, PhysicalActionOwner } from '../../actions/PhysicalActionCoordinatorTypes';
import type { HitZone } from '../../combat/UnitHitShapes';
import type { DefinitionRef } from '../catalogs/CombatCatalogTypes';
import type { UnitCombatCapabilitiesV1 } from './InfantryBodyTypes';

export const BLOOD_RUNTIME_SCHEMA_VERSION = 1 as const;
export const FATIGUE_RUNTIME_SCHEMA_VERSION = 1 as const;
export const UNIT_PHYSIOLOGY_RUNTIME_SCHEMA_VERSION = 1 as const;
export const UNIT_MEDICAL_RUNTIME_SCHEMA_VERSION = 1 as const;
export const APPLY_FIRST_AID_ACTION_SCHEMA_VERSION = 1 as const;
export const FIRST_AID_TERMINAL_RESULT_SCHEMA_VERSION = 1 as const;
export const MAX_APPLIED_FIRST_AID_ACTION_IDS = 64;

export type BloodState = 'stable' | 'weakened' | 'critical' | 'unconscious' | 'dead';

export interface BloodRuntimeV1 {
  readonly schemaVersion: typeof BLOOD_RUNTIME_SCHEMA_VERSION;
  bloodLoss: number;
  pendingBloodLoss: number;
  currentBleedingRatePerSecond: number;
  lastExposureSeconds: number;
  lastUpdateBoundarySeconds: number | null;
  nextUpdateBoundarySeconds: number;
  updateCount: number;
  state: BloodState;
  lastAppliedDelta: number;
  lastStateChangeSeconds: number | null;
}

export interface BloodCombatCapabilitiesV1 extends UnitCombatCapabilitiesV1 {}

export interface FatigueFactorSampleV1 {
  readonly movementIntensity: number;
  readonly postureMultiplier: number;
  readonly aimingActive: boolean;
  readonly firstAidActive: boolean;
  readonly heavyWeaponActive: boolean;
  readonly deployActive: boolean;
  readonly woundBurden: number;
  readonly woundGrowthMultiplier: number;
  readonly bloodGrowthMultiplier: number;
  readonly netRatePerSecond: number;
}

export interface FatigueRuntimeV1 {
  readonly schemaVersion: typeof FATIGUE_RUNTIME_SCHEMA_VERSION;
  fatigue: number;
  lastUpdateBoundarySeconds: number | null;
  nextUpdateBoundarySeconds: number;
  updateCount: number;
  sampledNetRatePerSecond: number;
  lastAppliedDelta: number;
  lastSample: FatigueFactorSampleV1;
  initialized: boolean;
}

export interface UnitPhysiologyRuntimeV1 {
  readonly schemaVersion: typeof UNIT_PHYSIOLOGY_RUNTIME_SCHEMA_VERSION;
  blood: BloodRuntimeV1;
  fatigue: FatigueRuntimeV1;
}

export const FIRST_AID_WORK_INTERVAL_SECONDS = 0.25;
export const FIRST_AID_REQUIRED_WORK_TICKS = 24;
export const FIRST_AID_ACTION_DURATION_SECONDS = 6;
export const FIRST_AID_MAX_DISTANCE_METRES = 1.5;
export const FIRST_AID_ACTION_TYPE = 'infantry_apply_first_aid' as const;

export interface ApplyFirstAidActionV1 {
  readonly schemaVersion: typeof APPLY_FIRST_AID_ACTION_SCHEMA_VERSION;
  readonly actionId: string;
  readonly sequence: number;
  actionHandle: PhysicalActionHandleV1 | null;
  readonly owner: PhysicalActionOwner;
  readonly ownerToken: string;
  readonly targetUnitId: string;
  readonly requestedZone: HitZone | null;
  readonly resolvedZone: HitZone;
  readonly startedSeconds: number;
  completedWorkTicks: number;
  phase: 'working';
  resultCode: string | null;
  resultRu: string | null;
}

export type FirstAidTerminalStatus = 'completed' | 'cancelled' | 'denied' | 'failed';

export interface FirstAidTerminalResultV1 {
  readonly schemaVersion: typeof FIRST_AID_TERMINAL_RESULT_SCHEMA_VERSION;
  readonly actionId: string;
  readonly status: FirstAidTerminalStatus;
  readonly actorUnitId: string;
  readonly targetUnitId: string;
  readonly zone: HitZone;
  readonly endedSeconds: number;
  readonly chargeSpent: boolean;
  readonly resultCode: string;
  readonly resultRu: string;
}

export interface UnitMedicalRuntimeV1 {
  readonly schemaVersion: typeof UNIT_MEDICAL_RUNTIME_SCHEMA_VERSION;
  loadoutRef: DefinitionRef | null;
  firstAidCharges: number;
  maximumFirstAidCharges: number;
  nextFirstAidSequence: number;
  activeFirstAidAction: ApplyFirstAidActionV1 | null;
  lastFirstAidResult: FirstAidTerminalResultV1 | null;
  appliedFirstAidActionIds: string[];
}
