import type { GridPosition } from '../geometry';
import { measurePerformancePhase } from '../debug/PerformancePhases';
import type { TacticalMap } from '../map/MapModel';
import {
  getVegetationDefinitionKey,
  getVegetationDefinitionRevision,
} from '../map/VegetationDefinition';
import { getEnvironmentProfileRuntimeSnapshot } from '../map/EnvironmentProfileRuntime';
import {
  visibilityMaskIndex,
  type VisibilityCandidateMask,
} from './VisibilityCandidateMask';
import {
  traceVisibilityRayPath,
  traverseVisibilitySegmentCells,
  type VisibilityTraceBlockerKind,
  type VisibilityTraceCellSample,
} from './VisibilityRayKernel';
import { getVisibilityStaticGrid } from './VisibilityStaticGrid';

const CACHE_LIMIT = 24;
const EPSILON = 1e-6;

export type VisibilityBlockerKind = 0 | 1 | 2 | 3 | 4;

export interface VisibilityGeometryFieldOptions {
  readonly origin: GridPosition;
  readonly originHeightAboveGroundMeters: number;
  readonly targetHeightAboveGroundMeters: number;
  readonly rangeCells: number;
  readonly channel?: 'visual' | 'fire' | 'combined';
  readonly candidateMask?: VisibilityCandidateMask;
}

export interface VisibilityGeometryField {
  readonly key: string;
  readonly originX: number;
  readonly originY: number;
  readonly width: number;
  readonly height: number;
  readonly rangeCells: number;
  readonly hardBlocked: Uint8Array;
  readonly visualTransmission: Uint8Array;
  readonly fireTransmission: Uint8Array;
  readonly blockerKind: Uint8Array;
  readonly evaluated: Uint8Array;
  readonly evaluatedTargetCellCount: number;
  readonly geometryTraversedCellCount: number;
  readonly geometryRayCount: number;
  readonly mapVisualRevision: number;
  readonly channel: 'visual' | 'fire' | 'combined';
  readonly profileId: string;
  readonly profileRevision: number;
  readonly profileKey: string;
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
    () => buildField(map, normalized, key),
  );
  cache.fields.set(key, build);
  trimCache(cache.fields, CACHE_LIMIT);
  cache.diagnostics.geometryBuildCount += 1;
  cache.diagnostics.processedCellCount += build.evaluatedTargetCellCount;
  cache.diagnostics.rayCount += build.geometryRayCount;
  cache.diagnostics.lastKey = key;
  return build;
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
      + field.blockerKind.byteLength
      + field.evaluated.byteLength;
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
): {
  hardBlocked: boolean;
  visualTransmission: number;
  fireTransmission: number;
  blockerKind: VisibilityBlockerKind;
  evaluated: boolean;
} {
  const cellX = Math.floor(x);
  const cellY = Math.floor(y);
  if (cellX < 0 || cellY < 0 || cellX >= field.width || cellY >= field.height) {
    return { hardBlocked: true, visualTransmission: 0, fireTransmission: 0, blockerKind: 4, evaluated: false };
  }
  const index = cellY * field.width + cellX;
  return {
    hardBlocked: field.hardBlocked[index] === 1,
    visualTransmission: (field.visualTransmission[index] ?? 0) / 255,
    fireTransmission: (field.fireTransmission[index] ?? 0) / 255,
    blockerKind: (field.blockerKind[index] ?? 0) as VisibilityBlockerKind,
    evaluated: field.evaluated[index] === 1,
  };
}

