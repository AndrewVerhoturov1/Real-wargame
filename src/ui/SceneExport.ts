import { normalizeMap, type TacticalMapData } from '../core/map/MapModel';
import { normalizePressureZones, type PressureZoneData } from '../core/pressure/PressureZone';
import type { SimulationState } from '../core/simulation/SimulationState';
import { normalizeUnits, type UnitData, type UnitModel } from '../core/units/UnitModel';

export interface ExportedSceneData {
  version: string;
  exportedAt: string;
  noteRu: string;
  map: {
    width: number;
    height: number;
    cellSize: number;
    metersPerCell: number;
    defaultTerrain: string;
    defaultHeight: number;
    heightMap: number[][];
    forestMap: number[][];
    objects: Array<Record<string, unknown>>;
  };
  units: Array<Record<string, unknown>>;
  pressureZones: Array<Record<string, unknown>>;
}

export async function loadSceneJsonFromFile(state: SimulationState, file: File): Promise<void> {
  const text = await file.text();
  let parsed: unknown;

  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new Error('Файл не похож на правильный JSON.');
  }

  const scene = normalizeImportedScene(parsed);

  state.map = normalizeMap(scene.map);
  state.units = normalizeUnits(scene.units);
  state.pressureZones = normalizePressureZones(scene.pressureZones);
  state.selectedUnitId = null;
  state.selectedUnitIds = [];
  state.selectionBox = null;
  state.editor.selectedObjectId = null;
  state.editor.selectedZoneId = null;
  state.editor.drag = null;
  state.editor.tool = 'select';
  state.editor.nextObjectIndex = nextIndex(scene.map.objects ?? [], 'editor_object_');
  state.editor.nextUnitIndex = nextIndex(scene.units, 'editor_unit_');
  state.editor.nextZoneIndex = nextIndex(scene.pressureZones, 'editor_zone_');
  state.editor.lastMessage = `JSON сцены загружен: карта ${state.map.width}×${state.map.height}, юнитов ${state.units.length}, зон ${state.pressureZones.length}.`;
}

export function downloadCurrentSceneJson(state: SimulationState): void {
  const scene = buildExportedScene(state);
  const json = JSON.stringify(scene, null, 2);
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = `real-wargame-scene-${buildTimestampForFileName()}.json`;
  link.click();
  URL.revokeObjectURL(url);
  state.editor.lastMessage = 'JSON сцены скачан. Его можно отдать Codex для закрепления в файлах проекта.';
}

function normalizeImportedScene(value: unknown): {
  map: TacticalMapData;
  units: UnitData[];
  pressureZones: PressureZoneData[];
} {
  const scene = requireRecord(value, 'Файл должен содержать объект сцены.');
  const map = requireRecord(scene.map, 'В JSON сцены нет блока map.');

  return {
    map: map as unknown as TacticalMapData,
    units: readArray(scene.units) as unknown as UnitData[],
    pressureZones: readArray(scene.pressureZones) as unknown as PressureZoneData[],
  };
}

function buildExportedScene(state: SimulationState): ExportedSceneData {
  return {
    version: 'scene-export-v2',
    exportedAt: new Date().toISOString(),
    noteRu: 'Это экспорт текущей сцены из браузерного редактора. heightMap хранит высоты -2..4, forestMap подготовлен под слои леса 0/1/2, losHeightMeters хранит физическую высоту объектов для линии видимости. Чтобы закрепить изменения в проекте, передайте этот файл Codex: он должен разнести map / units / pressureZones по исходным JSON-файлам проекта.',
    map: {
      width: state.map.width,
      height: state.map.height,
      cellSize: state.map.cellSize,
      metersPerCell: state.map.metersPerCell,
      defaultTerrain: state.map.defaultTerrain,
      defaultHeight: state.map.defaultHeight,
      heightMap: buildHeightMap(state),
      forestMap: buildForestMap(state),
      objects: state.map.objects.map((object) => ({
        id: object.id,
        kind: object.kind,
        x: roundThree(object.x),
        y: roundThree(object.y),
        widthCells: roundThree(object.widthCells),
        heightCells: roundThree(object.heightCells),
        losHeightMeters: roundOne(object.losHeightMeters ?? 1),
        rotationDegrees: roundOne(radiansToDegrees(object.rotationRadians)),
        label: object.labels?.en,
        labelRu: object.labels?.ru,
      })),
    },
    units: state.units.map(exportUnit),
    pressureZones: state.pressureZones.map((zone) => ({
      id: zone.id,
      label: zone.labels.en,
      labelRu: zone.labels.ru,
      type: zone.type,
      shape: zone.shape,
      x: roundThree(zone.x),
      y: roundThree(zone.y),
      radiusCells: roundThree(zone.radiusCells),
      widthCells: roundThree(zone.widthCells),
      heightCells: roundThree(zone.heightCells),
      strength: roundOne(zone.strength),
      stressPerSecond: roundOne(zone.stressPerSecond),
      reason: zone.reasons.en,
      reasonRu: zone.reasons.ru,
    })),
  };
}

function buildHeightMap(state: SimulationState): number[][] {
  const rows: number[][] = [];

  for (let y = 0; y < state.map.height; y += 1) {
    const row: number[] = [];
    for (let x = 0; x < state.map.width; x += 1) {
      row.push(state.map.cells[y * state.map.width + x]?.height ?? state.map.defaultHeight);
    }
    rows.push(row);
  }

  return rows;
}

function buildForestMap(state: SimulationState): number[][] {
  const rows: number[][] = [];

  for (let y = 0; y < state.map.height; y += 1) {
    const row: number[] = [];
    for (let x = 0; x < state.map.width; x += 1) {
      row.push(state.map.cells[y * state.map.width + x]?.forest ?? 0);
    }
    rows.push(row);
  }

  return rows;
}

function exportUnit(unit: UnitModel): Record<string, unknown> {
  return {
    id: unit.id,
    label: unit.labels.en,
    labelRu: unit.labels.ru,
    type: unit.type,
    side: unit.side,
    x: roundThree(unit.position.x - 0.5),
    y: roundThree(unit.position.y - 0.5),
    speedCellsPerSecond: roundThree(unit.speedCellsPerSecond),
    heldItem: unit.heldItem,
    facingDegrees: roundOne(radiansToDegrees(unit.facingRadians)),
    viewAngleDegrees: roundOne(radiansToDegrees(unit.viewAngleRadians)),
    viewRangeCells: roundThree(unit.viewRangeCells),
    behaviorProfile: unit.behaviorProfile,
  };
}

function nextIndex(items: Array<{ id?: string }>, prefix: string): number {
  let maxIndex = 0;

  for (const item of items) {
    if (!item.id?.startsWith(prefix)) {
      continue;
    }

    const suffix = Number.parseInt(item.id.slice(prefix.length), 10);
    if (Number.isFinite(suffix)) {
      maxIndex = Math.max(maxIndex, suffix);
    }
  }

  return maxIndex + 1;
}

function requireRecord(value: unknown, message: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(message);
  }

  return value as Record<string, unknown>;
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function buildTimestampForFileName(): string {
  return new Date()
    .toISOString()
    .replaceAll(':', '-')
    .replaceAll('.', '-')
    .replace('T', '_')
    .replace('Z', '');
}

function radiansToDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

function roundOne(value: number): number {
  return Math.round(value * 10) / 10;
}

function roundThree(value: number): number {
  return Math.round(value * 1000) / 1000;
}
