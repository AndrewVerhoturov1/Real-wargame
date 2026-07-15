import type { UnitPosture } from '../behavior/BehaviorModel';
import type { GridPosition } from '../geometry';
import {
  resolveObjectCoverProperties,
  type MapObject,
  type TacticalMap,
} from '../map/MapModel';
import { getMapRevisionSnapshot } from '../map/MapRuntimeState';

const CACHE_LIMIT = 16;
const THREAT_POSITION_BUCKET_CELLS = 0.1;
const LEGACY_FOREST_SAMPLES_PER_CELL = 3;

export interface ThreatRelativeCoverFieldOptions {
  readonly threatId: string;
  readonly threatPosition: GridPosition;
  readonly posture: UnitPosture;
}

export interface ThreatRelativeCoverField {
  readonly key: string;
  readonly threatId: string;
  readonly width: number;
  readonly height: number;
  readonly protection: Uint8Array;
  readonly concealment: Uint8Array;
  readonly objectProtection: Uint8Array;
  readonly forestProtection: Uint8Array;
  readonly strongestObjectIndex: Int16Array;
}

export interface ThreatRelativeCoverCell {
  readonly protection: number;
  readonly concealment: number;
  readonly objectProtection: number;
  readonly forestProtection: number;
  readonly object: MapObject | null;
}

export interface ThreatRelativeCoverFieldDiagnostics {
  readonly geometryBuildCount: number;
  readonly cacheHitCount: number;
  readonly fullMapScanCount: number;
  readonly objectChecks: number;
  readonly forestMapReads: number;
  readonly lastBuildMs: number;
  readonly cachedFieldCount: number;
  readonly evictionCount: number;
  readonly lastKey: string;
}

interface MutableDiagnostics {
  geometryBuildCount: number;
  cacheHitCount: number;
  fullMapScanCount: number;
  objectChecks: number;
  forestMapReads: number;
  lastBuildMs: number;
  evictionCount: number;
  lastKey: string;
}

interface MapCache {
  readonly fields: Map<string, ThreatRelativeCoverField>;
  readonly diagnostics: MutableDiagnostics;
}

const cache = new WeakMap<TacticalMap, MapCache>();

export function getThreatRelativeCoverField(
  map: TacticalMap,
  options: ThreatRelativeCoverFieldOptions,
): ThreatRelativeCoverField {
  const mapCache = getMapCache(map);
  const key = buildKey(map, options);
  const existing = mapCache.fields.get(key);
  if (existing) {
    mapCache.diagnostics.cacheHitCount += 1;
    mapCache.fields.delete(key);
    mapCache.fields.set(key, existing);
    return existing;
  }

  const startedAt = performance.now();
  const build = buildField(map, key, options);
  mapCache.fields.set(key, build.field);
  mapCache.diagnostics.geometryBuildCount += 1;
  mapCache.diagnostics.fullMapScanCount += 1;
  mapCache.diagnostics.objectChecks += build.objectChecks;
  mapCache.diagnostics.forestMapReads += build.forestMapReads;
  mapCache.diagnostics.lastBuildMs = performance.now() - startedAt;
  mapCache.diagnostics.lastKey = key;
  trimCache(mapCache);
  return build.field;
}

export function readThreatRelativeCoverCell(
  map: TacticalMap,
  field: ThreatRelativeCoverField,
  position: GridPosition,
): ThreatRelativeCoverCell | null {
  const x = Math.floor(position.x);
  const y = Math.floor(position.y);
  if (x < 0 || y < 0 || x >= field.width || y >= field.height) return null;
  const index = y * field.width + x;
  const objectIndex = field.strongestObjectIndex[index] ?? -1;
  return {
    protection: field.protection[index] ?? 0,
    concealment: field.concealment[index] ?? 0,
    objectProtection: field.objectProtection[index] ?? 0,
    forestProtection: field.forestProtection[index] ?? 0,
    object: objectIndex >= 0 ? map.objects[objectIndex] ?? null : null,
  };
}

export function getThreatRelativeCoverFieldDiagnostics(
  map: TacticalMap,
): ThreatRelativeCoverFieldDiagnostics {
  const existing = cache.get(map);
  if (!existing) {
    return {
      geometryBuildCount: 0,
      cacheHitCount: 0,
      fullMapScanCount: 0,
      objectChecks: 0,
      forestMapReads: 0,
      lastBuildMs: 0,
      cachedFieldCount: 0,
      evictionCount: 0,
      lastKey: '',
    };
  }
  return {
    ...existing.diagnostics,
    cachedFieldCount: existing.fields.size,
  };
}

export function clearThreatRelativeCoverFieldCache(map: TacticalMap): void {
  cache.delete(map);
}

