import {
  publishMovementProfileStateToAiMemory,
  publishTacticalOrderIntentToAiMemory,
} from '../ai/TacticalOrderBlackboard';
import type { UnitPlanState } from '../ai/UnitPlan';
import { initializeSimulationAiEventFacts } from '../ai/events/SimulationAiEvents';
import {
  normalizeAiRuntimeSceneSnapshot,
  normalizeSerializedMoveOrder,
  restoreMoveOrder,
  type AiRuntimeSceneSnapshotV1,
  type SerializedMoveOrder,
} from '../ai/runtime/AiRuntimeSnapshot';
import {
  createPhysicalActionCoordinatorState,
} from '../actions/PhysicalActionCoordinator';
import {
  reconcilePhysicalActionCoordinatorState,
  type PhysicalActionReconciliationActionV1,
} from '../actions/PhysicalActionCoordinatorReconciliation';
import { normalizePhysicalActionCoordinatorState } from '../actions/PhysicalActionCoordinatorSerialization';
import {
  POSTURE_TRANSITION_ACTION_TYPE,
  normalizeUnitPhysicalAction,
  synchronizeEffectivePostureFromAction,
} from '../actions/PostureTransition';
import {
  createBehaviorRuntime,
  createBehaviorSettings,
  createSoldierParameters,
  createUnitInitialState,
  normalizeBehaviorProfileId,
  type BehaviorProfileId,
  type BehaviorSettings,
  type SoldierParameterOverrides,
  type SoldierParameters,
  type UnitBehaviorRuntime,
  type UnitInitialState,
} from '../behavior/BehaviorModel';
import { clearCombatRuntime, replaceCombatRuntime, type CombatRuntimeState } from '../combat/CombatDamage';
import { clearWeaponRuntime, replaceWeaponRuntime, type WeaponRuntimeState } from '../combat/WeaponModel';
import {
  createInfantryCombatUnitRuntime,
  normalizeInfantryCombatUnitRuntime,
  type InfantryCombatUnitRuntimeV1,
} from '../infantry-combat/runtime';
import type { GridPosition } from '../geometry';
import {
  MOVEMENT_WEAPON_PREPARATION_ACTION_TYPE,
  createMovementRuntime,
  type MovementRuntimeState,
} from '../movement/MovementRuntime';
import {
  DEFAULT_MOVEMENT_PROFILE_ID,
  BUILT_IN_MOVEMENT_PROFILES,
  isMovementGait,
  normalizeMovementProfileId,
  resolveMovementProfileIdAlias,
  type MovementGait,
  type MovementProfileSource,
} from '../movement/MovementProfiles';
import { createEmptyTacticalKnowledge, normalizeTacticalKnowledge } from '../knowledge/SoldierThreatMemory';
import type { NavigationProfileSource } from '../navigation/NavigationProfileResolver';
import type { NavigationMovementMode } from '../navigation/NavigationProfiles';
import type { MoveOrder } from '../orders/MoveOrder';
import { normalizePlayerCommand, type PlayerCommand } from '../orders/PlayerCommand';
import {
  createAttentionRuntime,
  createAttentionSettings,
  type AttentionRuntimeState,
  type UnitAttentionSettings,
  type UnitAttentionSettingsInput,
} from '../perception/AttentionModel';
import {
  createEmptyPerceptionKnowledge,
  normalizePerceptionKnowledge,
  type UnitPerceptionKnowledge,
} from '../perception/PerceptionContact';
import type { PressureZoneMode } from '../pressure/PressureZone';
import {
  createDefaultTacticalPositionSettings,
  initializeTacticalPositionSettings,
  type TacticalPositionSettings,
  type TacticalPositionSettingsInput,
} from '../tactical/TacticalPositionSettings';

export type UnitSide = 'blue' | 'red';
export type UnitAiControl = 'graph' | 'manual';
export type UnitSideInput = UnitSide | 'player';
export type UnitType = 'infantry_squad' | 'scout_team' | 'support_team';
export type UnitHeldItem = 'long_item' | 'support_item' | 'short_item';
export type ThreatMemorySource = 'seen' | 'heard' | 'reported' | 'fire_pressure';
export type FireThreatClass = 'rifle_fire' | 'machine_gun_fire';

