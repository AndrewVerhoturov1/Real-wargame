import type { GridPosition, WorldPosition } from '../geometry';

export type TerrainKind = 'field' | 'forest' | 'road' | 'swamp' | 'rough' | 'water';

export type MapObjectKind =
  | 'tree'
  | 'rock'
  | 'structure'
  | 'cover'
  | 'ditch'
  | 'crates'
  | 'fence'
  | 'post'
  | 'logs'
  | 'well'
  | 'bridge';

export interface MapCellData {
  x: number;
  y: number;
  terrain?: TerrainKind;
  height?: -1 | 0 | 1 | 2;
}

export interface MapCellRunData {
  x1: number;
  x2: number;
  y: number;
  terrain?: TerrainKind;
  height?: -1 | 0 | 1 | 2;
}

export interface MapCellRectData {
  x1: number;
  x2: number;
  y1: number;
  y2: number;
  terrain?: TerrainKind;
  height?: -1 | 0 | 1 | 2;
}

export interface MapObjectData {
  id: string;
  kind: MapObjectKind;
  x: number;
  y: number;
  rotationDegrees?: number;
  widthCells?: number;
  heightCells?: number;
  label?: string;
  labelRu?: string;
}

export interface TacticalMapData {
  width: number;
  height: number;
  cellSize: number;
  defaultTerrain?: TerrainKind;
  defaultHeight?: -1 | 0 | 1 | 2;
  cellRuns?: MapCellRunData[];
  cellRects?: MapCellRectData[];
  cells?: MapCellData[];
  objects?: MapObjectData[];
}

export interface MapCell {
  x: number;
  y: number;
  terrain: TerrainKind;
  height: -1 | 0 | 1 | 2;
}

export interface MapObject {
  id: string;
  kind: MapObjectKind;
  x: number;
  y: number;
  rotationRadians: number;
  widthCells: number;
  heightCells: number;
  labels: {
    en: string;
    ru: string;
  } | null;
}

export interface TacticalMap {
  width: number;
  height: number;
  cellSize: number;
  cells: MapCell[];
  objects: MapObject[];
}

export function normalizeMap(data: TacticalMapData): TacticalMap {
  const defaultTerrain = data.defaultTerrain ?? 'field';
  const defaultHeight = data.defaultHeight ?? 0;
  const overrides = new Map<string, MapCellData>();

  for (const rect of data.cellRects ?? []) {
    for (let y = rect.y1; y <= rect.y2; y += 1) {
      for (let x = rect.x1; x <= rect.x2; x += 1) {
        overrides.set(cellKey(x, y), {
          x,
          y,
          terrain: rect.terrain,
          height: rect.height,
        });
      }
    }
  }

  for (const run of data.cellRuns ?? []) {
    for (let x = run.x1; x <= run.x2; x += 1) {
      overrides.set(cellKey(x, run.y), {
        x,
        y: run.y,
        terrain: run.terrain,
        height: run.height,
      });
    }
  }

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
    objects: normalizeMapObjects(data.objects ?? []),
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

function normalizeMapObjects(objects: MapObjectData[]): MapObject[] {
  return objects.map((object) => ({
    id: object.id,
    kind: object.kind,
    x: object.x,
    y: object.y,
    rotationRadians: degreesToRadians(object.rotationDegrees ?? 0),
    widthCells: object.widthCells ?? 1,
    heightCells: object.heightCells ?? 1,
    labels: object.label
      ? {
          en: object.label,
          ru: object.labelRu ?? object.label,
        }
      : null,
  }));
}

function cellKey(x: number, y: number): string {
  return `${x}:${y}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}
