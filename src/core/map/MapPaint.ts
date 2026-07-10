import { distance, type GridPosition } from '../geometry';
import { getCell, normalizeElevationLevel, normalizeForestLayer, type TacticalMap } from './MapModel';
import type { SimulationState } from '../simulation/SimulationState';

export type TerrainPaintTool = 'paint_height' | 'paint_forest';
export type TerrainBrushShape = 'circle' | 'square';

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
  const changed = tool === 'paint_height'
    ? paintHeight(state.map, grid, editor.heightBrushLevel ?? 1, radius, shape)
    : paintForest(state.map, grid, editor.forestBrushKind ?? 1, radius, shape);

  if (tool === 'paint_height') {
    state.editor.lastMessage = changed > 0
      ? `Высота: покрашено клеток ${changed}, уровень ${formatHeight(editor.heightBrushLevel ?? 1)}, кисть ${formatShape(shape)}.`
      : 'Высота: кисть не попала на карту.';
  } else {
    state.editor.lastMessage = changed > 0
      ? `Лес: покрашено клеток ${changed}, слой ${formatForest(editor.forestBrushKind ?? 1)}, кисть ${formatShape(shape)}.`
      : 'Лес: кисть не попала на карту.';
  }
}

export function clearHeightLayer(state: SimulationState): void {
  for (const cell of state.map.cells) cell.height = 0;
  state.editor.lastMessage = 'Слой высот очищен: все клетки стали 0.';
}

export function clearForestLayer(state: SimulationState): void {
  for (const cell of state.map.cells) cell.forest = 0;
  state.editor.lastMessage = 'Слой леса очищен: везде нет леса.';
}

function paintHeight(
  map: TacticalMap,
  center: GridPosition,
  level: number,
  radius: number,
  shape: TerrainBrushShape,
): number {
  const normalized = normalizeElevationLevel(level);
  let changed = 0;
  forEachBrushCell(map, center, radius, shape, (x, y) => {
    const cell = getCell(map, x, y);
    if (!cell || cell.height === normalized) return;
    cell.height = normalized;
    changed += 1;
  });
  return changed;
}

function paintForest(
  map: TacticalMap,
  center: GridPosition,
  kind: number,
  radius: number,
  shape: TerrainBrushShape,
): number {
  const normalized = normalizeForestLayer(kind);
  let changed = 0;
  forEachBrushCell(map, center, radius, shape, (x, y) => {
    const cell = getCell(map, x, y);
    if (!cell || cell.forest === normalized) return;
    cell.forest = normalized;
    changed += 1;
  });
  return changed;
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
    callback(centerX, centerY);
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
