import {
  createBallisticLineProbeContext,
  probeBallisticLine,
  type BallisticLineBlocker,
} from '../../combat/BallisticLineProbe';
import {
  createCombatUnitSpatialQueryScratch,
  getCombatUnitSpatialIndex,
  queryUnitsNearBallisticSegmentInto,
} from '../../combat/CombatUnitSpatialIndex';
import { getUnitHitShapes, normalizeDirection, type BallisticDirection3, type BallisticPoint3 } from '../../combat/UnitHitShapes';
import type { SimulationState } from '../../simulation/SimulationState';
import { getSideRelation } from '../../units/SideRelations';
import type { UnitModel } from '../../units/UnitModel';
import type { MuzzleGeometryV1 } from './MuzzleGeometry';

const FRIENDLY_CORRIDOR_MINIMUM_PADDING_METRES = 0.45;
const ANGLE_EPSILON = 1e-9;

export interface MuzzleBlockedResultV1 {
  readonly blocked: boolean;
  readonly blockedBy: BallisticLineBlocker;
  readonly obstructionId: string | null;
  readonly hitDistanceMetres: number | null;
}

export interface CenterlineFriendlyFireRiskV1 {
  readonly risk: 0 | 1;
  readonly firstBlocker: BallisticLineBlocker;
  readonly firstUnitId: string | null;
  readonly firstUnitFriendly: boolean;
  readonly hitDistanceMetres: number | null;
}

export interface FriendlyFireCorridorRiskV1 {
  readonly risk: number;
  readonly firstUnitId: string | null;
  readonly nearestAngularSeparationRadians: number | null;
  readonly corridorAngularRadiusRadians: number;
  readonly queriedCandidateCount: number;
}

const corridorCandidates: UnitModel[] = [];
const corridorScratch = createCombatUnitSpatialQueryScratch();

export function evaluateMuzzleBlocked(
  state: Pick<SimulationState, 'map' | 'units'>,
  shooter: UnitModel,
  geometry: MuzzleGeometryV1,
): MuzzleBlockedResultV1 {
  const result = probeBallisticLine(createBallisticLineProbeContext(state), {
    origin: geometry.weaponAnchor,
    target: geometry.muzzle,
    shooterId: shooter.id,
  });
  return {
    blocked: !result.clear,
    blockedBy: result.blockedBy,
    obstructionId: result.obstructionId,
    hitDistanceMetres: result.hitDistanceMetres,
  };
}

/**
 * Cheap pre-shot corridor. It queries only spatial buckets near the intended segment,
 * then compares friendly hit-shape angular extents with the current dispersion cone.
 */
export function evaluateFriendlyFireCorridorRisk(
  state: SimulationState,
  shooter: UnitModel,
  muzzle: BallisticPoint3,
  direction: BallisticDirection3,
  maximumDistanceMetres: number,
  effectiveDispersionRadians: number,
): FriendlyFireCorridorRiskV1 {
  const distance = Math.max(0, maximumDistanceMetres);
  const normalizedDirection = normalizeDirection(direction);
  const target = {
    xMetres: muzzle.xMetres + normalizedDirection.x * distance,
    yMetres: muzzle.yMetres + normalizedDirection.y * distance,
    zMetres: muzzle.zMetres + normalizedDirection.z * distance,
  };
  const dispersion = Math.max(0, effectiveDispersionRadians);
  const queryPaddingMetres = Math.max(
    FRIENDLY_CORRIDOR_MINIMUM_PADDING_METRES,
    Math.tan(Math.min(Math.PI / 3, dispersion)) * distance + FRIENDLY_CORRIDOR_MINIMUM_PADDING_METRES,
  );
  const candidateCount = queryUnitsNearBallisticSegmentInto(
    state,
    { x: muzzle.xMetres / state.map.metersPerCell, y: muzzle.yMetres / state.map.metersPerCell },
    { x: target.xMetres / state.map.metersPerCell, y: target.yMetres / state.map.metersPerCell },
    queryPaddingMetres,
    corridorCandidates,
    corridorScratch,
    getCombatUnitSpatialIndex(state),
  );

  let maximumRisk = 0;
  let firstUnitId: string | null = null;
  let nearestAngularSeparationRadians: number | null = null;
  let maximumCorridorAngularRadius = dispersion;
  for (const unit of corridorCandidates) {
    if (unit.id === shooter.id || getSideRelation(shooter.side, unit.side) !== 'friendly') continue;
    for (const shape of getUnitHitShapes(unit, state.map)) {
      const center = {
        xMetres: shape.centerXMetres,
        yMetres: shape.centerYMetres,
        zMetres: (shape.bottomZMetres + shape.topZMetres) * 0.5,
      };
      const relative = {
        x: center.xMetres - muzzle.xMetres,
        y: center.yMetres - muzzle.yMetres,
        z: center.zMetres - muzzle.zMetres,
      };
      const along = relative.x * normalizedDirection.x + relative.y * normalizedDirection.y + relative.z * normalizedDirection.z;
      if (along <= 0 || along > distance) continue;
      const centerDistance = Math.hypot(relative.x, relative.y, relative.z);
      if (centerDistance <= ANGLE_EPSILON) continue;
      const cosine = clamp(
        (relative.x * normalizedDirection.x + relative.y * normalizedDirection.y + relative.z * normalizedDirection.z) / centerDistance,
        -1,
        1,
      );
      const angularSeparation = Math.acos(cosine);
      const halfHeight = (shape.topZMetres - shape.bottomZMetres) * 0.5;
      const shapeRadius = Math.hypot(shape.radiusMetres, halfHeight);
      const shapeAngularRadius = Math.atan2(shapeRadius, centerDistance);
      const corridorAngularRadius = dispersion + shapeAngularRadius;
      maximumCorridorAngularRadius = Math.max(maximumCorridorAngularRadius, corridorAngularRadius);
      if (angularSeparation > corridorAngularRadius) continue;
      const risk = clamp01(1 - angularSeparation / Math.max(ANGLE_EPSILON, corridorAngularRadius));
      if (risk > maximumRisk || (risk === maximumRisk && (firstUnitId === null || unit.id < firstUnitId))) {
        maximumRisk = risk;
        firstUnitId = unit.id;
        nearestAngularSeparationRadians = angularSeparation;
      }
    }
  }
  return {
    risk: maximumRisk,
    firstUnitId,
    nearestAngularSeparationRadians,
    corridorAngularRadiusRadians: maximumCorridorAngularRadius,
    queriedCandidateCount: candidateCount,
  };
}

export function evaluateCenterlineFriendlyFireRisk(
  state: Pick<SimulationState, 'map' | 'units'>,
  shooter: UnitModel,
  muzzle: BallisticPoint3,
  target: BallisticPoint3,
): CenterlineFriendlyFireRiskV1 {
  const result = probeBallisticLine(createBallisticLineProbeContext(state), {
    origin: muzzle,
    target,
    shooterId: shooter.id,
  });
  const firstUnit = result.blockedBy === 'unit' && result.obstructionId
    ? state.units.find((unit) => unit.id === result.obstructionId) ?? null
    : null;
  const friendly = Boolean(firstUnit && getSideRelation(shooter.side, firstUnit.side) === 'friendly');
  return {
    risk: friendly ? 1 : 0,
    firstBlocker: result.blockedBy,
    firstUnitId: firstUnit?.id ?? null,
    firstUnitFriendly: friendly,
    hitDistanceMetres: result.hitDistanceMetres,
  };
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
