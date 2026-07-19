import type { GridPosition } from '../geometry';
import type { UnitModel } from '../units/UnitModel';
import type { TacticalPositionSettings } from './TacticalPositionSettings';
import {
  searchTacticalPositions,
  type TacticalPositionCandidateSeedV2,
  type TacticalPositionFieldView,
  type TacticalPositionSearchRequest,
  type TacticalPositionSearchResult,
} from './TacticalPositionSearch';

export type TacticalPositionSearchObjective =
  | 'balanced'
  | 'advance_to_threat'
  | 'withdraw_from_threat'
  | 'continue_order';

export interface TacticalPositionReferenceThreat {
  readonly id: string;
  readonly position: GridPosition;
}

export interface TacticalPositionObjectiveContext {
  readonly objective: TacticalPositionSearchObjective;
  readonly referenceThreatId: string | null;
  readonly referenceThreatPosition: GridPosition | null;
  readonly orderTarget: GridPosition | null;
}

export interface TacticalPositionObjectiveMetrics {
  readonly referenceThreatId: string | null;
  readonly distanceToThreatMeters: number | null;
  readonly threatDistanceDeltaMeters: number | null;
  readonly distanceToOrderTargetMeters: number | null;
  readonly objectiveAlignment: number;
}

export type TacticalPositionCandidateWithObjective = TacticalPositionCandidateSeedV2 & {
  readonly metrics: TacticalPositionCandidateSeedV2['metrics'] & TacticalPositionObjectiveMetrics;
};

export function normalizeTacticalPositionSearchObjective(value: unknown): TacticalPositionSearchObjective {
  if (
    value === 'advance_to_threat'
    || value === 'withdraw_from_threat'
    || value === 'continue_order'
  ) return value;
  return 'balanced';
}

export function tacticalPositionObjectiveLabelRu(objective: TacticalPositionSearchObjective): string {
  if (objective === 'advance_to_threat') return 'Продвижение к угрозе';
  if (objective === 'withdraw_from_threat') return 'Отход от угрозы';
  if (objective === 'continue_order') return 'Продолжение приказа через позицию';
  return 'Сбалансированный поиск';
}

export function resolveTacticalPositionReferenceThreat(unit: UnitModel): TacticalPositionReferenceThreat | null {
  const threats = [...unit.tacticalKnowledge.threats].sort((left, right) => {
    const leftScore = threatPriority(left);
    const rightScore = threatPriority(right);
    if (leftScore !== rightScore) return rightScore - leftScore;
    return left.id.localeCompare(right.id);
  });
  const threat = threats[0];
  return threat ? { id: threat.id, position: { x: threat.x, y: threat.y } } : null;
}

/**
 * Runs the existing bounded field search over an expanded candidate pool, then
 * attaches objective geometry and ranks only already-valid tactical positions.
 * It never adds a full-map pass or an A* per candidate.
 */
export function searchTacticalPositionsForObjective(
  field: TacticalPositionFieldView,
  request: TacticalPositionSearchRequest & TacticalPositionObjectiveContext,
): TacticalPositionSearchResult {
  const requestedLimit = Math.max(1, Math.floor(request.maxCandidates));
  const expandedLimit = Math.min(96, Math.max(24, requestedLimit * 4));
  const base = searchTacticalPositions(field, {
    ...request,
    maxCandidates: expandedLimit,
    orderTarget: request.orderTarget,
  });
  const originThreatDistance = request.referenceThreatPosition
    ? distanceMeters(request.origin, request.referenceThreatPosition, field.metersPerCell)
    : null;

  const ranked = base.candidates.map((candidate, originalIndex) => {
    const distanceToThreatMeters = request.referenceThreatPosition
      ? distanceMeters(candidate.position, request.referenceThreatPosition, field.metersPerCell)
      : null;
    const threatDistanceDeltaMeters = distanceToThreatMeters !== null && originThreatDistance !== null
      ? roundTwo(distanceToThreatMeters - originThreatDistance)
      : null;
    const distanceToOrderTargetMeters = request.orderTarget
      ? distanceMeters(candidate.position, request.orderTarget, field.metersPerCell)
      : null;
    const objectiveAlignment = calculateObjectiveAlignment(
      request.objective,
      threatDistanceDeltaMeters,
      distanceToOrderTargetMeters,
      request.searchRadiusMeters,
    );
    const enriched: TacticalPositionCandidateWithObjective = {
      ...candidate,
      position: { ...candidate.position },
      source: { ...candidate.source },
      metrics: {
        ...candidate.metrics,
        referenceThreatId: request.referenceThreatId,
        distanceToThreatMeters: nullableRound(distanceToThreatMeters),
        threatDistanceDeltaMeters,
        distanceToOrderTargetMeters: nullableRound(distanceToOrderTargetMeters),
        objectiveAlignment,
      },
    };
    return {
      candidate: enriched,
      score: objectiveSortScore(enriched, request.objective, request.settings),
      originalIndex,
    };
  });

  ranked.sort((left, right) => (
    right.score - left.score
    || left.originalIndex - right.originalIndex
    || left.candidate.id.localeCompare(right.candidate.id)
  ));

  return {
    candidates: ranked.slice(0, requestedLimit).map((item) => item.candidate),
    diagnostics: base.diagnostics,
  };
}