export interface KnownThreatMemory {
  id: string;
  labelRu: string;
  mode: PressureZoneMode;
  x: number;
  y: number;
  radiusCells: number;
  widthCells: number;
  heightCells: number;
  rotationDegrees: number;
  strength: number;
  suppression: number;
  stressPerSecond: number;
  directionDegrees: number;
  arcDegrees: number;
  rangeCells: number;
  minRangeCells: number;
  falloffPercent: number;
  confidence: number;
  uncertaintyCells: number;
  source: ThreatMemorySource;
  visibleNow: boolean;
  lastSeenSeconds: number;
  lastUpdatedSeconds: number;
  fireThreatClass?: FireThreatClass | null;
  evidenceCount?: number;
  lastEvidenceSeconds?: number;
}

export interface UnitTacticalKnowledge {
  threats: KnownThreatMemory[];
  revision: number;
  lastUpdatedSeconds: number;
}

export interface UnitRuntimeData extends Partial<Pick<UnitBehaviorRuntime, 'stress' | 'suppression' | 'ammo' | 'weaponReady' | 'posture'>> {
  weapon?: WeaponRuntimeState;
  combat?: CombatRuntimeState;
  aiRuntime?: AiRuntimeSceneSnapshotV1;
  moveOrder?: SerializedMoveOrder;
  movement?: MovementRuntimeState;
  physicalActionCoordinator?: unknown;
  physicalAction?: unknown;
  infantryCombat?: unknown;
}

export interface UnitData {
  id: string;
  label?: string;
  labelRu?: string;
  type: UnitType;
  side: UnitSideInput;
  aiControl?: UnitAiControl;
  x: number;
  y: number;
  speedCellsPerSecond?: number;
  heldItem?: UnitHeldItem;
  facingDegrees?: number;
  viewAngleDegrees?: number;
  viewRangeCells?: number;
  behaviorProfile?: BehaviorProfileId;
  behavior?: Partial<BehaviorSettings>;
  soldier?: SoldierParameterOverrides;
  attention?: UnitAttentionSettingsInput;
  attentionProfileId?: string;
  tacticalPositionSettings?: TacticalPositionSettingsInput;
  initialState?: Partial<UnitInitialState>;
  tacticalKnowledge?: Partial<UnitTacticalKnowledge>;
  perceptionKnowledge?: Partial<UnitPerceptionKnowledge>;
  runtime?: UnitRuntimeData;
  movementProfileId?: string;
  movementGait?: MovementGait;
  movementProfileSource?: MovementProfileSource | 'player' | 'unit' | 'ai' | 'fallback' | 'migration';
  navigationProfileId?: string;
  navigationMovementMode?: NavigationMovementMode;
  playerCommand?: unknown;
}

export interface UnitModel {
  id: string;
  labels: {
    en: string;
    ru: string;
  };
  type: UnitType;
  side: UnitSide;
  aiControl: UnitAiControl;
  position: GridPosition;
  speedCellsPerSecond: number;
  playerCommand: PlayerCommand | null;
  plan: UnitPlanState | null;
  order: MoveOrder | null;
  heldItem: UnitHeldItem;
  facingRadians: number;
  viewAngleRadians: number;
  viewRangeCells: number;
  behaviorProfile: BehaviorProfileId;
  behaviorSettings: BehaviorSettings;
  behaviorRuntime: UnitBehaviorRuntime;
  soldier: SoldierParameters;
  attentionSettings: UnitAttentionSettings;
  attentionRuntime: AttentionRuntimeState;
  playerAttentionProfileId?: string | null;
  tacticalPositionSettings: TacticalPositionSettings;
  tacticalPositionSettingsRevision: number;
  initialState: UnitInitialState;
  tacticalKnowledge: UnitTacticalKnowledge;
  perceptionKnowledge: UnitPerceptionKnowledge;
  movementRuntime: MovementRuntimeState;
  infantryCombatRuntime: InfantryCombatUnitRuntimeV1;
  unitRoleNavigationProfileId?: string | null;
  playerNavigationProfileId?: string | null;
  navigationMovementMode?: NavigationMovementMode | null;
  activeNavigationProfileId?: string;
  activeNavigationProfileSource?: NavigationProfileSource;
  unitRoleMovementProfileId?: string | null;
}

