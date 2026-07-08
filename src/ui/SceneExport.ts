import type { SimulationState } from '../core/simulation/SimulationState';
import type { UnitModel } from '../core/units/UnitModel';

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

function buildExportedScene(state: SimulationState): ExportedSceneData {
  return {
    version: 'scene-export-v2',
    exportedAt: new Date().toISOString(),
    noteRu: 'Это экспорт текущей сцены из браузерного редактора. heightMap хранит высоты -2..4, forestMap подготовлен под слои леса 0/1/2. Чтобы закрепить изменения в проекте, передайте этот файл Codex: он должен разнести map / units / pressureZones по исходным JSON-файлам проекта.',
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
