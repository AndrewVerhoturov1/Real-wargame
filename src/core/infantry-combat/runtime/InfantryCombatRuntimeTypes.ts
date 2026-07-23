import type { PhysicalActionHandleV1, PhysicalActionOwner } from '../../actions/PhysicalActionCoordinatorTypes';
import type { BallisticDirection3, BallisticPoint3 } from '../../combat/UnitHitShapes';
import type { UnitPosture } from '../../behavior/BehaviorModel';
import type {
  AmmoDefinitionV1,
  DefinitionRef,
  WeaponClass,
  WeaponDefinitionV1,
  WeaponProficiency,
} from '../catalogs/CombatCatalogTypes';

export const INFANTRY_COMBAT_UNIT_RUNTIME_SCHEMA_VERSION = 1 as const;
export const INFANTRY_WEAPON_INSTANCE_SCHEMA_VERSION = 1 as const;
export const FIRE_TASK_RUNTIME_SCHEMA_VERSION = 1 as const;
export const AIM_TRACKING_RUNTIME_SCHEMA_VERSION = 1 as const;
export const AIM_SOLUTION_RUNTIME_SCHEMA_VERSION = 1 as const;
export const AIM_FACTOR_BREAKDOWN_SCHEMA_VERSION = 1 as const;
export const WEAPON_OPERATOR_PROFILE_SCHEMA_VERSION = 1 as const;
export const WEAPON_RECOIL_RUNTIME_SCHEMA_VERSION = 1 as const;

export interface ResolvedWeaponSnapshotV1 {
  readonly weaponDefinitionRef: DefinitionRef;
  readonly ammoDefinitionRef: DefinitionRef;
  readonly weapon: WeaponDefinitionV1;
  readonly ammo: AmmoDefinitionV1;
}

export interface WeaponOperatorProfileV1 {
  readonly schemaVersion: typeof WEAPON_OPERATOR_PROFILE_SCHEMA_VERSION;
  readonly shootingSkill: number;
  readonly proficiencyByWeaponClass: Readonly<Record<WeaponClass, WeaponProficiency>>;
}

export interface WeaponRecoilRuntimeV1 {
  readonly schemaVersion: typeof WEAPON_RECOIL_RUNTIME_SCHEMA_VERSION;
  pitchOffsetRadians: number;
  yawOffsetRadians: number;
  lastUpdatedSeconds: number;
  sequence: number;
}

export interface InfantryWeaponInstanceV1 {
  readonly schemaVersion: typeof INFANTRY_WEAPON_INSTANCE_SCHEMA_VERSION;
  readonly weaponInstanceId: string;
  readonly slot: 'primary';
  readonly resolved: ResolvedWeaponSnapshotV1;
  readonly operatorProfile: WeaponOperatorProfileV1;
  recoil: WeaponRecoilRuntimeV1;
  roundsInWeapon: number;
  shotSequence: number;
  lastCommittedShotId: string | null;
}

export type AimInvalidReason =
  | 'not_tracked_yet'
  | 'contact_missing'
  | 'invalid_perceived_position'
  | 'invalid_muzzle_velocity'
  | 'invalid_geometry';

export interface AimPerceptionSampleV1 {
  readonly position: BallisticPoint3;
  readonly observedSeconds: number;
  readonly sourceUpdatedSeconds: number;
}

export interface AimFactorBreakdownV1 {
  readonly schemaVersion: typeof AIM_FACTOR_BREAKDOWN_SCHEMA_VERSION;
  readonly posture: UnitPosture;
  readonly isMoving: boolean;
  readonly movementSpeedMetresPerSecond: number;
  readonly shootingSkill: number;
  readonly proficiency: WeaponProficiency;
  readonly fatigue: number;
  readonly woundStabilityMultiplier: number;
  readonly postureDispersionMultiplier: number;
  readonly movementDispersionMultiplier: number;
  readonly skillDispersionMultiplier: number;
  readonly proficiencyDispersionMultiplier: number;
  readonly fatigueDispersionMultiplier: number;
  readonly woundDispersionMultiplier: number;
  readonly aimRateMultiplier: number;
  readonly recoilRecoveryMultiplier: number;
  readonly recoilImpulseMultiplier: number;
  readonly effectiveDispersionRadians: number;
  readonly aimQualityPerSecond: number;
}

