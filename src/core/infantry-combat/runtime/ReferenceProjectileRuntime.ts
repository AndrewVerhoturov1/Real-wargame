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

/** Stage 5 compatibility boundary preserving optional direction diagnostics from V2 saves. */
export function normalizeReferenceProjectileRuntimeState(value: unknown): ProjectileRuntimeStateV2 {
  const normalized = normalizeProjectileRuntimeState(value);
  const rawRecords = readCommitRecords(value);
  if (rawRecords.size === 0) return normalized;
  normalized.committedShots = normalized.committedShots.map((record) => {
    const raw = rawRecords.get(record.shotId);
    return raw ? mergeStage5Fields(record, raw) : record;
  });
  return normalized;
}

/** Stage 3 compatibility name returning the canonical JSON-safe V2 snapshot. */
export function serializeReferenceProjectileRuntimeState(
  value: ProjectileRuntimeStateV2,
): ProjectileRuntimeSnapshotV2 {
  const serialized = serializeProjectileRuntimeState(value);
  const sourceRecords = new Map(value.committedShots.map((record) => [record.shotId, record]));
  return {
    ...serialized,
    committedShots: serialized.committedShots.map((record) => {
      const source = sourceRecords.get(record.shotId);
      return source
        ? mergeStage5Fields(record, source as unknown as Record<string, unknown>)
        : record;
    }),
  };
}

export { appendBoundedCommitRecord };
export type { ShotCommitRecordV1 };

function readCommitRecords(value: unknown): Map<string, Record<string, unknown>> {
  const output = new Map<string, Record<string, unknown>>();
  if (!isRecord(value) || !Array.isArray(value.committedShots)) return output;
  for (const candidate of value.committedShots) {
    if (!isRecord(candidate) || typeof candidate.shotId !== 'string' || !candidate.shotId.trim()) continue;
    output.set(candidate.shotId, candidate);
  }
  return output;
}

function mergeStage5Fields(record: ShotCommitRecordV1, raw: Record<string, unknown>): ShotCommitRecordV1 {
  const aim = direction(raw.aimDirectionBeforeDispersion);
  const final = direction(raw.finalProjectileDirection);
  return {
    ...record,
    ...(aim ? { aimDirectionBeforeDispersion: aim } : {}),
    ...(final ? { finalProjectileDirection: final } : {}),
    ...(finite(raw.dispersionPitchRadians) !== null ? { dispersionPitchRadians: finite(raw.dispersionPitchRadians)! } : {}),
    ...(finite(raw.dispersionYawRadians) !== null ? { dispersionYawRadians: finite(raw.dispersionYawRadians)! } : {}),
    ...(finite(raw.recoilPitchRadians) !== null ? { recoilPitchRadians: finite(raw.recoilPitchRadians)! } : {}),
    ...(finite(raw.recoilYawRadians) !== null ? { recoilYawRadians: finite(raw.recoilYawRadians)! } : {}),
    ...(finite(raw.predictedHitProbability) !== null ? { predictedHitProbability: clamp01(finite(raw.predictedHitProbability)!) } : {}),
    ...(finite(raw.effectiveDispersionRadians) !== null ? { effectiveDispersionRadians: Math.max(0, finite(raw.effectiveDispersionRadians)!) } : {}),
  };
}

function direction(value: unknown): { x: number; y: number; z: number } | null {
  if (!isRecord(value)) return null;
  const x = finite(value.x);
  const y = finite(value.y);
  const z = finite(value.z);
  if (x === null || y === null || z === null) return null;
  const magnitude = Math.hypot(x, y, z);
  if (magnitude <= 1e-9) return null;
  return { x: x / magnitude, y: y / magnitude, z: z / magnitude };
}

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
