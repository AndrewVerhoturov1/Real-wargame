import type { GridPosition } from '../geometry';
import type { TacticalMap } from '../map/MapModel';
import {
  resolveVegetationDefinition,
  VEGETATION_DEFINITION_REVISION,
} from '../map/VegetationDefinition';
import { getVisibilityStaticGrid } from './VisibilityStaticGrid';

const CACHE_LIMIT = 24;
const POSITION_QUANTUM_CELLS = 0.25;
const HEIGHT_QUANTUM_METERS = 0.05;
const HORIZON_MARGIN = 0.02;

export type VisibilityBlockerKind = 0 | 1 | 2;

export interface VisibilityGeometryFieldOptions {
  readonly origin: GridPosition;
  readonly originHeightAboveGroundMeters: number;
  readonly targetHeightAboveGroundMeters: number;
  readonly rangeCells: number;
}

export interface VisibilityGeometryField {
  readonly key: string;
  readonly originX: number;
  readonly originY: number;
  readonly width: number;
  readonly height: number;
  readonly rangeCells: number;
  /** 1 only for terrain/object occlusion. Vegetation remains transmissive. */
  readonly hardBlocked: Uint8Array;
  readonly visualTransmission: Uint8Array;
  readonly fireTransmission: Uint8Array;
  /** 0 none, 1 terrain/horizon, 2 map object. */
  readonly blockerKind: Uint8Array;
  readonly mapVisualRevision: number;
}

export interface VisibilityGeometryFieldDiagnostics {
  readonly geometryBuildCount: number;
  readonly geometryCacheHitCount: number;
  readonly cachedFieldCount: number;
  readonly fullMapScanCount: number;
  readonly processedCellCount: number;
  readonly rayCount: number;
  readonly retainedTypedArrayBytes: number;
  readonly lastKey: string;
}

interface MutableDiagnostics {
  geometryBuildCount: number;
  geometryCacheHitCount: number;
  fullMapScanCount: number;
  processedCellCount: number;
  rayCount: number;
  lastKey: string;
}

interface MapCache {
  readonly fields: Map<string, VisibilityGeometryField>;
  readonly diagnostics: MutableDiagnostics;
}

const cacheByMap = new WeakMap<TacticalMap, MapCache>();

export function getVisibilityGeometryField(
  map: TacticalMap,
  options: VisibilityGeometryFieldOptions,
): VisibilityGeometryField {
  const staticGrid = getVisibilityStaticGrid(map);
  const normalized = normalizeOptions(map, options);
  const key = buildKey(staticGrid.mapVisualRevision, normalized);
  const cache = getMapCache(map);
  const existing = cache.fields.get(key);
  if (existing) {
    cache.diagnostics.geometryCacheHitCount += 1;
    cache.diagnostics.lastKey = key;
    touch(cache.fields, key, existing);
    return existing;
  }

  const build = buildField(map, staticGrid, normalized, key);
  cache.fields.set(key, build.field);
  trimCache(cache.fields, CACHE_LIMIT);
  cache.diagnostics.geometryBuildCount += 1;
  cache.diagnostics.processedCellCount += build.processedCellCount;
  cache.diagnostics.rayCount += build.rayCount;
  cache.diagnostics.lastKey = key;
  return build.field;
}

export function getVisibilityGeometryFieldDiagnostics(
  map: TacticalMap,
): VisibilityGeometryFieldDiagnostics {
  const cache = cacheByMap.get(map);
  if (!cache) return emptyDiagnostics();
  let retainedTypedArrayBytes = 0;
  for (const field of cache.fields.values()) {
    retainedTypedArrayBytes += field.hardBlocked.byteLength
      + field.visualTransmission.byteLength
      + field.fireTransmission.byteLength
      + field.blockerKind.byteLength;
  }
  return {
    ...cache.diagnostics,
    cachedFieldCount: cache.fields.size,
    retainedTypedArrayBytes,
  };
}

export function clearVisibilityGeometryFieldCache(map: TacticalMap): void {
  cacheByMap.delete(map);
}

export function readVisibilityGeometryCell(
  field: VisibilityGeometryField,
  x: number,
  y: number,
): { hardBlocked: boolean; visualTransmission: number; fireTransmission: number; blockerKind: VisibilityBlockerKind } {
  const cellX = Math.floor(x);
  const cellY = Math.floor(y);
  if (cellX < 0 || cellY < 0 || cellX >= field.width || cellY >= field.height) {
    return { hardBlocked: true, visualTransmission: 0, fireTransmission: 0, blockerKind: 1 };
  }
  const index = cellY * field.width + cellX;
  return {
    hardBlocked: field.hardBlocked[index] === 1,
    visualTransmission: (field.visualTransmission[index] ?? 0) / 255,
    fireTransmission: (field.fireTransmission[index] ?? 0) / 255,
    blockerKind: (field.blockerKind[index] ?? 0) as VisibilityBlockerKind,
  };
}

