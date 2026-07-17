import type { UnitPosture } from '../behavior/BehaviorModel';
import { measurePerformancePhase } from '../debug/PerformancePhases';
import type { GridPosition } from '../geometry';
import {
  resolveObjectCoverProperties,
  type MapObject,
  type TacticalMap,
} from '../map/MapModel';
import { getMapLayerRevision } from '../map/MapRuntimeState';
import { getVegetationDefinitionKey, resolveVegetationDefinition } from '../map/VegetationDefinition';
import { getVisibilityStaticGrid } from '../visibility/VisibilityStaticGrid';

const CACHE_LIMIT = 16;
const THREAT_POSITION_BUCKET_CELLS = 0.1;
const LEGACY_FOREST_SAMPLES_PER_CELL = 3;
const SQRT_TWO = Math.SQRT2;

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
  readonly staticBuildCount: number;
  readonly cacheHitCount: number;
  readonly fullMapScanCount: number;
  readonly objectChecks: number;
  readonly forestMapReads: number;
  readonly forestDensitySamples: number;
  readonly lastBuildMs: number;
  readonly cachedFieldCount: number;
  readonly evictionCount: number;
  readonly lastKey: string;
}

interface MutableDiagnostics {
  geometryBuildCount: number;
  staticBuildCount: number;
  cacheHitCount: number;
  fullMapScanCount: number;
  objectChecks: number;
  forestMapReads: number;
  forestDensitySamples: number;
  lastBuildMs: number;
  evictionCount: number;
  lastKey: string;
}

interface MapCache {
  readonly fields: Map<string, ThreatRelativeCoverField>;
  readonly hotFields: Map<number, ThreatRelativeCoverField>;
  objectRevision: number;
  forestRevision: number;
  terrainRevision: number;
  vegetationFireKey: string;
  staticGrid: ThreatRelativeCoverStaticGrid | null;
  readonly diagnostics: MutableDiagnostics;
}

interface ThreatRelativeCoverStaticGrid {
  readonly objectRevision: number;
  readonly forestRevision: number;
  readonly terrainRevision: number;
  readonly vegetationFireKey: string;
  readonly forestDensityWeight: Float32Array;
  readonly descriptorsByPosture: Record<UnitPosture, readonly ObjectDescriptor[]>;
}

interface ObjectDescriptor {
  readonly objectIndex: number;
  readonly centerX: number;
  readonly centerY: number;
  readonly hitRadius: number;
  readonly hitRadiusSquared: number;
  readonly coverReliability: number;
  readonly sizeReliability: number;
  readonly strength: number;
  readonly concealment: number;
}

const cache = new WeakMap<TacticalMap, MapCache>();