function buildField(
  map: TacticalMap,
  key: string,
  options: ThreatRelativeCoverFieldOptions,
): { field: ThreatRelativeCoverField; objectChecks: number; forestMapReads: number } {
  const cellCount = map.width * map.height;
  const protection = new Uint8Array(cellCount);
  const concealment = new Uint8Array(cellCount);
  const objectProtection = new Uint8Array(cellCount);
  const forestProtection = new Uint8Array(cellCount);
  const strongestObjectIndex = new Int16Array(cellCount);
  strongestObjectIndex.fill(-1);

  const forestDensity = new Float32Array(cellCount);
  const forestMapReads = buildForestDensityField(map, options.threatPosition, forestDensity);
  let objectChecks = 0;

  for (let y = 0; y < map.height; y += 1) {
    for (let x = 0; x < map.width; x += 1) {
      const index = y * map.width + x;
      const target = { x: x + 0.5, y: y + 0.5 };
      let remainingProtection = 1;
      let remainingConcealment = 1;
      let strongestExpected = 0;
      let strongestIndex = -1;

      for (let objectIndex = 0; objectIndex < map.objects.length; objectIndex += 1) {
        const object = map.objects[objectIndex];
        objectChecks += 1;
        const contribution = evaluateObjectContribution(
          object,
          options.threatPosition,
          target,
          options.posture,
        );
        if (!contribution) continue;
        remainingProtection *= 1 - contribution.expectedProtection / 100;
        remainingConcealment *= 1 - contribution.concealment / 100;
        if (contribution.expectedProtection > strongestExpected) {
          strongestExpected = contribution.expectedProtection;
          strongestIndex = objectIndex;
        }
      }

      objectProtection[index] = clampPercent(100 * (1 - remainingProtection));

      const forest = forestContribution(forestDensity[index] ?? 0);
      if (forest.expectedProtection > 0) {
        remainingProtection *= 1 - forest.expectedProtection / 100;
        remainingConcealment *= 1 - forest.concealment / 100;
        if (forest.expectedProtection > strongestExpected) strongestIndex = -1;
      }

      forestProtection[index] = forest.expectedProtection;
      protection[index] = clampPercent(100 * (1 - remainingProtection));
      concealment[index] = clampPercent(100 * (1 - remainingConcealment));
      strongestObjectIndex[index] = strongestIndex;
    }
  }

  return {
    field: {
      key,
      threatId: options.threatId,
      width: map.width,
      height: map.height,
      protection,
      concealment,
      objectProtection,
      forestProtection,
      strongestObjectIndex,
    },
    objectChecks,
    forestMapReads,
  };
}

/**
 * Builds a bounded-cost radial transmittance approximation. Each target cell follows one
 * deterministic DDA predecessor toward the subjective threat origin, so forest work is O(map cells)
 * instead of tracing a separate multi-sample ray for every target. The legacy three-samples-per-cell
 * density scale is retained when accumulating light/dense forest weights.
 */
function buildForestDensityField(
  map: TacticalMap,
  threatPosition: GridPosition,
  density: Float32Array,
): number {
  const originX = clampInt(Math.floor(threatPosition.x), 0, map.width - 1);
  const originY = clampInt(Math.floor(threatPosition.y), 0, map.height - 1);
  const cellCount = map.width * map.height;
  const maxRadius = Math.max(
    originX,
    originY,
    map.width - 1 - originX,
    map.height - 1 - originY,
  );
  const counts = new Uint32Array(maxRadius + 2);

  for (let y = 0; y < map.height; y += 1) {
    for (let x = 0; x < map.width; x += 1) {
      const radius = Math.max(Math.abs(x - originX), Math.abs(y - originY));
      if (radius > 0) counts[radius + 1] += 1;
    }
  }
  for (let index = 1; index < counts.length; index += 1) counts[index] += counts[index - 1];

  const ordered = new Uint32Array(Math.max(0, cellCount - 1));
  const writeOffsets = counts.slice();
  for (let y = 0; y < map.height; y += 1) {
    for (let x = 0; x < map.width; x += 1) {
      const radius = Math.max(Math.abs(x - originX), Math.abs(y - originY));
      if (radius <= 0) continue;
      ordered[writeOffsets[radius]] = y * map.width + x;
      writeOffsets[radius] += 1;
    }
  }

  for (const index of ordered) {
    const x = index % map.width;
    const y = Math.floor(index / map.width);
    propagateForestDensity(map, density, originX, originY, x, y);
  }
  return ordered.length;
}

