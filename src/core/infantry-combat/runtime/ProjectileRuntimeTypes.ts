import type { DefinitionRef } from '../catalogs/CombatCatalogTypes';
import type { BallisticDirection3, BallisticPoint3, HitZone } from '../../combat/UnitHitShapes';
import type { AmmoDefinitionV1 } from '../catalogs/CombatCatalogTypes';
import type { BodyImpactPhysicsV1 } from './InfantryBodyTypes';
import { MAX_BODY_PENETRATIONS_PER_PROJECTILE } from './BodyPenetration';

export const REFERENCE_PROJECTILE_RUNTIME_SCHEMA_VERSION = 1 as const;
export const PROJECTILE_RUNTIME_SCHEMA_VERSION = 3 as const;
export const PROJECTILE_STATE_SCHEMA_VERSION = 2 as const;
export const SHOT_COMMIT_RECORD_SCHEMA_VERSION = 1 as const;
export const PROJECTILE_IMPACT_SCHEMA_VERSION = 2 as const;
export const PROJECTILE_TERMINATION_SCHEMA_VERSION = 1 as const;
export const STAGE3_PROJECTILE_FIXED_STEP_SECONDS = 1 / 30;
export const STAGE3_GRAVITY_METRES_PER_SECOND_SQUARED = 9.81;
export const MAX_STAGE3_CATCH_UP_STEPS = 8;
export const PRODUCTION_PROJECTILE_CAPACITY = 4096;
export const DEFAULT_PROJECTILE_EVENT_BUFFER_CAPACITY = 4096;
export const MAX_STAGE6_IMPACT_BUFFER_ENTRIES = PRODUCTION_PROJECTILE_CAPACITY * MAX_BODY_PENETRATIONS_PER_PROJECTILE;
export const MAX_STAGE3_ACTIVE_PROJECTILES = PRODUCTION_PROJECTILE_CAPACITY;
export const MAX_STAGE3_COMMIT_LEDGER_ENTRIES = 4096;
export const MAX_STAGE3_IMPACT_ENTRIES = MAX_STAGE6_IMPACT_BUFFER_ENTRIES;
export const MAX_STAGE3_TERMINATION_ENTRIES = 4096;
export const MAX_STAGE3_APPLIED_IMPACT_IDS = MAX_STAGE6_IMPACT_BUFFER_ENTRIES;

export interface ProjectileStateV1 {
  readonly schemaVersion: 1 | typeof PROJECTILE_STATE_SCHEMA_VERSION;
  readonly projectileId: string;
  readonly shotId: string;
  readonly shooterId: string;
  readonly ammoSnapshot: AmmoDefinitionV1;
  position: BallisticPoint3;
  velocityMetresPerSecond: BallisticDirection3;
  ageSeconds: number;
  readonly maximumLifetimeSeconds: number;
  bodyPenetrationBudget: number;
  bodyPenetrationCount?: number;
  impactSequence: number;
  lastHitUnitId?: string | null;
}

export type ProjectileStateV2 = ProjectileStateV1;

export interface ShotCommitRecordV1 {
  readonly schemaVersion: typeof SHOT_COMMIT_RECORD_SCHEMA_VERSION;
  readonly shotId: string;
  readonly shooterId: string;
  readonly fireTaskId: string;
  readonly weaponInstanceId: string;
  readonly weaponDefinitionRef: DefinitionRef;
  readonly ammoDefinitionRef: DefinitionRef;
  readonly committedSimulationSeconds: number;
  readonly muzzlePosition: BallisticPoint3;
  readonly aimDirectionBeforeDispersion?: BallisticDirection3;
  readonly dispersionPitchRadians?: number;
  readonly dispersionYawRadians?: number;
  readonly recoilPitchRadians?: number;
  readonly recoilYawRadians?: number;
  readonly finalProjectileDirection?: BallisticDirection3;
  readonly initialVelocityMetresPerSecond: BallisticDirection3;
  readonly predictedHitProbability?: number;
  readonly effectiveDispersionRadians?: number;
  readonly roundsBefore: number;
  readonly roundsAfter: number;
}