export function getThreatRelativeCoverField(
  map: TacticalMap,
  options: ThreatRelativeCoverFieldOptions,
): ThreatRelativeCoverField {
  const mapCache = getMapCache(map);
  const objectRevision = getMapLayerRevision(map, 'objects');
  const forestRevision = getMapLayerRevision(map, 'forest');
  const terrainRevision = getMapLayerRevision(map, 'terrain');
  const vegetationFireKey = getVegetationDefinitionKey('fire');
  if (
    mapCache.objectRevision !== objectRevision
    || mapCache.forestRevision !== forestRevision
    || mapCache.terrainRevision !== terrainRevision
    || mapCache.vegetationFireKey !== vegetationFireKey
  ) {
    mapCache.objectRevision = objectRevision;
    mapCache.forestRevision = forestRevision;
    mapCache.terrainRevision = terrainRevision;
    mapCache.vegetationFireKey = vegetationFireKey;
    mapCache.hotFields.clear();
    mapCache.staticGrid = null;
  }

  const staticGrid = getStaticGrid(map, mapCache, objectRevision, forestRevision, terrainRevision, vegetationFireKey);

  const quantizedX = quantizeInteger(options.threatPosition.x, THREAT_POSITION_BUCKET_CELLS);
  const quantizedY = quantizeInteger(options.threatPosition.y, THREAT_POSITION_BUCKET_CELLS);
  const hotKey = buildNumericHotKey(quantizedX, quantizedY, options.posture);
  const hot = mapCache.hotFields.get(hotKey);
  if (hot) {
    mapCache.diagnostics.cacheHitCount += 1;
    return hot;
  }

  const key = [
    map.width,
    map.height,
    map.metersPerCell,
    quantizedX,
    quantizedY,
    options.posture,
    objectRevision,
    forestRevision,
    terrainRevision,
    vegetationFireKey,
  ].join(':');
  const existing = mapCache.fields.get(key);
  if (existing) {
    mapCache.diagnostics.cacheHitCount += 1;
    mapCache.fields.delete(key);
    mapCache.fields.set(key, existing);
    mapCache.hotFields.set(hotKey, existing);
    mapCache.diagnostics.lastKey = key;
    return existing;
  }

  const startedAt = performance.now();
  const build = measurePerformancePhase(
    'field.threat-relative-cover.build',
    () => buildField(map, key, options, staticGrid),
  );
  mapCache.fields.set(key, build.field);
  mapCache.hotFields.set(hotKey, build.field);
  mapCache.diagnostics.geometryBuildCount += 1;
  mapCache.diagnostics.fullMapScanCount += 1;
  mapCache.diagnostics.objectChecks += build.objectChecks;
  mapCache.diagnostics.forestMapReads += build.forestMapReads;
  mapCache.diagnostics.forestDensitySamples += build.forestDensitySamples;
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

export function readThreatRelativeCoverProtection(
  field: ThreatRelativeCoverField,
  position: GridPosition,
): number {
  const x = Math.floor(position.x);
  const y = Math.floor(position.y);
  if (x < 0 || y < 0 || x >= field.width || y >= field.height) return 0;
  return field.protection[y * field.width + x] ?? 0;
}

export function getThreatRelativeCoverFieldDiagnostics(
  map: TacticalMap,
): ThreatRelativeCoverFieldDiagnostics {
  const existing = cache.get(map);
  if (!existing) return emptyDiagnostics();
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
  staticGrid: ThreatRelativeCoverStaticGrid,
): {
  field: ThreatRelativeCoverField;
  objectChecks: number;
  forestMapReads: number;
  forestDensitySamples: number;
} {
  const cellCount = map.width * map.height;
  const protection = new Uint8Array(cellCount);
  const concealment = new Uint8Array(cellCount);
  const objectProtection = new Uint8Array(cellCount);
  const forestProtection = new Uint8Array(cellCount);
  const strongestObjectIndex = new Int16Array(cellCount);
  strongestObjectIndex.fill(-1);

  const forestDensity = new Float32Array(cellCount);
  const forestDensitySamples = buildForestDensityField(
    map,
    options.threatPosition,
    forestDensity,
    staticGrid.forestDensityWeight,
  );
  const descriptors = staticGrid.descriptorsByPosture[options.posture];
  const threatX = options.threatPosition.x;
  const threatY = options.threatPosition.y;
  const remainingProtection = new Float32Array(cellCount);
  const remainingConcealment = new Float32Array(cellCount);
  const strongestExpected = new Uint8Array(cellCount);
  remainingProtection.fill(1);
  remainingConcealment.fill(1);
  let objectChecks = 0;

  for (const descriptor of descriptors) {
    const bounds = buildObjectShadowBounds(map, options.threatPosition, descriptor);
    for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
      const targetY = y + 0.5;
      for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
        const targetX = x + 0.5;
        const segmentX = targetX - threatX;
        const segmentY = targetY - threatY;
        const lengthSquared = segmentX * segmentX + segmentY * segmentY;
        if (lengthSquared <= 0.000001) continue;
        objectChecks += 1;
        const rawT = (
          (descriptor.centerX - threatX) * segmentX
          + (descriptor.centerY - threatY) * segmentY
        ) / lengthSquared;
        if (rawT <= 0.035 || rawT >= 0.985) continue;
        const projectionX = threatX + segmentX * rawT;
        const projectionY = threatY + segmentY * rawT;
        const deltaX = descriptor.centerX - projectionX;
        const deltaY = descriptor.centerY - projectionY;
        const distanceSquared = deltaX * deltaX + deltaY * deltaY;
        if (distanceSquared > descriptor.hitRadiusSquared) continue;

        const angleReliability = clampPercent(
          100 - (Math.sqrt(distanceSquared) / descriptor.hitRadius) * 52,
        );
        const reliability = clampPercent(
          descriptor.coverReliability * 0.55
            + angleReliability * 0.3
            + descriptor.sizeReliability * 0.15,
        );
        const expectedProtection = clampPercent(descriptor.strength * reliability / 100);
        if (expectedProtection <= 0) continue;
        const index = y * map.width + x;
        remainingProtection[index] *= 1 - expectedProtection / 100;
        remainingConcealment[index] *= 1 - descriptor.concealment / 100;
        if (expectedProtection > strongestExpected[index]) {
          strongestExpected[index] = expectedProtection;
          strongestObjectIndex[index] = descriptor.objectIndex;
        }
      }
    }
  }

  for (let index = 0; index < cellCount; index += 1) {
    objectProtection[index] = clampPercent(100 * (1 - remainingProtection[index]));
    const density = forestDensity[index] ?? 0;
    if (density > 0) {
      const forestStrength = clampPercent(8 + Math.min(34, density * 2.1));
      const forestReliability = clampPercent(18 + Math.min(72, density * 4.2));
      const forestExpected = clampPercent(forestStrength * forestReliability / 100);
      const forestConcealment = clampPercent(20 + Math.min(78, density * 6));
      forestProtection[index] = forestExpected;
      remainingProtection[index] *= 1 - forestExpected / 100;
      remainingConcealment[index] *= 1 - forestConcealment / 100;
      if (forestExpected > strongestExpected[index]) strongestObjectIndex[index] = -1;
    }
    protection[index] = clampPercent(100 * (1 - remainingProtection[index]));
    concealment[index] = clampPercent(100 * (1 - remainingConcealment[index]));
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
    forestMapReads: 0,
    forestDensitySamples,
  };
}

