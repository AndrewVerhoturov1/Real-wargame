import { distance, type GridPosition } from '../geometry';
import {
  clampGridPositionToMap,
  normalizeMap,
  type MapObject,
  type MapObjectKind,
  type TacticalMap,
  type TacticalMapData,
} from '../map/MapModel';
import { createMoveOrder } from '../orders/MoveOrder';
import {
  getPressureReportAtPosition,
  normalizePressureZones,
  type PressureZone,
  type PressureZoneData,
  type PressureZoneShape,
} from '../pressure/PressureZone';
import { findUnitAtGridPosition, normalizeUnits, type UnitData, type UnitModel, type UnitType } from '../units/UnitModel';

export interface SelectionBox {
  start: GridPosition;
  current: GridPosition;
}

export type EditorTool = 'select' | 'spawn_object' | 'spawn_unit' | 'spawn_zone' | 'delete';
export type EditorResizeHandle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
export type EditorDragMode =
  | 'move_object'
  | 'move_unit'
  | 'resize_object'
  | 'rotate_object'
  | 'move_zone'
  | 'resize_zone';

export interface EditorLayers {
  objects: boolean;
  units: boolean;
  pressureZones: boolean;
}

export interface EditorObjectSnapshot {
  x: number;
  y: number;
  widthCells: number;
  heightCells: number;
  rotationRadians: number;
}

export interface EditorZoneSnapshot {
  x: number;
  y: number;
  shape: PressureZoneShape;
  radiusCells: number;
  widthCells: number;
  heightCells: number;
}

export interface EditorUnitSnapshot {
  position: GridPosition;
}

export interface EditorDragState {
  mode: EditorDragMode;
  objectId?: string;
  unitId?: string;
  zoneId?: string;
  resizeHandle?: EditorResizeHandle;
  startGrid: GridPosition;
  startObject?: EditorObjectSnapshot;
  startZone?: EditorZoneSnapshot;
  startUnit?: EditorUnitSnapshot;
}

export interface EditorState {
  enabled: boolean;
  panelOpen: boolean;
  tool: EditorTool;
  objectKind: MapObjectKind;
  unitType: UnitType;
  zoneShape: PressureZoneShape;
  zoneRadiusCells: number;
  zoneWidthCells: number;
  zoneHeightCells: number;
  zoneStrength: number;
  zoneStressPerSecond: number;
  objectWidthCells: number;
  objectHeightCells: number;
  objectRotationDegrees: number;
  selectedObjectId: string | null;
  selectedZoneId: string | null;
  layers: EditorLayers;
  drag: EditorDragState | null;
  nextObjectIndex: number;
  nextUnitIndex: number;
  nextZoneIndex: number;
  lastMessage: string;
}

export interface SimulationState {
  map: TacticalMap;
  units: UnitModel[];
  pressureZones: PressureZone[];
  selectedUnitId: string | null;
  selectedUnitIds: string[];
  mouseGridPosition: GridPosition | null;
  selectionBox: SelectionBox | null;
  paused: boolean;
  editor: EditorState;
}

export function createInitialState(
  mapData: TacticalMapData,
  unitsData: UnitData[],
  pressureZoneData: PressureZoneData[] = [],
): SimulationState {
  return {
    map: normalizeMap(mapData),
    units: normalizeUnits(unitsData),
    pressureZones: normalizePressureZones(pressureZoneData),
    selectedUnitId: null,
    selectedUnitIds: [],
    mouseGridPosition: null,
    selectionBox: null,
    paused: false,
    editor: {
      enabled: false,
      panelOpen: false,
      tool: 'select',
      objectKind: 'tree',
      unitType: 'infantry_squad',
      zoneShape: 'circle',
      zoneRadiusCells: 3,
      zoneWidthCells: 5,
      zoneHeightCells: 3,
      zoneStrength: 50,
      zoneStressPerSecond: 15,
      objectWidthCells: 1,
      objectHeightCells: 1,
      objectRotationDegrees: 0,
      selectedObjectId: null,
      selectedZoneId: null,
      layers: {
        objects: true,
        units: true,
        pressureZones: true,
      },
      drag: null,
      nextObjectIndex: 1,
      nextUnitIndex: 1,
      nextZoneIndex: 1,
      lastMessage: 'Редактор выключен.',
    },
  };
}

export function getSelectedUnit(state: SimulationState): UnitModel | undefined {
  if (state.selectedUnitId === null) {
    return undefined;
  }

  return state.units.find((unit) => unit.id === state.selectedUnitId);
}