function buildField(
  map: TacticalMap,
  options: ReturnType<typeof normalizeOptions>,
  key: string,
): VisibilityGeometryField {
  const cellCount = map.width * map.height;
  const hardBlocked = new Uint8Array(cellCount);
  const visualTransmission = new Uint8Array(cellCount);
  const fireTransmission = new Uint8Array(cellCount);
  const blockerKind = new Uint8Array(cellCount);
  const evaluated = new Uint8Array(cellCount);
  hardBlocked.fill(1);

  const bounds = fieldBounds(map, options);
  let evaluatedTargetCellCount = 0;
  let geometryTraversedCellCount = 0;
  let geometryRayCount = 0;
  const tracedEndpoints = new Set<string>();

  const candidateAllowed = (x: number, y: number): boolean => {
    const dx = x + 0.5 - options.origin.x;
    const dy = y + 0.5 - options.origin.y;
    if (Math.hypot(dx, dy) > options.rangeCells + 0.001) return false;
    if (!options.candidateMask) return true;
    const local = visibilityMaskIndex(options.candidateMask, x, y);
    return local >= 0 && options.candidateMask.candidate[local] === 1;
  };

  const writeSample = (sample: VisibilityTraceCellSample): void => {
    if (!candidateAllowed(sample.x, sample.y)) return;
    const index = sample.mapIndex;
    if (evaluated[index] === 0) {
      evaluated[index] = 1;
      evaluatedTargetCellCount += 1;
    }
    if (sample.hardBlocked) {
      if (hardBlocked[index] === 1) {
        visualTransmission[index] = Math.max(visualTransmission[index] ?? 0, encodeTransmission(sample.visualTransmission));
        fireTransmission[index] = Math.max(fireTransmission[index] ?? 0, encodeTransmission(sample.fireTransmission));
        blockerKind[index] = encodeBlockerKind(sample.blockerKind);
      }
      return;
    }
    const visual = encodeTransmission(sample.visualTransmission);
    const fire = encodeTransmission(sample.fireTransmission);
    if (hardBlocked[index] === 1 || visual > visualTransmission[index] || fire > fireTransmission[index]) {
      hardBlocked[index] = 0;
      visualTransmission[index] = Math.max(visualTransmission[index] ?? 0, visual);
      fireTransmission[index] = Math.max(fireTransmission[index] ?? 0, fire);
      blockerKind[index] = 0;
    }
  };

  const traceEndpoint = (targetX: number, targetY: number): void => {
    const endpointKey = `${targetX}:${targetY}`;
    if (tracedEndpoints.has(endpointKey)) return;
    tracedEndpoints.add(endpointKey);
    const trace = traceVisibilityRayPath(map, {
      origin: options.origin,
      target: { x: targetX + 0.5, y: targetY + 0.5 },
      originHeightAboveGroundMeters: options.originHeightAboveGroundMeters,
      targetHeightAboveGroundMeters: options.targetHeightAboveGroundMeters,
      channel: options.channel,
    });
    geometryRayCount += 1;
    geometryTraversedCellCount += trace.samples.length;
    for (const sample of trace.samples) writeSample(sample);
  };

  const findFarthestCandidate = (targetX: number, targetY: number): { x: number; y: number } | null => {
    const cells = traverseVisibilitySegmentCells(
      map,
      options.origin,
      { x: targetX + 0.5, y: targetY + 0.5 },
    );
    let farthest: { x: number; y: number } | null = null;
    for (const cell of cells) {
      if (cell.x < bounds.minX || cell.y < bounds.minY || cell.x > bounds.maxX || cell.y > bounds.maxY) continue;
      if (candidateAllowed(cell.x, cell.y)) farthest = { x: cell.x, y: cell.y };
    }
    return farthest;
  };

  if (!options.candidateMask || options.candidateMask.candidateCellCount > 0) {
    for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
      const top = findFarthestCandidate(x, bounds.minY);
      if (top) traceEndpoint(top.x, top.y);
      if (bounds.maxY !== bounds.minY) {
        const bottom = findFarthestCandidate(x, bounds.maxY);
        if (bottom) traceEndpoint(bottom.x, bottom.y);
      }
    }
    for (let y = bounds.minY + 1; y < bounds.maxY; y += 1) {
      const left = findFarthestCandidate(bounds.minX, y);
      if (left) traceEndpoint(left.x, left.y);
      if (bounds.maxX !== bounds.minX) {
        const right = findFarthestCandidate(bounds.maxX, y);
        if (right) traceEndpoint(right.x, right.y);
      }
    }

    // DDA perimeter rays can leave isolated candidate cells between directions.
    // A bounded correctness fallback traces only those still unevaluated.
    for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
      for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
        if (!candidateAllowed(x, y)) continue;
        const index = y * map.width + x;
        if (evaluated[index] === 1) continue;
        traceEndpoint(x, y);
      }
    }
  }

  const originCellX = Math.floor(options.origin.x);
  const originCellY = Math.floor(options.origin.y);
  if (candidateAllowed(originCellX, originCellY)) {
    const originIndex = originCellY * map.width + originCellX;
    if (evaluated[originIndex] === 0) evaluatedTargetCellCount += 1;
    evaluated[originIndex] = 1;
    hardBlocked[originIndex] = 0;
    visualTransmission[originIndex] = 255;
    fireTransmission[originIndex] = 255;
    blockerKind[originIndex] = 0;
  }

  const profile = getEnvironmentProfileRuntimeSnapshot();
  const profileRevision = options.channel === 'visual'
    ? getVegetationDefinitionRevision('visibility')
    : options.channel === 'fire'
      ? getVegetationDefinitionRevision('fire')
      : Math.max(getVegetationDefinitionRevision('visibility'), getVegetationDefinitionRevision('fire'));
  const profileKey = options.channel === 'visual'
    ? getVegetationDefinitionKey('visibility')
    : options.channel === 'fire'
      ? getVegetationDefinitionKey('fire')
      : `${getVegetationDefinitionKey('visibility')}|${getVegetationDefinitionKey('fire')}`;

  return {
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
    evaluated,
    evaluatedTargetCellCount,
    geometryTraversedCellCount,
    geometryRayCount,
    mapVisualRevision: getVisibilityStaticGrid(map).mapVisualRevision,
    channel: options.channel,
    profileId: profile.activeProfileId,
    profileRevision,
    profileKey,
  };
}