function buildObjectDescriptors(map: TacticalMap, posture: UnitPosture): ObjectDescriptor[] {
  const result: ObjectDescriptor[] = [];
  for (let objectIndex = 0; objectIndex < map.objects.length; objectIndex += 1) {
    const object = map.objects[objectIndex];
    const properties = resolveObjectCoverProperties(object);
    if (!postureFitsCover(posture, properties.coverPosture)) continue;
    const hitRadius = Math.max(0.28, Math.min(object.widthCells, object.heightCells) * 0.72);
    result.push({
      objectIndex,
      centerX: object.x + object.widthCells / 2,
      centerY: object.y + object.heightCells / 2,
      hitRadius,
      hitRadiusSquared: hitRadius * hitRadius,
      coverReliability: properties.coverReliability,
      sizeReliability: clampPercent(
        35 + Math.min(55, Math.max(object.widthCells, object.heightCells) * 18),
      ),
      strength: clampPercent(properties.coverProtection * (properties.penetrable ? 0.58 : 1)),
      concealment: properties.concealment,
    });
  }
  return result;
}

function getStaticGrid(
  map: TacticalMap,
  mapCache: MapCache,
  objectRevision: number,
  forestRevision: number,
  terrainRevision: number,
  vegetationFireKey: string,
): ThreatRelativeCoverStaticGrid {
  const existing = mapCache.staticGrid;
  if (
    existing
    && existing.objectRevision === objectRevision
    && existing.forestRevision === forestRevision
    && existing.terrainRevision === terrainRevision
    && existing.vegetationFireKey === vegetationFireKey
  ) return existing;

  const visibilityGrid = getVisibilityStaticGrid(map);
  const forestDensityWeight = new Float32Array(map.width * map.height);
  for (let index = 0; index < forestDensityWeight.length; index += 1) {
    const vegetationMaterialId = visibilityGrid.vegetationMaterialIds[
      visibilityGrid.vegetationMaterialCodes[index] ?? 0
    ] ?? 'none';
    forestDensityWeight[index] = resolveVegetationDefinition(vegetationMaterialId).fire.densityWeight;
  }
  const created: ThreatRelativeCoverStaticGrid = {
    objectRevision,
    forestRevision,
    terrainRevision,
    vegetationFireKey,
    forestDensityWeight,
    descriptorsByPosture: {
      standing: buildObjectDescriptors(map, 'standing'),
      crouched: buildObjectDescriptors(map, 'crouched'),
      prone: buildObjectDescriptors(map, 'prone'),
    },
  };
  mapCache.staticGrid = created;
  mapCache.diagnostics.staticBuildCount += 1;
  return created;
}

