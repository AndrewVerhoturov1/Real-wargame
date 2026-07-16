import type { GridPosition } from '../geometry';
import { measurePerformancePhase } from '../debug/PerformancePhases';
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

  const build = measurePerformancePhase(
    'field.visibility-geometry.build',
    () => buildField(map, staticGrid, normalized, key),
  );
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
  let processedCellCount = 0;
  let rayCount = 0;
  const vegetationTransmission = createVegetationTransmissionLuts(map.metersPerCell);

  writeVisibleCell(
    hardBlocked,
    visualTransmission,
    fireTransmission,
    blockerKind,
    originIndex,
    255,
    255,
  );

  const traceRay = (targetX: number, targetY: number): void => {
    rayCount += 1;
    let visual = 1;
    let fire = 1;
    let horizonSlope = Number.NEGATIVE_INFINITY;
    let horizonKind: VisibilityBlockerKind = 1;
    const deltaX = targetX - originCellX;
    const deltaY = targetY - originCellY;
    const stepsX = Math.abs(deltaX);
    const stepsY = Math.abs(deltaY);
    const signX = deltaX > 0 ? 1 : deltaX < 0 ? -1 : 0;
    const signY = deltaY > 0 ? 1 : deltaY < 0 ? -1 : 0;
    let cellX = originCellX;
    let cellY = originCellY;
    let completedX = 0;
    let completedY = 0;

    while (completedX < stepsX || completedY < stepsY) {
      const decision = (1 + 2 * completedX) * stepsY - (1 + 2 * completedY) * stepsX;
      let diagonal = false;
      if (decision === 0) {
        cellX += signX;
        cellY += signY;
        completedX += 1;
        completedY += 1;
        diagonal = true;
      } else if (decision < 0) {
        cellX += signX;
        completedX += 1;
      } else {
        cellY += signY;
        completedY += 1;
      }

      const dx = cellX + 0.5 - options.origin.x;
      const dy = cellY + 0.5 - options.origin.y;
      const distanceCells = Math.hypot(dx, dy);
      if (distanceCells > options.rangeCells + 0.001) break;
      const distanceMeters = distanceCells * map.metersPerCell;
      const mapIndex = cellY * map.width + cellX;
      const terrainHeight = staticGrid.terrainHeightMeters[mapIndex];
      const targetSlope = (
        terrainHeight + options.targetHeightAboveGroundMeters - originEye
      ) / Math.max(0.001, distanceMeters);
      const blockedByHorizon = targetSlope + HORIZON_MARGIN < horizonSlope;
      const vegetationKind = staticGrid.forestKind[mapIndex] ?? 0;
      visual *= diagonal
        ? vegetationTransmission.visualDiagonal[vegetationKind] ?? 1
        : vegetationTransmission.visualAxis[vegetationKind] ?? 1;
      fire *= diagonal
        ? vegetationTransmission.fireDiagonal[vegetationKind] ?? 1
        : vegetationTransmission.fireAxis[vegetationKind] ?? 1;

      const blockedByObject = staticGrid.blockingFlags[mapIndex] === 1;
      if (blockedByHorizon) {
        writeBlockedCell(
          hardBlocked,
          visualTransmission,
          fireTransmission,
          blockerKind,
          mapIndex,
          horizonKind,
        );
      } else {
        // The occluding terrain/object cell itself remains observable and targetable.
        // Its height enters the horizon below, so the hard shadow starts on later cells.
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
  };

  // Keep the original perimeter order so competing rays preserve their exact
  // max-transmission tie behaviour, without allocating one object per target.
  for (let x = minX; x <= maxX; x += 1) {
    traceRay(x, minY);
    if (maxY !== minY) traceRay(x, maxY);
  }
  for (let y = minY + 1; y < maxY; y += 1) {
    traceRay(minX, y);
    if (maxX !== minX) traceRay(maxX, y);
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
    rayCount,
  };
}

function createVegetationTransmissionLuts(metersPerCell: number): {
  readonly visualAxis: readonly number[];
  readonly visualDiagonal: readonly number[];
  readonly fireAxis: readonly number[];
  readonly fireDiagonal: readonly number[];
} {
  const visualLoss = [0, 0, 0];
  const fireLoss = [0, 0, 0];
  for (let kind = 0; kind <= 2; kind += 1) {
    const vegetation = resolveVegetationDefinition(kind);
    visualLoss[kind] = vegetation.visibility.transmissionLossPerMeter;
    fireLoss[kind] = vegetation.fire.transmissionLossPerMeter;
  }
  const diagonalMeters = Math.SQRT2 * metersPerCell;
  return {
    visualAxis: visualLoss.map((loss) => Math.exp(-loss * metersPerCell)),
    visualDiagonal: visualLoss.map((loss) => Math.exp(-loss * diagonalMeters)),
    fireAxis: fireLoss.map((loss) => Math.exp(-loss * metersPerCell)),
    fireDiagonal: fireLoss.map((loss) => Math.exp(-loss * diagonalMeters)),
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
