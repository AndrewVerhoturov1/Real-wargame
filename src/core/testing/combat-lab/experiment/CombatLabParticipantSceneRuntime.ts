import { normalizeUnitSide, type UnitData, type UnitModel } from '../../../units/UnitModel';
import type { CombatLabExperimentV1 } from './CombatLabExperimentContracts';
import { applyAmmoAndAid, applyInitialHealth, applyPosture, applyPublishedLoadout } from './CombatLabParticipantInitialRuntime';
import type {
  CombatLabCreateParticipantInputV1,
  CombatLabParticipantInitialContextV1,
  CombatLabParticipantScenePatchV1,
} from './CombatLabParticipantSceneTypes';
import { CombatLabParticipantSceneError } from './CombatLabParticipantSceneTypes';
import {
  assertFinite,
  assertSnapshotCoordinates,
  assertStateCoordinates,
  degreesToRadians,
  finalizeExperiment,
  freezeExperiment,
  freezeRole,
  heldItemForType,
  nextStableId,
  normalizeDegrees,
  normalizeParameters,
  replaceUnitIdentity,
  requireRole,
  requireSceneUnitRecord,
  requireStableId,
  requireText,
  requireUnit,
  restoreExperimentState,
  sceneUnitIdSet,
  isRecord,
} from './CombatLabParticipantSceneSupport';

export function restoreCombatLabParticipantInitialContext(
  experiment: CombatLabExperimentV1,
  roleId: string,
): CombatLabParticipantInitialContextV1 {
  const role = requireRole(experiment, roleId);
  const state = restoreExperimentState(experiment);
  return Object.freeze({ state, unit: requireUnit(state, role.unitId, roleId) });
}

export function restoreCombatLabParticipantInitialUnit(experiment: CombatLabExperimentV1, roleId: string): UnitModel {
  return restoreCombatLabParticipantInitialContext(experiment, roleId).unit;
}

export function updateCombatLabParticipantInitialState(
  experiment: CombatLabExperimentV1,
  roleId: string,
  patch: CombatLabParticipantScenePatchV1,
): CombatLabExperimentV1 {
  const role = requireRole(experiment, roleId);
  const state = restoreExperimentState(experiment);
  const unit = requireUnit(state, role.unitId, roleId);
  const nextTitle = patch.titleRu === undefined ? role.titleRu : requireText(patch.titleRu, 'Имя бойца не может быть пустым.');

  if (patch.side !== undefined) unit.side = normalizeUnitSide(patch.side);
  if (patch.unitType !== undefined) { unit.type = patch.unitType; unit.heldItem = heldItemForType(patch.unitType); }
  if (patch.x !== undefined || patch.y !== undefined) {
    const x = patch.x ?? (unit.position.x - 0.5);
    const y = patch.y ?? (unit.position.y - 0.5);
    assertStateCoordinates(state, x, y);
    unit.position = { x: x + 0.5, y: y + 0.5 };
  }
  if (patch.facingDegrees !== undefined) {
    assertFinite(patch.facingDegrees, 'Направление бойца должно быть конечным числом.');
    unit.facingRadians = degreesToRadians(normalizeDegrees(patch.facingDegrees));
  }
  if (patch.posture !== undefined) applyPosture(unit, patch.posture);
  if (patch.loadoutRef !== undefined) applyPublishedLoadout(unit, patch.loadoutRef);
  applyAmmoAndAid(unit, patch);
  if (patch.initialHealth !== undefined) applyInitialHealth(unit, patch.initialHealth, state.simulationTimeSeconds, roleId);
  unit.labels.ru = nextTitle;
  unit.labels.en = nextTitle;
  unit.aiControl = 'manual';

  const roles = experiment.roles.map((candidate) => candidate.roleId === roleId ? freezeRole({ ...candidate, titleRu: nextTitle }) : candidate);
  return finalizeExperiment(experiment, state, roles);
}

export function createCombatLabParticipant(
  experiment: CombatLabExperimentV1,
  input: CombatLabCreateParticipantInputV1,
): CombatLabExperimentV1 {
  const roleId = input.roleId === undefined
    ? nextStableId('participant', new Set(experiment.roles.map((role) => role.roleId)))
    : requireStableId(input.roleId, 'Идентификатор участника');
  const unitId = input.unitId === undefined
    ? nextStableId('combat-lab-participant', sceneUnitIdSet(experiment))
    : requireStableId(input.unitId, 'Идентификатор бойца');
  if (experiment.roles.some((role) => role.roleId === roleId)) throw new CombatLabParticipantSceneError('combat_lab_participant_role_id_duplicate', `Идентификатор участника «${roleId}» уже используется.`);
  if (sceneUnitIdSet(experiment).has(unitId) || experiment.roles.some((role) => role.unitId === unitId)) throw new CombatLabParticipantSceneError('combat_lab_participant_unit_id_duplicate', `Идентификатор бойца «${unitId}» уже используется.`);
  const titleRu = requireText(input.titleRu, 'Имя бойца не может быть пустым.');
  assertSnapshotCoordinates(experiment, input.x, input.y);
  const posture = input.posture ?? 'standing';
  const unit: UnitData = {
    id: unitId,
    label: titleRu,
    labelRu: titleRu,
    type: input.unitType,
    side: input.side,
    aiControl: 'manual',
    x: input.x,
    y: input.y,
    facingDegrees: normalizeDegrees(input.facingDegrees ?? 0),
    heldItem: heldItemForType(input.unitType),
    initialState: { posture },
    runtime: { posture },
  };
  const role = freezeRole({ roleId, unitId, titleRu, parameters: normalizeParameters(input.parameters) });
  const provisional: CombatLabExperimentV1 = {
    ...experiment,
    sceneSnapshot: { ...experiment.sceneSnapshot, units: [...experiment.sceneSnapshot.units, unit as unknown as Record<string, unknown>] },
    roles: [...experiment.roles, role],
  };
  return updateCombatLabParticipantInitialState(provisional, roleId, input);
}

export function duplicateCombatLabParticipant(experiment: CombatLabExperimentV1, sourceRoleId: string): CombatLabExperimentV1 {
  const sourceRole = requireRole(experiment, sourceRoleId);
  const sourceUnit = requireSceneUnitRecord(experiment, sourceRole.unitId, sourceRoleId);
  const roleId = nextStableId(`${sourceRole.roleId}-copy`, new Set(experiment.roles.map((role) => role.roleId)));
  const unitId = nextStableId(`${sourceRole.unitId}-copy`, sceneUnitIdSet(experiment));
  const titleRu = `${sourceRole.titleRu} — копия`;
  const duplicatedUnit = replaceUnitIdentity(structuredClone(sourceUnit), sourceRole.unitId, unitId);
  duplicatedUnit.id = unitId;
  duplicatedUnit.label = titleRu;
  duplicatedUnit.labelRu = titleRu;
  duplicatedUnit.aiControl = 'manual';
  delete duplicatedUnit.playerCommand;
  delete duplicatedUnit.tacticalKnowledge;
  delete duplicatedUnit.perceptionKnowledge;
  if (isRecord(duplicatedUnit.runtime)) { delete duplicatedUnit.runtime.moveOrder; delete duplicatedUnit.runtime.aiRuntime; }
  const role = freezeRole({ roleId, unitId, titleRu, parameters: normalizeParameters(sourceRole.parameters) });
  return freezeExperiment({
    ...experiment,
    revision: experiment.revision + 1,
    roles: [...experiment.roles, role],
    sceneSnapshot: { ...experiment.sceneSnapshot, units: [...experiment.sceneSnapshot.units, duplicatedUnit] },
  });
}
