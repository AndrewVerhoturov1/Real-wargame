import type { UnitPosture } from '../behavior/BehaviorModel';
import { evaluateCoverBetween, objectCenter } from './CoverEvaluation';
import { distance, type GridPosition } from '../geometry';
import {
  resolveObjectCoverProperties,
  type MapObject,
  type TacticalMap,
} from '../map/MapModel';
import { getBuiltInNavigationProfile } from '../navigation/NavigationProfiles';
import type { TacticalRouteKnownThreat } from '../navigation/RouteCostField';
import { findGridPath } from '../pathfinding/GridPathfinder';
import {
  getDirectionalTerrainStaticGrid,
  sampleDirectionalSlope,
} from '../terrain/DirectionalTerrainStaticGrid';
import type { UnitModel } from '../units/UnitModel';
import type {
  TacticalPositionCandidateSeed,
  TacticalQueryGenerationResult,
  TacticalQueryStopReason,
  TacticalSlopeType,
} from '../ai/tactical/TacticalQuery';

export interface CoverTacticalCandidateGenerationInput {
  readonly map: TacticalMap;
  readonly unit: UnitModel;
  readonly threatPosition: GridPosition | null;
  readonly orderTarget: GridPosition | null;
  readonly searchRadiusMeters: number;
  readonly maxCandidates: number;
  readonly maxCalculationMs: number;
}

export function generateCoverTacticalCandidates(
  input: CoverTacticalCandidateGenerationInput,
): TacticalQueryGenerationResult {
  const startedAt = nowMs();
  const radiusCells = Math.max(0, input.searchRadiusMeters / input.map.metersPerCell);
  const maxCandidates = Math.max(1, Math.floor(input.maxCandidates));
  const maxCalculationMs = Math.max(0, input.maxCalculationMs);
  const candidates: TacticalPositionCandidateSeed[] = [];
  const objects = [...input.map.objects]
    .sort((left, right) => distance(input.unit.position, objectCenter(left)) - distance(input.unit.position, objectCenter(right))
      || left.id.localeCompare(right.id));
  let stopReason: TacticalQueryStopReason | undefined;

  if (maxCalculationMs <= 0) {
    return {
      candidates,
      elapsedMs: elapsed(startedAt),
      stopReason: timeLimitReason(maxCalculationMs),
    };
  }

  for (let index = 0; index < objects.length; index += 1) {
    if (elapsed(startedAt) >= maxCalculationMs) {
      stopReason = timeLimitReason(maxCalculationMs);
      break;
    }
    const object = objects[index];
    const center = objectCenter(object);
    const distanceCells = distance(input.unit.position, center);
    if (distanceCells > radiusCells) continue;
    const properties = resolveObjectCoverProperties(object);
    if (properties.coverProtection <= 0 && properties.concealment <= 0) continue;
    if (!postureFitsCover(input.unit.behaviorRuntime.posture, properties.coverPosture)) continue;
    if (candidates.length >= maxCandidates) {
      stopReason = candidateLimitReason(maxCandidates);
      break;
    }

    const position = input.threatPosition
      ? positionBehindObject(input.threatPosition, object)
      : center;
    const onMap = position.x >= 0
      && position.y >= 0
      && position.x < input.map.width
      && position.y < input.map.height;
    const directional = input.threatPosition
      ? evaluateCoverBetween(input.map, input.threatPosition, position, input.unit.behaviorRuntime.posture)
      : {
          object,
          protection: properties.coverProtection,
          concealment: properties.concealment,
          blocksThreat: properties.coverProtection > 0,
        };
    const path = onMap
      ? findGridPath(input.map, input.unit.position, position, {
          allowGoalAdjustment: false,
          navigationProfile: getBuiltInNavigationProfile('cautious'),
          tacticalContext: {
            unitId: input.unit.id,
            originX: input.unit.position.x,
            originY: input.unit.position.y,
            knowledgeRevision: input.unit.tacticalKnowledge.revision,
            knownThreats: input.unit.tacticalKnowledge.threats.map(toRouteThreat),
          },
        })
      : null;
    const routeDanger = path?.ok
      ? normalizeRouteDanger(
          path.costBreakdown.dangerCost
          + path.costBreakdown.exposureCost
          + Math.max(0, path.costBreakdown.directionalTerrainCost),
          path.cells.length,
        )
      : 100;
    const slopeType = classifySlope(input.map, position, input.threatPosition);
    const distanceMeters = distance(input.unit.position, position) * input.map.metersPerCell;
    const orderAlignment = input.orderTarget
      ? clampPercent(100 - (distance(position, input.orderTarget) / Math.max(1, radiusCells)) * 100)
      : 50;

    candidates.push({
      id: `cover:${object.id}`,
      position: { ...position },
      source: {
        kind: 'map_object',
        id: object.id,
        label: object.labels?.en ?? `Cover ${object.id}`,
        labelRu: object.labels?.ru ?? `Укрытие ${object.id}`,
      },
      metrics: {
        onMap,
        routeExists: path?.ok === true,
        distanceMeters,
        blocksThreat: directional.blocksThreat,
        protection: directional.protection,
        concealment: directional.concealment,
        routeDanger,
        slopeType,
        orderAlignment,
      },
    });
  }

  return {
    candidates,
    elapsedMs: elapsed(startedAt),
    stopReason,
  };
}

