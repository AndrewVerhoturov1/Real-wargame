import type { GridPosition } from '../geometry';
import {
  getMapObjectBounds,
  mapObjectBoundsOverlap,
  type MapObjectBounds,
} from '../map/MapObjectGeometry';
import type { MapObject, TacticalMap } from '../map/MapModel';
import { getMapLayerRevision } from '../map/MapRuntimeState';

export { getMapObjectBounds, type MapObjectBounds } from '../map/MapObjectGeometry';

export interface MapObjectSpatialIndexDiagnostics {
  objectsRevision: number;
  buildCount: number;
  queryCount: number;
  bucketCount: number;
  objectCount: number;
  lastCandidateCount: number;
}

export interface MapObjectSpatialQueryScratch {
  readonly seenObjectIds: Set<string>;
}

interface CachedSpatialIndex {
  revision: number;
  index: MapObjectSpatialIndex;
  diagnostics: MapObjectSpatialIndexDiagnostics;
}

const DEFAULT_BUCKET_SIZE_CELLS = 8;
const cache = new WeakMap<TacticalMap, CachedSpatialIndex>();

export function createMapObjectSpatialQueryScratch(): MapObjectSpatialQueryScratch {
  return { seenObjectIds: new Set<string>() };
}

export class MapObjectSpatialIndex {
  private readonly buckets = new Map<string, MapObject[]>();

  constructor(
    readonly map: TacticalMap,
    readonly bucketSizeCells = DEFAULT_BUCKET_SIZE_CELLS,
  ) {
    for (const object of map.objects) {
      const bounds = getMapObjectBounds(object);
      this.forEachBucket(bounds, (bucket) => bucket.push(object));
    }
    for (const bucket of this.buckets.values()) bucket.sort(compareObjects);
  }

  get bucketCount(): number {
    return this.buckets.size;
  }

  queryPoint(x: number, y: number): MapObject[] {
    return this.queryRect({ minX: x, minY: y, maxX: x, maxY: y });
  }

  queryRect(bounds: MapObjectBounds): MapObject[] {
    const output: MapObject[] = [];
    this.queryRectInto(bounds, output, createMapObjectSpatialQueryScratch());
    return output;
  }

  queryRectInto(
    bounds: MapObjectBounds,
    output: MapObject[],
    scratch: MapObjectSpatialQueryScratch,
  ): number {
    output.length = 0;
    scratch.seenObjectIds.clear();
    this.forEachBucket(bounds, (bucket) => {
      for (const object of bucket) {
        if (scratch.seenObjectIds.has(object.id)) continue;
        scratch.seenObjectIds.add(object.id);
        if (mapObjectBoundsOverlap(getMapObjectBounds(object), bounds)) output.push(object);
      }
    }, false);
    output.sort(compareObjects);
    return output.length;
  }

  queryCircle(center: GridPosition, radiusCells: number): MapObject[] {
    const radius = Math.max(0, radiusCells);
    return this.queryRect({
      minX: center.x - radius,
      minY: center.y - radius,
      maxX: center.x + radius,
      maxY: center.y + radius,
    });
  }

  querySegment(start: GridPosition, end: GridPosition, paddingCells = 0.25): MapObject[] {
    const output: MapObject[] = [];
    this.querySegmentInto(start, end, paddingCells, output, createMapObjectSpatialQueryScratch());
    return output;
  }

  querySegmentInto(
    start: GridPosition,
    end: GridPosition,
    paddingCells: number,
    output: MapObject[],
    scratch: MapObjectSpatialQueryScratch,
  ): number {
    const padding = Math.max(0, paddingCells);
    return this.queryRectInto({
      minX: Math.min(start.x, end.x) - padding,
      minY: Math.min(start.y, end.y) - padding,
      maxX: Math.max(start.x, end.x) + padding,
      maxY: Math.max(start.y, end.y) + padding,
    }, output, scratch);
  }

  private forEachBucket(
    bounds: MapObjectBounds,
    callback: (bucket: MapObject[]) => void,
    createMissing = true,
  ): void {
    const safeBucketSize = Math.max(1, this.bucketSizeCells);
    const minBucketX = Math.floor(bounds.minX / safeBucketSize);
    const maxBucketX = Math.floor(bounds.maxX / safeBucketSize);
    const minBucketY = Math.floor(bounds.minY / safeBucketSize);
    const maxBucketY = Math.floor(bounds.maxY / safeBucketSize);

    for (let bucketY = minBucketY; bucketY <= maxBucketY; bucketY += 1) {
      for (let bucketX = minBucketX; bucketX <= maxBucketX; bucketX += 1) {
        const key = `${bucketX}:${bucketY}`;
        let bucket = this.buckets.get(key);
        if (!bucket && createMissing) {
          bucket = [];
          this.buckets.set(key, bucket);
        }
        if (bucket) callback(bucket);
      }
    }
  }
}

export function getMapObjectSpatialIndex(map: TacticalMap): MapObjectSpatialIndex {
  const revision = getMapLayerRevision(map, 'objects');
  const existing = cache.get(map);
  if (existing?.revision === revision) return existing.index;

  const index = new MapObjectSpatialIndex(map);
  const diagnostics: MapObjectSpatialIndexDiagnostics = {
    objectsRevision: revision,
    buildCount: (existing?.diagnostics.buildCount ?? 0) + 1,
    queryCount: existing?.diagnostics.queryCount ?? 0,
    bucketCount: index.bucketCount,
    objectCount: map.objects.length,
    lastCandidateCount: 0,
  };

  const instrumented = instrumentQueries(index, diagnostics);
  cache.set(map, { revision, index: instrumented, diagnostics });
  return instrumented;
}

export function getMapObjectSpatialIndexDiagnostics(map: TacticalMap): MapObjectSpatialIndexDiagnostics {
  const existing = cache.get(map);
  if (!existing) {
    return {
      objectsRevision: getMapLayerRevision(map, 'objects'),
      buildCount: 0,
      queryCount: 0,
      bucketCount: 0,
      objectCount: map.objects.length,
      lastCandidateCount: 0,
    };
  }
  return { ...existing.diagnostics };
}

function instrumentQueries(
  index: MapObjectSpatialIndex,
  diagnostics: MapObjectSpatialIndexDiagnostics,
): MapObjectSpatialIndex {
  const original = index.queryRectInto.bind(index);
  Object.defineProperty(index, 'queryRectInto', {
    configurable: true,
    value: (...args: Parameters<MapObjectSpatialIndex['queryRectInto']>) => {
      const count = original(...args);
      diagnostics.queryCount += 1;
      diagnostics.lastCandidateCount = count;
      return count;
    },
  });
  return index;
}

function compareObjects(left: MapObject, right: MapObject): number {
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}
