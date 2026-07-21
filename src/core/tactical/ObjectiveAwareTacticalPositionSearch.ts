import {
  searchGeneralizedTacticalPositions,
  type GeneralizedTacticalPositionFieldView,
  type GeneralizedTacticalPositionSearchRequest,
} from './GeneralizedTacticalPositionSearch';
import type {
  TacticalPositionCandidateSeedV2,
  TacticalPositionSearchResult,
} from './TacticalPositionSearch';

interface ObjectiveMetrics {
  readonly objectiveAlignment?: number;
  readonly finalScore?: number;
  readonly staticPotential?: number;
  readonly directionalFit?: number;
  readonly lineQuality?: number;
  readonly protection?: number;
  readonly concealment?: number;
  readonly positionDanger?: number;
  readonly danger?: number;
  readonly routeDanger?: number;
  readonly uncertainty?: number;
}

const MAX_RETURNED_CANDIDATES = 16;
const MAX_EXACT_CANDIDATES = 32;
const MAX_PRELIMINARY_CANDIDATES = 128;

/**
 * Keeps the bounded geometric search intact, but gives the movement objective
 * enough influence to change the selected tactical positions. The base search
 * intentionally oversamples a small bounded pool, then this stage selects the
 * original requested count using the already calculated objective alignment.
 */
export function searchObjectiveAwareTacticalPositions(
  field: GeneralizedTacticalPositionFieldView,
  request: GeneralizedTacticalPositionSearchRequest,
): TacticalPositionSearchResult {
  if (request.objective === 'balanced') {
    return searchGeneralizedTacticalPositions(field, request);
  }

  const requestedCount = clampInt(request.maxCandidates, 1, MAX_RETURNED_CANDIDATES);
  const expandedCount = clampInt(
    Math.max(requestedCount + 4, requestedCount * 3),
    requestedCount,
    MAX_RETURNED_CANDIDATES,
  );
  const existingPreliminary = request.limits?.preliminaryCandidates ?? 36;
  const existingExact = request.limits?.exactCandidates ?? 12;
  const expandedRequest: GeneralizedTacticalPositionSearchRequest = {
    ...request,
    maxCandidates: expandedCount,
    limits: {
      ...request.limits,
      preliminaryCandidates: clampInt(
        Math.max(existingPreliminary, expandedCount * 4),
        8,
        MAX_PRELIMINARY_CANDIDATES,
      ),
      exactCandidates: clampInt(
        Math.max(existingExact, expandedCount),
        1,
        MAX_EXACT_CANDIDATES,
      ),
    },
  };

  const result = searchGeneralizedTacticalPositions(field, expandedRequest);
  const objectiveWeight = objectiveWeightFor(request);
  const candidates = result.candidates.map((candidate) => {
    const metrics = candidate.metrics as TacticalPositionCandidateSeedV2['metrics'] & ObjectiveMetrics;
    const alignment = percent(metrics.objectiveAlignment ?? 50);
    const tacticalQuality = baseTacticalQuality(metrics);
    const finalScore = percent(tacticalQuality * (1 - objectiveWeight) + alignment * objectiveWeight);
    return {
      ...candidate,
      metrics: {
        ...candidate.metrics,
        finalScore: roundTwo(finalScore),
      },
    } as TacticalPositionCandidateSeedV2;
  });

  candidates.sort((left, right) => {
    const leftMetrics = left.metrics as TacticalPositionCandidateSeedV2['metrics'] & ObjectiveMetrics;
    const rightMetrics = right.metrics as TacticalPositionCandidateSeedV2['metrics'] & ObjectiveMetrics;
    return finite(rightMetrics.finalScore) - finite(leftMetrics.finalScore)
      || finite(rightMetrics.objectiveAlignment) - finite(leftMetrics.objectiveAlignment)
      || left.id.localeCompare(right.id);
  });

  return {
    candidates: candidates.slice(0, requestedCount),
    diagnostics: result.diagnostics,
  };
}

function objectiveWeightFor(request: GeneralizedTacticalPositionSearchRequest): number {
  if (request.objective === 'continue_order') return 0.30;
  if (request.kind === 'defense' || request.kind === 'cover') return 0.42;
  return 0.34;
}

function baseTacticalQuality(metrics: ObjectiveMetrics): number {
  const danger = percent(metrics.positionDanger ?? metrics.danger);
  const routeDanger = percent(metrics.routeDanger);
  const uncertainty = percent(metrics.uncertainty);
  return percent(
    percent(metrics.protection) * 0.27
      + percent(metrics.staticPotential) * 0.20
      + percent(metrics.directionalFit) * 0.15
      + percent(metrics.lineQuality) * 0.10
      + percent(metrics.concealment) * 0.08
      + (100 - danger) * 0.10
      + (100 - routeDanger) * 0.06
      + (100 - uncertainty) * 0.04,
  );
}

function percent(value: unknown): number {
  return Math.max(0, Math.min(100, finite(value)));
}

function finite(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function clampInt(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, Math.floor(Number.isFinite(value) ? value : minimum)));
}

function roundTwo(value: number): number {
  return Math.round(value * 100) / 100;
}