function positionBehindObject(
  threatPosition: GridPosition,
  object: MapObject,
): GridPosition {
  const center = objectCenter(object);
  const dx = center.x - threatPosition.x;
  const dy = center.y - threatPosition.y;
  const length = Math.hypot(dx, dy) || 1;
  const offset = Math.max(object.widthCells, object.heightCells) / 2 + 0.55;
  return {
    x: center.x + (dx / length) * offset,
    y: center.y + (dy / length) * offset,
  };
}

function postureFitsCover(posture: UnitPosture, coverPosture: UnitPosture): boolean {
  const rank: Record<UnitPosture, number> = {
    prone: 0,
    crouched: 1,
    standing: 2,
  };
  return rank[posture] <= rank[coverPosture];
}

function classifySlope(
  map: TacticalMap,
  position: GridPosition,
  threatPosition: GridPosition | null,
): TacticalSlopeType {
  if (!threatPosition) return 'flat';
  const cellX = Math.max(0, Math.min(map.width - 1, Math.floor(position.x)));
  const cellY = Math.max(0, Math.min(map.height - 1, Math.floor(position.y)));
  const threatBearing = Math.atan2(threatPosition.y - position.y, threatPosition.x - position.x);
  const slope = sampleDirectionalSlope(getDirectionalTerrainStaticGrid(map), cellX, cellY, threatBearing);
  if (slope < -0.12) return 'reverse';
  if (slope > 0.12) return 'direct';
  return 'flat';
}

function normalizeRouteDanger(totalDangerCost: number, cellCount: number): number {
  return clampPercent((totalDangerCost / Math.max(1, cellCount)) * 35);
}

function toRouteThreat(threat: UnitModel['tacticalKnowledge']['threats'][number]): TacticalRouteKnownThreat {
  return {
    id: threat.id,
    x: threat.x,
    y: threat.y,
    radiusCells: threat.radiusCells,
    widthCells: threat.widthCells,
    heightCells: threat.heightCells,
    rotationDegrees: threat.rotationDegrees,
    mode: threat.mode,
    strength: threat.strength,
    suppression: threat.suppression,
    confidence: threat.confidence,
    uncertaintyCells: threat.uncertaintyCells,
    directionDegrees: threat.directionDegrees,
    arcDegrees: threat.arcDegrees,
    rangeCells: threat.rangeCells,
    minRangeCells: threat.minRangeCells,
    falloffPercent: threat.falloffPercent,
  };
}

function candidateLimitReason(maxCandidates: number): TacticalQueryStopReason {
  return {
    code: 'max_candidates',
    reason: `Candidate budget stopped the query at ${maxCandidates} positions.`,
    reasonRu: `Лимит кандидатов остановил запрос после ${maxCandidates} позиций.`,
  };
}

function timeLimitReason(maxCalculationMs: number): TacticalQueryStopReason {
  return {
    code: 'time_limit',
    reason: `Calculation time budget of ${maxCalculationMs} ms was exhausted.`,
    reasonRu: `Исчерпан лимит времени расчёта ${maxCalculationMs} мс.`,
  };
}

function elapsed(startedAt: number): number {
  return Math.max(0, nowMs() - startedAt);
}

function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value * 100) / 100));
}