export type ProjectileImpactType = 'terrain' | 'object' | 'unit';

export interface ProjectileImpactV1 {
  readonly schemaVersion: 1 | typeof PROJECTILE_IMPACT_SCHEMA_VERSION;
  readonly impactId: string;
  readonly impactSequence?: number;
  readonly projectileId: string;
  readonly shotId: string;
  readonly shooterId: string;
  readonly hitType: ProjectileImpactType;
  readonly impactSeconds: number;
  readonly projectileAgeSeconds: number;
  readonly point: BallisticPoint3;
  readonly hitObjectId: string | null;
  readonly hitUnitId: string | null;
  readonly hitZone: HitZone | null;
  readonly materialId: string | null;
  readonly normal: BallisticDirection3 | null;
  readonly velocityBeforeImpact: BallisticDirection3;
  readonly bodyPhysics?: BodyImpactPhysicsV1 | null;
}

export type ProjectileImpactV2 = ProjectileImpactV1;

export interface ProjectileTerminationV1 {
  readonly schemaVersion: typeof PROJECTILE_TERMINATION_SCHEMA_VERSION;
  readonly terminationId: string;
  readonly projectileId: string;
  readonly shotId: string;
  readonly reason: 'impact' | 'body_penetration_limit' | 'lifetime' | 'out_of_bounds' | 'reconciled_orphan';
  readonly simulationSeconds: number;
  readonly point: BallisticPoint3;
}

export interface ReferenceProjectileRuntimeStateV1 {
  readonly schemaVersion: typeof REFERENCE_PROJECTILE_RUNTIME_SCHEMA_VERSION;
  readonly fixedStepSeconds: typeof STAGE3_PROJECTILE_FIXED_STEP_SECONDS;
  accumulatorSeconds: number;
  activeProjectiles: ProjectileStateV1[];
  committedShots: ShotCommitRecordV1[];
  impacts: ProjectileImpactV1[];
  terminations: ProjectileTerminationV1[];
  appliedImpactIds: string[];
  diagnostics: {
    fixedSubstepsExecuted: number;
    sweptTraceCount: number;
    unitCheckCount: number;
    objectCandidateCount: number;
    capRejectionCount: number;
    lastImpactId: string | null;
    lastTerminationId: string | null;
  };
}

export interface ProjectilePoolV3 {
  readonly capacity: number;
  readonly active: Uint8Array;
  readonly generation: Uint32Array;
  readonly projectileIds: Array<string | null>;
  readonly shotIds: Array<string | null>;
  readonly shooterIds: Array<string | null>;
  readonly ammoSnapshots: Array<AmmoDefinitionV1 | null>;
  readonly positionX: Float64Array;
  readonly positionY: Float64Array;
  readonly positionZ: Float64Array;
  readonly velocityX: Float64Array;
  readonly velocityY: Float64Array;
  readonly velocityZ: Float64Array;
  readonly ageSeconds: Float64Array;
  readonly maximumLifetimeSeconds: Float64Array;
  readonly bodyPenetrationBudget: Float64Array;
  readonly bodyPenetrationCount: Uint8Array;
  readonly impactSequence: Uint32Array;
  readonly lastHitUnitIds: Array<string | null>;
  readonly freeSlots: Uint32Array;
  activeCount: number;
  freeSlotCount: number;
  highWaterMark: number;
}

export type ProjectilePoolV2 = ProjectilePoolV3;