export function normalizeUnits(data: UnitData[], sourceToRuntimeCellScale = 1): UnitModel[] {
  const scale = normalizeScale(sourceToRuntimeCellScale);
  return data.map((unit) => {
    const fallbackLabel = unit.label ?? unit.id;
    const behaviorProfile = normalizeBehaviorProfileId(unit.behaviorProfile);
    const soldier = createSoldierParameters(behaviorProfile, unit.soldier);
    const legacyInitial = {
      posture: unit.runtime?.posture,
      stress: unit.runtime?.stress,
      suppression: unit.runtime?.suppression,
      ammo: unit.runtime?.ammo,
      weaponReady: unit.runtime?.weaponReady,
      fatigue: unit.soldier?.condition?.fatigue,
      morale: unit.soldier?.condition?.morale,
      confusion: unit.soldier?.condition?.confusion,
      health: unit.soldier?.condition?.health,
    };
    const initialState = createUnitInitialState(soldier, compactUndefined({ ...legacyInitial, ...unit.initialState }));
    const behaviorRuntime = createBehaviorRuntime(initialState);
    const initialNavigationProfile = unit.navigationProfileId ?? 'normal';
    const facingRadians = degreesToRadians(unit.facingDegrees ?? 0);
    const attentionSettings = createAttentionSettings(unit.attention);
    const importedPerceptionKnowledge = unit.perceptionKnowledge
      ? scalePerceptionKnowledge(normalizePerceptionKnowledge(unit.perceptionKnowledge), scale)
      : createEmptyPerceptionKnowledge();
    const rawMovementProfileId = unit.movementProfileId ?? DEFAULT_MOVEMENT_PROFILE_ID;
    const requestedMovementProfileId = resolveMovementProfileIdAlias(rawMovementProfileId).id;
    const requestedMovementGait = isMovementGait(unit.movementGait)
      ? unit.movementGait
      : BUILT_IN_MOVEMENT_PROFILES.find((profile) => profile.id === requestedMovementProfileId)?.preferredGait ?? 'walk';
    const importedPlayerCommand = scalePlayerCommand(
      normalizePlayerCommand(unit.playerCommand, unit.id),
      scale,
    );

    const model: UnitModel = {
      id: unit.id,
      labels: {
        en: fallbackLabel,
        ru: unit.labelRu ?? fallbackLabel,
      },
      type: unit.type,
      side: normalizeUnitSide(unit.side),
      aiControl: normalizeUnitAiControl(unit.aiControl),
      position: {
        x: (unit.x + 0.5) * scale,
        y: (unit.y + 0.5) * scale,
      },
      speedCellsPerSecond: Math.max(0, (unit.speedCellsPerSecond ?? 0.5) * scale),
      playerCommand: importedPlayerCommand,
      plan: null,
      order: null,
      heldItem: unit.heldItem ?? defaultHeldItemForUnitType(unit.type),
      facingRadians,
      viewAngleRadians: degreesToRadians(unit.viewAngleDegrees ?? attentionSettings.profiles.observe.directAngleDegrees),
      viewRangeCells: Math.max(0, (unit.viewRangeCells ?? 7) * scale),
      behaviorProfile,
      behaviorSettings: createBehaviorSettings(behaviorProfile, unit.behavior),
      behaviorRuntime,
      soldier,
      attentionSettings,
      attentionRuntime: createAttentionRuntime(attentionSettings, facingRadians),
      playerAttentionProfileId: unit.attentionProfileId ?? null,
      tacticalPositionSettings: createDefaultTacticalPositionSettings(),
      tacticalPositionSettingsRevision: 0,
      initialState,
      tacticalKnowledge: unit.tacticalKnowledge
        ? normalizeTacticalKnowledge(unit.tacticalKnowledge, scale)
        : createEmptyTacticalKnowledge(),
      perceptionKnowledge: importedPerceptionKnowledge,
      infantryCombatRuntime: createInfantryCombatUnitRuntime(),
      movementRuntime: createMovementRuntime(
        rawMovementProfileId,
        requestedMovementGait,
        unit.runtime?.movement,
      ),
      unitRoleNavigationProfileId: unit.navigationProfileId ?? null,
      playerNavigationProfileId: importedPlayerCommand?.intent.navigationProfileId ?? initialNavigationProfile,
      navigationMovementMode: unit.navigationMovementMode ?? null,
      activeNavigationProfileId: importedPlayerCommand?.intent.navigationProfileId ?? initialNavigationProfile,
      activeNavigationProfileSource: importedPlayerCommand ? 'playerCommand' : unit.navigationProfileId ? 'unitRole' : 'default',
      unitRoleMovementProfileId: unit.movementProfileId
        ? requestedMovementProfileId
        : null,
    };
    initializeTacticalPositionSettings(model, unit.tacticalPositionSettings);
    applyInitialStateToRuntime(model, false);
    model.infantryCombatRuntime = normalizeInfantryCombatUnitRuntime(unit.runtime?.infantryCombat);
    model.behaviorRuntime.physicalActionCoordinator = normalizePhysicalActionCoordinatorState(
      unit.runtime?.physicalActionCoordinator,
    );
    model.movementRuntime = createMovementRuntime(
      rawMovementProfileId,
      requestedMovementGait,
      {
        ...(unit.runtime?.movement ?? {}),
        requestedProfileSource: unit.runtime?.movement?.requestedProfileSource
          ?? unit.movementProfileSource
          ?? (unit.movementProfileId ? 'unit' : 'default'),
      },
    );
    model.behaviorRuntime.physicalAction = normalizeUnitPhysicalAction(unit.runtime?.physicalAction, model.id);
    reconcileKnownPhysicalActions(model);
    synchronizeEffectivePostureFromAction(model);
    if (unit.runtime?.weapon) replaceWeaponRuntime(model, unit.runtime.weapon);
    restoreAiRuntimeSnapshot(model, unit.runtime?.aiRuntime);
    if (!model.order) restorePlayerMoveOrderSnapshot(model, unit.runtime?.moveOrder);
    if (!model.order) {
      model.movementRuntime.isMoving = false;
      model.movementRuntime.velocityCellsPerSecond = { x: 0, y: 0 };
    }
    if (model.playerCommand) publishTacticalOrderIntentToAiMemory(model, model.playerCommand.intent);
    else publishMovementProfileStateToAiMemory(model);
    if (unit.runtime?.combat) replaceCombatRuntime(model, unit.runtime.combat);
    if (model.behaviorRuntime.physicalAction?.status === 'running' && model.behaviorRuntime.physicalAction.actionHandle) {
      model.behaviorRuntime.currentAction = 'change_posture';
      model.behaviorRuntime.reason = model.behaviorRuntime.physicalAction.reasonRu;
    }
    initializeSimulationAiEventFacts(model);
    return model;
  });
}