export function readTacticalPositionObjectiveMetrics(
  candidate: TacticalPositionCandidateSeedV2,
): TacticalPositionObjectiveMetrics {
  const metrics = candidate.metrics as TacticalPositionCandidateSeedV2['metrics'] & Partial<TacticalPositionObjectiveMetrics>;
  return {
    referenceThreatId: typeof metrics.referenceThreatId === 'string' ? metrics.referenceThreatId : null,
    distanceToThreatMeters: finiteOrNull(metrics.distanceToThreatMeters),
    threatDistanceDeltaMeters: finiteOrNull(metrics.threatDistanceDeltaMeters),
    distanceToOrderTargetMeters: finiteOrNull(metrics.distanceToOrderTargetMeters),
    objectiveAlignment: clampPercent(metrics.objectiveAlignment ?? 50),
  };
}

function objectiveSortScore(
  candidate: TacticalPositionCandidateWithObjective,
  objective: TacticalPositionSearchObjective,
  settings: TacticalPositionSettings,
): number {
  const metrics = candidate.metrics;
  const base = metrics.safety * 0.45
    + (100 - metrics.danger) * 0.2
    + metrics.protection * 0.2
    + (100 - metrics.routeDanger) * 0.15;
  if (objective === 'balanced') return base;
  const modeWeight = objective === 'advance_to_threat'
    ? settings.advanceToThreatWeight
    : objective === 'withdraw_from_threat'
      ? settings.withdrawFromThreatWeight
      : settings.orderTargetDistanceWeight;
  return base + metrics.objectiveAlignment * (modeWeight + settings.objectiveAlignmentWeight);
}

function calculateObjectiveAlignment(
  objective: TacticalPositionSearchObjective,
  threatDistanceDeltaMeters: number | null,
  distanceToOrderTargetMeters: number | null,
  radiusMeters: number,
): number {
  const radius = Math.max(1, radiusMeters);
  if (objective === 'advance_to_threat') {
    return threatDistanceDeltaMeters === null
      ? 0
      : clampPercent(50 - threatDistanceDeltaMeters / radius * 100);
  }
  if (objective === 'withdraw_from_threat') {
    return threatDistanceDeltaMeters === null
      ? 0
      : clampPercent(50 + threatDistanceDeltaMeters / radius * 100);
  }
  if (objective === 'continue_order') {
    return distanceToOrderTargetMeters === null
      ? 0
      : clampPercent(100 - distanceToOrderTargetMeters / radius * 100);
  }
  return 50;
}

function threatPriority(threat: UnitModel['tacticalKnowledge']['threats'][number]): number {
  return (threat.visibleNow ? 1000 : 0)
    + threat.confidence * 2
    + threat.strength
    + threat.suppression * 0.5;
}

function distanceMeters(from: GridPosition, to: GridPosition, metersPerCell: number): number {
  return Math.hypot(from.x - to.x, from.y - to.y) * Math.max(0.001, metersPerCell);
}

function finiteOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function nullableRound(value: number | null): number | null {
  return value === null ? null : roundTwo(value);
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, roundTwo(Number.isFinite(value) ? value : 0)));
}

function roundTwo(value: number): number {
  return Math.round(value * 100) / 100;
}
