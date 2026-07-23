import type { AmmoDefinitionV1, DefinitionRef } from '../catalogs/CombatCatalogTypes';
import type { BallisticDirection3, BallisticPoint3, HitZone } from '../../combat/UnitHitShapes';

export const REFERENCE_PROJECTILE_RUNTIME_SCHEMA_VERSION = 1 as const;
export const PROJECTILE_RUNTIME_SCHEMA_VERSION = 2 as const;
export const PROJECTILE_STATE_SCHEMA_VERSION = 1 as const;
export const SHOT_COMMIT_RECORD_SCHEMA_VERSION = 1 as const;
export const PROJECTILE_IMPACT_SCHEMA_VERSION = 1 as const;
export const PROJECTILE_TERMINATION_SCHEMA_VERSION = 1 as const;

export const STAGE3_PROJECTILE_FIXED_STEP_SECONDS = 1 / 30;
export const PRODUCTION_PROJECTILE_CAPACITY = 4096;
/** @deprecated Stage 3 compatibility alias. */
export const MAX_STAGE3_ACTIVE_PROJECTILES = PRODUCTION_PROJECTILE_CAPACITY;
export const MAX_STAGE3_COMMIT_LEDGER_ENTRIES = 8192;
export const MAX_STAGE3_IMPACT_ENTRIES = 8192;
export const MAX_STAGE3_TERMINATION_ENTRIES = 8192;
export const MAX_STAGE3_APPLIED_IMPACT_IDS = 8192;
export const MAX_STAGE3_CATCH_UP_STEPS = 8;
export const STAGE3_GRAVITY_METRES_PER_SECOND_SQUARED = 9.81;
export const DEFAULT_PROJECTILE_EVENT_BUFFER_CAPACITY = PRODUCTION_PROJECTILE_CAPACITY;

export interface ProjectileStateV1 {
  readonly schemaVersion: typeof PROJECTILE_STATE_SCHEMA_VERSION;
  readonly projectileId: string;
  readonly shotId: string;
  readonly shooterId: string;
  readonly ammoSnapshot: AmmoDefinitionV1;
  position: BallisticPoint3;
  velocityMetresPerSecond: BallisticDirection3;
  ageSeconds: number;
  readonly maximumLifetimeSeconds: number;
  bodyPenetrationBudget: number;
  impactSequence: number;
}

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
  /** Absent only in migrated Stage 3-4 records. New Stage 5 commits always populate these fields. */
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
  readonly schemaVersion: typeof PROJECTILE_IMPACT_SCHEMA_VERSION;
  readonly impactId: string;
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
}

export type ProjectileTerminationReason = 'impact' | 'lifetime' | 'out_of_bounds' | 'reconciled_orphan';

export interface ProjectileTerminationV1 {
  readonly schemaVersion: typeof PROJECTILE_TERMINATION_SCHEMA_VERSION;
  readonly terminationId: string;
  readonly projectileId: string;
  readonly shotId: string;
  readonly reason: ProjectileTerminationReason;
  readonly simulationSeconds: number;
  readonly point: BallisticPoint3;
}

export interface ReferenceProjectileDiagnosticsV1 {
  fixedSubstepsExecuted: number;
  sweptTraceCount: number;
  unitCheckCount: number;
  objectCandidateCount: number;
  capRejectionCount: number;
  lastImpactId: string | null;
  lastTerminationId: string | null;
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
  diagnostics: ReferenceProjectileDiagnosticsV1;
}

export interface ProjectilePoolV2 {
  readonly capacity: number;
  activeCount: number;
  highWaterMark: number;
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
  readonly impactSequence: Uint32Array;
  readonly freeSlots: Int32Array;
  freeSlotCount: number;
}

export interface ProjectileSlotHandleV2 {
  readonly slot: number;
  readonly generation: number;
  readonly projectileId: string;
}

export type ProjectileSpawnStatus =
  | 'spawned'
  | 'capacity_exceeded'
  | 'duplicate_projectile_id'
  | 'invalid_candidate';

export interface ProjectileSpawnResult {
  readonly status: ProjectileSpawnStatus;
  readonly handle: ProjectileSlotHandleV2 | null;
}

export interface ProjectileRuntimeDiagnosticsV2 {
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
  /** Stage 3 compatibility projection. */
  unitCheckCount: number;
}

export interface SerializableProjectileDiagnosticsV2 extends ProjectileRuntimeDiagnosticsV2 {}

export interface ProjectileRuntimeSnapshotV2 {
  readonly schemaVersion: typeof PROJECTILE_RUNTIME_SCHEMA_VERSION;
  readonly fixedStepSeconds: typeof STAGE3_PROJECTILE_FIXED_STEP_SECONDS;
  readonly accumulatorSeconds: number;
  readonly capacity: number;
  readonly activeProjectiles: ProjectileStateV1[];
  readonly committedShots: ShotCommitRecordV1[];
  readonly impacts: ProjectileImpactV1[];
  readonly terminations: ProjectileTerminationV1[];
  readonly appliedImpactIds: string[];
  readonly diagnostics: SerializableProjectileDiagnosticsV2;
}

export interface ProjectileRuntimeStateV2 {
  readonly schemaVersion: typeof PROJECTILE_RUNTIME_SCHEMA_VERSION;
  readonly fixedStepSeconds: typeof STAGE3_PROJECTILE_FIXED_STEP_SECONDS;
  accumulatorSeconds: number;
  readonly pool: ProjectilePoolV2;
  committedShots: ShotCommitRecordV1[];
  impacts: ProjectileImpactV1[];
  terminations: ProjectileTerminationV1[];
  appliedImpactIds: string[];
  diagnostics: ProjectileRuntimeDiagnosticsV2;
  /** Compatibility accessor. The pool remains the authoritative hot state. */
  activeProjectiles: ProjectileStateV1[];
}

export type AnyProjectileRuntimeSnapshot = ReferenceProjectileRuntimeStateV1 | ProjectileRuntimeSnapshotV2;