function buildField(
  map: TacticalMap,
  staticGrid: ReturnType<typeof getVisibilityStaticGrid>,
  options: ReturnType<typeof normalizeOptions>,
  key: string,
): { field: VisibilityGeometryField; processedCellCount: number; rayCount: number } {
  const cellCount = map.width * map.height;
  const hardBlocked = new Uint8Array(cellCount);
  const visualTransmission = new Uint8Array(cellCount);
  const fireTransmission = new Uint8Array(cellCount);
  const blockerKind = new Uint8Array(cellCount);
  hardBlocked.fill(1);

  const originCellX = clampInt(Math.floor(options.origin.x), 0, map.width - 1);
  const originCellY = clampInt(Math.floor(options.origin.y), 0, map.height - 1);
  const radius = Math.max(1, Math.ceil(options.rangeCells));
  const minX = Math.max(0, originCellX - radius);
  const minY = Math.max(0, originCellY - radius);
  const maxX = Math.min(map.width - 1, originCellX + radius);
  const maxY = Math.min(map.height - 1, originCellY + radius);
  const originIndex = originCellY * map.width + originCellX;
  const originEye = staticGrid.terrainHeightMeters[originIndex]
    + options.originHeightAboveGroundMeters;
  const perimeter = perimeterCells(minX, minY, maxX, maxY);
  let processedCellCount = 0;

  writeVisibleCell(
    hardBlocked,
    visualTransmission,
    fireTransmission,
    blockerKind,
    originIndex,
    255,
    255,
  );

  for (const target of perimeter) {
    let visual = 1;
    let fire = 1;
    let horizonSlope = Number.NEGATIVE_INFINITY;
    let horizonKind: VisibilityBlockerKind = 1;
    let previousX = originCellX;
    let previousY = originCellY;
    const cells = supercoverLine(originCellX, originCellY, target.x, target.y);

    for (let index = 1; index < cells.length; index += 1) {
      const cell = cells[index];
      const dx = cell.x + 0.5 - options.origin.x;
      const dy = cell.y + 0.5 - options.origin.y;
      const distanceCells = Math.hypot(dx, dy);
      if (distanceCells > options.rangeCells + 0.001) break;
      const distanceMeters = distanceCells * map.metersPerCell;
      const mapIndex = cell.y * map.width + cell.x;
      const terrainHeight = staticGrid.terrainHeightMeters[mapIndex];
      const targetSlope = (
        terrainHeight + options.targetHeightAboveGroundMeters - originEye
      ) / Math.max(0.001, distanceMeters);
      const blockedByHorizon = targetSlope + HORIZON_MARGIN < horizonSlope;
      const stepMeters = Math.hypot(cell.x - previousX, cell.y - previousY) * map.metersPerCell;
      previousX = cell.x;
      previousY = cell.y;

      const vegetation = resolveVegetationDefinition(staticGrid.forestKind[mapIndex]);
      visual *= Math.exp(-vegetation.visibility.transmissionLossPerMeter * stepMeters);
      fire *= Math.exp(-vegetation.fire.transmissionLossPerMeter * stepMeters);

      const blockedByObject = staticGrid.blockingFlags[mapIndex] === 1;
      if (blockedByHorizon || blockedByObject) {
        writeBlockedCell(
          hardBlocked,
          visualTransmission,
          fireTransmission,
          blockerKind,
          mapIndex,
          blockedByObject ? 2 : horizonKind,
        );
      } else {
        writeVisibleCell(
          hardBlocked,
          visualTransmission,
          fireTransmission,
          blockerKind,
          mapIndex,
          encodeTransmission(visual),
          encodeTransmission(fire),
        );
      }
      processedCellCount += 1;

      const groundSlope = (terrainHeight - originEye) / Math.max(0.001, distanceMeters);
      if (groundSlope > horizonSlope) {
        horizonSlope = groundSlope;
        horizonKind = 1;
      }
      if (blockedByObject) {
        const objectSlope = (
          staticGrid.objectTopHeightMeters[mapIndex] - originEye
        ) / Math.max(0.001, distanceMeters);
        if (objectSlope > horizonSlope) {
          horizonSlope = objectSlope;
          horizonKind = 2;
        }
      }
    }
  }

  return {
    field: {
      key,
      originX: options.origin.x,
      originY: options.origin.y,
      width: map.width,
      height: map.height,
      rangeCells: options.rangeCells,
      hardBlocked,
      visualTransmission,
      fireTransmission,
      blockerKind,
      mapVisualRevision: staticGrid.mapVisualRevision,
    },
    processedCellCount,
    rayCount: perimeter.length,
  };
}

