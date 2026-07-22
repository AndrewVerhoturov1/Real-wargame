import type { SimulationState } from '../simulation/SimulationState';
import {
  createBallisticTraceContext,
  traceBallisticRay,
  type BallisticTraceContext,
} from './BallisticTrace';
import { normalizeDirection, type BallisticPoint3, type HitZone } from './UnitHitShapes';

export type BallisticLineBlocker = 'terrain' | 'map_object' | 'unit' | 'range' | null;

export interface BallisticLineProbeContext {
  readonly traceContext: BallisticTraceContext;
}

export interface BallisticLineProbeRequest {
  readonly origin: BallisticPoint3;
  readonly target: BallisticPoint3;
  readonly shooterId?: string;
  readonly ignoreUnitIds?: readonly string[];
  readonly maximumDistanceMetres?: number;
}

export interface BallisticLineProbeResult {
  readonly clear: boolean;
  readonly blockedBy: BallisticLineBlocker;
  readonly obstructionId: string | null;
  readonly hitDistanceMetres: number | null;
  readonly clearanceMetres: number | null;
  readonly impactPoint: BallisticPoint3;
  readonly hitZone: HitZone | null;
}

export function createBallisticLineProbeContext(
  state: Pick<SimulationState, 'map' | 'units'>,
): BallisticLineProbeContext {
  return {
    traceContext: createBallisticTraceContext(state.map, state.units),
  };
}

/**
 * Read-only deterministic line check for tactical solvers and tests.
 * The caller supplies exact weapon and target points; no time, random source or combat state is read.
 */
export function probeBallisticLine(
  context: BallisticLineProbeContext,
  request: BallisticLineProbeRequest,
): BallisticLineProbeResult {
  const dx = request.target.xMetres - request.origin.xMetres;
  const dy = request.target.yMetres - request.origin.yMetres;
  const dz = request.target.zMetres - request.origin.zMetres;
  const targetDistanceMetres = Math.hypot(dx, dy, dz);
  const maximumDistanceMetres = Math.max(0, request.maximumDistanceMetres ?? targetDistanceMetres);
  const traceDistanceMetres = Math.min(targetDistanceMetres, maximumDistanceMetres);
  const direction = normalizeDirection({ x: dx, y: dy, z: dz });
  const result = traceBallisticRay(context.traceContext, {
    shotId: 'ballistic-line-probe',
    shooterId: request.shooterId ?? '',
    origin: request.origin,
    direction,
    maximumDistanceMetres: traceDistanceMetres,
    muzzleVelocityMetresPerSecond: 1,
    ignoreUnitIds: request.ignoreUnitIds,
  });

  if (result.hitType !== 'none') {
    return {
      clear: false,
      blockedBy: result.hitType === 'object' ? 'map_object' : result.hitType,
      obstructionId: result.hitObjectId ?? result.hitUnitId ?? null,
      hitDistanceMetres: result.travelledMetres,
      clearanceMetres: 0,
      impactPoint: result.impactPoint,
      hitZone: result.hitZone ?? null,
    };
  }

  if (targetDistanceMetres > maximumDistanceMetres) {
    return {
      clear: false,
      blockedBy: 'range',
      obstructionId: null,
      hitDistanceMetres: maximumDistanceMetres,
      clearanceMetres: result.clearanceMetres,
      impactPoint: result.impactPoint,
      hitZone: null,
    };
  }

  return {
    clear: true,
    blockedBy: null,
    obstructionId: null,
    hitDistanceMetres: null,
    clearanceMetres: result.clearanceMetres,
    impactPoint: result.impactPoint,
    hitZone: null,
  };
}