function fieldBounds(
  map: TacticalMap,
  options: ReturnType<typeof normalizeOptions>,
): { minX: number; minY: number; maxX: number; maxY: number } {
  if (options.candidateMask) {
    return {
      minX: options.candidateMask.minCellX,
      minY: options.candidateMask.minCellY,
      maxX: options.candidateMask.minCellX + options.candidateMask.width - 1,
      maxY: options.candidateMask.minCellY + options.candidateMask.height - 1,
    };
  }
  const originCellX = Math.floor(options.origin.x);
  const originCellY = Math.floor(options.origin.y);
  const radius = Math.max(1, Math.ceil(options.rangeCells));
  return {
    minX: Math.max(0, originCellX - radius),
    minY: Math.max(0, originCellY - radius),
    maxX: Math.min(map.width - 1, originCellX + radius),
    maxY: Math.min(map.height - 1, originCellY + radius),
  };
}

function normalizeOptions(map: TacticalMap, options: VisibilityGeometryFieldOptions) {
  return {
    origin: {
      x: clamp(finite(options.origin.x), 0, Math.max(0, map.width - EPSILON)),
      y: clamp(finite(options.origin.y), 0, Math.max(0, map.height - EPSILON)),
    },
    originHeightAboveGroundMeters: Math.max(0.05, finite(options.originHeightAboveGroundMeters)),
    targetHeightAboveGroundMeters: Math.max(0.05, finite(options.targetHeightAboveGroundMeters)),
    rangeCells: Math.max(0.5, Math.min(Math.hypot(map.width, map.height), finite(options.rangeCells))),
    channel: options.channel ?? 'combined',
    candidateMask: options.candidateMask,
  };
}

function buildKey(
  mapVisualRevision: number,
  options: ReturnType<typeof normalizeOptions>,
): string {
  return [
    'visibility-geometry:v2-kernel',
    exact(options.origin.x),
    exact(options.origin.y),
    exact(options.originHeightAboveGroundMeters),
    exact(options.targetHeightAboveGroundMeters),
    exact(options.rangeCells),
    options.channel,
    mapVisualRevision,
    options.channel === 'visual'
      ? getVegetationDefinitionKey('visibility')
      : options.channel === 'fire'
        ? getVegetationDefinitionKey('fire')
        : `${getVegetationDefinitionKey('visibility')}|${getVegetationDefinitionKey('fire')}`,
    options.candidateMask?.key ?? 'unmasked',
  ].join(':');
}

function encodeBlockerKind(kind: VisibilityTraceBlockerKind): VisibilityBlockerKind {
  if (kind === 'terrain') return 1;
  if (kind === 'object') return 2;
  if (kind === 'vegetation') return 3;
  if (kind === 'boundary') return 4;
  return 0;
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

function exact(value: number): string {
  return Number.isFinite(value) ? Number(value).toPrecision(15) : 'invalid';
}

function finite(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
