import { buildSceneSnapshot, restoreSimulationStateFromSceneSnapshot } from '../../../simulation/SceneSnapshot';
import { createInitialState, type SimulationState } from '../../../simulation/SimulationState';
import type { UnitHeldItem, UnitModel, UnitType } from '../../../units/UnitModel';
import type { CombatLabExperimentRoleV1, CombatLabExperimentV1, CombatLabParticipantParametersV1 } from './CombatLabExperimentContracts';
import { CombatLabParticipantSceneError } from './CombatLabParticipantSceneTypes';

export function restoreExperimentState(experiment: CombatLabExperimentV1): SimulationState {
  const state = createInitialState({ width: 1, height: 1, cellSize: 1, metersPerCell: 1, defaultTerrain: 'field', defaultHeight: 0, objects: [] }, []);
  restoreSimulationStateFromSceneSnapshot(state, experiment.sceneSnapshot);
  return state;
}

export function finalizeExperiment(
  experiment: CombatLabExperimentV1,
  state: SimulationState,
  roles: readonly CombatLabExperimentRoleV1[],
): CombatLabExperimentV1 {
  const sceneSnapshot = buildSceneSnapshot(state, {
    exportedAt: experiment.sceneSnapshot.exportedAt,
    environmentProfiles: experiment.sceneSnapshot.environmentProfiles,
    staticTacticalPositionArtifact: experiment.sceneSnapshot.staticTacticalPositionArtifact ?? null,
  });
  return freezeExperiment({ ...experiment, revision: experiment.revision + 1, roles, sceneSnapshot });
}

export function requireRole(experiment: CombatLabExperimentV1, roleId: string): CombatLabExperimentRoleV1 {
  const role = experiment.roles.find((candidate) => candidate.roleId === roleId);
  if (!role) throw new CombatLabParticipantSceneError('combat_lab_participant_missing', `Участник «${roleId}» не найден.`);
  return role;
}

export function requireUnit(state: SimulationState, unitId: string, roleId: string): UnitModel {
  const unit = state.units.find((candidate) => candidate.id === unitId);
  if (!unit) throw new CombatLabParticipantSceneError('combat_lab_participant_unit_missing', `Боец «${unitId}» участника «${roleId}» отсутствует в начальной сцене.`);
  return unit;
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

export function assertStateCoordinates(state: Pick<SimulationState, 'map'>, x: number, y: number): void {
  assertFinite(x, 'Координата X должна быть конечным числом.');
  assertFinite(y, 'Координата Y должна быть конечным числом.');
  if (x < 0 || y < 0 || x >= state.map.width || y >= state.map.height) {
    throw new CombatLabParticipantSceneError('combat_lab_participant_position_out_of_bounds', 'Положение бойца находится за пределами карты.');
  }
}

export function sceneUnitIdSet(experiment: CombatLabExperimentV1): Set<string> {
  return new Set(experiment.sceneSnapshot.units.flatMap((candidate) => isRecord(candidate) && typeof candidate.id === 'string' ? [candidate.id] : []));
}

export function nextStableId(prefix: string, used: ReadonlySet<string>): string {
  for (let index = 1; index <= 1_000_000; index += 1) {
    const candidate = `${prefix}-${index}`;
    if (!used.has(candidate)) return candidate;
  }
  throw new CombatLabParticipantSceneError('combat_lab_participant_id_exhausted', `Не удалось создать свободный идентификатор с префиксом «${prefix}».`);
}

export function replaceUnitIdentity(value: unknown, sourceUnitId: string, targetUnitId: string): Record<string, unknown> {
  const replaced = replaceIdentityValue(value, sourceUnitId, targetUnitId);
  if (!isRecord(replaced)) throw new CombatLabParticipantSceneError('combat_lab_participant_duplicate_invalid', 'Исходная запись бойца повреждена.');
  return replaced;
}

function replaceIdentityValue(value: unknown, sourceUnitId: string, targetUnitId: string): unknown {
  if (typeof value === 'string') {
    if (value === sourceUnitId) return targetUnitId;
    if (value.startsWith(`${sourceUnitId}:`)) return `${targetUnitId}${value.slice(sourceUnitId.length)}`;
    return value;
  }
  if (Array.isArray(value)) return value.map((item) => replaceIdentityValue(item, sourceUnitId, targetUnitId));
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, replaceIdentityValue(child, sourceUnitId, targetUnitId)]));
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

export function requireStableId(value: string, label: string): string {
  const id = value.trim();
  if (!/^[a-z0-9][a-z0-9:_-]*$/i.test(id)) {
    throw new CombatLabParticipantSceneError('combat_lab_participant_id_invalid', `${label} должен содержать только латинские буквы, цифры, двоеточие, дефис или подчёркивание.`);
  }
  return id;
}

export function requireText(value: string, messageRu: string): string {
  const text = value.trim();
  if (!text) throw new CombatLabParticipantSceneError('combat_lab_participant_title_invalid', messageRu);
  return text;
}

export function assertFinite(value: number, messageRu: string): void {
  if (!Number.isFinite(value)) throw new CombatLabParticipantSceneError('combat_lab_participant_number_invalid', messageRu);
}

export function assertFiniteRange(value: number, minimum: number, maximum: number, messageRu: string): void {
  assertFinite(value, messageRu);
  if (value < minimum || value > maximum) throw new CombatLabParticipantSceneError('combat_lab_participant_number_out_of_range', messageRu);
}

export function assertIntegerRange(value: number, minimum: number, maximum: number, messageRu: string): void {
  if (!Number.isInteger(value) || value < minimum || value > maximum) throw new CombatLabParticipantSceneError('combat_lab_participant_integer_out_of_range', messageRu);
}

export function normalizeDegrees(value: number): number {
  assertFinite(value, 'Направление бойца должно быть конечным числом.');
  return ((value % 360) + 360) % 360;
}

export function degreesToRadians(value: number): number { return (value * Math.PI) / 180; }
export function increment(value: number): number { return Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.trunc(value)) + 1); }
export function compareText(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
export function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
export function deepFreeze<T>(value: T): T { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child); return Object.freeze(value); }
