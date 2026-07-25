import { createBloodRuntime, normalizeBloodRuntime, serializeBloodRuntime } from './BloodLossRuntime';
import { createFatigueRuntime, normalizeFatigueRuntime, serializeFatigueRuntime } from './FatigueRuntime';
import {
  UNIT_PHYSIOLOGY_RUNTIME_SCHEMA_VERSION,
  type UnitPhysiologyRuntimeV1,
} from './PhysiologyTypes';

export function createUnitPhysiologyRuntime(startedSeconds = 0): UnitPhysiologyRuntimeV1 {
  return {
    schemaVersion: UNIT_PHYSIOLOGY_RUNTIME_SCHEMA_VERSION,
    blood: createBloodRuntime(startedSeconds),
    fatigue: createFatigueRuntime(startedSeconds),
  };
}

export function normalizeUnitPhysiologyRuntime(
  value: unknown,
  fallbackSeconds = 0,
): UnitPhysiologyRuntimeV1 {
  if (!isRecord(value) || value.schemaVersion !== UNIT_PHYSIOLOGY_RUNTIME_SCHEMA_VERSION) {
    return createUnitPhysiologyRuntime(fallbackSeconds);
  }
  return {
    schemaVersion: UNIT_PHYSIOLOGY_RUNTIME_SCHEMA_VERSION,
    blood: normalizeBloodRuntime(value.blood, fallbackSeconds),
    fatigue: normalizeFatigueRuntime(value.fatigue, fallbackSeconds),
  };
}

export function serializeUnitPhysiologyRuntime(value: UnitPhysiologyRuntimeV1): UnitPhysiologyRuntimeV1 {
  return {
    schemaVersion: UNIT_PHYSIOLOGY_RUNTIME_SCHEMA_VERSION,
    blood: serializeBloodRuntime(value.blood),
    fatigue: serializeFatigueRuntime(value.fatigue),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
