import { normalizeUnits, type UnitData, type UnitModel } from '../../../units/UnitModel';
import type { CombatLabExperimentRoleV1, CombatLabExperimentV1 } from './CombatLabExperimentContracts';
import type { CombatLabParticipantReadObserverV1 } from './CombatLabParticipantSceneTypes';
import { CombatLabParticipantSceneError } from './CombatLabParticipantSceneTypes';
import { requireRole, requireSceneUnitRecord } from './CombatLabParticipantSceneSupportUtilities';

const DEFAULT_RUNTIME_METRES_PER_CELL = 2;

export interface NormalizedCombatLabParticipantSceneUnitV1 {
  readonly role: CombatLabExperimentRoleV1;
  readonly sourceRecord: Record<string, unknown>;
  readonly unit: UnitModel;
  readonly sourceToRuntimeCellScale: number;
}

export function normalizeCombatLabParticipantSceneUnit(
  experiment: CombatLabExperimentV1,
  roleId: string,
  observer: CombatLabParticipantReadObserverV1 = {},
): NormalizedCombatLabParticipantSceneUnitV1 {
  const role = requireRole(experiment, roleId);
  const sourceRecord = requireSceneUnitRecord(experiment, role.unitId, roleId);
  return normalizeCombatLabParticipantSceneUnitRecord(experiment, role, sourceRecord, observer);
}

export function normalizeCombatLabParticipantSceneUnitRecord(
  experiment: CombatLabExperimentV1,
  role: CombatLabExperimentRoleV1,
  sourceRecord: Record<string, unknown>,
  observer: CombatLabParticipantReadObserverV1 = {},
): NormalizedCombatLabParticipantSceneUnitV1 {
  observer.onUnitRecordRead?.(role.unitId);
  const sourceToRuntimeCellScale = resolveSourceToRuntimeCellScale(experiment);
  const [unit] = normalizeUnits([structuredClone(sourceRecord) as unknown as UnitData], sourceToRuntimeCellScale);
  if (!unit) {
    throw new CombatLabParticipantSceneError('combat_lab_participant_unit_invalid', `Боец «${role.unitId}» участника «${role.roleId}» не может быть нормализован.`);
  }
  observer.onUnitNormalized?.(role.unitId);
  return Object.freeze({ role, sourceRecord, unit, sourceToRuntimeCellScale });
}

export function resolveSourceToRuntimeCellScale(experiment: CombatLabExperimentV1): number {
  const map = experiment.sceneSnapshot.map as typeof experiment.sceneSnapshot.map & { runtimeMetersPerCell?: number };
  const sourceMetresPerCell = normalizeMetresPerCell(map.metersPerCell, 10);
  const requestedRuntimeMetresPerCell = normalizeMetresPerCell(map.runtimeMetersPerCell, Math.min(sourceMetresPerCell, DEFAULT_RUNTIME_METRES_PER_CELL));
  return sourceMetresPerCell / Math.min(sourceMetresPerCell, requestedRuntimeMetresPerCell);
}

function normalizeMetresPerCell(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value) || (value as number) <= 0) return fallback;
  return Math.max(0.25, Math.min(100, value as number));
}
