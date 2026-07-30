import type { UnitHeldItem, UnitType } from '../../../units/UnitModel';
import type {
  CombatLabExperimentRoleV1,
  CombatLabExperimentV1,
  CombatLabParticipantParametersV1,
} from './CombatLabExperimentContracts';
import { CombatLabParticipantSceneError } from './CombatLabParticipantSceneTypes';
import { assertFinite, deepFreeze, isRecord } from './CombatLabParticipantSceneSupportValues';

export function requireRole(experiment: CombatLabExperimentV1, roleId: string): CombatLabExperimentRoleV1 {
  const role = experiment.roles.find((candidate) => candidate.roleId === roleId);
  if (!role) throw new CombatLabParticipantSceneError('combat_lab_participant_missing', `Участник «${roleId}» не найден.`);
  return role;
}

export function requireSceneUnitRecord(experiment: CombatLabExperimentV1, unitId: string, roleId: string): Record<string, unknown> {
  const unit = experiment.sceneSnapshot.units.find((candidate) => isRecord(candidate) && candidate.id === unitId);
  if (!unit) throw new CombatLabParticipantSceneError('combat_lab_participant_unit_missing', `Боец «${unitId}» участника «${roleId}» отсутствует в начальной сцене.`);
  return unit;
}

export function assertSnapshotCoordinates(experiment: CombatLabExperimentV1, x: number, y: number): void {
  assertFinite(x, 'Координата X должна быть конечным числом.');
  assertFinite(y, 'Координата Y должна быть конечным числом.');
  if (x < 0 || y < 0 || x >= experiment.sceneSnapshot.map.width || y >= experiment.sceneSnapshot.map.height) {
    throw new CombatLabParticipantSceneError('combat_lab_participant_position_out_of_bounds', 'Положение бойца находится за пределами карты.');
  }
}

export function sceneUnitIdSet(experiment: CombatLabExperimentV1): Set<string> {
  return new Set(experiment.sceneSnapshot.units.flatMap((candidate) => isRecord(candidate) && typeof candidate.id === 'string' ? [candidate.id] : []));
}

export function normalizeParameters(value: CombatLabParticipantParametersV1 | undefined): CombatLabParticipantParametersV1 {
  const accuracy = value?.schemaVersion === 1 && value.accuracy ? deepFreeze(structuredClone(value.accuracy)) : null;
  return Object.freeze({ schemaVersion: 1, accuracy });
}

export function freezeRole(role: CombatLabExperimentRoleV1): CombatLabExperimentRoleV1 {
  return Object.freeze({ ...role, parameters: normalizeParameters(role.parameters) });
}

export function freezeExperiment(experiment: CombatLabExperimentV1): CombatLabExperimentV1 {
  const roles = Object.freeze(experiment.roles.map((role) => freezeRole(role)));
  const tracks = Object.freeze(experiment.tracks.map((track) => Object.freeze({ ...track, steps: Object.freeze([...track.steps]) })));
  const sceneSnapshot = { ...experiment.sceneSnapshot, units: [...experiment.sceneSnapshot.units] };
  return Object.freeze({ ...experiment, roles, tracks, sceneSnapshot });
}

export function heldItemForType(type: UnitType): UnitHeldItem {
  return type === 'support_team' ? 'support_item' : type === 'scout_team' ? 'short_item' : 'long_item';
}
