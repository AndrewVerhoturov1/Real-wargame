import {
  INFANTRY_COMBAT_UNIT_RUNTIME_SCHEMA_VERSION,
  type InfantryCombatUnitRuntimeV1,
} from './InfantryCombatRuntimeTypes';
import { normalizeInfantryWeaponInstance, serializeInfantryWeaponInstance } from './InfantryWeaponInstance';
import {
  normalizeFireTaskRuntime,
  normalizeFireTaskTerminalResult,
  serializeFireTaskRuntime,
} from './FireTaskRuntime';
import { createUnitWoundRuntime, normalizeUnitWoundRuntime, serializeUnitWoundRuntime } from './WoundRuntime';

const DIRECTION_MAGNITUDE_EPSILON = 1e-9;
const UNIT_DIRECTION_MAGNITUDE_TOLERANCE = 1e-12;

export function createInfantryCombatUnitRuntime(): InfantryCombatUnitRuntimeV1 {
  return {
    schemaVersion: INFANTRY_COMBAT_UNIT_RUNTIME_SCHEMA_VERSION,
    nextFireTaskSequence: 1,
    primaryWeapon: null,
    activeFireTask: null,
    lastFireResult: null,
    lastShotCommit: null,
    wounds: createUnitWoundRuntime(),
  };
}

export function normalizeInfantryCombatUnitRuntime(value: unknown): InfantryCombatUnitRuntimeV1 {
  if (!isRecord(value) || value.schemaVersion !== INFANTRY_COMBAT_UNIT_RUNTIME_SCHEMA_VERSION) return createInfantryCombatUnitRuntime();
  return {
    schemaVersion: INFANTRY_COMBAT_UNIT_RUNTIME_SCHEMA_VERSION,
    nextFireTaskSequence: integer(value.nextFireTaskSequence, 1, 1, Number.MAX_SAFE_INTEGER),
    primaryWeapon: normalizeInfantryWeaponInstance(value.primaryWeapon),
    activeFireTask: normalizeFireTaskRuntime(value.activeFireTask),
    lastFireResult: normalizeFireTaskTerminalResult(value.lastFireResult),
    lastShotCommit: normalizeShotCommitDiagnostic(value.lastShotCommit),
    wounds: normalizeUnitWoundRuntime(value.wounds),
  };
}

export function serializeInfantryCombatUnitRuntime(value: InfantryCombatUnitRuntimeV1): InfantryCombatUnitRuntimeV1 {
  return {
    schemaVersion: INFANTRY_COMBAT_UNIT_RUNTIME_SCHEMA_VERSION,
    nextFireTaskSequence: integer(value.nextFireTaskSequence, 1, 1, Number.MAX_SAFE_INTEGER),
    primaryWeapon: value.primaryWeapon ? serializeInfantryWeaponInstance(value.primaryWeapon) : null,
    activeFireTask: value.activeFireTask ? serializeFireTaskRuntime(value.activeFireTask) : null,
    lastFireResult: value.lastFireResult ? structuredClone(value.lastFireResult) : null,
    lastShotCommit: value.lastShotCommit ? structuredClone(value.lastShotCommit) : null,
    wounds: serializeUnitWoundRuntime(value.wounds ?? createUnitWoundRuntime()),
  };
}

function normalizeShotCommitDiagnostic(value: unknown): import('./InfantryCombatRuntimeTypes').ShotCommitDiagnosticV1 | null {
  if (!isRecord(value)) return null;
  const allowed = new Set([
    'committed', 'already_committed', 'task_not_firing', 'ownership_lost', 'weapon_missing',
    'weapon_capability_lost', 'unsupported_mode', 'empty_weapon', 'aim_solution_invalid', 'aim_solution_below_threshold',
    'movement_forbidden', 'muzzle_blocked', 'friendly_risk_exceeded', 'projectile_capacity_exceeded',
    'duplicate_projectile_id', 'invalid_projectile_candidate', 'invalid_target',
  ]);
  if (typeof value.status !== 'string' || !allowed.has(value.status)) return null;
  return {
    status: value.status as import('./InfantryCombatRuntimeTypes').ShotCommitStatus,
    reasonRu: typeof value.reasonRu === 'string' ? value.reasonRu : '',
    muzzlePosition: normalizePoint(value.muzzlePosition),
    muzzleBlocked: value.muzzleBlocked === true,
    friendlyRisk: clamp01(value.friendlyRisk),
    roundsBefore: nullableInteger(value.roundsBefore),
    roundsAfter: nullableInteger(value.roundsAfter),
    shotId: nullableText(value.shotId),
    projectileId: nullableText(value.projectileId),
    aimDirectionBeforeDispersion: normalizeDirection(value.aimDirectionBeforeDispersion),
    dispersionPitchRadians: finite(value.dispersionPitchRadians, 0),
    dispersionYawRadians: finite(value.dispersionYawRadians, 0),
    recoilPitchRadians: finite(value.recoilPitchRadians, 0),
    recoilYawRadians: finite(value.recoilYawRadians, 0),
    finalProjectileDirection: normalizeDirection(value.finalProjectileDirection),
  };
}

function normalizePoint(value: unknown): { xMetres: number; yMetres: number; zMetres: number } | null {
  if (!isRecord(value)) return null;
  const x = finiteOrNull(value.xMetres); const y = finiteOrNull(value.yMetres); const z = finiteOrNull(value.zMetres);
  return x === null || y === null || z === null ? null : { xMetres: x, yMetres: y, zMetres: z };
}
function normalizeDirection(value: unknown): { x: number; y: number; z: number } | null {
  if (!isRecord(value)) return null;
  const x = finiteOrNull(value.x); const y = finiteOrNull(value.y); const z = finiteOrNull(value.z);
  if (x === null || y === null || z === null) return null;
  const magnitude = Math.hypot(x, y, z);
  if (magnitude <= DIRECTION_MAGNITUDE_EPSILON) return null;
  if (Math.abs(magnitude - 1) <= UNIT_DIRECTION_MAGNITUDE_TOLERANCE) return { x, y, z };
  return { x: x / magnitude, y: y / magnitude, z: z / magnitude };
}
function nullableInteger(value: unknown): number | null { return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.round(value)) : null; }
function nullableText(value: unknown): string | null { return typeof value === 'string' && value.trim() ? value.trim() : null; }
function clamp01(value: unknown): number { return Math.max(0, Math.min(1, finite(value, 0))); }
function finite(value: unknown, fallback: number): number { return typeof value === 'number' && Number.isFinite(value) ? value : fallback; }
function finiteOrNull(value: unknown): number | null { return typeof value === 'number' && Number.isFinite(value) ? value : null; }
function integer(value: unknown, fallback: number, minimum: number, maximum: number): number { const numeric = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : fallback; return Math.max(minimum, Math.min(maximum, numeric)); }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