function normalizeOptions(map: TacticalMap, options: VisibilityGeometryFieldOptions) {
  return {
    origin: {
      x: clamp(finite(options.origin.x), 0.5, Math.max(0.5, map.width - 0.5)),
      y: clamp(finite(options.origin.y), 0.5, Math.max(0.5, map.height - 0.5)),
    },
    originHeightAboveGroundMeters: Math.max(0.05, finite(options.originHeightAboveGroundMeters)),
    targetHeightAboveGroundMeters: Math.max(0.05, finite(options.targetHeightAboveGroundMeters)),
    rangeCells: Math.max(0.5, Math.min(Math.hypot(map.width, map.height), finite(options.rangeCells))),
  };
}

function buildKey(
  mapVisualRevision: number,
  options: ReturnType<typeof normalizeOptions>,
): string {
  return [
    'visibility-geometry:v1',
    quantize(options.origin.x, POSITION_QUANTUM_CELLS),
    quantize(options.origin.y, POSITION_QUANTUM_CELLS),
    quantize(options.originHeightAboveGroundMeters, HEIGHT_QUANTUM_METERS),
    quantize(options.targetHeightAboveGroundMeters, HEIGHT_QUANTUM_METERS),
    quantize(options.rangeCells, 0.25),
    mapVisualRevision,
    VEGETATION_DEFINITION_REVISION,
  ].join(':');
}

function writeVisibleCell(
  hardBlocked: Uint8Array,
  visualTransmission: Uint8Array,
  fireTransmission: Uint8Array,
  blockerKind: Uint8Array,
  index: number,
  visual: number,
  fire: number,
): void {
  if (visual > visualTransmission[index] || fire > fireTransmission[index]) {
    visualTransmission[index] = Math.max(visualTransmission[index], visual);
    fireTransmission[index] = Math.max(fireTransmission[index], fire);
    hardBlocked[index] = 0;
    blockerKind[index] = 0;
  }
}

function writeBlockedCell(
  hardBlocked: Uint8Array,
  visualTransmission: Uint8Array,
  fireTransmission: Uint8Array,
  blockerKind: Uint8Array,
  index: number,
  kind: VisibilityBlockerKind,
): void {
  if (visualTransmission[index] > 0 || fireTransmission[index] > 0) return;
  hardBlocked[index] = 1;
  blockerKind[index] = kind;
}

function perimeterCells(minX: number, minY: number, maxX: number, maxY: number): Array<{ x: number; y: number }> {
  const result: Array<{ x: number; y: number }> = [];
  for (let x = minX; x <= maxX; x += 1) {
    result.push({ x, y: minY });
    if (maxY !== minY) result.push({ x, y: maxY });
  }
  for (let y = minY + 1; y < maxY; y += 1) {
    result.push({ x: minX, y });
    if (maxX !== minX) result.push({ x: maxX, y });
  }
  return result;
}

function supercoverLine(x0: number, y0: number, x1: number, y1: number): Array<{ x: number; y: number }> {
  const points: Array<{ x: number; y: number }> = [];
  const dx = x1 - x0;
  const dy = y1 - y0;
  const nx = Math.abs(dx);
  const ny = Math.abs(dy);
  const signX = dx > 0 ? 1 : dx < 0 ? -1 : 0;
  const signY = dy > 0 ? 1 : dy < 0 ? -1 : 0;
  let x = x0;
  let y = y0;
  let ix = 0;
  let iy = 0;
  points.push({ x, y });
  while (ix < nx || iy < ny) {
    const decision = (1 + 2 * ix) * ny - (1 + 2 * iy) * nx;
    if (decision === 0) {
      x += signX;
      y += signY;
      ix += 1;
      iy += 1;
    } else if (decision < 0) {
      x += signX;
      ix += 1;
    } else {
      y += signY;
      iy += 1;
    }
    points.push({ x, y });
  }
  return points;
}

function getMapCache(map: TacticalMap): MapCache {
  const existing = cacheByMap.get(map);
  if (existing) return existing;
  const created: MapCache = {
    fields: new Map(),
    diagnostics: {
      geometryBuildCount: 0,
      geometryCacheHitCount: 0,
      fullMapScanCount: 0,
      processedCellCount: 0,
      rayCount: 0,
      lastKey: '',
    },
  };
  cacheByMap.set(map, created);
  return created;
}

function emptyDiagnostics(): VisibilityGeometryFieldDiagnostics {
  return {
    geometryBuildCount: 0,
    geometryCacheHitCount: 0,
    cachedFieldCount: 0,
    fullMapScanCount: 0,
    processedCellCount: 0,
    rayCount: 0,
    retainedTypedArrayBytes: 0,
    lastKey: '',
  };
}

function touch<T>(cache: Map<string, T>, key: string, value: T): void {
  cache.delete(key);
  cache.set(key, value);
}

function trimCache<T>(cache: Map<string, T>, maximum: number): void {
  while (cache.size > maximum) {
    const oldest = cache.keys().next().value as string | undefined;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

function encodeTransmission(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value * 255)));
}

function quantize(value: number, step: number): string {
  return (Math.round(value / step) * step).toFixed(3);
}

function finite(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}
