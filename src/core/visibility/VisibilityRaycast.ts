import type { VisibilityStaticGrid } from './VisibilityStaticGrid';

const FOREST_MIN_TRANSMISSION = 0.04;
const SPARSE_FOREST_LOSS_PER_METER = 0.035;
const DENSE_FOREST_LOSS_PER_METER = 0.075;
const TERRAIN_CLEARANCE_MARGIN_METERS = 0.03;

export interface VisibilityRayPoint {
  readonly x: number;
  readonly y: number;
}

export interface TerrainVisibilityRayResult {
  readonly visible: boolean;
  readonly blockedBy: 'terrain' | 'object' | 'forest' | null;
  readonly transmission: number;
  readonly occlusionDepthMeters: number;
  readonly processedCells: number;
  readonly blockerCell: { readonly x: number; readonly y: number } | null;
}

export function evaluateTerrainVisibilityRay(
  grid: VisibilityStaticGrid,
  from: VisibilityRayPoint,
  to: VisibilityRayPoint,
  observerEyeHeightMeters: number,
  targetHeightMeters: number,
  metersPerCell: number,
): TerrainVisibilityRayResult {
  const originX = clamp(Math.floor(from.x), 0, grid.width - 1);
  const originY = clamp(Math.floor(from.y), 0, grid.height - 1);
  const targetX = clamp(Math.floor(to.x), 0, grid.width - 1);
  const targetY = clamp(Math.floor(to.y), 0, grid.height - 1);
  const originIndex = originY * grid.width + originX;
  const targetIndex = targetY * grid.width + targetX;
  const originHeight = grid.terrainHeightMeters[originIndex] + Math.max(0.05, observerEyeHeightMeters);
  const targetHeight = grid.terrainHeightMeters[targetIndex] + Math.max(0.05, targetHeightMeters);
  const totalDistanceCells = Math.max(0.001, Math.hypot(to.x - from.x, to.y - from.y));
  const cells = supercoverLine(originX, originY, targetX, targetY);
  let transmission = 1;
  let maximumOcclusion = 0;
  let blockedBy: TerrainVisibilityRayResult['blockedBy'] = null;
  let blockerCell: TerrainVisibilityRayResult['blockerCell'] = null;
  let processedCells = 0;
  let previousCenterX = from.x;
  let previousCenterY = from.y;

  for (let index = 1; index < cells.length - 1; index += 1) {
    const cell = cells[index];
    const centerX = cell.x + 0.5;
    const centerY = cell.y + 0.5;
    const distanceCells = Math.hypot(centerX - from.x, centerY - from.y);
    const fraction = clamp(distanceCells / totalDistanceCells, 0, 1);
    const sightHeight = originHeight + (targetHeight - originHeight) * fraction;
    const mapIndex = cell.y * grid.width + cell.x;
    const terrainTop = grid.terrainHeightMeters[mapIndex];
    const objectTop = grid.objectTopHeightMeters[mapIndex];
    const blockerTop = Math.max(terrainTop, objectTop);
    const occlusion = blockerTop + TERRAIN_CLEARANCE_MARGIN_METERS - sightHeight;
    if (occlusion > maximumOcclusion) {
      maximumOcclusion = occlusion;
      blockerCell = { x: cell.x, y: cell.y };
      blockedBy = objectTop > terrainTop + 0.05 ? 'object' : 'terrain';
    }

    const stepMeters = Math.hypot(centerX - previousCenterX, centerY - previousCenterY) * Math.max(0.001, metersPerCell);
    previousCenterX = centerX;
    previousCenterY = centerY;
    const forestKind = grid.forestKind[mapIndex];
    if (forestKind > 0) {
      const loss = forestKind === 2 ? DENSE_FOREST_LOSS_PER_METER : SPARSE_FOREST_LOSS_PER_METER;
      transmission *= Math.exp(-loss * stepMeters);
    }
    processedCells += 1;
  }

  if (maximumOcclusion > 0) {
    return {
      visible: false,
      blockedBy,
      transmission,
      occlusionDepthMeters: maximumOcclusion,
      processedCells,
      blockerCell,
    };
  }
  if (transmission <= FOREST_MIN_TRANSMISSION) {
    return {
      visible: false,
      blockedBy: 'forest',
      transmission,
      occlusionDepthMeters: 0,
      processedCells,
      blockerCell,
    };
  }
  return {
    visible: true,
    blockedBy: null,
    transmission,
    occlusionDepthMeters: 0,
    processedCells,
    blockerCell: null,
  };
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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