function reconcileKnownPhysicalActions(unit: UnitModel): void {
  const actions: PhysicalActionReconciliationActionV1[] = [];
  const posture = unit.behaviorRuntime.physicalAction;
  const preparation = unit.movementRuntime.weaponPreparation;
  const postureActionId = posture?.id ?? null;
  const preparationSequence = preparation?.actionHandle?.sequence
    ?? Math.max(1, preparation?.revision ?? unit.behaviorRuntime.physicalActionCoordinator.nextSequence);
  const preparationActionId = preparation
    ? preparation.actionHandle?.actionId ?? `${unit.id}:physical-action:${preparationSequence}`
    : null;

  if (posture?.status === 'running') {
    actions.push({
      payload: posture,
      actionId: posture.id,
      sequence: posture.sequence,
      actionType: POSTURE_TRANSITION_ACTION_TYPE,
      owner: posture.owner,
      ownerToken: posture.ownerToken,
      channels: ['locomotion', 'posture', 'weapon'],
      startedSeconds: posture.startedSeconds,
      reasonCode: posture.reasonCode,
      reasonRu: posture.reasonRu,
    });
  }
  if (preparation && preparation.remainingSeconds > 1e-9 && preparationActionId) {
    actions.push({
      payload: preparation,
      actionId: preparationActionId,
      sequence: preparationSequence,
      actionType: MOVEMENT_WEAPON_PREPARATION_ACTION_TYPE,
      owner: { source: 'movement', id: preparation.contactId },
      ownerToken: preparation.ownerToken,
      channels: ['locomotion', 'weapon'],
      startedSeconds: preparation.actionHandle
        ? unit.behaviorRuntime.physicalActionCoordinator.activeLeases.find(
          (lease) => lease.handle.actionId === preparation.actionHandle?.actionId,
        )?.startedSeconds ?? 0
        : 0,
      reasonCode: 'movement_weapon_preparation_restored',
      reasonRu: 'Подготовка оружия после движения восстановлена.',
    });
  } else if (preparation) {
    unit.movementRuntime.weaponPreparation = null;
  }

  const result = reconcilePhysicalActionCoordinatorState(unit, {
    actions,
    knownActionTypes: [
      POSTURE_TRANSITION_ACTION_TYPE,
      MOVEMENT_WEAPON_PREPARATION_ACTION_TYPE,
      'legacy_fire_action',
    ],
    reconciledSeconds: 0,
  });

  if (postureActionId && result.blockedActionIds.includes(postureActionId) && posture?.status === 'running') {
    posture.status = 'failed';
    posture.resultCode = 'posture_transition_reconciliation_blocked';
    posture.resultRu = 'Смена позы не восстановлена из-за конфликта физических каналов.';
  }
  if (preparationActionId && result.blockedActionIds.includes(preparationActionId)) {
    unit.movementRuntime.weaponPreparation = null;
  }
}

