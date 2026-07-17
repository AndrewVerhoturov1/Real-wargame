import {
  getSoldierDangerField,
  type SoldierDangerFieldContext,
  type SoldierDangerThreat,
} from '../knowledge/SoldierDangerField';
import type { TacticalMap } from '../map/MapModel';
import { getDirectionalTerrainSectorBasis } from '../terrain/DirectionalTerrainSectorBasis';
import type { NavigationProfile } from './NavigationProfiles';
import {
  getRouteCostFields,
  type RouteCostFieldCache,
  type RouteCostFields,
  type TacticalRouteContext,
  type TacticalRouteKnownThreat,
} from './RouteCostField';

export interface RouteCostFieldPreparationState {
  readonly nextThreatIndex: number;
  readonly fullDangerPrepared: boolean;
  readonly routeFieldsPrepared: boolean;
}

export interface DeferredRouteCostFieldPreparation {
  readonly ready: false;
  readonly state: RouteCostFieldPreparationState;
  readonly stage: 'threat-geometry' | 'danger-score' | 'route-fields';
}

export interface ReadyRouteCostFieldPreparation {
  readonly ready: true;
  readonly state: RouteCostFieldPreparationState;
  readonly fields: RouteCostFields;
  readonly stage: 'ready';
}

export type RouteCostFieldPreparationResult =
  | DeferredRouteCostFieldPreparation
  | ReadyRouteCostFieldPreparation;

const INITIAL_STATE: RouteCostFieldPreparationState = Object.freeze({
  nextThreatIndex: 0,
  fullDangerPrepared: false,
  routeFieldsPrepared: false,
});

/**
 * Warms a reactive route replan in bounded synchronous stages. Each invocation
 * performs at most one potentially heavy cache-building unit of work, so a
 * growing contact set cannot materialize every visibility/cover geometry and
 * the final A* candidate inside one simulation tick.
 */
export function prepareRouteCostFieldsForReplan(
  map: TacticalMap,
  profile: NavigationProfile,
  tacticalContext: TacticalRouteContext,
  cache: RouteCostFieldCache,
  previousState: RouteCostFieldPreparationState | undefined,
): RouteCostFieldPreparationResult {
  const state = previousState ?? INITIAL_STATE;
  const needsDanger = tacticalContext.knownThreats.length > 0 && profile.dangerWeight > 0;

  if (needsDanger) {
    const directionalBasis = getDirectionalTerrainSectorBasis(map);
    const nextThreatIndex = Math.max(0, Math.min(
      tacticalContext.knownThreats.length,
      state.nextThreatIndex,
    ));
    if (nextThreatIndex < tacticalContext.knownThreats.length) {
      const threat = tacticalContext.knownThreats[nextThreatIndex]!;
      getSoldierDangerField(map, buildDangerContext(tacticalContext, [threat]), { directionalBasis });
      return {
        ready: false,
        stage: 'threat-geometry',
        state: {
          nextThreatIndex: nextThreatIndex + 1,
          fullDangerPrepared: false,
          routeFieldsPrepared: false,
        },
      };
    }

    if (!state.fullDangerPrepared) {
      getSoldierDangerField(
        map,
        buildDangerContext(tacticalContext, tacticalContext.knownThreats),
        { directionalBasis },
      );
      return {
        ready: false,
        stage: 'danger-score',
        state: {
          nextThreatIndex,
          fullDangerPrepared: true,
          routeFieldsPrepared: false,
        },
      };
    }
  }

  const fields = getRouteCostFields(map, profile, tacticalContext, cache);
  if (!state.routeFieldsPrepared) {
    return {
      ready: false,
      stage: 'route-fields',
      state: {
        nextThreatIndex: tacticalContext.knownThreats.length,
        fullDangerPrepared: needsDanger ? true : state.fullDangerPrepared,
        routeFieldsPrepared: true,
      },
    };
  }

  return {
    ready: true,
    stage: 'ready',
    fields,
    state,
  };
}

function buildDangerContext(
  tacticalContext: TacticalRouteContext,
  threats: readonly TacticalRouteKnownThreat[],
): SoldierDangerFieldContext {
  return {
    unitId: tacticalContext.unitId,
    posture: tacticalContext.posture ?? 'standing',
    knowledgeRevision: tacticalContext.knowledgeRevision,
    threats: threats.map(toDangerThreat),
  };
}

function toDangerThreat(threat: TacticalRouteKnownThreat): SoldierDangerThreat {
  return {
    id: threat.id,
    mode: threat.mode,
    x: threat.x,
    y: threat.y,
    radiusCells: threat.radiusCells,
    widthCells: threat.widthCells,
    heightCells: threat.heightCells,
    rotationDegrees: threat.rotationDegrees,
    strength: threat.strength,
    suppression: threat.suppression,
    confidence: threat.confidence,
    uncertaintyCells: threat.uncertaintyCells,
    directionDegrees: threat.directionDegrees ?? 0,
    arcDegrees: threat.arcDegrees ?? 45,
    rangeCells: threat.rangeCells ?? Math.max(0.5, threat.radiusCells),
    minRangeCells: threat.minRangeCells ?? 0,
    falloffPercent: threat.falloffPercent ?? 0,
    fireThreatClass: threat.fireThreatClass ?? null,
  };
}
