import {
  createBallisticLineProbeContext,
  probeBallisticLine,
  type BallisticLineBlocker,
} from '../../combat/BallisticLineProbe';
import type { BallisticPoint3 } from '../../combat/UnitHitShapes';
import type { SimulationState } from '../../simulation/SimulationState';
import { getSideRelation } from '../../units/SideRelations';
import type { UnitModel } from '../../units/UnitModel';
import type { MuzzleGeometryV1 } from './MuzzleGeometry';

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