function buildObjectShadowBounds(
  map: TacticalMap,
  threatPosition: GridPosition,
  descriptor: ObjectDescriptor,
): { minX: number; minY: number; maxX: number; maxY: number } {
  const dx = descriptor.centerX - threatPosition.x;
  const dy = descriptor.centerY - threatPosition.y;
  const distance = Math.hypot(dx, dy);
  if (distance <= descriptor.hitRadius + 0.001) {
    return { minX: 0, minY: 0, maxX: map.width - 1, maxY: map.height - 1 };
  }

  const bearing = Math.atan2(dy, dx);
  const halfAngle = Math.asin(Math.min(0.999, descriptor.hitRadius / distance));
  const farDistance = Math.max(
    Math.hypot(threatPosition.x, threatPosition.y),
    Math.hypot(map.width - threatPosition.x, threatPosition.y),
    Math.hypot(threatPosition.x, map.height - threatPosition.y),
    Math.hypot(map.width - threatPosition.x, map.height - threatPosition.y),
  ) + 1;
  const nearDistance = Math.max(0, distance - descriptor.hitRadius - 1);
  const points = [
    threatPosition,
    polarPoint(threatPosition, bearing - halfAngle, nearDistance),
    polarPoint(threatPosition, bearing + halfAngle, nearDistance),
    polarPoint(threatPosition, bearing - halfAngle, farDistance),
    polarPoint(threatPosition, bearing + halfAngle, farDistance),
  ];
  return {
    minX: clampInt(Math.floor(Math.min(...points.map((point) => point.x))) - 1, 0, map.width - 1),
    minY: clampInt(Math.floor(Math.min(...points.map((point) => point.y))) - 1, 0, map.height - 1),
    maxX: clampInt(Math.ceil(Math.max(...points.map((point) => point.x))) + 1, 0, map.width - 1),
    maxY: clampInt(Math.ceil(Math.max(...points.map((point) => point.y))) + 1, 0, map.height - 1),
  };
}

function polarPoint(origin: GridPosition, bearing: number, distance: number): GridPosition {
  return {
    x: origin.x + Math.cos(bearing) * distance,
    y: origin.y + Math.sin(bearing) * distance,
  };
}

/**
 * Deterministic radial predecessor propagation. Every in-map non-origin cell is visited once,
 * after its Chebyshev-nearer predecessor, retaining cumulative light/dense forest transmittance
 * without tracing a separate multi-sample ray to every target.
 */
