import { normalizeUnitSide, type UnitData } from '../../../units/UnitModel';
import type { CombatLabExperimentRoleV1, CombatLabExperimentV1 } from './CombatLabExperimentContracts';
import {
  applyAmmoAndAid,
  applyInitialHealth,
  applyPosture,
  applyPublishedLoadout,
  captureCombatLabParticipantStableRuntime,
  resetCombatLabParticipantForInitialEdit,
  restoreCombatLabParticipantStableRuntime,
} from './CombatLabParticipantInitialRuntime';
import type {
  CombatLabCreateParticipantInputV1,
  CombatLabParticipantInitialDraftV1,
  CombatLabParticipantInitialSummaryV1,
  CombatLabParticipantMutationOptionsV1,
  CombatLabParticipantReadObserverV1,
  CombatLabParticipantScenePatchV1,
} from './CombatLabParticipantSceneTypes';
import { CombatLabParticipantSceneError } from './CombatLabParticipantSceneTypes';
import {
  assertFinite,
  assertSnapshotCoordinates,
  degreesToRadians,
  freezeExperiment,
  freezeRole,
  heldItemForType,
  isRecord,
  nextStableId,
  normalizeCombatLabParticipantSceneUnit,
  normalizeCombatLabParticipantSceneUnitRecord,
  normalizeDegrees,
  normalizeParameters,
  replaceCombatLabParticipantSceneUnit,
  replaceUnitIdentity,
  requireRole,
  requireSceneUnitRecord,
  requireStableId,
  requireText,
  sceneUnitIdSet,
  serializeCombatLabParticipantSceneUnit,
} from './CombatLabParticipantSceneSupport';

export function readCombatLabParticipantInitialSummary(
  experiment: CombatLabExperimentV1,
  roleId: string,
  observer: CombatLabParticipantReadObserverV1 = {},
): CombatLabParticipantInitialSummaryV1 {
  const normalized = normalizeCombatLabParticipantSceneUnit(experiment, roleId, observer);
  return summarize(normalized.role, normalized.unit);
}

export function readCombatLabParticipantInitialSummaries(
  experiment: CombatLabExperimentV1,
  observer: CombatLabParticipantReadObserverV1 = {},
): readonly CombatLabParticipantInitialSummaryV1[] {
  const wantedUnitIds = new Set(experiment.roles.map((role) => role.unitId));
  const recordsByUnitId = new Map<string, Record<string, unknown>>();
  for (const candidate of experiment.sceneSnapshot.units) {
    if (!isRecord(candidate) || typeof candidate.id !== 'string' || !wantedUnitIds.has(candidate.id)) continue;
    recordsByUnitId.set(candidate.id, candidate);
  }
  return Object.freeze(experiment.roles.map((role) => {
    const sourceRecord = recordsByUnitId.get(role.unitId);
    if (!sourceRecord) throw new CombatLabParticipantSceneError('combat_lab_participant_unit_missing', `Боец «${role.unitId}» участника «${role.roleId}» отсутствует в начальной сцене.`);
    const normalized = normalizeCombatLabParticipantSceneUnitRecord(experiment, role, sourceRecord, observer);
    return summarize(role, normalized.unit);
  }));
}

export function readCombatLabParticipantInitialDraft(
  experiment: CombatLabExperimentV1,
  roleId: string,
  observer: CombatLabParticipantReadObserverV1 = {},
): CombatLabParticipantInitialDraftV1 {
  const normalized = normalizeCombatLabParticipantSceneUnit(experiment, roleId, observer);
  const unit = normalized.unit;
  const runtime = unit.infantryCombatRuntime;
  return Object.freeze({
    roleId: normalized.role.roleId,
    unitId: normalized.role.unitId,
    titleRu: normalized.role.titleRu,
    side: unit.side,
    unitType: unit.type,
    x: (unit.position.x / normalized.sourceToRuntimeCellScale) - 0.5,
    y: (unit.position.y / normalized.sourceToRuntimeCellScale) - 0.5,
    facingDegrees: (unit.facingRadians * 180) / Math.PI,
    runtimeMetersPerCell: experiment.sceneSnapshot.map.metersPerCell / normalized.sourceToRuntimeCellScale,
    posture: unit.behaviorRuntime.posture,
    loadoutRef: runtime.ammoInventory.loadoutRef ? Object.freeze({ ...runtime.ammoInventory.loadoutRef }) : null,
    loadedRounds: runtime.primaryWeapon?.roundsInWeapon ?? 0,
    reserves: Object.freeze(runtime.ammoInventory.reserves.map((entry) => Object.freeze({
      ammoDefinitionId: entry.ammoDefinitionId,
      rounds: entry.rounds,
      maximumRounds: entry.maximumRounds,
    }))),
    firstAidCharges: runtime.medical.firstAidCharges,
    bloodLoss: runtime.physiology.blood.bloodLoss,
    wounds: Object.freeze(runtime.wounds.slots.map((slot) => Object.freeze({
      zone: slot.zone,
      severity: slot.severity,
      hitCount: slot.hitCount,
    }))),
    unit,
  });
}

