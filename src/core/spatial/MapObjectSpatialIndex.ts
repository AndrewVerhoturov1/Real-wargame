import type { GridPosition } from '../geometry';
import type { MapObject, TacticalMap } from '../map/MapModel';
import { getMapLayerRevision } from '../map/MapRuntimeState';

export interface MapObjectBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface MapObjectSpatialIndexDiagnostics {
  objectsRevision: number;
  buildCount: number;
  queryCount: number;
  bucketCount: number;
  objectCount: number;
  lastCandidateCount: number;
}

interface CachedSpatialIndex {
  revision: number;
  index: MapObjectSpatialIndex;
  diagnostics: MapObjectSpatialIndexDiagnostics;
}

const DEFAULT_BUCKET_SIZE_CELLS = 8;
const cache = new WeakMap<TacticalMap, CachedSpatialIndex>();

export class MapObjectSpatialIndex {
  private readonly buckets = new Map<string, MapObject[]>();
  private readonly order = new Map<MapObject, number>();

  constructor(
    readonly map: TacticalMap,
    readonly bucketSizeCells = DEFAULT_BUCKET_SIZE_CELLS,
  ) {
    for (const [index, object] of map.objects.entries()) {
      this.order.set(object, index);
      const bounds = getMapObjectBounds(object);
      this.forEachBucket(bounds, (bucket) => bucket.push(object));
    }
  }

  get bucketCount(): number {
    return this.buckets.size;
  }

  queryPoint(x: number, y: number): MapObject[] {
    return this.queryRect({ minX: x, minY: y, maxX: x, maxY: y });
  }

  queryRect(bounds: MapObjectBounds): MapObject[] {
    const candidates = new Set<MapObject>();
    this.forEachBucket(bounds, (bucket) => {
      for (const object of bucket) candidates.add(object);
    }, false);

    const filtered = new Set<MapObject>();
    for (const object of candidates) {
      if (boundsOverlap(getMapObjectBounds(object), bounds)) filtered.add(object);
    }
    return this.sortCandidates(filtered);
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
    const padding = Math.max(0, paddingCells);
    return this.queryRect({
      minX: Math.min(start.x, end.x) - padding,
      minY: Math.min(start.y, end.y) - padding,
      maxX: Math.max(start.x, end.x) + padding,
      maxY: Math.max(start.y, end.y) + padding,
    });
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

  private sortCandidates(candidates: Set<MapObject>): MapObject[] {
    return [...candidates].sort((left, right) => (
      (this.order.get(left) ?? Number.MAX_SAFE_INTEGER)
      - (this.order.get(right) ?? Number.MAX_SAFE_INTEGER)
    ));
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

export function getMapObjectBounds(object: MapObject): MapObjectBounds {
  const halfWidth = Math.max(0.05, object.widthCells / 2);
  const halfHeight = Math.max(0.05, object.heightCells / 2);
  const cos = Math.abs(Math.cos(object.rotationRadians));
  const sin = Math.abs(Math.sin(object.rotationRadians));
  const extentX = cos * halfWidth + sin * halfHeight;
  const extentY = sin * halfWidth + cos * halfHeight;
  const centerX = object.x + 0.5;
  const centerY = object.y + 0.5;
  return {
    minX: centerX - extentX,
    minY: centerY - extentY,
    maxX: centerX + extentX,
    maxY: centerY + extentY,
  };
}

function boundsOverlap(left: MapObjectBounds, right: MapObjectBounds): boolean {
  return left.maxX >= right.minX
    && left.minX <= right.maxX
    && left.maxY >= right.minY
    && left.minY <= right.maxY;
}

function instrumentQueries(
  index: MapObjectSpatialIndex,
  diagnostics: MapObjectSpatialIndexDiagnostics,
): MapObjectSpatialIndex {
  for (const methodName of ['queryPoint', 'queryRect', 'queryCircle', 'querySegment'] as const) {
    const original = index[methodName].bind(index) as (...args: unknown[]) => MapObject[];
    Object.defineProperty(index, methodName, {
      configurable: true,
      value: (...args: unknown[]) => {
        const result = original(...args);
        diagnostics.queryCount += 1;
        diagnostics.lastCandidateCount = result.length;
        return result;
      },
    });
  }
  return index;
}