function propagateForestDensity(
  map: TacticalMap,
  density: Float32Array,
  originX: number,
  originY: number,
  x: number,
  y: number,
): void {
  const dx = x - originX;
  const dy = y - originY;
  const steps = Math.max(Math.abs(dx), Math.abs(dy));
  if (steps <= 0) return;
  const previousScale = (steps - 1) / steps;
  const previousX = Math.round(originX + dx * previousScale);
  const previousY = Math.round(originY + dy * previousScale);
  const previousIndex = previousY * map.width + previousX;
  const index = y * map.width + x;
  const previousCell = map.cells[previousIndex];
  const stepLength = Math.hypot(x - previousX, y - previousY);
  const sampleWeight = previousX === originX && previousY === originY
    ? 0
    : forestDensityWeight(previousCell?.forest ?? 0) * LEGACY_FOREST_SAMPLES_PER_CELL * stepLength;
  density[index] = (density[previousIndex] ?? 0) + sampleWeight;
}

function forestDensityWeight(forest: number): number {
  if (forest === 2) return 1.7;
  if (forest === 1) return 0.8;
  return 0;
}

function forestContribution(density: number): { expectedProtection: number; concealment: number } {
  if (density <= 0) return { expectedProtection: 0, concealment: 0 };
  const strength = clampPercent(8 + Math.min(34, density * 2.1));
  const reliability = clampPercent(18 + Math.min(72, density * 4.2));
  return {
    expectedProtection: clampPercent(strength * reliability / 100),
    concealment: clampPercent(20 + Math.min(78, density * 6)),
  };
}

function evaluateObjectContribution(
  object: MapObject,
  threatPosition: GridPosition,
  targetPosition: GridPosition,
  posture: UnitPosture,
): { expectedProtection: number; concealment: number } | null {
  const properties = resolveObjectCoverProperties(object);
  if (!postureFitsCover(posture, properties.coverPosture)) return null;

  const center = {
    x: object.x + object.widthCells / 2,
    y: object.y + object.heightCells / 2,
  };
  const segment = distanceToSegment(center, threatPosition, targetPosition);
  const hitRadius = Math.max(0.28, Math.min(object.widthCells, object.heightCells) * 0.72);
  if (segment.t <= 0.035 || segment.t >= 0.985 || segment.distance > hitRadius) return null;

  const angleReliability = clampPercent(100 - (segment.distance / hitRadius) * 52);
  const sizeReliability = clampPercent(35 + Math.min(55, Math.max(object.widthCells, object.heightCells) * 18));
  const reliability = clampPercent(
    properties.coverReliability * 0.55 + angleReliability * 0.3 + sizeReliability * 0.15,
  );
  const strength = clampPercent(properties.coverProtection * (properties.penetrable ? 0.58 : 1));
  const expectedProtection = clampPercent(strength * reliability / 100);
  if (expectedProtection <= 0) return null;
  return { expectedProtection, concealment: properties.concealment };
}

function distanceToSegment(
  point: GridPosition,
  start: GridPosition,
  end: GridPosition,
): { distance: number; t: number } {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= 0.000001) {
    return { distance: Math.hypot(point.x - start.x, point.y - start.y), t: 0 };
  }
  const rawT = ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared;
  const t = Math.max(0, Math.min(1, rawT));
  const projectionX = start.x + dx * t;
  const projectionY = start.y + dy * t;
  return { distance: Math.hypot(point.x - projectionX, point.y - projectionY), t };
}

function postureFitsCover(posture: UnitPosture, coverPosture: UnitPosture): boolean {
  const rank: Record<UnitPosture, number> = { prone: 0, crouched: 1, standing: 2 };
  return rank[posture] <= rank[coverPosture];
}

function buildKey(map: TacticalMap, options: ThreatRelativeCoverFieldOptions): string {
  const revisions = getMapRevisionSnapshot(map);
  return [
    map.width,
    map.height,
    map.metersPerCell,
    options.threatId,
    quantize(options.threatPosition.x, THREAT_POSITION_BUCKET_CELLS),
    quantize(options.threatPosition.y, THREAT_POSITION_BUCKET_CELLS),
    options.posture,
    revisions.objects,
    revisions.forest,
  ].join(':');
}

function getMapCache(map: TacticalMap): MapCache {
  const existing = cache.get(map);
  if (existing) return existing;
  const created: MapCache = {
    fields: new Map(),
    diagnostics: {
      geometryBuildCount: 0,
      cacheHitCount: 0,
      fullMapScanCount: 0,
      objectChecks: 0,
      forestMapReads: 0,
      lastBuildMs: 0,
      evictionCount: 0,
      lastKey: '',
    },
  };
  cache.set(map, created);
  return created;
}

function trimCache(mapCache: MapCache): void {
  while (mapCache.fields.size > CACHE_LIMIT) {
    const oldest = mapCache.fields.keys().next().value as string | undefined;
    if (!oldest) break;
    mapCache.fields.delete(oldest);
    mapCache.diagnostics.evictionCount += 1;
  }
}

function quantize(value: number, step: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value / step) * step;
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
