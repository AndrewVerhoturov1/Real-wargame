import type { SimulationState } from '../simulation/SimulationState';
import type { UnitModel } from '../units/UnitModel';

const BUCKET_SIZE_CELLS = 8;

interface CombatUnitIndex {
  readonly simulationTimeSeconds: number;
  readonly unitCount: number;
  readonly buckets: Map<string, UnitModel[]>;
}

const cache = new WeakMap<SimulationState, CombatUnitIndex>();

export function queryUnitsNearBallisticSegment(
  state: SimulationState,
  startGrid: { x: number; y: number },
  endGrid: { x: number; y: number },
  radiusMetres: number,
): UnitModel[] {
  const index = getIndex(state);
  const radiusCells = Math.max(0, radiusMetres) / Math.max(0.001, state.map.metersPerCell);
  const minX = Math.floor((Math.min(startGrid.x, endGrid.x) - radiusCells) / BUCKET_SIZE_CELLS);
  const maxX = Math.floor((Math.max(startGrid.x, endGrid.x) + radiusCells) / BUCKET_SIZE_CELLS);
  const minY = Math.floor((Math.min(startGrid.y, endGrid.y) - radiusCells) / BUCKET_SIZE_CELLS);
  const maxY = Math.floor((Math.max(startGrid.y, endGrid.y) + radiusCells) / BUCKET_SIZE_CELLS);
  const seen = new Set<UnitModel>();
  const result: UnitModel[] = [];

  for (let bucketY = minY; bucketY <= maxY; bucketY += 1) {
    for (let bucketX = minX; bucketX <= maxX; bucketX += 1) {
      for (const unit of index.buckets.get(bucketKey(bucketX, bucketY)) ?? []) {
        if (seen.has(unit)) continue;
        seen.add(unit);
        result.push(unit);
      }
    }
  }

  return result;
}

export function clearCombatUnitSpatialIndex(state: SimulationState): void {
  cache.delete(state);
}

function getIndex(state: SimulationState): CombatUnitIndex {
  const existing = cache.get(state);
  if (
    existing
    && existing.simulationTimeSeconds === state.simulationTimeSeconds
    && existing.unitCount === state.units.length
  ) {
    return existing;
  }

  const buckets = new Map<string, UnitModel[]>();
  for (const unit of state.units) {
    const bucketX = Math.floor(unit.position.x / BUCKET_SIZE_CELLS);
    const bucketY = Math.floor(unit.position.y / BUCKET_SIZE_CELLS);
    const key = bucketKey(bucketX, bucketY);
    const bucket = buckets.get(key) ?? [];
    bucket.push(unit);
    buckets.set(key, bucket);
  }

  const next: CombatUnitIndex = {
    simulationTimeSeconds: state.simulationTimeSeconds,
    unitCount: state.units.length,
    buckets,
  };
  cache.set(state, next);
  return next;
}

function bucketKey(x: number, y: number): string {
  return `${x}:${y}`;
}