export function updateCombatLabParticipantInitialState(
  experiment: CombatLabExperimentV1,
  roleId: string,
  patch: CombatLabParticipantScenePatchV1,
  options: CombatLabParticipantMutationOptionsV1 = {},
): CombatLabExperimentV1 {
  const normalized = normalizeCombatLabParticipantSceneUnit(experiment, roleId);
  const unit = normalized.unit;
  const stable = captureCombatLabParticipantStableRuntime(unit);
  resetCombatLabParticipantForInitialEdit(unit);
  restoreCombatLabParticipantStableRuntime(unit, stable, options.catalogRegistry);

  const nextTitle = patch.titleRu === undefined
    ? normalized.role.titleRu
    : requireText(patch.titleRu, 'Имя бойца не может быть пустым.');
  if (patch.side !== undefined) unit.side = normalizeUnitSide(patch.side);
  if (patch.unitType !== undefined) {
    unit.type = patch.unitType;
    unit.heldItem = heldItemForType(patch.unitType);
  }
  if (patch.x !== undefined || patch.y !== undefined) {
    const x = patch.x ?? ((unit.position.x / normalized.sourceToRuntimeCellScale) - 0.5);
    const y = patch.y ?? ((unit.position.y / normalized.sourceToRuntimeCellScale) - 0.5);
    assertSnapshotCoordinates(experiment, x, y);
    unit.position = {
      x: (x + 0.5) * normalized.sourceToRuntimeCellScale,
      y: (y + 0.5) * normalized.sourceToRuntimeCellScale,
    };
  }
  if (patch.facingDegrees !== undefined) {
    assertFinite(patch.facingDegrees, 'Направление бойца должно быть конечным числом.');
    unit.facingRadians = degreesToRadians(normalizeDegrees(patch.facingDegrees));
  }
  if (patch.posture !== undefined) applyPosture(unit, patch.posture);
  if (patch.loadoutRef !== undefined) applyPublishedLoadout(unit, patch.loadoutRef, options.catalogRegistry);
  applyAmmoAndAid(unit, patch);
  if (patch.initialHealth !== undefined) {
    applyInitialHealth(unit, patch.initialHealth, experiment.sceneSnapshot.simulationTimeSeconds, roleId);
  }
  unit.labels.ru = nextTitle;
  unit.labels.en = nextTitle;
  unit.aiControl = 'manual';

  const roles = experiment.roles.map((candidate) => candidate.roleId === roleId
    ? freezeRole({ ...candidate, titleRu: nextTitle })
    : candidate);
  return replaceCombatLabParticipantSceneUnit({ ...experiment, roles }, roleId, unit);
}

