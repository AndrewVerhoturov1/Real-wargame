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

export function createInfantryCombatUnitRuntime(): InfantryCombatUnitRuntimeV1 {
  return {
    schemaVersion: INFANTRY_COMBAT_UNIT_RUNTIME_SCHEMA_VERSION,
    nextFireTaskSequence: 1,
    primaryWeapon: null,
    activeFireTask: null,
    lastFireResult: null,
    lastShotCommit: null,
  };
}

export function normalizeInfantryCombatUnitRuntime(value: unknown): InfantryCombatUnitRuntimeV1 {
  if (!isRecord(value) || value.schemaVersion !== INFANTRY_COMBAT_UNIT_RUNTIME_SCHEMA_VERSION) {
    return createInfantryCombatUnitRuntime();
  }
  return {
    schemaVersion: INFANTRY_COMBAT_UNIT_RUNTIME_SCHEMA_VERSION,
    nextFireTaskSequence: integer(value.nextFireTaskSequence, 1, 1, Number.MAX_SAFE_INTEGER),
    primaryWeapon: normalizeInfantryWeaponInstance(value.primaryWeapon),
    activeFireTask: normalizeFireTaskRuntime(value.activeFireTask),
    lastFireResult: normalizeFireTaskTerminalResult(value.lastFireResult),
    lastShotCommit: normalizeShotCommitDiagnostic(value.lastShotCommit),
  };
}

export function serializeInfantryCombatUnitRuntime(
  value: InfantryCombatUnitRuntimeV1,
): InfantryCombatUnitRuntimeV1 {
  return {
    schemaVersion: INFANTRY_COMBAT_UNIT_RUNTIME_SCHEMA_VERSION,
    nextFireTaskSequence: integer(value.nextFireTaskSequence, 1, 1, Number.MAX_SAFE_INTEGER),
    primaryWeapon: value.primaryWeapon ? serializeInfantryWeaponInstance(value.primaryWeapon) : null,
    activeFireTask: value.activeFireTask ? serializeFireTaskRuntime(value.activeFireTask) : null,
    lastFireResult: value.lastFireResult ? structuredClone(value.lastFireResult) : null,
    lastShotCommit: value.lastShotCommit ? structuredClone(value.lastShotCommit) : null,
  };
}

function integer(value: unknown, fallback: number, minimum: number, maximum: number): number {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : fallback;
  return Math.max(minimum, Math.min(maximum, numeric));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}


function normalizeShotCommitDiagnostic(value: unknown): import('./InfantryCombatRuntimeTypes').ShotCommitDiagnosticV1 | null {
  if (!isRecord(value)) return null;
  const allowed = new Set([
    'committed', 'already_committed', 'task_not_firing', 'ownership_lost', 'weapon_missing',
    'unsupported_mode', 'empty_weapon', 'muzzle_blocked', 'friendly_risk_exceeded',
    'projectile_capacity_exceeded', 'invalid_target',
  ]);
  if (typeof value.status !== 'string' || !allowed.has(value.status)) return null;
  const point = isRecord(value.muzzlePosition)
    && typeof value.muzzlePosition.xMetres === 'number' && Number.isFinite(value.muzzlePosition.xMetres)
    && typeof value.muzzlePosition.yMetres === 'number' && Number.isFinite(value.muzzlePosition.yMetres)
    && typeof value.muzzlePosition.zMetres === 'number' && Number.isFinite(value.muzzlePosition.zMetres)
    ? { xMetres: value.muzzlePosition.xMetres, yMetres: value.muzzlePosition.yMetres, zMetres: value.muzzlePosition.zMetres }
    : null;
  const nullableInteger = (candidate: unknown): number | null => typeof candidate === 'number' && Number.isFinite(candidate) ? Math.max(0, Math.round(candidate)) : null;
  const nullableText = (candidate: unknown): string | null => typeof candidate === 'string' && candidate.trim() ? candidate.trim() : null;
  return {
    status: value.status as import('./InfantryCombatRuntimeTypes').ShotCommitStatus,
    muzzlePosition: point,
    muzzleBlocked: value.muzzleBlocked === true,
    friendlyRisk: typeof value.friendlyRisk === 'number' && Number.isFinite(value.friendlyRisk) ? Math.max(0, Math.min(1, value.friendlyRisk)) : 0,
    roundsBefore: nullableInteger(value.roundsBefore),
    roundsAfter: nullableInteger(value.roundsAfter),
    shotId: nullableText(value.shotId),
    projectileId: nullableText(value.projectileId),
  };
}
