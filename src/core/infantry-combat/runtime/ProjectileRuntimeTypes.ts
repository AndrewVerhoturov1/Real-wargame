import type { AmmoDefinitionV1, DefinitionRef } from '../catalogs/CombatCatalogTypes';
import type { BallisticDirection3, BallisticPoint3, HitZone } from '../../combat/UnitHitShapes';

export const REFERENCE_PROJECTILE_RUNTIME_SCHEMA_VERSION = 1 as const;
export const PROJECTILE_STATE_SCHEMA_VERSION = 1 as const;
export const SHOT_COMMIT_RECORD_SCHEMA_VERSION = 1 as const;
export const PROJECTILE_IMPACT_SCHEMA_VERSION = 1 as const;
export const PROJECTILE_TERMINATION_SCHEMA_VERSION = 1 as const;

export const STAGE3_PROJECTILE_FIXED_STEP_SECONDS = 1 / 30;
export const MAX_STAGE3_ACTIVE_PROJECTILES = 16;
export const MAX_STAGE3_COMMIT_LEDGER_ENTRIES = 64;
export const MAX_STAGE3_IMPACT_ENTRIES = 64;
export const MAX_STAGE3_TERMINATION_ENTRIES = 64;
export const MAX_STAGE3_APPLIED_IMPACT_IDS = 64;
export const MAX_STAGE3_CATCH_UP_STEPS = 8;
export const STAGE3_GRAVITY_METRES_PER_SECOND_SQUARED = 9.81;

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
  readonly initialVelocityMetresPerSecond: BallisticDirection3;
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
  readonly impactType: ProjectileImpactType;
  readonly simulationSeconds: number;
  readonly point: BallisticPoint3;
  readonly hitObjectId: string | null;
  readonly hitUnitId: string | null;
  readonly hitZone: HitZone | null;
  readonly materialId: string | null;
  readonly normal: BallisticDirection3 | null;
}

export type ProjectileTerminationReason = 'impact' | 'lifetime' | 'out_of_bounds';

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
