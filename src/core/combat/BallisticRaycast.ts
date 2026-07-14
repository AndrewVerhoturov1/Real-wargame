import { getCell, type MapObject } from '../map/MapModel';
import { sampleSmoothHeightLevel } from '../terrain/SmoothTerrain';
import type { SimulationState } from '../simulation/SimulationState';
import { isUnitCombatCapable } from './CombatDamage';
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
  hitObjectId?: string;
  hitUnitId?: string;
  hitZone?: HitZone;
}

interface CandidateHit {
  type: Exclude<BallisticHitType, 'none'>;
  distanceMetres: number;
  objectId?: string;
  unitId?: string;
  zone?: HitZone;
}

export function traceProjectile(state: SimulationState, input: BallisticRayInput): BallisticRayResult {
  const direction = normalizeDirection(input.direction);
  const maximumDistanceMetres = Math.max(0, input.maximumDistanceMetres);
  const ignored = new Set<string>([input.shooterId, ...(input.ignoreUnitIds ?? [])]);
  const candidates: CandidateHit[] = [];

  const terrainDistance = traceTerrain(state, input.origin, direction, maximumDistanceMetres);
  if (terrainDistance !== null) candidates.push({ type: 'terrain', distanceMetres: terrainDistance });

  for (const object of state.map.objects) {
    const distanceMetres = intersectObject(state, input.origin, direction, maximumDistanceMetres, object);
    if (distanceMetres !== null) candidates.push({ type: 'object', distanceMetres, objectId: object.id });
  }

  for (const unit of state.units) {
    if (ignored.has(unit.id)) continue;
    const intersection = intersectRayWithUnitHitShapes(input.origin, direction, maximumDistanceMetres, unit, state.map);
    if (!intersection) continue;
    candidates.push({
      type: 'unit',
      distanceMetres: intersection.distanceMetres,
      unitId: unit.id,
      zone: intersection.zone,
    });
  }

  const nearest = candidates.sort((left, right) => left.distanceMetres - right.distanceMetres)[0];
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
      x: impactPoint.xMetres / state.map.metersPerCell,
      y: impactPoint.yMetres / state.map.metersPerCell,
    },
    hitObjectId: nearest?.objectId,
    hitUnitId: nearest?.unitId,
    hitZone: nearest?.zone,
  };
}

export function hasFriendlyUnitBeforeDistance(
  state: SimulationState,
  input: BallisticRayInput,
  friendlyUnitIds: ReadonlySet<string>,
  intendedDistanceMetres: number,
): string | null {
  const direction = normalizeDirection(input.direction);
  let nearest: { id: string; distance: number } | null = null;
  for (const unit of state.units) {
    if (!friendlyUnitIds.has(unit.id) || unit.id === input.shooterId || !isUnitCombatCapable(unit)) continue;
    const hit = intersectRayWithUnitHitShapes(input.origin, direction, intendedDistanceMetres, unit, state.map);
    if (!hit) continue;
    if (!nearest || hit.distanceMetres < nearest.distance) nearest = { id: unit.id, distance: hit.distanceMetres };
  }
  return nearest?.id ?? null;
}

function traceTerrain(
  state: SimulationState,
  origin: BallisticPoint3,
  direction: BallisticDirection3,
  maximumDistanceMetres: number,
): number | null {
  for (let distanceMetres = TERRAIN_SAMPLE_STEP_METRES; distanceMetres <= maximumDistanceMetres; distanceMetres += TERRAIN_SAMPLE_STEP_METRES) {
    const point = pointAlongRay(origin, direction, distanceMetres);
    const gridX = point.xMetres / state.map.metersPerCell;
    const gridY = point.yMetres / state.map.metersPerCell;
    const cell = getCell(state.map, Math.floor(gridX), Math.floor(gridY));
    if (!cell) return distanceMetres;
    const groundHeight = sampleSmoothHeightLevel(state.map, gridX, gridY) * ELEVATION_STEP_METRES;
    if (point.zMetres <= groundHeight + TERRAIN_IMPACT_MARGIN_METRES) return distanceMetres;
  }
  return null;
}

function intersectObject(
  state: SimulationState,
  origin: BallisticPoint3,
  direction: BallisticDirection3,
  maximumDistanceMetres: number,
  object: MapObject,
): number | null {
  const metresPerCell = state.map.metersPerCell;
  const centerGridX = object.x + object.widthCells / 2;
  const centerGridY = object.y + object.heightCells / 2;
  const centerX = centerGridX * metresPerCell;
  const centerY = centerGridY * metresPerCell;
  const cos = Math.cos(-object.rotationRadians);
  const sin = Math.sin(-object.rotationRadians);
  const localOriginX = (origin.xMetres - centerX) * cos - (origin.yMetres - centerY) * sin;
  const localOriginY = (origin.xMetres - centerX) * sin + (origin.yMetres - centerY) * cos;
  const localDirectionX = direction.x * cos - direction.y * sin;
  const localDirectionY = direction.x * sin + direction.y * cos;
  const halfWidth = Math.max(0.05, object.widthCells * metresPerCell / 2);
  const halfHeight = Math.max(0.05, object.heightCells * metresPerCell / 2);
  const xyRange = intersectSlabs(localOriginX, localOriginY, localDirectionX, localDirectionY, halfWidth, halfHeight);
  if (!xyRange) return null;

  const groundHeight = sampleSmoothHeightLevel(state.map, centerGridX, centerGridY) * ELEVATION_STEP_METRES;
  const objectTop = groundHeight + Math.max(0.05, object.losHeightMeters ?? 1);
  const start = Math.max(0, xyRange.enter);
  const end = Math.min(maximumDistanceMetres, xyRange.exit);
  if (end < start) return null;

  const zAtStart = origin.zMetres + direction.z * start;
  const zAtEnd = origin.zMetres + direction.z * end;
  const minZ = Math.min(zAtStart, zAtEnd);
  const maxZ = Math.max(zAtStart, zAtEnd);
  if (maxZ < groundHeight || minZ > objectTop) return null;
  return start;
}

function intersectSlabs(
  originX: number,
  originY: number,
  directionX: number,
  directionY: number,
  halfWidth: number,
  halfHeight: number,
): { enter: number; exit: number } | null {
  let enter = -Infinity;
  let exit = Infinity;
  const axes = [
    { origin: originX, direction: directionX, min: -halfWidth, max: halfWidth },
    { origin: originY, direction: directionY, min: -halfHeight, max: halfHeight },
  ];
  for (const axis of axes) {
    if (Math.abs(axis.direction) < 0.0000001) {
      if (axis.origin < axis.min || axis.origin > axis.max) return null;
      continue;
    }
    const first = (axis.min - axis.origin) / axis.direction;
    const second = (axis.max - axis.origin) / axis.direction;
    const axisEnter = Math.min(first, second);
    const axisExit = Math.max(first, second);
    enter = Math.max(enter, axisEnter);
    exit = Math.min(exit, axisExit);
    if (exit < enter) return null;
  }
  return { enter, exit };
}
