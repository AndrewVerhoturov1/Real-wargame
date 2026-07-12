import { distance, type GridPosition } from '../geometry';
import type { SimulationState } from '../simulation/SimulationState';
import { getCell, normalizeElevationLevel, normalizeForestLayer, type TacticalMap } from './MapModel';
import {
  fullMapRegion,
  markMapCellsDirty,
  type MapDirtyRegion,
} from './MapRuntimeState';

export type TerrainPaintTool = 'paint_height' | 'paint_forest';
export type TerrainBrushShape = 'circle' | 'square';

interface PaintResult {
  changed: number;
  region: MapDirtyRegion | null;
}

export function isTerrainPaintTool(tool: string): tool is TerrainPaintTool {
  return tool === 'paint_height' || tool === 'paint_forest';
}

export function paintEditorTerrainAt(state: SimulationState, grid: GridPosition): void {
  const editor = state.editor as typeof state.editor & {
    brushShape?: TerrainBrushShape;
    brushSizeCells?: number;
    heightBrushLevel?: number;
    forestBrushKind?: number;
  };
  const tool = String((state.editor as unknown as { tool?: string }).tool ?? '');

  if (!isTerrainPaintTool(tool)) return;

  const radius = Math.max(0, (editor.brushSizeCells ?? 1) / 2);
  const shape = editor.brushShape ?? 'circle';
  const result = tool === 'paint_height'
    ? paintHeight(state.map, grid, editor.heightBrushLevel ?? 1, radius, shape)
    : paintForest(state.map, grid, editor.forestBrushKind ?? 1, radius, shape);

  if (result.region) {
    markMapCellsDirty(state.map, tool === 'paint_height' ? 'height' : 'forest', result.region);
  }

  if (tool === 'paint_height') {
    state.editor.lastMessage = result.changed > 0
      ? `Высота: покрашено клеток ${result.changed}, уровень ${formatHeight(editor.heightBrushLevel ?? 1)}, кисть ${formatShape(shape)}.`
      : 'Высота: кисть не изменила карту.';
  } else {
    state.editor.lastMessage = result.changed > 0
      ? `Лес: покрашено клеток ${result.changed}, слой ${formatForest(editor.forestBrushKind ?? 1)}, кисть ${formatShape(shape)}.`
      : 'Лес: кисть не изменила карту.';
  }
}

export function clearHeightLayer(state: SimulationState): void {
  let changed = false;
  for (const cell of state.map.cells) {
    if (cell.height === 0) continue;
    cell.height = 0;
    changed = true;
  }
  if (changed) markMapCellsDirty(state.map, 'height', fullMapRegion(state.map));
  state.editor.lastMessage = changed
    ? 'Слой высот очищен: все клетки стали 0.'
    : 'Слой высот уже был пуст.';
}

export function clearForestLayer(state: SimulationState): void {
  let changed = false;
  for (const cell of state.map.cells) {
    if (cell.forest === 0) continue;
    cell.forest = 0;
    changed = true;
  }
  if (changed) markMapCellsDirty(state.map, 'forest', fullMapRegion(state.map));
  state.editor.lastMessage = changed
    ? 'Слой леса очищен: везде нет леса.'
    : 'Слой леса уже был пуст.';
}

function paintHeight(
  map: TacticalMap,
  center: GridPosition,
  level: number,
  radius: number,
  shape: TerrainBrushShape,
): PaintResult {
  const normalized = normalizeElevationLevel(level);
  return collectPaintChanges(map, center, radius, shape, (x, y) => {
    const cell = getCell(map, x, y);
    if (!cell || cell.height === normalized) return false;
    cell.height = normalized;
    return true;
  });
}

function paintForest(
  map: TacticalMap,
  center: GridPosition,
  kind: number,
  radius: number,
  shape: TerrainBrushShape,
): PaintResult {
  const normalized = normalizeForestLayer(kind);
  return collectPaintChanges(map, center, radius, shape, (x, y) => {
    const cell = getCell(map, x, y);
    if (!cell || cell.forest === normalized) return false;
    cell.forest = normalized;
    return true;
  });
}

function collectPaintChanges(
  map: TacticalMap,
  center: GridPosition,
  radius: number,
  shape: TerrainBrushShape,
  changeCell: (x: number, y: number) => boolean,
): PaintResult {
  let changed = 0;
  let region: MapDirtyRegion | null = null;
  forEachBrushCell(map, center, radius, shape, (x, y) => {
    if (!changeCell(x, y)) return;
    changed += 1;
    region = includeCell(region, x, y);
  });
  return { changed, region };
}

function includeCell(region: MapDirtyRegion | null, x: number, y: number): MapDirtyRegion {
  if (!region) return { minX: x, minY: y, maxX: x, maxY: y };
  return {
    minX: Math.min(region.minX, x),
    minY: Math.min(region.minY, y),
    maxX: Math.max(region.maxX, x),
    maxY: Math.max(region.maxY, y),
  };
}

function forEachBrushCell(
  map: TacticalMap,
  center: GridPosition,
  radius: number,
  shape: TerrainBrushShape,
  callback: (x: number, y: number) => void,
): void {
  const centerX = Math.floor(center.x);
  const centerY = Math.floor(center.y);
  const safeRadius = Math.max(0.01, radius);
  const minX = Math.max(0, Math.floor(center.x - safeRadius));
  const maxX = Math.min(map.width - 1, Math.ceil(center.x + safeRadius));
  const minY = Math.max(0, Math.floor(center.y - safeRadius));
  const maxY = Math.min(map.height - 1, Math.ceil(center.y + safeRadius));

  if (safeRadius <= 0.55) {
    if (centerX >= 0 && centerY >= 0 && centerX < map.width && centerY < map.height) {
      callback(centerX, centerY);
    }
    return;
  }

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const cellCenter = { x: x + 0.5, y: y + 0.5 };
      const inside = shape === 'square'
        ? Math.abs(cellCenter.x - center.x) <= safeRadius && Math.abs(cellCenter.y - center.y) <= safeRadius
        : distance(cellCenter, center) <= safeRadius;
      if (inside) callback(x, y);
    }
  }
}

function formatHeight(level: number): string {
  const normalized = normalizeElevationLevel(level);
  return normalized > 0 ? `+${normalized}` : String(normalized);
}

function formatForest(kind: number): string {
  switch (normalizeForestLayer(kind)) {
    case 1: return 'редкий лес';
    case 2: return 'густой лес';
    case 0:
    default: return 'нет леса';
  }
}

function formatShape(shape: TerrainBrushShape): string {
  return shape === 'square' ? 'квадрат' : 'круг';
}
