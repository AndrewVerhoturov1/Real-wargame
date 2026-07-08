import type { GridPosition } from '../geometry';
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
} from '../pressure/PressureZone';
import { findUnitAtGridPosition, normalizeUnits, type UnitData, type UnitModel, type UnitType } from '../units/UnitModel';

export interface SelectionBox {
  start: GridPosition;
  current: GridPosition;
}

export type EditorTool = 'select' | 'spawn_object' | 'spawn_unit' | 'delete';
export type EditorResizeHandle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
export type EditorDragMode = 'move_object' | 'move_unit' | 'resize_object' | 'rotate_object';

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

export interface EditorUnitSnapshot {
  position: GridPosition;
}

export interface EditorDragState {
  mode: EditorDragMode;
  objectId?: string;
  unitId?: string;
  resizeHandle?: EditorResizeHandle;
  startGrid: GridPosition;
  startObject?: EditorObjectSnapshot;
  startUnit?: EditorUnitSnapshot;
}

export interface EditorState {
  enabled: boolean;
  panelOpen: boolean;
  tool: EditorTool;
  objectKind: MapObjectKind;
  unitType: UnitType;
  objectWidthCells: number;
  objectHeightCells: number;
  objectRotationDegrees: number;
  selectedObjectId: string | null;
  layers: EditorLayers;
  drag: EditorDragState | null;
  nextObjectIndex: number;
  nextUnitIndex: number;
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
    editor: {
      enabled: false,
      panelOpen: false,
      tool: 'select',
      objectKind: 'tree',
      unitType: 'infantry_squad',
      objectWidthCells: 1,
      objectHeightCells: 1,
      objectRotationDegrees: 0,
      selectedObjectId: null,
      layers: {
        objects: true,
        units: true,
        pressureZones: true,
      },
      drag: null,
      nextObjectIndex: 1,
      nextUnitIndex: 1,
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

  state.editor.lastMessage = 'Нечего удалить.';
}

export function clearEditorScene(state: SimulationState): void {
  state.map.objects = [];
  state.units = [];
  state.editor.selectedObjectId = null;
  state.editor.drag = null;
  selectUnit(state, null);
  state.editor.lastMessage = 'Все предметы и юниты очищены.';
}

function beginSelectOrTransformAction(state: SimulationState, grid: GridPosition): void {
  if (state.editor.layers.objects) {
    const selectedObject = getSelectedMapObject(state);

    if (selectedObject) {
      const handle = getObjectHandleAtPosition(selectedObject, grid);

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

  state.editor.selectedObjectId = null;
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
  const [unit] = normalizeUnits([
    {
      id,
      label: id,
      labelRu: `Юнит ${index}`,
      type: state.editor.unitType,
      side: 'player',
      x: Math.max(0, Math.floor(grid.x)),
      y: Math.max(0, Math.floor(grid.y)),
      behaviorProfile: 'regular',
    },
  ]);

  unit.position = grid;
  state.units.push(unit);
  state.editor.nextUnitIndex = index + 1;
  state.editor.selectedObjectId = null;
  state.editor.drag = null;
  selectUnit(state, id);
  state.editor.lastMessage = `Создан юнит: ${id}`;
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
    selectUnit(state, unit?.id ?? null);
    state.editor.lastMessage = unit ? `Выбран юнит: ${unit.id}` : 'Ничего не выбрано.';
    return;
  }

  state.editor.selectedObjectId = null;
  selectUnit(state, null);
  state.editor.lastMessage = 'Ничего не выбрано: слои предметов и юнитов скрыты.';
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

  state.editor.lastMessage = 'В точке нечего удалить.';
}

function selectObjectForEditing(state: SimulationState, object: MapObject): void {
  state.editor.selectedObjectId = object.id;
  state.editor.objectWidthCells = roundOne(object.widthCells);
  state.editor.objectHeightCells = roundOne(object.heightCells);
  state.editor.objectRotationDegrees = Math.round(radiansToDegrees(object.rotationRadians));
  selectUnit(state, null);
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

function getObjectHandleAtPosition(object: MapObject, grid: GridPosition): EditorResizeHandle | 'rotate' | null {
  const center = { x: object.x + 0.5, y: object.y + 0.5 };
  const local = toLocalObjectPoint(grid, center, object.rotationRadians);
  const halfWidth = object.widthCells / 2;
  const halfHeight = object.heightCells / 2;
  const hitRadius = 0.45;
  const rotateHandleOffset = 0.95;

  if (Math.hypot(local.x, local.y + halfHeight + rotateHandleOffset) <= 0.65) {
    return 'rotate';
  }

  const nearLeft = Math.abs(local.x + halfWidth) <= hitRadius;
  const nearRight = Math.abs(local.x - halfWidth) <= hitRadius;
  const nearTop = Math.abs(local.y + halfHeight) <= hitRadius;
  const nearBottom = Math.abs(local.y - halfHeight) <= hitRadius;
  const insideWidthBand = Math.abs(local.x) <= halfWidth + hitRadius;
  const insideHeightBand = Math.abs(local.y) <= halfHeight + hitRadius;

  if (nearLeft && nearTop) return 'nw';
  if (nearRight && nearTop) return 'ne';
  if (nearLeft && nearBottom) return 'sw';
  if (nearRight && nearBottom) return 'se';
  if (nearLeft && insideHeightBand) return 'w';
  if (nearRight && insideHeightBand) return 'e';
  if (nearTop && insideWidthBand) return 'n';
  if (nearBottom && insideWidthBand) return 's';

  return null;
}

function isPositionInsideObject(position: GridPosition, object: MapObject): boolean {
  const center = { x: object.x + 0.5, y: object.y + 0.5 };
  const local = toLocalObjectPoint(position, center, object.rotationRadians);

  return Math.abs(local.x) <= object.widthCells / 2 && Math.abs(local.y) <= object.heightCells / 2;
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
