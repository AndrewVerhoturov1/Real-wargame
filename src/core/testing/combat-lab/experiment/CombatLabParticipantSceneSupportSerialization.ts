import { buildAiRuntimeSceneSnapshot, serializeMoveOrder } from '../../../ai/runtime/AiRuntimeSnapshot';
import { serializePhysicalActionCoordinatorState } from '../../../actions/PhysicalActionCoordinatorSerialization';
import { serializeUnitPhysicalAction } from '../../../actions/PostureTransition';
import { getCombatRuntime } from '../../../combat/CombatDamage';
import { getWeaponRuntime } from '../../../combat/WeaponModel';
import { serializeInfantryCombatUnitRuntime } from '../../../infantry-combat/runtime';
import { serializeMovementRuntime } from '../../../movement/MovementRuntime';
import { serializeTacticalPositionSettings } from '../../../tactical/TacticalPositionSettings';
import type { UnitModel } from '../../../units/UnitModel';
import type { CombatLabExperimentV1 } from './CombatLabExperimentContracts';
import { CombatLabParticipantSceneError } from './CombatLabParticipantSceneTypes';
import { resolveSourceToRuntimeCellScale } from './CombatLabParticipantSceneSupportNormalization';
import { freezeExperiment, isRecord, requireRole, requireSceneUnitRecord } from './CombatLabParticipantSceneSupportUtilities';

export function serializeCombatLabParticipantSceneUnit(sourceRecord: Record<string, unknown>, unit: UnitModel, sourceToRuntimeCellScale: number): Record<string, unknown> {
  const scale = Number.isFinite(sourceToRuntimeCellScale) && sourceToRuntimeCellScale > 0 ? sourceToRuntimeCellScale : 1;
  return {
    ...structuredClone(sourceRecord), id: unit.id, label: unit.labels.en, labelRu: unit.labels.ru,
    type: unit.type, side: unit.side, aiControl: unit.aiControl,
    x: roundThree((unit.position.x / scale) - 0.5), y: roundThree((unit.position.y / scale) - 0.5),
    speedCellsPerSecond: roundThree(unit.speedCellsPerSecond / scale), heldItem: unit.heldItem,
    facingDegrees: roundOne((unit.facingRadians * 180) / Math.PI),
    viewAngleDegrees: roundOne(unit.attentionSettings.profiles.observe.directAngleDegrees),
    viewRangeCells: roundThree(unit.viewRangeCells / scale), behaviorProfile: unit.behaviorProfile,
    behavior: { ...unit.behaviorSettings },
    soldier: { traits: { ...unit.soldier.traits }, condition: { ...unit.soldier.condition } },
    attentionProfileId: unit.playerAttentionProfileId ?? undefined,
    attention: {
      defaultMode: unit.attentionSettings.defaultMode,
      profiles: Object.fromEntries(Object.entries(unit.attentionSettings.profiles).map(([mode, profile]) => [mode, { ...profile }])),
      vision: { ...unit.attentionSettings.vision },
      nearAwarenessRangeMeters: unit.attentionSettings.nearAwarenessRangeMeters,
      nearMinimumVisibilityQuality: unit.attentionSettings.nearMinimumVisibilityQuality,
    },
    tacticalPositionSettings: serializeTacticalPositionSettings(unit), initialState: { ...unit.initialState },
    tacticalKnowledge: structuredClone(unit.tacticalKnowledge), perceptionKnowledge: structuredClone(unit.perceptionKnowledge),
    navigationProfileId: unit.unitRoleNavigationProfileId ?? undefined,
    navigationMovementMode: unit.navigationMovementMode ?? undefined,
    movementProfileId: unit.unitRoleMovementProfileId ?? undefined,
    playerCommand: unit.playerCommand ? structuredClone(unit.playerCommand) : undefined,
    runtime: {
      stress: roundOne(unit.behaviorRuntime.stress), suppression: roundOne(unit.behaviorRuntime.suppression),
      ammo: Math.round(unit.behaviorRuntime.ammo), weaponReady: unit.behaviorRuntime.weaponReady,
      posture: unit.behaviorRuntime.posture, weapon: { ...getWeaponRuntime(unit) },
      combat: structuredClone(getCombatRuntime(unit)), movement: serializeMovementRuntime(unit.movementRuntime),
      physicalActionCoordinator: serializePhysicalActionCoordinatorState(unit.behaviorRuntime.physicalActionCoordinator),
      physicalAction: serializeUnitPhysicalAction(unit.behaviorRuntime.physicalAction),
      infantryCombat: serializeInfantryCombatUnitRuntime(unit.infantryCombatRuntime),
      moveOrder: unit.order ? serializeMoveOrder(unit.order) : undefined,
      aiRuntime: buildAiRuntimeSceneSnapshot(unit.behaviorRuntime.aiRuntimeSession, unit.order, unit.behaviorRuntime.aiRouteStatusState),
    },
  };
}

export function replaceCombatLabParticipantSceneUnit(experiment: CombatLabExperimentV1, roleId: string, unit: UnitModel): CombatLabExperimentV1 {
  const role = requireRole(experiment, roleId);
  const sourceRecord = requireSceneUnitRecord(experiment, role.unitId, roleId);
  const serialized = serializeCombatLabParticipantSceneUnit(sourceRecord, unit, resolveSourceToRuntimeCellScale(experiment));
  let replaced = false;
  const units = experiment.sceneSnapshot.units.map((candidate) => {
    if (!isRecord(candidate) || candidate.id !== role.unitId) return candidate;
    replaced = true;
    return serialized;
  });
  if (!replaced) throw new CombatLabParticipantSceneError('combat_lab_participant_unit_missing', `Боец «${role.unitId}» участника «${roleId}» отсутствует в начальной сцене.`);
  return freezeExperiment({ ...experiment, revision: experiment.revision + 1, sceneSnapshot: { ...experiment.sceneSnapshot, units } });
}

function roundOne(value: number): number { return Math.round(value * 10) / 10; }
function roundThree(value: number): number { return Math.round(value * 1000) / 1000; }