export function createCombatLabParticipant(
  experiment: CombatLabExperimentV1,
  input: CombatLabCreateParticipantInputV1,
  options: CombatLabParticipantMutationOptionsV1 = {},
): CombatLabExperimentV1 {
  const roleId = input.roleId === undefined
    ? nextStableId('participant', new Set(experiment.roles.map((role) => role.roleId)))
    : requireStableId(input.roleId, 'Идентификатор участника');
  const unitId = input.unitId === undefined
    ? nextStableId('combat-lab-participant', sceneUnitIdSet(experiment))
    : requireStableId(input.unitId, 'Идентификатор бойца');
  if (experiment.roles.some((role) => role.roleId === roleId)) {
    throw new CombatLabParticipantSceneError('combat_lab_participant_role_id_duplicate', `Идентификатор участника «${roleId}» уже используется.`);
  }
  if (sceneUnitIdSet(experiment).has(unitId) || experiment.roles.some((role) => role.unitId === unitId)) {
    throw new CombatLabParticipantSceneError('combat_lab_participant_unit_id_duplicate', `Идентификатор бойца «${unitId}» уже используется.`);
  }
  const titleRu = requireText(input.titleRu, 'Имя бойца не может быть пустым.');
  assertSnapshotCoordinates(experiment, input.x, input.y);
  const posture = input.posture ?? 'standing';
  const raw: UnitData = {
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
  const normalized = normalizeCombatLabParticipantSceneUnitRecord(
    experiment,
    role,
    raw as unknown as Record<string, unknown>,
  );
  const unit = normalized.unit;
  if (input.loadoutRef !== undefined) applyPublishedLoadout(unit, input.loadoutRef, options.catalogRegistry);
  applyAmmoAndAid(unit, input);
  if (input.initialHealth !== undefined) {
    applyInitialHealth(unit, input.initialHealth, experiment.sceneSnapshot.simulationTimeSeconds, roleId);
  }
  unit.labels.en = titleRu;
  unit.labels.ru = titleRu;
  unit.aiControl = 'manual';
  const serialized = serializeCombatLabParticipantSceneUnit(
    raw as unknown as Record<string, unknown>,
    unit,
    normalized.sourceToRuntimeCellScale,
  );
  return freezeExperiment({
    ...experiment,
    revision: experiment.revision + 1,
    roles: [...experiment.roles, role],
    sceneSnapshot: {
      ...experiment.sceneSnapshot,
      units: [...experiment.sceneSnapshot.units, serialized],
    },
  });
}

export function duplicateCombatLabParticipant(
  experiment: CombatLabExperimentV1,
  sourceRoleId: string,
  options: CombatLabParticipantMutationOptionsV1 = {},
): CombatLabExperimentV1 {
  const sourceRole = requireRole(experiment, sourceRoleId);
  const sourceUnit = requireSceneUnitRecord(experiment, sourceRole.unitId, sourceRoleId);
  const roleId = nextStableId(`${sourceRole.roleId}-copy`, new Set(experiment.roles.map((role) => role.roleId)));
  const unitId = nextStableId(`${sourceRole.unitId}-copy`, sceneUnitIdSet(experiment));
  const titleRu = `${sourceRole.titleRu} — копия`;
  const duplicatedRecord = replaceUnitIdentity(structuredClone(sourceUnit), sourceRole.unitId, unitId);
  duplicatedRecord.id = unitId;
  duplicatedRecord.label = titleRu;
  duplicatedRecord.labelRu = titleRu;
  duplicatedRecord.aiControl = 'manual';
  const role = freezeRole({ roleId, unitId, titleRu, parameters: normalizeParameters(sourceRole.parameters) });
  const normalized = normalizeCombatLabParticipantSceneUnitRecord(experiment, role, duplicatedRecord);
  const stable = captureCombatLabParticipantStableRuntime(normalized.unit);
  resetCombatLabParticipantForInitialEdit(normalized.unit);
  restoreCombatLabParticipantStableRuntime(normalized.unit, stable, options.catalogRegistry);
  normalized.unit.id = unitId;
  normalized.unit.labels.en = titleRu;
  normalized.unit.labels.ru = titleRu;
  normalized.unit.aiControl = 'manual';
  const serialized = serializeCombatLabParticipantSceneUnit(
    duplicatedRecord,
    normalized.unit,
    normalized.sourceToRuntimeCellScale,
  );
  return freezeExperiment({
    ...experiment,
    revision: experiment.revision + 1,
    roles: [...experiment.roles, role],
    sceneSnapshot: { ...experiment.sceneSnapshot, units: [...experiment.sceneSnapshot.units, serialized] },
  });
}

function summarize(role: CombatLabExperimentRoleV1, unit: ReturnType<typeof normalizeCombatLabParticipantSceneUnit>['unit']): CombatLabParticipantInitialSummaryV1 {
  const weapon = unit.infantryCombatRuntime.primaryWeapon;
  const reserveRounds = unit.infantryCombatRuntime.ammoInventory.reserves.reduce((sum, item) => sum + item.rounds, 0);
  return Object.freeze({
    roleId: role.roleId,
    unitId: role.unitId,
    titleRu: role.titleRu,
    side: unit.side,
    posture: unit.behaviorRuntime.posture,
    weaponNameRu: weapon?.resolved.weapon.nameRu ?? null,
    loadedRounds: weapon?.roundsInWeapon ?? 0,
    reserveRounds,
    healthRu: healthSummary(unit.infantryCombatRuntime.wounds.slots, unit.infantryCombatRuntime.physiology.blood.state),
  });
}

function healthSummary(slots: readonly { readonly severity: string }[], bloodState: string): string {
  if (bloodState === 'dead') return 'Погиб';
  if (bloodState === 'unconscious') return 'Без сознания';
  if (slots.some((slot) => slot.severity === 'critical')) return 'Критическое ранение';
  if (slots.some((slot) => slot.severity === 'severe')) return 'Тяжёлое ранение';
  if (slots.some((slot) => slot.severity === 'light')) return 'Лёгкое ранение';
  return bloodState === 'stable' ? 'Здоров' : `Потеря крови: ${bloodState}`;
}
