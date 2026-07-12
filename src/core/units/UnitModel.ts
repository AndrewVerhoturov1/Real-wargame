import type { UnitPlanState } from '../ai/UnitPlan';
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
import type { PressureZoneMode } from '../pressure/PressureZone';

export type UnitSide = 'player';
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

export interface UnitData {
  id: string;
  label?: string;
  labelRu?: string;
  type: UnitType;
  side: UnitSide;
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
  initialState?: Partial<UnitInitialState>;
  tacticalKnowledge?: Partial<UnitTacticalKnowledge>;
  runtime?: Partial<Pick<UnitBehaviorRuntime, 'stress' | 'suppression' | 'ammo' | 'weaponReady' | 'posture'>>;
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
  initialState: UnitInitialState;
  tacticalKnowledge: UnitTacticalKnowledge;
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

    const model: UnitModel = {
      id: unit.id,
      labels: {
        en: fallbackLabel,
        ru: unit.labelRu ?? fallbackLabel,
      },
      type: unit.type,
      side: unit.side,
      position: {
        x: (unit.x + 0.5) * scale,
        y: (unit.y + 0.5) * scale,
      },
      speedCellsPerSecond: Math.max(0, (unit.speedCellsPerSecond ?? 0.5) * scale),
      playerCommand: null,
      plan: null,
      order: null,
      heldItem: unit.heldItem ?? defaultHeldItemForUnitType(unit.type),
      facingRadians: degreesToRadians(unit.facingDegrees ?? 0),
      viewAngleRadians: degreesToRadians(unit.viewAngleDegrees ?? 90),
      viewRangeCells: Math.max(0, (unit.viewRangeCells ?? 7) * scale),
      behaviorProfile,
      behaviorSettings: createBehaviorSettings(behaviorProfile, unit.behavior),
      behaviorRuntime,
      soldier,
      initialState,
      tacticalKnowledge: unit.tacticalKnowledge
        ? normalizeTacticalKnowledge(unit.tacticalKnowledge, scale)
        : createEmptyTacticalKnowledge(),
      unitRoleNavigationProfileId: unit.navigationProfileId ?? null,
      playerNavigationProfileId: initialNavigationProfile,
      navigationMovementMode: unit.navigationMovementMode ?? null,
      activeNavigationProfileId: initialNavigationProfile,
      activeNavigationProfileSource: unit.navigationProfileId ? 'unitRole' : 'default',
    };
    applyInitialStateToRuntime(model);
    return model;
  });
}

export function applyInitialStateToRuntime(unit: UnitModel): void {
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
  unit.soldier.condition.fatigue = initial.fatigue;
  unit.soldier.condition.morale = initial.morale;
  unit.soldier.condition.confusion = initial.confusion;
  unit.soldier.condition.health = initial.health;
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