function restorePlayerMoveOrderSnapshot(unit: UnitModel, value: unknown): void {
  const snapshot = normalizeSerializedMoveOrder(value);
  if (!snapshot || snapshot.source !== 'player') return;
  if (snapshot.playerCommandId && snapshot.playerCommandId !== unit.playerCommand?.id) return;
  unit.order = restoreMoveOrder(snapshot);
}

function restoreAiRuntimeSnapshot(unit: UnitModel, value: unknown): void {
  if (value === undefined) return;
  const normalized = normalizeAiRuntimeSceneSnapshot(value, { unitId: unit.id });
  if (!normalized.snapshot) {
    unit.behaviorRuntime.aiRuntimeSession = null;
    unit.behaviorRuntime.aiRouteStatusState = null;
    unit.order = null;
    unit.behaviorRuntime.aiGraphReason = normalized.messageRu;
    unit.behaviorRuntime.reason = normalized.messageRu;
    unit.behaviorRuntime.lastEvent = 'ai_runtime_scene_reset';
    return;
  }

  unit.behaviorRuntime.aiRuntimeSession = normalized.snapshot.session;
  unit.behaviorRuntime.aiNodeCooldowns = { ...normalized.snapshot.session.cooldowns };
  unit.behaviorRuntime.aiRouteStatusState = normalized.snapshot.routeStatus ?? null;
  unit.order = normalized.snapshot.activeOrder
    ? restoreMoveOrder(normalized.snapshot.activeOrder)
    : null;
  unit.behaviorRuntime.aiGraphReason = normalized.messageRu;
  unit.behaviorRuntime.reason = normalized.messageRu;
  unit.behaviorRuntime.lastEvent = 'ai_runtime_scene_restored';
}

