import type { UnitPosture } from '../../behavior/BehaviorModel';
import type { GridPosition } from '../../geometry';

export type TacticalQueryKind = 'cover';
export type TacticalQueryStatus = 'generated' | 'filtered' | 'scored' | 'selected' | 'stopped';
export type TacticalQueryGenerationStatus = 'queued' | 'calculating' | 'ready' | 'stale' | 'cancelled' | 'failed';
export type TacticalSlopeType = 'direct' | 'reverse' | 'flat';
export type TacticalQueryStopReasonCode =
  | 'max_candidates'
  | 'time_limit'
  | 'no_candidates'
  | 'host_unavailable';
export type TacticalCandidateExclusionCode =
  | 'outside_map'
  | 'route_unavailable'
  | 'distance_too_short'
  | 'distance_too_long'
  | 'does_not_block_threat'
  | 'route_too_dangerous';

export interface TacticalQueryBudget {
  readonly maxCandidates: number;
  readonly searchRadiusMeters: number;
  readonly maxCalculationMs: number;
}

export interface TacticalQueryStopReason {
  readonly code: TacticalQueryStopReasonCode;
  readonly reason: string;
  readonly reasonRu: string;
}

export interface TacticalCandidateSource {
  readonly kind: 'map_object' | 'terrain';
  readonly id: string;
  readonly label: string;
  readonly labelRu: string;
}

export interface TacticalCandidateMetrics {
  readonly onMap: boolean;
  readonly routeExists: boolean;
  readonly distanceMeters: number;
  readonly blocksThreat: boolean;
  readonly protection: number;
  readonly concealment: number;
  readonly routeDanger: number;
  readonly slopeType: TacticalSlopeType;
  readonly orderAlignment: number;
  /** Position meaning is incomplete without the posture required to use it. */
  readonly recommendedPosture?: UnitPosture;
}

export interface TacticalPositionCandidateSeed {
  readonly id: string;
  readonly position: GridPosition;
  readonly source: TacticalCandidateSource;
  readonly metrics: TacticalCandidateMetrics;
}

export interface TacticalCandidateExclusionReason {
  readonly code: TacticalCandidateExclusionCode;
  readonly reason: string;
  readonly reasonRu: string;
}

export interface TacticalCandidateScoreBreakdown {
  readonly protection: number;
  readonly concealment: number;
  readonly distance: number;
  readonly routeDanger: number;
  readonly slope: number;
  readonly orderAlignment: number;
}

export interface TacticalPositionCandidate extends TacticalPositionCandidateSeed {
  readonly totalScore: number;
  readonly scoreBreakdown: TacticalCandidateScoreBreakdown;
  readonly excluded: boolean;
  readonly exclusionReasons: readonly TacticalCandidateExclusionReason[];
}

export interface TacticalQuery {
  readonly id: string;
  readonly kind: TacticalQueryKind;
  readonly status: TacticalQueryStatus;
  readonly budget: TacticalQueryBudget;
  readonly candidates: readonly TacticalPositionCandidate[];
  readonly elapsedMs: number;
  readonly stopReason?: TacticalQueryStopReason;
  readonly winnerCandidateId?: string;
  readonly searchRequestId?: string;
  readonly searchRequestStatus?: TacticalQueryGenerationStatus;
}

export interface TacticalQueryGenerationRequest extends TacticalQueryBudget {
  readonly unitId: string;
  readonly queryKey?: string;
  readonly requestId?: string;
  readonly blackboard: Readonly<Record<string, unknown>>;
}

export interface TacticalQueryGenerationResult {
  readonly candidates: readonly TacticalPositionCandidateSeed[];
  readonly elapsedMs: number;
  readonly stopReason?: TacticalQueryStopReason;
  readonly requestId?: string;
  readonly requestStatus?: TacticalQueryGenerationStatus;
}

export interface TacticalQueryFilterOptions {
  readonly requireOnMap: boolean;
  readonly requireRoute: boolean;
  readonly minimumDistanceMeters: number;
  readonly maximumDistanceMeters: number;
  readonly requireDirectionalCover: boolean;
  readonly maxRouteDanger: number;
}

