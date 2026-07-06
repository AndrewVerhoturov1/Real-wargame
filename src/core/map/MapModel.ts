import type { GridPosition, WorldPosition } from '../geometry';

export type TerrainKind = 'field' | 'forest' | 'road' | 'swamp';

export interface MapCellData {
  x: number;
  y: number;
  terrain?: TerrainKind;
  height?: -1 | 0 | 1 | 2;
}

export interface TacticalMapData {
  width: number;
  height: number;
  cellSize: number;
  defaultTerrain?: TerrainKind;
  defaultHeight?: -1 | 0 | 1 | 2;
  cells?: MapCellData[];
}

export interface MapCell {
  x: number;
  y: number;
  terrain: TerrainKind;
  height: -1 | 0 | 1 | 2;
}

export interface TacticalMap {
  width: number;
  height: number;
  cellSize: number;
  cells: MapCell[];
}

export function normalizeMap(data: TacticalMapData): TacticalMap {
  const defaultTerrain = data.defaultTerrain ?? 'field';
  const defaultHeight = data.defaultHeight ?? 0;
  const overrides = new Map<string, MapCellData>();

  for (const cell of data.cells ?? []) {
    overrides.set(cellKey(cell.x, cell.y), cell);
  }

  const cells: MapCell[] = [];

  for (let y = 0; y < data.height; y += 1) {
    for (let x = 0; x < data.width; x += 1) {
      const override = overrides.get(cellKey(x, y));
      cells.push({
        x,
        y,
        terrain: override?.terrain ?? defaultTerrain,
        height: override?.height ?? defaultHeight,
      });
    }
  }

  return {
    width: data.width,
    height: data.height,
    cellSize: data.cellSize,
    cells,
  };
}

export function getCell(map: TacticalMap, x: number, y: number): MapCell | undefined {
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) {
    return undefined;
  }

  return map.cells[y * map.width + x];
}

export function worldToGrid(map: TacticalMap, world: WorldPosition): GridPosition {
  return {
    x: world.x / map.cellSize,
    y: world.y / map.cellSize,
  };
}

export function gridToWorld(map: TacticalMap, grid: GridPosition): WorldPosition {
  return {
    x: grid.x * map.cellSize,
    y: grid.y * map.cellSize,
  };
}

export function gridToCellLabel(map: TacticalMap, grid: GridPosition): string {
  const cell = gridToCellCenter(map, grid);
  return `${Math.floor(cell.x)}, ${Math.floor(cell.y)}`;
}

export function gridToCellCenter(map: TacticalMap, grid: GridPosition): GridPosition {
  const cellX = clamp(Math.floor(grid.x), 0, map.width - 1);
  const cellY = clamp(Math.floor(grid.y), 0, map.height - 1);

  return {
    x: cellX + 0.5,
    y: cellY + 0.5,
  };
}

export function clampGridPositionToMap(map: TacticalMap, grid: GridPosition): GridPosition {
  return {
    x: clamp(grid.x, 0.5, map.width - 0.5),
    y: clamp(grid.y, 0.5, map.height - 0.5),
  };
}

function cellKey(x: number, y: number): string {
  return `${x}:${y}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
