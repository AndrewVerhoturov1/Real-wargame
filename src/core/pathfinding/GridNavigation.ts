import type {
  MapObject,
  MapObjectKind,
  TacticalMap,
  TerrainKind,
} from '../map/MapModel';

export const INFANTRY_NAVIGATION_RADIUS_CELLS = 0.18;

export interface NavigationCell {
  readonly x: number;
  readonly y: number;
  readonly passable: boolean;
  readonly movementCost: number;
  readonly height: number;
  readonly terrain: TerrainKind;
  readonly blockedByObjectId?: string;
  readonly bridge: boolean;
}

export interface NavigationGrid {
  readonly width: number;
  readonly height: number;
  readonly cells: readonly NavigationCell[];
}

const HARD_BLOCKING_OBJECTS = new Set<MapObjectKind>([
  'structure',
  'tree',
  'rock',
  'cover',
  'crates',
  'fence',
  'post',
  'logs',
  'well',
]);

const PASSABLE_OBJECTS = new Set<MapObjectKind>(['ditch', 'bridge']);

const BODY_SAMPLES: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [INFANTRY_NAVIGATION_RADIUS_CELLS, 0],
  [-INFANTRY_NAVIGATION_RADIUS_CELLS, 0],
  [0, INFANTRY_NAVIGATION_RADIUS_CELLS],
  [0, -INFANTRY_NAVIGATION_RADIUS_CELLS],
  [INFANTRY_NAVIGATION_RADIUS_CELLS * 0.70710678, INFANTRY_NAVIGATION_RADIUS_CELLS * 0.70710678],
  [-INFANTRY_NAVIGATION_RADIUS_CELLS * 0.70710678, INFANTRY_NAVIGATION_RADIUS_CELLS * 0.70710678],
  [INFANTRY_NAVIGATION_RADIUS_CELLS * 0.70710678, -INFANTRY_NAVIGATION_RADIUS_CELLS * 0.70710678],
  [-INFANTRY_NAVIGATION_RADIUS_CELLS * 0.70710678, -INFANTRY_NAVIGATION_RADIUS_CELLS * 0.70710678],
];

export function buildNavigationGrid(map: TacticalMap): NavigationGrid {
  const bridgeMask = new Uint8Array(map.width * map.height);
  for (const object of map.objects) {
    if (object.kind !== 'bridge') continue;
    markObjectCells(map, object, (index) => {
      bridgeMask[index] = 1;
    }, false);
  }

  const mutable = map.cells.map((cell, index): NavigationCell => {
    const bridge = bridgeMask[index] === 1;
    const passable = cell.terrain !== 'water' || bridge;
    return {
      x: cell.x,
      y: cell.y,
      passable,
      movementCost: bridge ? 0.9 : terrainMovementCost(cell.terrain, cell.forest),
      height: cell.height,
      terrain: cell.terrain,
      bridge,
    };
  });

  for (const object of map.objects) {
    if (!isMapObjectMovementBlocking(object.kind)) continue;
    markObjectCells(map, object, (index) => {
      const current = mutable[index];
      mutable[index] = {
        ...current,
        passable: false,
        blockedByObjectId: object.id,
      };
    }, true);
  }

  return {
    width: map.width,
    height: map.height,
    cells: mutable,
  };
}

export function isMapObjectMovementBlocking(kind: MapObjectKind): boolean {
  if (HARD_BLOCKING_OBJECTS.has(kind)) return true;
  if (PASSABLE_OBJECTS.has(kind)) return false;
  return true;
}

export function isMapCellPassable(map: TacticalMap, x: number, y: number): boolean {
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= map.width || y >= map.height) {
    return false;
  }

  const cell = map.cells[y * map.width + x];
  if (!cell) return false;
  const bridge = map.objects.some((object) => object.kind === 'bridge' && objectOccupiesCell(object, x, y, false));
  if (cell.terrain === 'water' && !bridge) return false;
  return !map.objects.some((object) => (
    isMapObjectMovementBlocking(object.kind)
    && objectOccupiesCell(object, x, y, true)
  ));
}

export function isNavigationCellPassable(grid: NavigationGrid, x: number, y: number): boolean {
  return navigationCellAt(grid, x, y)?.passable === true;
}

export function navigationCellCost(grid: NavigationGrid, x: number, y: number): number {
  const cell = navigationCellAt(grid, x, y);
  return cell?.passable ? cell.movementCost : Number.POSITIVE_INFINITY;
}

export function navigationCellAt(grid: NavigationGrid, x: number, y: number): NavigationCell | undefined {
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= grid.width || y >= grid.height) {
    return undefined;
  }
  return grid.cells[y * grid.width + x];
}

export function navigationCellCenter(x: number, y: number): { x: number; y: number } {
  return { x: x + 0.5, y: y + 0.5 };
}

export function gridPositionToNavigationCell(
  map: TacticalMap,
  position: { x: number; y: number },
): { x: number; y: number } {
  return {
    x: clamp(Math.floor(position.x), 0, map.width - 1),
    y: clamp(Math.floor(position.y), 0, map.height - 1),
  };
}

function markObjectCells(
  map: TacticalMap,
  object: MapObject,
  mark: (index: number) => void,
  includeBodyRadius: boolean,
): void {
  const radius = Math.hypot(object.widthCells, object.heightCells) / 2
    + (includeBodyRadius ? INFANTRY_NAVIGATION_RADIUS_CELLS : 0);
  const minX = clamp(Math.floor(object.x - radius - 1), 0, map.width - 1);
  const maxX = clamp(Math.floor(object.x + radius + 1), 0, map.width - 1);
  const minY = clamp(Math.floor(object.y - radius - 1), 0, map.height - 1);
  const maxY = clamp(Math.floor(object.y + radius + 1), 0, map.height - 1);

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      if (!objectOccupiesCell(object, x, y, includeBodyRadius)) continue;
      mark(y * map.width + x);
    }
  }
}

function objectOccupiesCell(
  object: MapObject,
  cellX: number,
  cellY: number,
  includeBodyRadius: boolean,
): boolean {
  const centerX = cellX + 0.5;
  const centerY = cellY + 0.5;
  const samples = includeBodyRadius ? BODY_SAMPLES : BODY_SAMPLES.slice(0, 1);
  return samples.some(([offsetX, offsetY]) => pointInsideRotatedObject(
    centerX + offsetX,
    centerY + offsetY,
    object,
  ));
}

function pointInsideRotatedObject(x: number, y: number, object: MapObject): boolean {
  const dx = x - object.x;
  const dy = y - object.y;
  const cosine = Math.cos(-object.rotationRadians);
  const sine = Math.sin(-object.rotationRadians);
  const localX = dx * cosine - dy * sine;
  const localY = dx * sine + dy * cosine;
  return Math.abs(localX) <= object.widthCells / 2
    && Math.abs(localY) <= object.heightCells / 2;
}

function terrainMovementCost(terrain: TerrainKind, forest: number): number {
  switch (terrain) {
    case 'road': return 0.8;
    case 'forest': return forest >= 2 ? 1.45 : 1.25;
    case 'rough': return 1.3;
    case 'swamp': return 1.8;
    case 'water': return Number.POSITIVE_INFINITY;
    case 'field':
    default:
      return forest >= 2 ? 1.45 : forest >= 1 ? 1.25 : 1;
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