export interface TacticalQueryScoreWeights {
  readonly protection: number;
  readonly concealment: number;
  readonly distance: number;
  readonly routeDanger: number;
  readonly slope: number;
  readonly orderAlignment: number;
}

const ZERO_BREAKDOWN: TacticalCandidateScoreBreakdown = Object.freeze({
  protection: 0,
  concealment: 0,
  distance: 0,
  routeDanger: 0,
  slope: 0,
  orderAlignment: 0,
});

export function createTacticalQuery(
  id: string,
  budget: TacticalQueryBudget,
  generation: TacticalQueryGenerationResult,
): TacticalQuery {
  const normalizedBudget = normalizeBudget(budget);
  const limited = generation.candidates.slice(0, normalizedBudget.maxCandidates);
  const truncated = generation.candidates.length > limited.length;
  const stopReason = generation.stopReason ?? (truncated ? {
    code: 'max_candidates' as const,
    reason: `Candidate budget stopped the query at ${normalizedBudget.maxCandidates} positions.`,
    reasonRu: `Лимит кандидатов остановил запрос после ${normalizedBudget.maxCandidates} позиций.`,
  } : undefined);
  return {
    id,
    kind: 'cover',
    status: stopReason ? 'stopped' : 'generated',
    budget: normalizedBudget,
    candidates: limited.map(seedToCandidate),
    elapsedMs: round(Math.max(0, generation.elapsedMs)),
    stopReason,
    searchRequestId: generation.requestId,
    searchRequestStatus: generation.requestStatus,
  };
}

export function filterTacticalQuery(
  query: TacticalQuery,
  options: TacticalQueryFilterOptions,
): TacticalQuery {
  const minimumDistanceMeters = Math.max(0, options.minimumDistanceMeters);
  const maximumDistanceMeters = Math.max(minimumDistanceMeters, options.maximumDistanceMeters);
  const maxRouteDanger = clampPercent(options.maxRouteDanger);
  const candidates = query.candidates.map((candidate) => {
    const reasons: TacticalCandidateExclusionReason[] = [];
    if (options.requireOnMap && !candidate.metrics.onMap) {
      reasons.push(exclusion('outside_map', 'Position is outside the tactical map.', 'Позиция находится за пределами карты.'));
    }
    if (options.requireRoute && !candidate.metrics.routeExists) {
      reasons.push(exclusion('route_unavailable', 'No exact route reaches the position.', 'До позиции нет точного доступного маршрута.'));
    }
    if (candidate.metrics.distanceMeters < minimumDistanceMeters) {
      reasons.push(exclusion('distance_too_short', 'Position is closer than the allowed distance.', 'Позиция находится ближе допустимой дистанции.'));
    }
    if (candidate.metrics.distanceMeters > maximumDistanceMeters) {
      reasons.push(exclusion('distance_too_long', 'Position is farther than the allowed distance.', 'Позиция находится дальше допустимой дистанции.'));
    }
    if (options.requireDirectionalCover && !candidate.metrics.blocksThreat) {
      reasons.push(exclusion(
        'does_not_block_threat',
        'Cover does not protect from the current threat direction.',
        'Укрытие не защищает от текущего направления угрозы.',
      ));
    }
    if (candidate.metrics.routeDanger > maxRouteDanger) {
      reasons.push(exclusion(
        'route_too_dangerous',
        `Route danger ${candidate.metrics.routeDanger} exceeds ${maxRouteDanger}.`,
        `Опасность маршрута ${candidate.metrics.routeDanger} превышает предел ${maxRouteDanger}.`,
      ));
    }
    return {
      ...candidate,
      excluded: reasons.length > 0,
      exclusionReasons: reasons,
      totalScore: 0,
      scoreBreakdown: { ...ZERO_BREAKDOWN },
    };
  });
  return {
    ...query,
    status: 'filtered',
    candidates,
    winnerCandidateId: undefined,
  };
}