export function applyInitialStateToRuntime(unit: UnitModel, clearPerceptionKnowledge = true): void {
  clearWeaponRuntime(unit);
  clearCombatRuntime(unit);
  unit.infantryCombatRuntime = createInfantryCombatUnitRuntime();
  const initial = unit.initialState;
  unit.behaviorRuntime.previousPosture = initial.posture;
  unit.behaviorRuntime.posture = initial.posture;
  unit.behaviorRuntime.stress = initial.stress;
  unit.behaviorRuntime.suppression = initial.suppression;
  unit.behaviorRuntime.ammo = initial.ammo;
  unit.behaviorRuntime.weaponReady = initial.weaponReady;
  unit.behaviorRuntime.danger = 0;
  unit.behaviorRuntime.rawDanger = 0;
  unit.behaviorRuntime.state = 'idle';
  unit.behaviorRuntime.previousState = 'idle';
  unit.behaviorRuntime.currentAction = 'waiting';
  unit.behaviorRuntime.reason = 'Initial state applied.';
  unit.behaviorRuntime.lastEvent = 'initial_state_applied';
  unit.behaviorRuntime.aiGraphLastTickMs = -1;
  unit.behaviorRuntime.aiNextDecisionAtMs = 0;
  unit.behaviorRuntime.aiObserverNextPollMs = 0;
  unit.behaviorRuntime.aiDecisionTickCount = 0;
  unit.behaviorRuntime.aiObserverPollCount = 0;
  unit.behaviorRuntime.aiReactiveWakeCount = 0;
  unit.behaviorRuntime.aiLastReactiveWakeAtMs = -1;
  unit.behaviorRuntime.aiLastSimulationStep = -1;
  unit.behaviorRuntime.aiNodeCooldowns = {};
  unit.behaviorRuntime.aiRuntimeSession = null;
  unit.behaviorRuntime.aiRouteStatusState = null;
  unit.behaviorRuntime.aiSimulationEventFacts = null;
  unit.behaviorRuntime.physicalActionCoordinator = createPhysicalActionCoordinatorState();
  unit.behaviorRuntime.physicalAction = null;
  unit.soldier.condition.fatigue = initial.fatigue;
  unit.soldier.condition.morale = initial.morale;
  unit.soldier.condition.confusion = initial.confusion;
  unit.soldier.condition.health = initial.health;
  unit.attentionRuntime = createAttentionRuntime(unit.attentionSettings, unit.facingRadians);
  const movementProfileId = unit.movementRuntime?.requestedProfileId ?? DEFAULT_MOVEMENT_PROFILE_ID;
  const movementGait = unit.movementRuntime?.requestedGait ?? 'walk';
  const movementSource = unit.movementRuntime?.requestedProfileSource ?? 'default';
  unit.movementRuntime = createMovementRuntime(movementProfileId, movementGait);
  unit.movementRuntime.requestedProfileSource = movementSource;
  unit.movementRuntime.effectiveProfileSource = movementSource;
  if (clearPerceptionKnowledge) unit.perceptionKnowledge = createEmptyPerceptionKnowledge();
}

export function copyRuntimeToInitialState(unit: UnitModel): void {
  unit.initialState = createUnitInitialState(unit.soldier, {
    posture: unit.behaviorRuntime.posture,
    stress: unit.behaviorRuntime.stress,
    suppression: unit.behaviorRuntime.suppression,
    ammo: unit.behaviorRuntime.ammo,
    weaponReady: unit.behaviorRuntime.weaponReady,
    fatigue: unit.soldier.condition.fatigue,
    morale: unit.soldier.condition.morale,
    confusion: unit.soldier.condition.confusion,
    health: unit.soldier.condition.health,
  });
}

export function findUnitAtGridPosition(
  units: UnitModel[],
  gridPosition: GridPosition,
  radiusCells = 0.45,
): UnitModel | undefined {
  for (let index = units.length - 1; index >= 0; index -= 1) {
    const unit = units[index];
    const pointDistance = Math.hypot(
      unit.position.x - gridPosition.x,
      unit.position.y - gridPosition.y,
    );

    if (pointDistance <= radiusCells) return unit;
  }

  return undefined;
}

export function normalizeUnitSide(value: UnitSideInput | string | undefined): UnitSide {
  return value === 'red' ? 'red' : 'blue';
}

export function normalizeUnitAiControl(value: UnitAiControl | string | undefined): UnitAiControl {
  return value === 'manual' ? 'manual' : 'graph';
}

export function isUnitGraphAiControlled(unit: UnitModel): boolean {
  return unit.aiControl === 'graph';
}

function scalePlayerCommand(command: PlayerCommand | null, scale: number): PlayerCommand | null {
  if (!command || scale === 1) return command;
  return {
    ...command,
    target: {
      x: command.target.x * scale,
      y: command.target.y * scale,
    },
  };
}

function scalePerceptionKnowledge(knowledge: UnitPerceptionKnowledge, scale: number): UnitPerceptionKnowledge {
  if (scale === 1) return knowledge;
  return {
    ...knowledge,
    contacts: knowledge.contacts.map((contact) => ({
      ...contact,
      lastKnownPosition: {
        x: contact.lastKnownPosition.x * scale,
        y: contact.lastKnownPosition.y * scale,
      },
      uncertaintyCells: contact.uncertaintyCells * scale,
    })),
  };
}

function defaultHeldItemForUnitType(type: UnitType): UnitHeldItem {
  if (type === 'support_team') return 'support_item';
  if (type === 'scout_team') return 'short_item';
  return 'long_item';
}

function normalizeScale(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function compactUndefined<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as Partial<T>;
}

function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}
