import {
  getMapObjectBounds,
  getMapObjectCenter,
  getMapObjectHeightMetres,
  mapObjectIntersectsRect,
} from '../map/MapObjectGeometry';
import type { MapObject, MapObjectKind, TacticalMap } from '../map/MapModel';
import { getMapRevisionSnapshot } from '../map/MapRuntimeState';
import { resolveCellVegetationMaterialId } from '../map/VegetationDefinition';
import { sampleSmoothHeightLevel } from '../terrain/SmoothTerrain';

const ELEVATION_STEP_METERS = 2;

export interface VisibilityStaticGrid {
  width: number;
  height: number;
  terrainHeightMeters: Float32Array;
  objectTopHeightMeters: Float32Array;
  vegetationMaterialIds: readonly string[];
  vegetationMaterialCodes: Uint16Array;
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
  const vegetationMaterialIds: string[] = [];
  const vegetationCodeById = new Map<string, number>();
  const vegetationMaterialCodes = new Uint16Array(length);
  const blockingFlags = new Uint8Array(length);

  for (let y = 0; y < map.height; y += 1) {
    for (let x = 0; x < map.width; x += 1) {
      const index = y * map.width + x;
      terrainHeightMeters[index] = sampleSmoothHeightLevel(map, x + 0.5, y + 0.5) * ELEVATION_STEP_METERS;
      const vegetationMaterialId = resolveCellVegetationMaterialId(map.cells[index]);
      let vegetationCode = vegetationCodeById.get(vegetationMaterialId);
      if (vegetationCode === undefined) {
        vegetationCode = vegetationMaterialIds.length;
        vegetationMaterialIds.push(vegetationMaterialId);
        vegetationCodeById.set(vegetationMaterialId, vegetationCode);
      }
      vegetationMaterialCodes[index] = vegetationCode;
    }
  }

  for (const object of map.objects) rasterizeObject(map, object, objectTopHeightMeters, blockingFlags);

  return {
    width: map.width,
    height: map.height,
    terrainHeightMeters,
    objectTopHeightMeters,
    vegetationMaterialIds,
    vegetationMaterialCodes,
    blockingFlags,
    mapVisualRevision: revision,
  };
}

function rasterizeObject(
  map: TacticalMap,
  object: MapObject,
  objectTopHeightMeters: Float32Array,
  blockingFlags: Uint8Array,
): void {
  const height = getMapObjectHeightMetres(object);
  if (height <= 0.05) return;
  const center = getMapObjectCenter(object);
  const objectGround = sampleSmoothHeightLevel(map, center.x, center.y) * ELEVATION_STEP_METERS;
  const objectTop = objectGround + height;
  const bounds = getMapObjectBounds(object);
  const minX = Math.max(0, Math.floor(bounds.minX));
  const maxX = Math.min(map.width - 1, Math.ceil(bounds.maxX) - 1);
  const minY = Math.max(0, Math.floor(bounds.minY));
  const maxY = Math.min(map.height - 1, Math.ceil(bounds.maxY) - 1);

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      if (!mapObjectIntersectsRect(object, { minX: x, minY: y, maxX: x + 1, maxY: y + 1 })) continue;
      const index = y * map.width + x;
      objectTopHeightMeters[index] = Math.max(objectTopHeightMeters[index], objectTop);
      if (blocksLineOfSight(object.kind)) blockingFlags[index] = 1;
    }
  }
}

function blocksLineOfSight(kind: MapObjectKind): boolean {
  return kind !== 'ditch' && kind !== 'bridge';
}