export function scoreTacticalQuery(
  query: TacticalQuery,
  weights: TacticalQueryScoreWeights,
): TacticalQuery {
  const radius = Math.max(1, query.budget.searchRadiusMeters);
  const candidates = query.candidates.map((candidate) => {
    if (candidate.excluded) {
      return {
        ...candidate,
        totalScore: 0,
        scoreBreakdown: { ...ZERO_BREAKDOWN },
      };
    }
    const distanceQuality = clampPercent(100 - (candidate.metrics.distanceMeters / radius) * 100);
    const routeSafety = 100 - clampPercent(candidate.metrics.routeDanger);
    const slopeQuality = candidate.metrics.slopeType === 'reverse'
      ? 100
      : candidate.metrics.slopeType === 'flat'
        ? 50
        : 0;
    const scoreBreakdown: TacticalCandidateScoreBreakdown = {
      protection: round(clampPercent(candidate.metrics.protection) * weights.protection),
      concealment: round(clampPercent(candidate.metrics.concealment) * weights.concealment),
      distance: round(distanceQuality * weights.distance),
      routeDanger: round(routeSafety * weights.routeDanger),
      slope: round(slopeQuality * weights.slope),
      orderAlignment: round(clampPercent(candidate.metrics.orderAlignment) * weights.orderAlignment),
    };
    return {
      ...candidate,
      scoreBreakdown,
      totalScore: round(Object.values(scoreBreakdown).reduce((sum, value) => sum + value, 0)),
    };
  });
  return {
    ...query,
    status: 'scored',
    candidates,
    winnerCandidateId: undefined,
  };
}

export function selectBestTacticalPosition(query: TacticalQuery): {
  readonly query: TacticalQuery;
  readonly winner?: TacticalPositionCandidate;
} {
  const winner = [...query.candidates]
    .filter((candidate) => !candidate.excluded)
    .sort((left, right) => right.totalScore - left.totalScore || left.id.localeCompare(right.id))[0];
  if (!winner) {
    return {
      query: {
        ...query,
        status: 'stopped',
        winnerCandidateId: undefined,
        stopReason: query.stopReason ?? {
          code: 'no_candidates',
          reason: 'No tactical position survived the filters.',
          reasonRu: 'После фильтров не осталось подходящих тактических позиций.',
        },
      },
    };
  }
  return {
    query: {
      ...query,
      status: 'selected',
      winnerCandidateId: winner.id,
    },
    winner,
  };
}

export function cloneTacticalQueries(
  queries: Readonly<Record<string, TacticalQuery>>,
): Record<string, TacticalQuery> {
  return Object.fromEntries(Object.entries(queries).map(([key, query]) => [key, cloneTacticalQuery(query)]));
}

export function cloneTacticalQuery(query: TacticalQuery): TacticalQuery {
  return {
    ...query,
    budget: { ...query.budget },
    stopReason: query.stopReason ? { ...query.stopReason } : undefined,
    candidates: query.candidates.map((candidate) => ({
      ...candidate,
      position: { ...candidate.position },
      source: { ...candidate.source },
      metrics: { ...candidate.metrics },
      scoreBreakdown: { ...candidate.scoreBreakdown },
      exclusionReasons: candidate.exclusionReasons.map((reason) => ({ ...reason })),
    })),
  };
}

function seedToCandidate(seed: TacticalPositionCandidateSeed): TacticalPositionCandidate {
  return {
    id: seed.id,
    position: { ...seed.position },
    source: { ...seed.source },
    metrics: {
      ...seed.metrics,
      distanceMeters: round(Math.max(0, seed.metrics.distanceMeters)),
      protection: clampPercent(seed.metrics.protection),
      concealment: clampPercent(seed.metrics.concealment),
      routeDanger: clampPercent(seed.metrics.routeDanger),
      orderAlignment: clampPercent(seed.metrics.orderAlignment),
    },
    totalScore: 0,
    scoreBreakdown: { ...ZERO_BREAKDOWN },
    excluded: false,
    exclusionReasons: [],
  };
}

function normalizeBudget(value: TacticalQueryBudget): TacticalQueryBudget {
  return {
    maxCandidates: Math.max(1, Math.floor(value.maxCandidates)),
    searchRadiusMeters: Math.max(0, value.searchRadiusMeters),
    maxCalculationMs: Math.max(0, value.maxCalculationMs),
  };
}

function exclusion(
  code: TacticalCandidateExclusionCode,
  reason: string,
  reasonRu: string,
): TacticalCandidateExclusionReason {
  return { code, reason, reasonRu };
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, round(Number.isFinite(value) ? value : 0)));
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
