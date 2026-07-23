import type { SimulationState } from '../simulation/SimulationState';
import type { UnitModel } from '../units/UnitModel';

const BUCKET_SIZE_CELLS = 8;

export interface CombatUnitIndex {
  readonly simulationTimeSeconds: number;
  readonly unitCount: number;
  readonly unitsIdentity: readonly UnitModel[];
  readonly mapIdentity: SimulationState['map'];
  readonly unitIds: readonly string[];
  readonly unitPositions: Float64Array;
  readonly buckets: Map<string, UnitModel[]>;
}

export interface CombatUnitSpatialQueryScratch {
  readonly seenUnitIds: Set<string>;
}

const cache = new WeakMap<SimulationState, CombatUnitIndex>();

export function createCombatUnitSpatialQueryScratch(): CombatUnitSpatialQueryScratch {
  return { seenUnitIds: new Set<string>() };
}

export function getCombatUnitSpatialIndex(state: SimulationState): CombatUnitIndex {
  return getIndex(state);
}

export function queryUnitsNearBallisticSegment(
  state: SimulationState,
  startGrid: { x: number; y: number },
  endGrid: { x: number; y: number },
  radiusMetres: number,
): UnitModel[] {
  const output: UnitModel[] = [];
  queryUnitsNearBallisticSegmentInto(
    state,
    startGrid,
    endGrid,
    radiusMetres,
    output,
    createCombatUnitSpatialQueryScratch(),
  );
  return output;
}

export function queryUnitsNearBallisticSegmentInto(
  state: SimulationState,
  startGrid: { x: number; y: number },
  endGrid: { x: number; y: number },
  radiusMetres: number,
  output: UnitModel[],
  scratch: CombatUnitSpatialQueryScratch,
  preparedIndex: CombatUnitIndex = getIndex(state),
): number {
  output.length = 0;
  scratch.seenUnitIds.clear();
  const radiusCells = Math.max(0, radiusMetres) / Math.max(0.001, state.map.metersPerCell);
  const minX = Math.floor((Math.min(startGrid.x, endGrid.x) - radiusCells) / BUCKET_SIZE_CELLS);
  const maxX = Math.floor((Math.max(startGrid.x, endGrid.x) + radiusCells) / BUCKET_SIZE_CELLS);
  const minY = Math.floor((Math.min(startGrid.y, endGrid.y) - radiusCells) / BUCKET_SIZE_CELLS);
  const maxY = Math.floor((Math.max(startGrid.y, endGrid.y) + radiusCells) / BUCKET_SIZE_CELLS);

  for (let bucketY = minY; bucketY <= maxY; bucketY += 1) {
    for (let bucketX = minX; bucketX <= maxX; bucketX += 1) {
      const bucket = preparedIndex.buckets.get(bucketKey(bucketX, bucketY));
      if (!bucket) continue;
      for (const unit of bucket) {
        if (scratch.seenUnitIds.has(unit.id)) continue;
        scratch.seenUnitIds.add(unit.id);
        output.push(unit);
      }
    }
  }
  output.sort(compareUnits);
  return output.length;
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
    && existing.unitsIdentity === state.units
    && existing.mapIdentity === state.map
    && matchesUnitSnapshot(existing, state.units)
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
  for (const bucket of buckets.values()) bucket.sort(compareUnits);

  const unitIds = new Array<string>(state.units.length);
  const unitPositions = new Float64Array(state.units.length * 2);
  for (let index = 0; index < state.units.length; index += 1) {
    const unit = state.units[index]!;
    unitIds[index] = unit.id;
    unitPositions[index * 2] = unit.position.x;
    unitPositions[index * 2 + 1] = unit.position.y;
  }
  const next: CombatUnitIndex = {
    simulationTimeSeconds: state.simulationTimeSeconds,
    unitCount: state.units.length,
    unitsIdentity: state.units,
    mapIdentity: state.map,
    unitIds,
    unitPositions,
    buckets,
  };
  cache.set(state, next);
  return next;
}


function matchesUnitSnapshot(index: CombatUnitIndex, units: readonly UnitModel[]): boolean {
  if (index.unitIds.length !== units.length || index.unitPositions.length !== units.length * 2) return false;
  for (let unitIndex = 0; unitIndex < units.length; unitIndex += 1) {
    const unit = units[unitIndex]!;
    if (
      index.unitIds[unitIndex] !== unit.id
      || index.unitPositions[unitIndex * 2] !== unit.position.x
      || index.unitPositions[unitIndex * 2 + 1] !== unit.position.y
    ) {
      return false;
    }
  }
  return true;
}

function compareUnits(left: UnitModel, right: UnitModel): number {
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

function bucketKey(x: number, y: number): string {
  return `${x}:${y}`;
}