function buildForestDensityField(
  map: TacticalMap,
  threatPosition: GridPosition,
  density: Float32Array,
  forestDensityWeight: Float32Array,
): number {
  const originX = clampInt(Math.floor(threatPosition.x), 0, map.width - 1);
  const originY = clampInt(Math.floor(threatPosition.y), 0, map.height - 1);
  const maxRadius = Math.max(
    originX,
    originY,
    map.width - 1 - originX,
    map.height - 1 - originY,
  );
  let reads = 0;

  for (let radius = 1; radius <= maxRadius; radius += 1) {
    const minX = originX - radius;
    const maxX = originX + radius;
    const minY = originY - radius;
    const maxY = originY + radius;

    for (let x = minX; x <= maxX; x += 1) {
      if (x < 0 || x >= map.width) continue;
      if (minY >= 0 && minY < map.height) {
        propagateForestDensity(map, density, forestDensityWeight, originX, originY, x, minY);
        reads += 1;
      }
      if (maxY !== minY && maxY >= 0 && maxY < map.height) {
        propagateForestDensity(map, density, forestDensityWeight, originX, originY, x, maxY);
        reads += 1;
      }
    }
    for (let y = minY + 1; y < maxY; y += 1) {
      if (y < 0 || y >= map.height) continue;
      if (minX >= 0 && minX < map.width) {
        propagateForestDensity(map, density, forestDensityWeight, originX, originY, minX, y);
        reads += 1;
      }
      if (maxX !== minX && maxX >= 0 && maxX < map.width) {
        propagateForestDensity(map, density, forestDensityWeight, originX, originY, maxX, y);
        reads += 1;
      }
    }
  }
  return reads;
}

function propagateForestDensity(
  map: TacticalMap,
  density: Float32Array,
  forestDensityWeight: Float32Array,
  originX: number,
  originY: number,
  x: number,
  y: number,
): void {
  const dx = x - originX;
  const dy = y - originY;
  const steps = Math.max(Math.abs(dx), Math.abs(dy));
  const previousScale = (steps - 1) / steps;
  const previousX = Math.round(originX + dx * previousScale);
  const previousY = Math.round(originY + dy * previousScale);
  const previousIndex = previousY * map.width + previousX;
  const index = y * map.width + x;
  const stepLength = previousX !== x && previousY !== y ? SQRT_TWO : 1;
  const sampleWeight = previousX === originX && previousY === originY
    ? 0
    : (forestDensityWeight[previousIndex] ?? 0)
      * LEGACY_FOREST_SAMPLES_PER_CELL
      * stepLength;
  density[index] = (density[previousIndex] ?? 0) + sampleWeight;
}

function postureFitsCover(posture: UnitPosture, coverPosture: UnitPosture): boolean {
  const rank: Record<UnitPosture, number> = { prone: 0, crouched: 1, standing: 2 };
  return rank[posture] <= rank[coverPosture];
}

function buildNumericHotKey(x: number, y: number, posture: UnitPosture): number {
  const postureCode = posture === 'prone' ? 0 : posture === 'crouched' ? 1 : 2;
  return ((x + 100_000) * 200_001 + (y + 100_000)) * 4 + postureCode;
}

function getMapCache(map: TacticalMap): MapCache {
  const existing = cache.get(map);
  if (existing) return existing;
  const created: MapCache = {
    fields: new Map(),
    hotFields: new Map(),
    objectRevision: -1,
    forestRevision: -1,
    terrainRevision: -1,
    vegetationFireKey: '',
    staticGrid: null,
    diagnostics: {
      geometryBuildCount: 0,
      staticBuildCount: 0,
      cacheHitCount: 0,
      fullMapScanCount: 0,
      objectChecks: 0,
      forestMapReads: 0,
      forestDensitySamples: 0,
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
    const removed = mapCache.fields.get(oldest);
    mapCache.fields.delete(oldest);
    if (removed) {
      for (const [hotKey, field] of mapCache.hotFields) {
        if (field === removed) mapCache.hotFields.delete(hotKey);
      }
    }
    mapCache.diagnostics.evictionCount += 1;
  }
}

function emptyDiagnostics(): ThreatRelativeCoverFieldDiagnostics {
  return {
    geometryBuildCount: 0,
    staticBuildCount: 0,
    cacheHitCount: 0,
    fullMapScanCount: 0,
    objectChecks: 0,
    forestMapReads: 0,
    forestDensitySamples: 0,
    lastBuildMs: 0,
    cachedFieldCount: 0,
    evictionCount: 0,
    lastKey: '',
  };
}

function quantizeInteger(value: number, step: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value / step);
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
