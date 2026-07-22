import { getCell, type TacticalMap } from '../map/MapModel';
import {
  getMapObjectCenter,
  getMapObjectHeightMetres,
  intersectSegmentWithMapObject,
} from '../map/MapObjectGeometry';
import { getMapObjectSpatialIndex, type MapObjectSpatialIndex } from '../spatial/MapObjectSpatialIndex';
import { sampleSmoothHeightLevel } from '../terrain/SmoothTerrain';
import type { UnitModel } from '../units/UnitModel';
import {
  intersectRayWithUnitHitShapes,
  normalizeDirection,
  pointAlongRay,
  type BallisticDirection3,
  type BallisticPoint3,
  type HitZone,
} from './UnitHitShapes';

const ELEVATION_STEP_METRES = 2;
const TERRAIN_SAMPLE_STEP_METRES = 0.5;
const TERRAIN_IMPACT_MARGIN_METRES = 0.02;
const DISTANCE_EPSILON_METRES = 1e-7;

export interface BallisticRayInput {
  shotId: string;
  shooterId: string;
  origin: BallisticPoint3;
  direction: BallisticDirection3;
  maximumDistanceMetres: number;
  muzzleVelocityMetresPerSecond: number;
  ignoreUnitIds?: readonly string[];
}

export type BallisticHitType = 'none' | 'terrain' | 'object' | 'unit';

export interface BallisticRayResult {
  shotId: string;
  hitType: BallisticHitType;
  travelledMetres: number;
  flightTimeSeconds: number;
  impactPoint: BallisticPoint3;
  impactGridPosition: { x: number; y: number };
  clearanceMetres: number | null;
  hitObjectId?: string;
  hitUnitId?: string;
  hitZone?: HitZone;
}

export interface BallisticTraceContext {
  readonly map: TacticalMap;
  readonly units: readonly UnitModel[];
  readonly objectSpatialIndex: MapObjectSpatialIndex;
}

interface CandidateHit {
  type: Exclude<BallisticHitType, 'none'>;
  distanceMetres: number;
  objectId?: string;
  unitId?: string;
  zone?: HitZone;
}

interface TerrainTrace {
  hitDistanceMetres: number | null;
  minimumClearanceMetres: number | null;
}

interface ObjectTrace {
  hitDistanceMetres: number | null;
  clearanceMetres: number | null;
}

export function createBallisticTraceContext(
  map: TacticalMap,
  units: readonly UnitModel[],
): BallisticTraceContext {
  return {
    map,
    units,
    objectSpatialIndex: getMapObjectSpatialIndex(map),
  };
}

/** Pure deterministic ray trace. It never mutates the map, units or simulation state. */
export function traceBallisticRay(
  context: BallisticTraceContext,
  input: BallisticRayInput,
): BallisticRayResult {
  const direction = normalizeDirection(input.direction);
  const maximumDistanceMetres = Math.max(0, input.maximumDistanceMetres);
  const ignored = new Set<string>([input.shooterId, ...(input.ignoreUnitIds ?? [])]);
  let nearest: CandidateHit | null = null;
  let minimumClearanceMetres: number | null = null;

  const terrain = traceTerrain(context.map, input.origin, direction, maximumDistanceMetres);
  minimumClearanceMetres = lowerNullable(minimumClearanceMetres, terrain.minimumClearanceMetres);
  if (terrain.hitDistanceMetres !== null) {
    nearest = chooseNearest(nearest, {
      type: 'terrain',
      distanceMetres: terrain.hitDistanceMetres,
    });
  }

  const segmentStart = {
    x: input.origin.xMetres / context.map.metersPerCell,
    y: input.origin.yMetres / context.map.metersPerCell,
  };
  const endPoint = pointAlongRay(input.origin, direction, maximumDistanceMetres);
  const segmentEnd = {
    x: endPoint.xMetres / context.map.metersPerCell,
    y: endPoint.yMetres / context.map.metersPerCell,
  };
  const objectCandidates = context.objectSpatialIndex.querySegment(segmentStart, segmentEnd, 0);
  for (const object of objectCandidates) {
    const trace = traceMapObject(
      context.map,
      input.origin,
      direction,
      maximumDistanceMetres,
      object,
      segmentStart,
      segmentEnd,
    );
    minimumClearanceMetres = lowerNullable(minimumClearanceMetres, trace.clearanceMetres);
    if (trace.hitDistanceMetres === null) continue;
    nearest = chooseNearest(nearest, {
      type: 'object',
      distanceMetres: trace.hitDistanceMetres,
      objectId: object.id,
    });
  }

  for (const unit of context.units) {
    if (ignored.has(unit.id)) continue;
    const intersection = intersectRayWithUnitHitShapes(
      input.origin,
      direction,
      maximumDistanceMetres,
      unit,
      context.map,
    );
    if (!intersection) continue;
    nearest = chooseNearest(nearest, {
      type: 'unit',
      distanceMetres: intersection.distanceMetres,
      unitId: unit.id,
      zone: intersection.zone,
    });
  }

  const travelledMetres = nearest?.distanceMetres ?? maximumDistanceMetres;
  const impactPoint = pointAlongRay(input.origin, direction, travelledMetres);
  const velocity = Math.max(1, input.muzzleVelocityMetresPerSecond);
  return {
    shotId: input.shotId,
    hitType: nearest?.type ?? 'none',
    travelledMetres,
    flightTimeSeconds: travelledMetres / velocity,
    impactPoint,
    impactGridPosition: {
      x: impactPoint.xMetres / context.map.metersPerCell,
      y: impactPoint.yMetres / context.map.metersPerCell,
    },
    clearanceMetres: nearest ? 0 : normalizeClearance(minimumClearanceMetres),
    hitObjectId: nearest?.objectId,
    hitUnitId: nearest?.unitId,
    hitZone: nearest?.zone,
  };
}

