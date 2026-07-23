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
  };
}

function integer(value: unknown, fallback: number, minimum: number, maximum: number): number {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : fallback;
  return Math.max(minimum, Math.min(maximum, numeric));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
