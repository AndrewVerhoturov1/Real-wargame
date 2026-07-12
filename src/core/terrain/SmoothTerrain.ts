import { getCell, type TacticalMap } from '../map/MapModel';
import {
  expandDirtyRegion,
  getMapDirtyRegionSince,
  getMapLayerRevision,
  type MapDirtyRegion,
} from '../map/MapRuntimeState';

// This kernel is also used by the painted terrain texture. Keeping one kernel means
// line of sight, relief overlays, height readouts and the visible landscape agree.
const SMOOTH_RADIUS_CELLS = 1;
const HEIGHT_WEIGHT_CENTER = 5;
const HEIGHT_WEIGHT_NEAR = 2;
const HEIGHT_WEIGHT_FAR = 1;

export interface SmoothTerrainDiagnostics {
  heightRevision: number;
  fullBuildCount: number;
  incrementalBuildCount: number;
  cacheHitCount: number;
  lastUpdatedCellCount: number;
}

interface CachedSmoothGrid {
  heightRevision: number;
  width: number;
  height: number;
  grid: number[][];
  diagnostics: SmoothTerrainDiagnostics;
}

const smoothGridCache = new WeakMap<TacticalMap, CachedSmoothGrid>();

export function sampleSmoothHeightLevel(map: TacticalMap, gridX: number, gridY: number): number {
  const smoothed = getSmoothedHeightGrid(map);
  const x = clamp(gridX - 0.5, 0, map.width - 1);
  const y = clamp(gridY - 0.5, 0, map.height - 1);
  const x1 = Math.floor(x);
  const y1 = Math.floor(y);
  const x2 = Math.min(map.width - 1, x1 + 1);
  const y2 = Math.min(map.height - 1, y1 + 1);
  const tx = x - x1;
  const ty = y - y1;
  const top = lerp(smoothed[y1][x1], smoothed[y1][x2], tx);
  const bottom = lerp(smoothed[y2][x1], smoothed[y2][x2], tx);

  return lerp(top, bottom, ty);
}

export function getSmoothedHeightGrid(map: TacticalMap): number[][] {
  const heightRevision = getMapLayerRevision(map, 'height');
  const cached = smoothGridCache.get(map);

  if (cached
    && cached.width === map.width
    && cached.height === map.height
    && cached.heightRevision === heightRevision) {
    cached.diagnostics.cacheHitCount += 1;
    cached.diagnostics.heightRevision = heightRevision;
    cached.diagnostics.lastUpdatedCellCount = 0;
    return cached.grid;
  }

  if (cached && cached.width === map.width && cached.height === map.height) {
    const dirty = getMapDirtyRegionSince(map, 'height', cached.heightRevision);
    if (dirty) {
      const expanded = expandDirtyRegion(map, dirty, SMOOTH_RADIUS_CELLS);
      const updatedCellCount = rebuildSmoothedHeightRegion(map, cached.grid, expanded);
      cached.heightRevision = heightRevision;
      cached.diagnostics.heightRevision = heightRevision;
      cached.diagnostics.incrementalBuildCount += 1;
      cached.diagnostics.lastUpdatedCellCount = updatedCellCount;
      return cached.grid;
    }
  }

  const grid = buildSmoothedHeightGrid(map);
  const diagnostics: SmoothTerrainDiagnostics = {
    heightRevision,
    fullBuildCount: (cached?.diagnostics.fullBuildCount ?? 0) + 1,
    incrementalBuildCount: cached?.diagnostics.incrementalBuildCount ?? 0,
    cacheHitCount: cached?.diagnostics.cacheHitCount ?? 0,
    lastUpdatedCellCount: map.width * map.height,
  };
  smoothGridCache.set(map, {
    heightRevision,
    width: map.width,
    height: map.height,
    grid,
    diagnostics,
  });
  return grid;
}

export function buildSmoothedHeightGrid(map: TacticalMap): number[][] {
  const rows: number[][] = Array.from({ length: map.height }, () => new Array<number>(map.width));
  rebuildSmoothedHeightRegion(map, rows, {
    minX: 0,
    minY: 0,
    maxX: Math.max(0, map.width - 1),
    maxY: Math.max(0, map.height - 1),
  });
  return rows;
}

export function getSmoothTerrainDiagnostics(map: TacticalMap): SmoothTerrainDiagnostics {
  const cached = smoothGridCache.get(map);
  if (!cached) {
    return {
      heightRevision: getMapLayerRevision(map, 'height'),
      fullBuildCount: 0,
      incrementalBuildCount: 0,
      cacheHitCount: 0,
      lastUpdatedCellCount: 0,
    };
  }
  return { ...cached.diagnostics };
}

export function hasHeightVariation(map: TacticalMap): boolean {
  return map.cells.some((cell) => cell.height !== map.defaultHeight);
}

function rebuildSmoothedHeightRegion(
  map: TacticalMap,
  grid: number[][],
  region: MapDirtyRegion,
): number {
  let updated = 0;
  for (let y = region.minY; y <= region.maxY; y += 1) {
    const row = grid[y] ?? (grid[y] = new Array<number>(map.width));
    for (let x = region.minX; x <= region.maxX; x += 1) {
      row[x] = calculateSmoothedHeight(map, x, y);
      updated += 1;
    }
  }
  return updated;
}

function calculateSmoothedHeight(map: TacticalMap, x: number, y: number): number {
  let total = 0;
  let weightTotal = 0;

  for (let oy = -SMOOTH_RADIUS_CELLS; oy <= SMOOTH_RADIUS_CELLS; oy += 1) {
    for (let ox = -SMOOTH_RADIUS_CELLS; ox <= SMOOTH_RADIUS_CELLS; ox += 1) {
      const sampleX = clampInt(x + ox, 0, map.width - 1);
      const sampleY = clampInt(y + oy, 0, map.height - 1);
      const cell = getCell(map, sampleX, sampleY);
      const distance = Math.hypot(ox, oy);
      const weight = distance < 0.01
        ? HEIGHT_WEIGHT_CENTER
        : distance <= 1.1
          ? HEIGHT_WEIGHT_NEAR
          : HEIGHT_WEIGHT_FAR;

      total += (cell?.height ?? map.defaultHeight) * weight;
      weightTotal += weight;
    }
  }

  return total / weightTotal;
}

function lerp(start: number, end: number, factor: number): number {
  return start + (end - start) * factor;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clampInt(value: number, min: number, max: number): number {
  return Math.round(clamp(value, min, max));
}
