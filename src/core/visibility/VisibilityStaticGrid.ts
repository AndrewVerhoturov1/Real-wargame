import type { MapObject, MapObjectKind, TacticalMap } from '../map/MapModel';
import { getMapRevisionSnapshot } from '../map/MapRuntimeState';
import { resolveCellVegetationLayer } from '../map/VegetationDefinition';
import { sampleSmoothHeightLevel } from '../terrain/SmoothTerrain';

const ELEVATION_STEP_METERS = 2;

export interface VisibilityStaticGrid {
  width: number;
  height: number;
  terrainHeightMeters: Float32Array;
  objectTopHeightMeters: Float32Array;
  forestKind: Uint8Array;
  blockingFlags: Uint8Array;
  mapVisualRevision: number;
}

interface VisibilityStaticGridCacheEntry {
  revision: number;
  grid: VisibilityStaticGrid;
}

const cache = new WeakMap<TacticalMap, VisibilityStaticGridCacheEntry>();

export function getVisibilityStaticGrid(map: TacticalMap): VisibilityStaticGrid {
  const revision = getMapRevisionSnapshot(map).visual;
  const current = cache.get(map);
  if (current?.revision === revision) return current.grid;
  const grid = buildVisibilityStaticGrid(map, revision);
  cache.set(map, { revision, grid });
  return grid;
}

export function clearVisibilityStaticGridCache(map: TacticalMap): void {
  cache.delete(map);
}

function buildVisibilityStaticGrid(map: TacticalMap, revision: number): VisibilityStaticGrid {
  const length = map.width * map.height;
  const terrainHeightMeters = new Float32Array(length);
  const objectTopHeightMeters = new Float32Array(length);
  const forestKind = new Uint8Array(length);
  const blockingFlags = new Uint8Array(length);

  for (let y = 0; y < map.height; y += 1) {
    for (let x = 0; x < map.width; x += 1) {
      const index = y * map.width + x;
      terrainHeightMeters[index] = sampleSmoothHeightLevel(map, x + 0.5, y + 0.5) * ELEVATION_STEP_METERS;
      forestKind[index] = resolveCellVegetationLayer(map.cells[index]);
    }
  }

  for (const object of map.objects) rasterizeObject(map, object, terrainHeightMeters, objectTopHeightMeters, blockingFlags);

  return {
    width: map.width,
    height: map.height,
    terrainHeightMeters,
    objectTopHeightMeters,
    forestKind,
    blockingFlags,
    mapVisualRevision: revision,
  };
}

function rasterizeObject(
  map: TacticalMap,
  object: MapObject,
  terrainHeightMeters: Float32Array,
  objectTopHeightMeters: Float32Array,
  blockingFlags: Uint8Array,
): void {
  const halfWidth = Math.max(0.35, object.widthCells / 2);
  const halfHeight = Math.max(0.35, object.heightCells / 2);
  const radius = Math.ceil(Math.hypot(halfWidth, halfHeight)) + 1;
  const centerX = object.x + 0.5;
  const centerY = object.y + 0.5;
  const minX = Math.max(0, Math.floor(centerX - radius));
  const maxX = Math.min(map.width - 1, Math.ceil(centerX + radius));
  const minY = Math.max(0, Math.floor(centerY - radius));
  const maxY = Math.min(map.height - 1, Math.ceil(centerY + radius));
  const cos = Math.cos(-object.rotationRadians);
  const sin = Math.sin(-object.rotationRadians);
  const height = objectHeightMeters(object);
  if (height <= 0.05) return;

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const dx = x + 0.5 - centerX;
      const dy = y + 0.5 - centerY;
      const localX = dx * cos - dy * sin;
      const localY = dx * sin + dy * cos;
      if (Math.abs(localX) > halfWidth || Math.abs(localY) > halfHeight) continue;
      const index = y * map.width + x;
      objectTopHeightMeters[index] = Math.max(objectTopHeightMeters[index], terrainHeightMeters[index] + height);
      if (blocksLineOfSight(object.kind)) blockingFlags[index] = 1;
    }
  }
}

function blocksLineOfSight(kind: MapObjectKind): boolean {
  return kind !== 'ditch' && kind !== 'bridge';
}

function objectHeightMeters(object: MapObject): number {
  if (typeof object.losHeightMeters === 'number' && Number.isFinite(object.losHeightMeters)) return object.losHeightMeters;
  switch (object.kind) {
    case 'tree': return 6;
    case 'structure': return 5;
    case 'post': return 1.35;
    case 'crates': return 1.25;
    case 'rock':
    case 'fence': return 1.2;
    case 'cover':
    case 'well': return 1.1;
    case 'logs':
    case 'bridge': return 0.8;
    case 'ditch':
    default: return 0.2;
  }
}
