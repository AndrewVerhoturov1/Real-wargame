import { getGameEditorDrafts } from '../editor/GameEditorDrafts';
import { distance, type GridPosition } from '../geometry';
import {
  clampGridPositionToMap,
  normalizeMap,
  type MapObject,
  type MapObjectKind,
  type TacticalMap,
  type TacticalMapData,
} from '../map/MapModel';
import { createMovementProfileRegistry, type MovementProfileRegistry } from '../movement/MovementProfiles';
import { createMoveOrder } from '../orders/MoveOrder';
import {
  getPressureReportAtPosition,
  normalizePressureZones,
  type PressureZone,
  type PressureZoneData,
  type PressureZoneShape,
} from '../pressure/PressureZone';
import { findUnitAtGridPosition, normalizeUnits, type UnitData, type UnitModel, type UnitSide, type UnitType } from '../units/UnitModel';

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
  unitSide: UnitSide;
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
  movementProfiles: MovementProfileRegistry;
  selectedUnitId: string | null;
  selectedUnitIds: string[];
  mouseGridPosition: GridPosition | null;
  selectionBox: SelectionBox | null;
  simulationTimeSeconds: number;
  simulationStep: number;
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
    movementProfiles: createMovementProfileRegistry(),
    selectedUnitId: null,
    selectedUnitIds: [],
    mouseGridPosition: null,
    selectionBox: null,
    simulationTimeSeconds: 0,
    simulationStep: 0,
    editor: {
      enabled: false,
      panelOpen: false,
      tool: 'select',
      objectKind: 'tree',
      unitType: 'infantry_squad',
      unitSide: 'blue',
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

export function getSelectedUnits(state: SimulationState): UnitModel[] {
  const selectedIds = new Set(state.selectedUnitIds);
  return state.units.filter((unit) => selectedIds.has(unit.id));
}

export function getSelectedMapObject(state: SimulationState): MapObject | undefined {
  if (state.editor.selectedObjectId === null) {
    return undefined;
  }

  return state.map.objects.find((object) => object.id === state.editor.selectedObjectId);
}

export function getSelectedPressureZone(state: SimulationState): PressureZone | undefined {
  if (state.editor.selectedZoneId === null) {
    return undefined;
  }

  return state.pressureZones.find((zone) => zone.id === state.editor.selectedZoneId);
}

export function selectUnit(state: SimulationState, unitId: string | null): void {
  state.selectedUnitId = unitId;
  state.selectedUnitIds = unitId ? [unitId] : [];
}

export function selectUnits(state: SimulationState, unitIds: string[]): void {
  const uniqueIds = [...new Set(unitIds)];
  state.selectedUnitIds = uniqueIds;
  state.selectedUnitId = uniqueIds[0] ?? null;
}

export function selectUnitsInBox(state: SimulationState, box: SelectionBox): void {
  selectUnits(
    state,
    state.units
      .filter((unit) => isInsideBox(unit.position, box))
      .map((unit) => unit.id),
  );
}

export function setMouseGridPosition(state: SimulationState, position: GridPosition | null): void {
  state.mouseGridPosition = position;
}

export function startSelectionBox(state: SimulationState, start: GridPosition): void {
  state.selectionBox = { start, current: start };
}

export function updateSelectionBox(state: SimulationState, current: GridPosition): void {
  if (state.selectionBox) {
    state.selectionBox = { start: state.selectionBox.start, current };
  }
}

export function clearSelectionBox(state: SimulationState): void {
  state.selectionBox = null;
}

export function issueMoveOrderToSelectedUnit(
  state: SimulationState,
  rawTarget: GridPosition,
): void {
  const selectedUnits = getSelectedUnits(state);

  if (selectedUnits.length === 0) {
    return;
  }

  const target = clampGridPositionToMap(state.map, rawTarget);
  const center = getSelectionCenter(selectedUnits);

  for (const unit of selectedUnits) {
    const unitTarget = selectedUnits.length === 1
      ? target
      : clampGridPositionToMap(state.map, {
          x: target.x + unit.position.x - center.x,
          y: target.y + unit.position.y - center.y,
        });

    unit.order = createMoveOrder(unitTarget);
    unit.behaviorRuntime.lastEvent = 'move_order_received';
    unit.behaviorRuntime.reason = 'Move order received.';
    applyPressurePreview(state, unit, unitTarget);
    setUnitDirection(unit, unitTarget);
  }
}

export function beginEditorPointerAction(state: SimulationState, rawGrid: GridPosition): void {
  const grid = clampGridPositionToMap(state.map, rawGrid);

  if (!state.editor.enabled) {
    return;
  }

  state.editor.drag = null;

  switch (state.editor.tool) {
    case 'spawn_object':
      spawnEditorObject(state, grid);
      return;
    case 'spawn_unit':
      spawnEditorUnit(state, grid);
      return;
    case 'spawn_zone':
      spawnEditorZone(state, grid);
      return;
    case 'delete':
      deleteEditorTargetAt(state, grid);
      return;
    case 'select':
    default:
      beginSelectOrTransformAction(state, grid);
      return;
  }
}

export function updateEditorPointerAction(state: SimulationState, rawGrid: GridPosition): void {
  const drag = state.editor.drag;

  if (!drag) {
    return;
  }

  const grid = clampGridPositionToMap(state.map, rawGrid);

  switch (drag.mode) {
    case 'move_object':
      dragSelectedObject(state, drag, grid);
      return;
    case 'move_unit':
      dragSelectedUnit(state, drag, grid);
      return;
    case 'resize_object':
      dragResizeObject(state, drag, grid);
      return;
    case 'rotate_object':
      dragRotateObject(state, drag, grid);
      return;
    case 'move_zone':
      dragSelectedZone(state, drag, grid);
      return;
    case 'resize_zone':
      dragResizeZone(state, drag, grid);
      return;
  }
}

export function finishEditorPointerAction(state: SimulationState, rawGrid: GridPosition): void {
  if (state.editor.drag) {
    updateEditorPointerAction(state, rawGrid);
    state.editor.drag = null;
  }
}

export function cancelEditorPointerAction(state: SimulationState): void {
  state.editor.drag = null;
}

export function handleEditorClick(state: SimulationState, rawGrid: GridPosition): void {
  beginEditorPointerAction(state, rawGrid);
  finishEditorPointerAction(state, rawGrid);
}

export function updateSelectedEditorObject(state: SimulationState, changes: Partial<Pick<MapObject, 'widthCells' | 'heightCells' | 'rotationRadians'>>): void {
  const object = getSelectedMapObject(state);

  if (!object) {
    state.editor.lastMessage = 'Предмет не выбран.';
    return;
  }

  Object.assign(object, changes);
  state.editor.objectWidthCells = object.widthCells;
  state.editor.objectHeightCells = object.heightCells;
  state.editor.objectRotationDegrees = Math.round(radiansToDegrees(object.rotationRadians));
  state.editor.lastMessage = `Предмет изменён: ${object.id}`;
}

export function updateSelectedEditorZone(state: SimulationState, changes: Partial<Pick<PressureZone, 'shape' | 'radiusCells' | 'widthCells' | 'heightCells' | 'strength' | 'stressPerSecond'>>): void {
  const zone = getSelectedPressureZone(state);

  if (!zone) {
    state.editor.lastMessage = 'Зона не выбрана.';
    return;
  }

  Object.assign(zone, changes);
  syncZoneEditorNumbers(state, zone);
  state.editor.lastMessage = `Зона изменена: ${zone.id}`;
}

export function nudgeSelectedEditorObject(state: SimulationState, dx: number, dy: number): void {
  const object = getSelectedMapObject(state);

  if (!object) {
    state.editor.lastMessage = 'Предмет не выбран.';
    return;
  }

  const center = clampGridPositionToMap(state.map, {
    x: object.x + 0.5 + dx,
    y: object.y + 0.5 + dy,
  });
  object.x = center.x - 0.5;
  object.y = center.y - 0.5;
  state.editor.lastMessage = `Предмет сдвинут: ${object.id}`;
}

export function nudgeSelectedEditorZone(state: SimulationState, dx: number, dy: number): void {
  const zone = getSelectedPressureZone(state);

  if (!zone) {
    state.editor.lastMessage = 'Зона не выбрана.';
    return;
  }

  const center = clampGridPositionToMap(state.map, {
    x: zone.x + dx,
    y: zone.y + dy,
  });
  zone.x = center.x;
  zone.y = center.y;
  state.editor.lastMessage = `Зона сдвинута: ${zone.id}`;
}

export function resizeSelectedEditorObject(state: SimulationState, widthDelta: number, heightDelta: number): void {
  const object = getSelectedMapObject(state);

  if (!object) {
    state.editor.lastMessage = 'Предмет не выбран.';
    return;
  }

  object.widthCells = clampNumber(object.widthCells + widthDelta, 0.1, 20);
  object.heightCells = clampNumber(object.heightCells + heightDelta, 0.1, 20);
  state.editor.objectWidthCells = object.widthCells;
  state.editor.objectHeightCells = object.heightCells;
  state.editor.lastMessage = `Размер изменён: ${object.id}`;
}

export function rotateSelectedEditorObject(state: SimulationState, degreesDelta: number): void {
  const object = getSelectedMapObject(state);

  if (!object) {
    state.editor.lastMessage = 'Предмет не выбран.';
    return;
  }

  object.rotationRadians += degreesToRadians(degreesDelta);
  state.editor.objectRotationDegrees = Math.round(radiansToDegrees(object.rotationRadians));
  state.editor.lastMessage = `Поворот изменён: ${object.id}`;
}

export function deleteSelectedEditorTargets(state: SimulationState): void {
  if (state.editor.selectedObjectId) {
    const objectId = state.editor.selectedObjectId;
    state.map.objects = state.map.objects.filter((object) => object.id !== objectId);
    state.editor.selectedObjectId = null;
    state.editor.drag = null;
    state.editor.lastMessage = `Предмет удалён: ${objectId}`;
    return;
  }

  if (state.selectedUnitId) {
    const unitId = state.selectedUnitId;
    state.units = state.units.filter((unit) => unit.id !== unitId);
    selectUnit(state, null);
    state.editor.drag = null;
    state.editor.lastMessage = `Юнит удалён: ${unitId}`;
    return;
  }

  if (state.editor.selectedZoneId) {
    const zoneId = state.editor.selectedZoneId;
    state.pressureZones = state.pressureZones.filter((zone) => zone.id !== zoneId);
    state.editor.selectedZoneId = null;
    state.editor.drag = null;
    state.editor.lastMessage = `Зона удалена: ${zoneId}`;
    return;
  }

  state.editor.lastMessage = 'Нечего удалить.';
}

export function clearEditorScene(state: SimulationState): void {
  state.map.objects = [];
  state.units = [];
  state.pressureZones = [];
  state.editor.selectedObjectId = null;
  state.editor.selectedZoneId = null;
  state.editor.drag = null;
  selectUnit(state, null);
  state.editor.lastMessage = 'Все предметы, юниты и зоны очищены.';
}

function beginSelectOrTransformAction(state: SimulationState, grid: GridPosition): void {
  if (state.editor.layers.objects) {
    const selectedObject = getSelectedMapObject(state);

    if (selectedObject) {
      const handle = getObjectHandleAtPosition(state.map, selectedObject, grid);

      if (handle === 'rotate') {
        state.editor.drag = createObjectDragState(selectedObject, grid, 'rotate_object');
        state.editor.lastMessage = `Потяни круглую ручку, чтобы вращать: ${selectedObject.id}`;
        return;
      }

      if (handle) {
        state.editor.drag = createObjectDragState(selectedObject, grid, 'resize_object', handle);
        state.editor.lastMessage = `Потяни квадратную ручку, чтобы менять размер: ${selectedObject.id}`;
        return;
      }

      if (isPositionInsideObject(grid, selectedObject)) {
        state.editor.drag = createObjectDragState(selectedObject, grid, 'move_object');
        state.editor.lastMessage = `Потяни предмет, чтобы переместить: ${selectedObject.id}`;
        return;
      }
    }

    const object = findMapObjectAtGridPosition(state, grid);

    if (object) {
      selectObjectForEditing(state, object);
      state.editor.drag = createObjectDragState(object, grid, 'move_object');
      state.editor.lastMessage = `Выбран предмет. Потяни его, чтобы переместить: ${object.id}`;
      return;
    }
  }

  if (state.editor.layers.units) {
    const unit = findUnitAtGridPosition(state.units, grid);

    if (unit) {
      state.editor.selectedObjectId = null;
      state.editor.selectedZoneId = null;
      selectUnit(state, unit.id);
      state.editor.drag = {
        mode: 'move_unit',
        unitId: unit.id,
        startGrid: grid,
        startUnit: {
          position: { ...unit.position },
        },
      };
      state.editor.lastMessage = `Выбран юнит. Потяни его, чтобы переместить: ${unit.id}`;
      return;
    }
  }

  if (state.editor.layers.pressureZones) {
    const selectedZone = getSelectedPressureZone(state);

    if (selectedZone) {
      const handle = getZoneHandleAtPosition(selectedZone, grid);

      if (handle) {
        state.editor.drag = createZoneDragState(selectedZone, grid, 'resize_zone', handle);
        state.editor.lastMessage = `Потяни ручку зоны, чтобы изменить размер: ${selectedZone.id}`;
        return;
      }

      if (isPositionInsideZone(grid, selectedZone)) {
        state.editor.drag = createZoneDragState(selectedZone, grid, 'move_zone');
        state.editor.lastMessage = `Потяни зону, чтобы переместить: ${selectedZone.id}`;
        return;
      }
    }

    const zone = findPressureZoneAtGridPosition(state, grid);

    if (zone) {
      selectZoneForEditing(state, zone);
      state.editor.drag = createZoneDragState(zone, grid, 'move_zone');
      state.editor.lastMessage = `Выбрана зона. Потяни её, чтобы переместить: ${zone.id}`;
      return;
    }
  }

  state.editor.selectedObjectId = null;
  state.editor.selectedZoneId = null;
  selectUnit(state, null);
  state.editor.lastMessage = 'Ничего не выбрано.';
}

function createObjectDragState(
  object: MapObject,
  startGrid: GridPosition,
  mode: EditorDragMode,
  resizeHandle?: EditorResizeHandle,
): EditorDragState {
  return {
    mode,
    objectId: object.id,
    resizeHandle,
    startGrid,
    startObject: {
      x: object.x,
      y: object.y,
      widthCells: object.widthCells,
      heightCells: object.heightCells,
      rotationRadians: object.rotationRadians,
    },
  };
}

function createZoneDragState(
  zone: PressureZone,
  startGrid: GridPosition,
  mode: EditorDragMode,
  resizeHandle?: EditorResizeHandle,
): EditorDragState {
  return {
    mode,
    zoneId: zone.id,
    resizeHandle,
    startGrid,
    startZone: {
      x: zone.x,
      y: zone.y,
      shape: zone.shape,
      radiusCells: zone.radiusCells,
      widthCells: zone.widthCells,
      heightCells: zone.heightCells,
    },
  };
}

function dragSelectedObject(state: SimulationState, drag: EditorDragState, grid: GridPosition): void {
  const object = drag.objectId ? state.map.objects.find((item) => item.id === drag.objectId) : undefined;

  if (!object || !drag.startObject) {
    return;
  }

  const center = clampGridPositionToMap(state.map, {
    x: drag.startObject.x + 0.5 + grid.x - drag.startGrid.x,
    y: drag.startObject.y + 0.5 + grid.y - drag.startGrid.y,
  });

  object.x = center.x - 0.5;
  object.y = center.y - 0.5;
  state.editor.lastMessage = `Предмет перемещается: ${object.id}`;
}

function dragSelectedUnit(state: SimulationState, drag: EditorDragState, grid: GridPosition): void {
  const unit = drag.unitId ? state.units.find((item) => item.id === drag.unitId) : undefined;

  if (!unit || !drag.startUnit) {
    return;
  }

  unit.position = clampGridPositionToMap(state.map, {
    x: drag.startUnit.position.x + grid.x - drag.startGrid.x,
    y: drag.startUnit.position.y + grid.y - drag.startGrid.y,
  });
  unit.order = null;
  state.editor.lastMessage = `Юнит перемещается: ${unit.id}`;
}

function dragSelectedZone(state: SimulationState, drag: EditorDragState, grid: GridPosition): void {
  const zone = drag.zoneId ? state.pressureZones.find((item) => item.id === drag.zoneId) : undefined;

  if (!zone || !drag.startZone) {
    return;
  }

  const center = clampGridPositionToMap(state.map, {
    x: drag.startZone.x + grid.x - drag.startGrid.x,
    y: drag.startZone.y + grid.y - drag.startGrid.y,
  });

  zone.x = center.x;
  zone.y = center.y;
  state.editor.lastMessage = `Зона перемещается: ${zone.id}`;
}

function dragResizeObject(state: SimulationState, drag: EditorDragState, grid: GridPosition): void {
  const object = drag.objectId ? state.map.objects.find((item) => item.id === drag.objectId) : undefined;

  if (!object || !drag.startObject || !drag.resizeHandle) {
    return;
  }

  const center = getObjectCenter(drag.startObject);
  const local = toLocalObjectPoint(grid, center, drag.startObject.rotationRadians);
  let nextWidth = drag.startObject.widthCells;
  let nextHeight = drag.startObject.heightCells;

  if (drag.resizeHandle.includes('e') || drag.resizeHandle.includes('w')) {
    nextWidth = Math.abs(local.x) * 2;
  }

  if (drag.resizeHandle.includes('n') || drag.resizeHandle.includes('s')) {
    nextHeight = Math.abs(local.y) * 2;
  }

  object.widthCells = clampNumber(nextWidth, 0.1, 20);
  object.heightCells = clampNumber(nextHeight, 0.1, 20);
  state.editor.objectWidthCells = roundOne(object.widthCells);
  state.editor.objectHeightCells = roundOne(object.heightCells);
  state.editor.lastMessage = `Размер меняется: ${object.id}`;
}

function dragResizeZone(state: SimulationState, drag: EditorDragState, grid: GridPosition): void {
  const zone = drag.zoneId ? state.pressureZones.find((item) => item.id === drag.zoneId) : undefined;

  if (!zone || !drag.startZone || !drag.resizeHandle) {
    return;
  }

  if (drag.startZone.shape === 'circle') {
    zone.radiusCells = clampNumber(distance(grid, { x: drag.startZone.x, y: drag.startZone.y }), 0.5, 30);
    state.editor.zoneRadiusCells = roundOne(zone.radiusCells);
    state.editor.lastMessage = `Радиус зоны меняется: ${zone.id}`;
    return;
  }

  const localX = grid.x - drag.startZone.x;
  const localY = grid.y - drag.startZone.y;
  let nextWidth = drag.startZone.widthCells;
  let nextHeight = drag.startZone.heightCells;

  if (drag.resizeHandle.includes('e') || drag.resizeHandle.includes('w')) {
    nextWidth = Math.abs(localX) * 2;
  }

  if (drag.resizeHandle.includes('n') || drag.resizeHandle.includes('s')) {
    nextHeight = Math.abs(localY) * 2;
  }

  zone.widthCells = clampNumber(nextWidth, 0.5, 40);
  zone.heightCells = clampNumber(nextHeight, 0.5, 40);
  state.editor.zoneWidthCells = roundOne(zone.widthCells);
  state.editor.zoneHeightCells = roundOne(zone.heightCells);
  state.editor.lastMessage = `Размер зоны меняется: ${zone.id}`;
}

function dragRotateObject(state: SimulationState, drag: EditorDragState, grid: GridPosition): void {
  const object = drag.objectId ? state.map.objects.find((item) => item.id === drag.objectId) : undefined;

  if (!object || !drag.startObject) {
    return;
  }

  const center = getObjectCenter(drag.startObject);
  const startAngle = Math.atan2(drag.startGrid.y - center.y, drag.startGrid.x - center.x);
  const currentAngle = Math.atan2(grid.y - center.y, grid.x - center.x);
  object.rotationRadians = drag.startObject.rotationRadians + currentAngle - startAngle;
  state.editor.objectRotationDegrees = Math.round(radiansToDegrees(object.rotationRadians));
  state.editor.lastMessage = `Поворот меняется: ${object.id}`;
}

function spawnEditorObject(state: SimulationState, grid: GridPosition): void {
  if (!state.editor.layers.objects) {
    state.editor.lastMessage = 'Слой предметов скрыт. Включи слой, чтобы создавать предметы.';
    return;
  }

  const index = state.editor.nextObjectIndex;
  const id = `editor_object_${index}`;

  state.map.objects.push({
    id,
    kind: state.editor.objectKind,
    x: grid.x - 0.5,
    y: grid.y - 0.5,
    rotationRadians: degreesToRadians(state.editor.objectRotationDegrees),
    widthCells: state.editor.objectWidthCells,
    heightCells: state.editor.objectHeightCells,
    labels: {
      en: id,
      ru: `Предмет ${index}`,
    },
  });

  state.editor.nextObjectIndex = index + 1;
  state.editor.selectedObjectId = id;
  state.editor.selectedZoneId = null;
  state.editor.drag = null;
  selectUnit(state, null);
  state.editor.lastMessage = `Создан предмет: ${id}`;
}

function spawnEditorUnit(state: SimulationState, grid: GridPosition): void {
  if (!state.editor.layers.units) {
    state.editor.lastMessage = 'Слой юнитов скрыт. Включи слой, чтобы создавать юнитов.';
    return;
  }

  const index = state.editor.nextUnitIndex;
  const id = `editor_unit_${index}`;
  const draft = getGameEditorDrafts(state).unit;
  const label = draft.name.trim() || `Юнит ${index}`;
  const [unit] = normalizeUnits([
    {
      id,
      label,
      labelRu: label,
      type: draft.type,
      side: draft.side,
      aiControl: 'graph',
      x: Math.max(0, Math.floor(grid.x)),
      y: Math.max(0, Math.floor(grid.y)),
      speedCellsPerSecond: draft.speedCellsPerSecond,
      heldItem: draft.heldItem,
      facingDegrees: draft.facingDegrees,
      viewAngleDegrees: draft.viewAngleDegrees,
      viewRangeCells: draft.viewRangeCells,
      behaviorProfile: draft.profile,
      soldier: {
        traits: { ...draft.traits },
        condition: { ...draft.condition },
      },
      attention: draft.attention,
      initialState: {
        posture: draft.posture,
        stress: draft.stress,
        suppression: draft.suppression,
        ammo: Math.round(draft.ammo),
        weaponReady: draft.weaponReady,
      },
    },
  ]);

  unit.position = grid;
  state.units.push(unit);
  state.editor.nextUnitIndex = index + 1;
  state.editor.selectedObjectId = null;
  state.editor.selectedZoneId = null;
  state.editor.drag = null;
  selectUnit(state, id);
  state.editor.lastMessage = `Создан боец: ${label} · ${draft.side === 'red' ? 'Противник' : 'Свои'}`;
}

function spawnEditorZone(state: SimulationState, grid: GridPosition): void {
  if (!state.editor.layers.pressureZones) {
    state.editor.lastMessage = 'Слой зон скрыт. Включи слой, чтобы создавать зоны.';
    return;
  }

  const index = state.editor.nextZoneIndex;
  const id = `editor_zone_${index}`;
  state.pressureZones.push({
    id,
    labels: {
      en: id,
      ru: `Зона ${index}`,
    },
    type: 'debug',
    shape: state.editor.zoneShape,
    x: grid.x,
    y: grid.y,
    radiusCells: state.editor.zoneShape === 'circle' ? state.editor.zoneRadiusCells : 0,
    widthCells: state.editor.zoneShape === 'rect' ? state.editor.zoneWidthCells : 0,
    heightCells: state.editor.zoneShape === 'rect' ? state.editor.zoneHeightCells : 0,
    strength: clampNumber(state.editor.zoneStrength, 0, 100),
    stressPerSecond: Math.max(0, state.editor.zoneStressPerSecond),
    reasons: {
      en: 'Editor zone',
      ru: 'Зона редактора',
    },
  });

  state.editor.nextZoneIndex = index + 1;
  state.editor.selectedObjectId = null;
  state.editor.selectedZoneId = id;
  state.editor.drag = null;
  selectUnit(state, null);
  state.editor.lastMessage = `Создана зона: ${id}`;
}

function selectEditorTargetAt(state: SimulationState, grid: GridPosition): void {
  if (state.editor.layers.objects) {
    const object = findMapObjectAtGridPosition(state, grid);

    if (object) {
      selectObjectForEditing(state, object);
      state.editor.lastMessage = `Выбран предмет: ${object.id}`;
      return;
    }
  }

  if (state.editor.layers.units) {
    const unit = findUnitAtGridPosition(state.units, grid);
    state.editor.selectedObjectId = null;
    state.editor.selectedZoneId = null;
    selectUnit(state, unit?.id ?? null);
    state.editor.lastMessage = unit ? `Выбран юнит: ${unit.id}` : 'Ничего не выбрано.';
    return;
  }

  if (state.editor.layers.pressureZones) {
    const zone = findPressureZoneAtGridPosition(state, grid);

    if (zone) {
      selectZoneForEditing(state, zone);
      state.editor.lastMessage = `Выбрана зона: ${zone.id}`;
      return;
    }
  }

  state.editor.selectedObjectId = null;
  state.editor.selectedZoneId = null;
  selectUnit(state, null);
  state.editor.lastMessage = 'Ничего не выбрано.';
}

function deleteEditorTargetAt(state: SimulationState, grid: GridPosition): void {
  if (state.editor.layers.objects) {
    const object = findMapObjectAtGridPosition(state, grid);

    if (object) {
      state.map.objects = state.map.objects.filter((item) => item.id !== object.id);
      state.editor.selectedObjectId = null;
      state.editor.drag = null;
      state.editor.lastMessage = `Предмет удалён: ${object.id}`;
      return;
    }
  }

  if (state.editor.layers.units) {
    const unit = findUnitAtGridPosition(state.units, grid);

    if (unit) {
      state.units = state.units.filter((item) => item.id !== unit.id);
      selectUnit(state, null);
      state.editor.drag = null;
      state.editor.lastMessage = `Юнит удалён: ${unit.id}`;
      return;
    }
  }

  if (state.editor.layers.pressureZones) {
    const zone = findPressureZoneAtGridPosition(state, grid);

    if (zone) {
      state.pressureZones = state.pressureZones.filter((item) => item.id !== zone.id);
      state.editor.selectedZoneId = null;
      state.editor.drag = null;
      state.editor.lastMessage = `Зона удалена: ${zone.id}`;
      return;
    }
  }

  state.editor.lastMessage = 'В точке нечего удалить.';
}

function selectObjectForEditing(state: SimulationState, object: MapObject): void {
  state.editor.selectedObjectId = object.id;
  state.editor.selectedZoneId = null;
  state.editor.objectWidthCells = roundOne(object.widthCells);
  state.editor.objectHeightCells = roundOne(object.heightCells);
  state.editor.objectRotationDegrees = Math.round(radiansToDegrees(object.rotationRadians));
  selectUnit(state, null);
}

function selectZoneForEditing(state: SimulationState, zone: PressureZone): void {
  state.editor.selectedZoneId = zone.id;
  state.editor.selectedObjectId = null;
  syncZoneEditorNumbers(state, zone);
  selectUnit(state, null);
}

function syncZoneEditorNumbers(state: SimulationState, zone: PressureZone): void {
  state.editor.zoneShape = zone.shape;
  state.editor.zoneRadiusCells = roundOne(zone.radiusCells);
  state.editor.zoneWidthCells = roundOne(zone.widthCells);
  state.editor.zoneHeightCells = roundOne(zone.heightCells);
  state.editor.zoneStrength = roundOne(zone.strength);
  state.editor.zoneStressPerSecond = roundOne(zone.stressPerSecond);
}

function findMapObjectAtGridPosition(state: SimulationState, grid: GridPosition): MapObject | undefined {
  for (let index = state.map.objects.length - 1; index >= 0; index -= 1) {
    const object = state.map.objects[index];

    if (isPositionInsideObject(grid, object)) {
      return object;
    }
  }

  return undefined;
}

function findPressureZoneAtGridPosition(state: SimulationState, grid: GridPosition): PressureZone | undefined {
  for (let index = state.pressureZones.length - 1; index >= 0; index -= 1) {
    const zone = state.pressureZones[index];

    if (isPositionInsideZone(grid, zone)) {
      return zone;
    }
  }

  return undefined;
}

function getObjectHandleAtPosition(map: TacticalMap, object: MapObject, grid: GridPosition): EditorResizeHandle | 'rotate' | null {
  const center = { x: object.x + 0.5, y: object.y + 0.5 };
  const local = toLocalObjectPoint(grid, center, object.rotationRadians);
  const halfWidth = object.widthCells / 2;
  const halfHeight = object.heightCells / 2;
  const padCells = 5 / map.cellSize;
  const handleHit = Math.max(0.14, 6 / map.cellSize);
  const rotateOffset = Math.max(0.9, 30 / map.cellSize);

  if (Math.hypot(local.x, local.y + halfHeight + rotateOffset) <= handleHit * 1.8) {
    return 'rotate';
  }

  const points: Array<[EditorResizeHandle, number, number]> = [
    ['nw', -halfWidth - padCells, -halfHeight - padCells],
    ['n', 0, -halfHeight - padCells],
    ['ne', halfWidth + padCells, -halfHeight - padCells],
    ['e', halfWidth + padCells, 0],
    ['se', halfWidth + padCells, halfHeight + padCells],
    ['s', 0, halfHeight + padCells],
    ['sw', -halfWidth - padCells, halfHeight + padCells],
    ['w', -halfWidth - padCells, 0],
  ];

  for (const [handle, x, y] of points) {
    if (Math.hypot(local.x - x, local.y - y) <= handleHit) {
      return handle;
    }
  }

  return null;
}

function getZoneHandleAtPosition(zone: PressureZone, grid: GridPosition): EditorResizeHandle | null {
  const hitRadius = 0.35;

  if (zone.shape === 'circle') {
    const radius = distance(grid, { x: zone.x, y: zone.y });
    return Math.abs(radius - zone.radiusCells) <= hitRadius ? 'e' : null;
  }

  const halfWidth = zone.widthCells / 2;
  const halfHeight = zone.heightCells / 2;
  const localX = grid.x - zone.x;
  const localY = grid.y - zone.y;
  const points: Array<[EditorResizeHandle, number, number]> = [
    ['nw', -halfWidth, -halfHeight],
    ['n', 0, -halfHeight],
    ['ne', halfWidth, -halfHeight],
    ['e', halfWidth, 0],
    ['se', halfWidth, halfHeight],
    ['s', 0, halfHeight],
    ['sw', -halfWidth, halfHeight],
    ['w', -halfWidth, 0],
  ];

  for (const [handle, x, y] of points) {
    if (Math.hypot(localX - x, localY - y) <= hitRadius) {
      return handle;
    }
  }

  return null;
}

function isPositionInsideObject(position: GridPosition, object: MapObject): boolean {
  const center = { x: object.x + 0.5, y: object.y + 0.5 };
  const local = toLocalObjectPoint(position, center, object.rotationRadians);

  return Math.abs(local.x) <= object.widthCells / 2 && Math.abs(local.y) <= object.heightCells / 2;
}

function isPositionInsideZone(position: GridPosition, zone: PressureZone): boolean {
  if (zone.shape === 'circle') {
    return distance(position, { x: zone.x, y: zone.y }) <= zone.radiusCells;
  }

  return (
    position.x >= zone.x - zone.widthCells / 2 &&
    position.x <= zone.x + zone.widthCells / 2 &&
    position.y >= zone.y - zone.heightCells / 2 &&
    position.y <= zone.y + zone.heightCells / 2
  );
}

function toLocalObjectPoint(position: GridPosition, center: GridPosition, rotationRadians: number): GridPosition {
  const dx = position.x - center.x;
  const dy = position.y - center.y;
  const cos = Math.cos(-rotationRadians);
  const sin = Math.sin(-rotationRadians);

  return {
    x: dx * cos - dy * sin,
    y: dx * sin + dy * cos,
  };
}

function getObjectCenter(object: EditorObjectSnapshot): GridPosition {
  return {
    x: object.x + 0.5,
    y: object.y + 0.5,
  };
}

function applyPressurePreview(state: SimulationState, unit: UnitModel, target: GridPosition): void {
  const report = getPressureReportAtPosition(target, state.pressureZones);
  unit.behaviorRuntime.state = 'moving';
  unit.behaviorRuntime.posture = 'standing';
  unit.behaviorRuntime.currentAction = 'move';

  if (!report) {
    unit.behaviorRuntime.danger = 0;
    unit.behaviorRuntime.reason = 'move_target_clear';
    return;
  }

  unit.behaviorRuntime.rawDanger = report.rawPressure;
  unit.behaviorRuntime.danger = Math.round(report.rawPressure);
  unit.behaviorRuntime.reason = `move_target_pressure:${report.zone.id}`;
}

function getSelectionCenter(units: UnitModel[]): GridPosition {
  const total = units.reduce(
    (sum, unit) => ({
      x: sum.x + unit.position.x,
      y: sum.y + unit.position.y,
    }),
    { x: 0, y: 0 },
  );

  return {
    x: total.x / units.length,
    y: total.y / units.length,
  };
}

function isInsideBox(position: GridPosition, box: SelectionBox): boolean {
  const minX = Math.min(box.start.x, box.current.x);
  const maxX = Math.max(box.start.x, box.current.x);
  const minY = Math.min(box.start.y, box.current.y);
  const maxY = Math.max(box.start.y, box.current.y);

  return position.x >= minX && position.x <= maxX && position.y >= minY && position.y <= maxY;
}

function setUnitDirection(unit: UnitModel, target: GridPosition): void {
  const dx = target.x - unit.position.x;
  const dy = target.y - unit.position.y;

  if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) {
    return;
  }

  unit.facingRadians = Math.atan2(dy, dx);
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function radiansToDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

function roundOne(value: number): number {
  return Math.round(value * 10) / 10;
}