export interface AimSolutionRuntimeV1 {
  readonly schemaVersion: typeof AIM_SOLUTION_RUNTIME_SCHEMA_VERSION;
  valid: boolean;
  invalidReason: AimInvalidReason | null;
  perceivedPosition: BallisticPoint3 | null;
  previousPerceivedPosition: BallisticPoint3 | null;
  perceivedSampleSeconds: number | null;
  previousPerceivedSampleSeconds: number | null;
  estimatedVelocityMetresPerSecond: BallisticDirection3;
  contactAgeSeconds: number;
  uncertaintyCells: number;
  predictedAimPoint: BallisticPoint3 | null;
  desiredDirection: BallisticDirection3;
  currentDirection: BallisticDirection3;
  directionSegmentStart: BallisticDirection3;
  directionProgress: number;
  physicalAimQuality: number;
  solutionQuality: number;
  usableAimQuality: number;
  predictedHitProbability: number;
  effectiveDispersionRadians: number;
  factors: AimFactorBreakdownV1;
}

export interface AimTrackingRuntimeV1 {
  readonly schemaVersion: typeof AIM_TRACKING_RUNTIME_SCHEMA_VERSION;
  readonly trackingIntervalSeconds: number;
  lastTrackingBoundarySeconds: number | null;
  nextTrackingBoundarySeconds: number;
  trackingUpdateCount: number;
  previousSample: AimPerceptionSampleV1 | null;
  lastSample: AimPerceptionSampleV1 | null;
  solution: AimSolutionRuntimeV1;
}

export type FireTaskPhase =
  | 'accepted'
  | 'weapon_ready'
  | 'aiming'
  | 'firing'
  | 'recovery'
  | 'completed'
  | 'cancelled'
  | 'denied'
  | 'failed';

export interface FireTaskTerminalResultV1 {
  readonly taskId: string;
  readonly phase: Extract<FireTaskPhase, 'completed' | 'cancelled' | 'denied' | 'failed'>;
  readonly resultCode: string;
  readonly resultRu: string;
  readonly endedSeconds: number;
  readonly committedShotId: string | null;
}

export interface FireTaskRuntimeV1 {
  readonly schemaVersion: typeof FIRE_TASK_RUNTIME_SCHEMA_VERSION;
  readonly taskId: string;
  readonly sequence: number;
  actionHandle: PhysicalActionHandleV1 | null;
  readonly owner: PhysicalActionOwner;
  readonly ownerToken: string;
  readonly target: BallisticPoint3;
  readonly targetRadiusMetres: 0;
  readonly contactId: string | null;
  readonly sourceUnitId: string | null;
  readonly mode: 'single';
  phase: FireTaskPhase;
  readonly requestedSeconds: number;
  phaseStartedSeconds: number;
  readyRemainingSeconds: number;
  aimQuality: number;
  aimTracking: AimTrackingRuntimeV1;
  readonly minimumSolutionQuality: number;
  readonly maximumFriendlyFireRisk: number;
  recoveryRemainingSeconds: number;
  committedShotId: string | null;
  resultCode: string | null;
  resultRu: string | null;
}

export type ShotCommitStatus =
  | 'committed'
  | 'already_committed'
  | 'task_not_firing'
  | 'ownership_lost'
  | 'weapon_missing'
  | 'unsupported_mode'
  | 'empty_weapon'
  | 'aim_solution_invalid'
  | 'aim_solution_below_threshold'
  | 'movement_forbidden'
  | 'muzzle_blocked'
  | 'friendly_risk_exceeded'
  | 'projectile_capacity_exceeded'
  | 'duplicate_projectile_id'
  | 'invalid_projectile_candidate'
  | 'invalid_target';

export interface ShotCommitDiagnosticV1 {
  readonly status: ShotCommitStatus;
  readonly reasonRu: string;
  readonly muzzlePosition: BallisticPoint3 | null;
  readonly muzzleBlocked: boolean;
  readonly friendlyRisk: number;
  readonly roundsBefore: number | null;
  readonly roundsAfter: number | null;
  readonly shotId: string | null;
  readonly projectileId: string | null;
  readonly aimDirectionBeforeDispersion: BallisticDirection3 | null;
  readonly dispersionPitchRadians: number;
  readonly dispersionYawRadians: number;
  readonly recoilPitchRadians: number;
  readonly recoilYawRadians: number;
  readonly finalProjectileDirection: BallisticDirection3 | null;
}

export interface InfantryCombatUnitRuntimeV1 {
  readonly schemaVersion: typeof INFANTRY_COMBAT_UNIT_RUNTIME_SCHEMA_VERSION;
  nextFireTaskSequence: number;
  primaryWeapon: InfantryWeaponInstanceV1 | null;
  activeFireTask: FireTaskRuntimeV1 | null;
  lastFireResult: FireTaskTerminalResultV1 | null;
  lastShotCommit: ShotCommitDiagnosticV1 | null;
}