export interface ProjectileRuntimeDiagnosticsV3 {
  capacity: number;
  activeCount: number;
  freeCount: number;
  highWaterMark: number;
  spawnCount: number;
  releaseCount: number;
  capRejectionCount: number;
  duplicateSpawnCount: number;
  invalidSpawnCount: number;
  fixedSubstepsExecuted: number;
  catchUpLimitedCount: number;
  accumulatorSeconds: number;
  sweptTraceCount: number;
  unitBroadPhaseQueryCount: number;
  unitCandidateCount: number;
  unitNarrowCheckCount: number;
  objectBroadPhaseQueryCount: number;
  objectCandidateCount: number;
  terrainSampleCount: number;
  impactBufferCapacity: number;
  impactBufferHighWaterMark: number;
  terminationBufferCapacity: number;
  terminationBufferHighWaterMark: number;
  eventOverflowCount: number;
  poolAllocationCount: number;
  poolResizeCount: number;
  scratchAllocationCount: number;
  fullScanFallbackCount: number;
  commitLedgerHighWaterMark: number;
  impactLedgerHighWaterMark: number;
  terminationLedgerHighWaterMark: number;
  appliedImpactLedgerHighWaterMark: number;
  lastImpactId: string | null;
  lastTerminationId: string | null;
  unitCheckCount: number;
  bodyImpactCount: number;
  bodyPenetrationCount: number;
  penetratedBodyImpactCount: number;
  bodyStopCount: number;
  penetrationLimitCount: number;
  woundAppliedCount: number;
  woundDuplicateCount: number;
  woundTargetMissingCount: number;
  maximumImpactsInSingleSubstep: number;
  lastBodyImpactId: string | null;
  lastBodyBudgetBefore: number;
  lastBodyBudgetAfter: number;
  lastBodyResistance: number;
  lastBodySpeedBefore: number;
  lastBodySpeedAfter: number;
}

export type ProjectileRuntimeDiagnosticsV2 = ProjectileRuntimeDiagnosticsV3;

export interface ProjectileRuntimeStateV3 {
  readonly schemaVersion: typeof PROJECTILE_RUNTIME_SCHEMA_VERSION;
  readonly fixedStepSeconds: typeof STAGE3_PROJECTILE_FIXED_STEP_SECONDS;
  accumulatorSeconds: number;
  pool: ProjectilePoolV3;
  committedShots: ShotCommitRecordV1[];
  impacts: ProjectileImpactV1[];
  terminations: ProjectileTerminationV1[];
  appliedImpactIds: string[];
  diagnostics: ProjectileRuntimeDiagnosticsV3;
  activeProjectiles: ProjectileStateV1[];
}

export type ProjectileRuntimeStateV2 = ProjectileRuntimeStateV3;

export interface ProjectileRuntimeSnapshotV3 {
  readonly schemaVersion: typeof PROJECTILE_RUNTIME_SCHEMA_VERSION;
  readonly fixedStepSeconds: typeof STAGE3_PROJECTILE_FIXED_STEP_SECONDS;
  readonly accumulatorSeconds: number;
  readonly capacity: number;
  readonly activeProjectiles: ProjectileStateV1[];
  readonly committedShots: ShotCommitRecordV1[];
  readonly impacts: ProjectileImpactV1[];
  readonly terminations: ProjectileTerminationV1[];
  readonly appliedImpactIds: string[];
  readonly diagnostics: ProjectileRuntimeDiagnosticsV3;
}

export type ProjectileRuntimeSnapshotV2 = ProjectileRuntimeSnapshotV3;

export interface LegacyProjectileRuntimeSnapshotV2 {
  readonly schemaVersion: 2;
  readonly fixedStepSeconds: number;
  readonly accumulatorSeconds: number;
  readonly capacity: number;
  readonly activeProjectiles: unknown[];
  readonly committedShots: unknown[];
  readonly impacts: unknown[];
  readonly terminations: unknown[];
  readonly appliedImpactIds: unknown[];
  readonly diagnostics: Record<string, unknown>;
}

export interface ProjectilePoolHandleV2 {
  readonly slot: number;
  readonly generation: number;
  readonly projectileId: string;
}

export type ProjectileSpawnStatusV2 =
  | 'spawned'
  | 'capacity_exceeded'
  | 'duplicate_projectile_id'
  | 'invalid_candidate';

export interface ProjectileSpawnResultV2 {
  readonly status: ProjectileSpawnStatusV2;
  readonly handle: ProjectilePoolHandleV2 | null;
}
