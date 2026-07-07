import {
  createBehaviorRuntime,
  createBehaviorSettings,
  normalizeBehaviorProfileId,
  type BehaviorProfileId,
  type BehaviorSettings,
  type UnitBehaviorRuntime,
} from '../behavior/BehaviorModel';
import type { GridPosition } from '../geometry';
import type { MoveOrder } from '../orders/MoveOrder';

export type UnitSide = 'player';
export type UnitType = 'infantry_squad' | 'scout_team' | 'support_team';
export type UnitHeldItem = 'long_item' | 'support_item' | 'short_item';

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
  order: MoveOrder | null;
  heldItem: UnitHeldItem;
  facingRadians: number;
  viewAngleRadians: number;
  viewRangeCells: number;
  behaviorProfile: BehaviorProfileId;
  behaviorSettings: BehaviorSettings;
  behaviorRuntime: UnitBehaviorRuntime;
}

export function normalizeUnits(data: UnitData[]): UnitModel[] {
  return data.map((unit) => {
    const fallbackLabel = unit.label ?? unit.id;
    const behaviorProfile = normalizeBehaviorProfileId(unit.behaviorProfile);

    return {
      id: unit.id,
      labels: {
        en: fallbackLabel,
        ru: unit.labelRu ?? fallbackLabel,
      },
      type: unit.type,
      side: unit.side,
      position: {
        x: unit.x + 0.5,
        y: unit.y + 0.5,
      },
      speedCellsPerSecond: unit.speedCellsPerSecond ?? 2.2,
      order: null,
      heldItem: unit.heldItem ?? defaultHeldItemForUnitType(unit.type),
      facingRadians: degreesToRadians(unit.facingDegrees ?? 0),
      viewAngleRadians: degreesToRadians(unit.viewAngleDegrees ?? 90),
      viewRangeCells: unit.viewRangeCells ?? 7,
      behaviorProfile,
      behaviorSettings: createBehaviorSettings(behaviorProfile, unit.behavior),
      behaviorRuntime: createBehaviorRuntime(),
    };
  });
}

export function findUnitAtGridPosition(
  units: UnitModel[],
  gridPosition: GridPosition,
  radiusCells = 0.45,
): UnitModel | undefined {
  for (let index = units.length - 1; index >= 0; index -= 1) {
    const unit = units[index];
    const distance = Math.hypot(
      unit.position.x - gridPosition.x,
      unit.position.y - gridPosition.y,
    );

    if (distance <= radiusCells) {
      return unit;
    }
  }

  return undefined;
}

function defaultHeldItemForUnitType(type: UnitType): UnitHeldItem {
  if (type === 'support_team') {
    return 'support_item';
  }

  if (type === 'scout_team') {
    return 'short_item';
  }

  return 'long_item';
}

function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}
