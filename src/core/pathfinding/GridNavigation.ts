import type {
  MapObject,
  MapObjectKind,
  TacticalMap,
  TerrainKind,
} from '../map/MapModel';
import {
  circleIntersectsMapObject,
  getMapObjectBounds,
  isPointInsideMapObject,
} from '../map/MapObjectGeometry';
import { resolveCellVegetationMaterialId } from '../map/VegetationDefinition';
import {
  getSurfaceMaterial,
  getVegetationMaterial,
  type EnvironmentMaterialProfile,
} from '../map/EnvironmentMaterialProfile';
import { getActiveEnvironmentProfile } from '../map/EnvironmentProfileRuntime';
import { getMapObjectSpatialIndex } from '../spatial/MapObjectSpatialIndex';

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

export interface NavigationPositionEvaluation {
  readonly passable: boolean;
  readonly movementCost: number;
  readonly bridge: boolean;
  readonly blockedByObjectId: string | null;
  readonly objectCandidateCount: number;
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
    const surface = getSurfaceMaterial(getActiveEnvironmentProfile(), cell.surfaceMaterialId);
    const passable = surface.movement.passable || bridge;
    return {
      x: cell.x,
      y: cell.y,
      passable,
      movementCost: bridge ? 0.9 : terrainMovementCost(cell.terrain, cell),
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

/** Exact local navigation query used by bounded tactical solvers. */
export function evaluateNavigationPosition(
  map: TacticalMap,
  position: { readonly x: number; readonly y: number },
  radiusCells = INFANTRY_NAVIGATION_RADIUS_CELLS,
  objectCandidates?: readonly MapObject[],
  environmentProfile: EnvironmentMaterialProfile = getActiveEnvironmentProfile(),
): NavigationPositionEvaluation {
  const x = Math.floor(position.x);
  const y = Math.floor(position.y);
  if (!Number.isFinite(position.x) || !Number.isFinite(position.y)
    || x < 0 || y < 0 || x >= map.width || y >= map.height) {
    return {
      passable: false,
      movementCost: Number.POSITIVE_INFINITY,
      bridge: false,
      blockedByObjectId: null,
      objectCandidateCount: 0,
    };
  }
  const cell = map.cells[y * map.width + x];
  if (!cell) {
    return {
      passable: false,
      movementCost: Number.POSITIVE_INFINITY,
      bridge: false,
      blockedByObjectId: null,
      objectCandidateCount: 0,
    };
  }
  const safeRadius = Math.max(0, Number.isFinite(radiusCells) ? radiusCells : INFANTRY_NAVIGATION_RADIUS_CELLS);
  const candidates = objectCandidates ?? getMapObjectSpatialIndex(map).queryCircle(position, safeRadius);
  const bridge = candidates.some((object) => object.kind === 'bridge' && isPointInsideMapObject(object, position));
  const blocker = candidates.find((object) => (
    isMapObjectMovementBlocking(object.kind)
    && circleIntersectsMapObject(object, position, safeRadius)
  ));
  const surface = getSurfaceMaterial(environmentProfile, cell.surfaceMaterialId);
  const passable = !blocker && (surface.movement.passable || bridge);
  return {
    passable,
    movementCost: passable ? (bridge ? 0.9 : terrainMovementCost(cell.terrain, cell, environmentProfile)) : Number.POSITIVE_INFINITY,
    bridge,
    blockedByObjectId: blocker?.id ?? null,
    objectCandidateCount: candidates.length,
  };
}

export function isMapCellPassable(map: TacticalMap, x: number, y: number): boolean {
  if (!Number.isInteger(x) || !Number.isInteger(y)) return false;
  return evaluateNavigationPosition(map, navigationCellCenter(x, y)).passable;
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
  const bounds = getMapObjectBounds(object);
  const padding = includeBodyRadius ? INFANTRY_NAVIGATION_RADIUS_CELLS : 0;
  const minX = clamp(Math.floor(bounds.minX - padding), 0, map.width - 1);
  const maxX = clamp(Math.floor(bounds.maxX + padding), 0, map.width - 1);
  const minY = clamp(Math.floor(bounds.minY - padding), 0, map.height - 1);
  const maxY = clamp(Math.floor(bounds.maxY + padding), 0, map.height - 1);

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
  const center = navigationCellCenter(cellX, cellY);
  return includeBodyRadius
    ? circleIntersectsMapObject(object, center, INFANTRY_NAVIGATION_RADIUS_CELLS)
    : isPointInsideMapObject(object, center);
}

function terrainMovementCost(
  terrain: TerrainKind,
  cell: TacticalMap['cells'][number],
  environmentProfile: EnvironmentMaterialProfile = getActiveEnvironmentProfile(),
): number {
  const vegetationResistance = getVegetationMaterial(
    environmentProfile,
    resolveCellVegetationMaterialId(cell),
  ).movement.resistance;
  const surface = getSurfaceMaterial(environmentProfile, cell.surfaceMaterialId);
  if (!surface.movement.passable || terrain === 'water') return Number.POSITIVE_INFINITY;
  return Math.max(0.05, 1
    + (surface.movement.resistance - 1)
    + (vegetationResistance - 1)
    + surface.movement.physicalCost);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
