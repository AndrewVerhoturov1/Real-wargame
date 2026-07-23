import type {
  ProjectileRuntimeSnapshotV2,
  ProjectileRuntimeStateV2,
  ShotCommitRecordV1,
} from './ProjectileRuntimeTypes';
import {
  appendBoundedCommitRecord,
  createProjectileRuntimeState,
  normalizeProjectileRuntimeState,
  serializeProjectileRuntimeState,
} from './ProjectileRuntime';

/** Stage 3 compatibility name backed by the Stage 4 pooled runtime. */
export function createReferenceProjectileRuntimeState(): ProjectileRuntimeStateV2 {
  return createProjectileRuntimeState();
}

/** Stage 3 compatibility name backed by the Stage 4 V1/V2 normalizer. */
export function normalizeReferenceProjectileRuntimeState(value: unknown): ProjectileRuntimeStateV2 {
  return normalizeProjectileRuntimeState(value);
}

/** Stage 3 compatibility name returning the canonical JSON-safe V2 snapshot. */
export function serializeReferenceProjectileRuntimeState(
  value: ProjectileRuntimeStateV2,
): ProjectileRuntimeSnapshotV2 {
  return serializeProjectileRuntimeState(value);
}

export { appendBoundedCommitRecord };
export type { ShotCommitRecordV1 };