function traceTerrain(
  map: TacticalMap,
  origin: BallisticPoint3,
  direction: BallisticDirection3,
  maximumDistanceMetres: number,
): TerrainTrace {
  let minimumClearanceMetres: number | null = null;
  for (
    let distanceMetres = Math.min(TERRAIN_SAMPLE_STEP_METRES, maximumDistanceMetres);
    distanceMetres > 0 && distanceMetres <= maximumDistanceMetres + DISTANCE_EPSILON_METRES;
    distanceMetres += TERRAIN_SAMPLE_STEP_METRES
  ) {
    const sampleDistance = Math.min(distanceMetres, maximumDistanceMetres);
    const point = pointAlongRay(origin, direction, sampleDistance);
    const gridX = point.xMetres / map.metersPerCell;
    const gridY = point.yMetres / map.metersPerCell;
    const cell = getCell(map, Math.floor(gridX), Math.floor(gridY));
    if (!cell) {
      return { hitDistanceMetres: sampleDistance, minimumClearanceMetres: 0 };
    }
    const groundHeight = sampleSmoothHeightLevel(map, gridX, gridY) * ELEVATION_STEP_METRES;
    const clearance = point.zMetres - groundHeight;
    minimumClearanceMetres = lowerNullable(minimumClearanceMetres, clearance);
    if (clearance <= TERRAIN_IMPACT_MARGIN_METRES) {
      return { hitDistanceMetres: sampleDistance, minimumClearanceMetres: 0 };
    }
    if (sampleDistance >= maximumDistanceMetres) break;
  }
  return { hitDistanceMetres: null, minimumClearanceMetres };
}

function traceMapObject(
  map: TacticalMap,
  origin: BallisticPoint3,
  direction: BallisticDirection3,
  maximumDistanceMetres: number,
  object: TacticalMap['objects'][number],
  segmentStart: { x: number; y: number },
  segmentEnd: { x: number; y: number },
): ObjectTrace {
  const footprint = intersectSegmentWithMapObject(object, segmentStart, segmentEnd);
  if (!footprint) return { hitDistanceMetres: null, clearanceMetres: null };

  const center = getMapObjectCenter(object);
  const bottomZ = sampleSmoothHeightLevel(map, center.x, center.y) * ELEVATION_STEP_METRES;
  const topZ = bottomZ + getMapObjectHeightMetres(object);
  const vertical = intersectLinearSlab(
    origin.zMetres,
    direction.z * maximumDistanceMetres,
    bottomZ,
    topZ,
    footprint.entryT,
    footprint.exitT,
  );
  if (vertical !== null) {
    return {
      hitDistanceMetres: vertical * maximumDistanceMetres,
      clearanceMetres: 0,
    };
  }

  const zAtEntry = origin.zMetres + direction.z * maximumDistanceMetres * footprint.entryT;
  const zAtExit = origin.zMetres + direction.z * maximumDistanceMetres * footprint.exitT;
  return {
    hitDistanceMetres: null,
    clearanceMetres: minimumVerticalSeparation(zAtEntry, zAtExit, bottomZ, topZ),
  };
}

function intersectLinearSlab(
  origin: number,
  delta: number,
  minimum: number,
  maximum: number,
  lowerT: number,
  upperT: number,
): number | null {
  let enter = lowerT;
  let exit = upperT;
  if (Math.abs(delta) <= DISTANCE_EPSILON_METRES) {
    return origin >= minimum && origin <= maximum ? enter : null;
  }
  const first = (minimum - origin) / delta;
  const second = (maximum - origin) / delta;
  enter = Math.max(enter, Math.min(first, second));
  exit = Math.min(exit, Math.max(first, second));
  return exit + DISTANCE_EPSILON_METRES >= enter ? Math.max(lowerT, enter) : null;
}

function minimumVerticalSeparation(
  firstZ: number,
  secondZ: number,
  bottomZ: number,
  topZ: number,
): number {
  const low = Math.min(firstZ, secondZ);
  const high = Math.max(firstZ, secondZ);
  if (low > topZ) return low - topZ;
  if (high < bottomZ) return bottomZ - high;
  return 0;
}

function chooseNearest(current: CandidateHit | null, candidate: CandidateHit): CandidateHit {
  if (!current) return candidate;
  const distanceDelta = candidate.distanceMetres - current.distanceMetres;
  if (distanceDelta < -DISTANCE_EPSILON_METRES) return candidate;
  if (distanceDelta > DISTANCE_EPSILON_METRES) return current;

  const typeDelta = hitTypePriority(candidate.type) - hitTypePriority(current.type);
  if (typeDelta < 0) return candidate;
  if (typeDelta > 0) return current;
  return candidateIdentity(candidate).localeCompare(candidateIdentity(current)) < 0 ? candidate : current;
}

function hitTypePriority(type: Exclude<BallisticHitType, 'none'>): number {
  if (type === 'terrain') return 0;
  if (type === 'object') return 1;
  return 2;
}

function candidateIdentity(candidate: CandidateHit): string {
  return candidate.objectId ?? candidate.unitId ?? '';
}

function lowerNullable(current: number | null, next: number | null): number | null {
  if (next === null || !Number.isFinite(next)) return current;
  if (current === null) return next;
  return Math.min(current, next);
}

function normalizeClearance(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  return Math.max(0, value);
}
