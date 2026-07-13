import type { UnitPlanState } from '../ai/UnitPlan';
import { initializeSimulationAiEventFacts } from '../ai/events/SimulationAiEvents';
import {
  normalizeAiRuntimeSceneSnapshot,
  restoreMoveOrder,
  type AiRuntimeSceneSnapshotV1,
} from '../ai/runtime/AiRuntimeSnapshot';
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
import type { GridPosition } from '../geometry';
import { createEmptyTacticalKnowledge, normalizeTacticalKnowledge } from '../knowledge/SoldierThreatMemory';
import type { NavigationProfileSource } from '../navigation/NavigationProfileResolver';
import type { NavigationMovementMode } from '../navigation/NavigationProfiles';
import type { MoveOrder } from '../orders/MoveOrder';
import type { PlayerCommand } from '../orders/PlayerCommand';
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

export type UnitSide = 'blue' | 'red';
export type UnitSideInput = UnitSide | 'player';
export type UnitType = 'infantry_squad' | 'scout_team' | 'support_team';
export type UnitHeldItem = 'long_item' | 'support_item' | 'short_item';
export type ThreatMemorySource = 'seen' | 'heard' | 'reported' | 'fire_pressure';

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
}

export interface UnitTacticalKnowledge {
  threats: KnownThreatMemory[];
  revision: number;
  lastUpdatedSeconds: number;
}

export interface UnitRuntimeData extends Partial<Pick<UnitBehaviorRuntime, 'stress' | 'suppression' | 'ammo' | 'weaponReady' | 'posture'>> {
  aiRuntime?: AiRuntimeSceneSnapshotV1;
}

export interface UnitData {
  id: string;
  label?: string;
  labelRu?: string;
  type: UnitType;
  side: UnitSideInput;
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
  initialState?: Partial<UnitInitialState>;
  tacticalKnowledge?: Partial<UnitTacticalKnowledge>;
  perceptionKnowledge?: Partial<UnitPerceptionKnowledge>;
  runtime?: UnitRuntimeData;
  navigationProfileId?: string;
  navigationMovementMode?: NavigationMovementMode;
}

export interface UnitModel {
  id: string;
  labels: {
    en: string;
    ru: string;
  };
  type: UnitType;
  side: UnitSide;
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
  initialState: UnitInitialState;
  tacticalKnowledge: UnitTacticalKnowledge;
  perceptionKnowledge: UnitPerceptionKnowledge;
  unitRoleNavigationProfileId?: string | null;
  playerNavigationProfileId?: string | null;
  navigationMovementMode?: NavigationMovementMode | null;
  activeNavigationProfileId?: string;
  activeNavigationProfileSource?: NavigationProfileSource;
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

    const model: UnitModel = {
      id: unit.id,
      labels: {
        en: fallbackLabel,
        ru: unit.labelRu ?? fallbackLabel,
      },
      type: unit.type,
      side: normalizeUnitSide(unit.side),
      position: {
        x: (unit.x + 0.5) * scale,
        y: (unit.y + 0.5) * scale,
      },
      speedCellsPerSecond: Math.max(0, (unit.speedCellsPerSecond ?? 0.5) * scale),
      playerCommand: null,
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
      initialState,
      tacticalKnowledge: unit.tacticalKnowledge
        ? normalizeTacticalKnowledge(unit.tacticalKnowledge, scale)
        : createEmptyTacticalKnowledge(),
      perceptionKnowledge: importedPerceptionKnowledge,
      unitRoleNavigationProfileId: unit.navigationProfileId ?? null,
      playerNavigationProfileId: initialNavigationProfile,
      navigationMovementMode: unit.navigationMovementMode ?? null,
      activeNavigationProfileId: initialNavigationProfile,
      activeNavigationProfileSource: unit.navigationProfileId ? 'unitRole' : 'default',
    };
    applyInitialStateToRuntime(model, false);
    restoreAiRuntimeSnapshot(model, unit.runtime?.aiRuntime);
    initializeSimulationAiEventFacts(model);
    return model;
  });
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
  unit.behaviorRuntime.aiNodeCooldowns = {};
  unit.behaviorRuntime.aiRuntimeSession = null;
  unit.behaviorRuntime.aiRouteStatusState = null;
  unit.behaviorRuntime.aiSimulationEventFacts = null;
  unit.soldier.condition.fatigue = initial.fatigue;
  unit.soldier.condition.morale = initial.morale;
  unit.soldier.condition.confusion = initial.confusion;
  unit.soldier.condition.health = initial.health;
  unit.attentionRuntime = createAttentionRuntime(unit.attentionSettings, unit.facingRadians);
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
