import type { TacticalPositionSearchObjective } from './TacticalPositionObjective';
import type {
  TacticalPositionMovementObjectiveSettings,
  TacticalPositionSearchSettings,
} from './TacticalPositionNodeSettings';

export interface TacticalPositionRankMetrics {
  readonly staticPotential?: number;
  readonly directionalFit?: number;
  readonly lineQuality?: number;
  readonly rangeFit?: number;
  readonly desiredDistanceFit?: number;
  readonly protection?: number;
  readonly concealment?: number;
  readonly danger?: number;
  readonly positionDanger?: number;
  readonly routeDanger?: number;
  readonly routeCost?: number;
  readonly uncertainty?: number;
  readonly orderAlignment?: number;
  readonly withdrawalQuality?: number;
  readonly postureFit?: number;
  readonly objectiveAlignment?: number;
  readonly threatDistanceDeltaMeters?: number | null;
}

export interface TacticalPositionRankContext {
  readonly searchRadiusMeters: number;
}

export interface TacticalPositionRankResult {
  readonly tacticalQuality: number;
  readonly movementObjectiveScore: number;
  readonly finalScore: number;
}

export interface TacticalPositionRankedCandidate {
  readonly id: string;
  readonly metrics: TacticalPositionRankMetrics;
}

export function rankTacticalPositionMetrics(
  metrics: TacticalPositionRankMetrics,
  objective: TacticalPositionSearchObjective,
  settings: TacticalPositionSearchSettings,
  context: TacticalPositionRankContext,
): TacticalPositionRankResult {
  const tacticalQuality = scoreTacticalQuality(metrics, settings, context);
  const movementObjectiveScore = scoreMovementObjective(metrics, objective, settings.movementObjective, context);
  const influence = movementInfluence(objective, settings.movementObjective);
  const tacticalWeight = nonNegative(settings.ranking.tacticalQualityWeight);
  const movementWeight = nonNegative(settings.ranking.movementObjectiveWeight) * influence;
  const finalScore = weightedAverage([
    [tacticalQuality, tacticalWeight],
    [movementObjectiveScore, movementWeight],
  ], tacticalQuality);
  return Object.freeze({
    tacticalQuality: roundTwo(tacticalQuality),
    movementObjectiveScore: roundTwo(movementObjectiveScore),
    finalScore: roundTwo(finalScore),
  });
}

export function sortTacticalPositionRanked<T extends TacticalPositionRankedCandidate>(
  candidates: readonly T[],
  objective: TacticalPositionSearchObjective,
  settings: TacticalPositionSearchSettings,
  context: TacticalPositionRankContext,
): T[] {
  return [...candidates].sort((left, right) => {
    const leftRank = rankTacticalPositionMetrics(left.metrics, objective, settings, context);
    const rightRank = rankTacticalPositionMetrics(right.metrics, objective, settings, context);
    return rightRank.finalScore - leftRank.finalScore
      || rightRank.tacticalQuality - leftRank.tacticalQuality
      || left.id.localeCompare(right.id);
  });
}

export function scoreTacticalQuality(
  metrics: TacticalPositionRankMetrics,
  settings: TacticalPositionSearchSettings,
  context: TacticalPositionRankContext,
): number {
  const weights = settings.ranking.weights;
  const danger = percent(metrics.positionDanger ?? metrics.danger);
  const routeDanger = percent(metrics.routeDanger);
  const routeEfficiency = percent(100 - finite(metrics.routeCost) / Math.max(1, context.searchRadiusMeters) * 8);
  const values: ReadonlyArray<readonly [number, number]> = [
    [percent(metrics.staticPotential), weights.staticPotential],
    [percent(metrics.directionalFit), weights.directionalFit],
    [percent(metrics.lineQuality), weights.lineQuality],
    [percent(metrics.rangeFit ?? 100), weights.rangeFit],
    [percent(metrics.desiredDistanceFit ?? 100), weights.desiredDistance],
    [percent(metrics.protection), weights.protection],
    [percent(metrics.concealment), weights.concealment],
    [100 - danger, weights.danger],
    [100 - routeDanger, weights.routeDanger],
    [routeEfficiency, weights.routeCost],
    [100 - percent(metrics.uncertainty), weights.certainty],
    [percent(metrics.orderAlignment ?? 50), weights.orderAlignment],
    [percent(metrics.withdrawalQuality ?? 50), weights.withdrawal],
    [percent(metrics.postureFit ?? 100), weights.postureFit],
  ];
  return weightedAverage(values, 0);
}

export function scoreMovementObjective(
  metrics: TacticalPositionRankMetrics,
  objective: TacticalPositionSearchObjective,
  settings: TacticalPositionMovementObjectiveSettings,
  context: TacticalPositionRankContext,
): number {
  if (objective === 'continue_order') return percent(metrics.orderAlignment ?? metrics.objectiveAlignment);
  const radius = Math.max(1, context.searchRadiusMeters);
  const tolerance = Math.max(0, finite(settings.distanceToleranceMeters));
  const delta = finiteOrNull(metrics.threatDistanceDeltaMeters);
  if (delta === null) return percent(metrics.objectiveAlignment ?? 50);
  const effectiveDelta = Math.abs(delta) <= tolerance ? 0 : delta - Math.sign(delta) * tolerance;
  let score = 50;
  let wrongDirection = false;
  if (objective === 'advance_to_threat') {
    score = 50 - effectiveDelta / radius * 100;
    wrongDirection = effectiveDelta > 0;
  } else if (objective === 'withdraw_from_threat') {
    score = 50 + effectiveDelta / radius * 100;
    wrongDirection = effectiveDelta < 0;
  } else {
    score = 100 - Math.abs(effectiveDelta) / radius * 100;
  }
  if (wrongDirection) score -= percent(settings.wrongDirectionPenalty);
  return percent(score);
}

function movementInfluence(
  objective: TacticalPositionSearchObjective,
  settings: TacticalPositionMovementObjectiveSettings,
): number {
  if (objective === 'advance_to_threat') return nonNegative(settings.advanceToThreatInfluence);
  if (objective === 'withdraw_from_threat') return nonNegative(settings.withdrawFromThreatInfluence);
  if (objective === 'continue_order') return nonNegative(settings.continueOrderInfluence);
  return nonNegative(settings.balancedInfluence);
}

function weightedAverage(values: ReadonlyArray<readonly [number, number]>, fallback: number): number {
  let score = 0;
  let totalWeight = 0;
  for (const [value, rawWeight] of values) {
    const weight = nonNegative(rawWeight);
    if (weight <= 0) continue;
    score += percent(value) * weight;
    totalWeight += weight;
  }
  return totalWeight > 0 ? percent(score / totalWeight) : percent(fallback);
}

function percent(value: unknown): number {
  return Math.max(0, Math.min(100, finite(value)));
}

function nonNegative(value: unknown): number {
  return Math.max(0, finite(value));
}

function finite(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function finiteOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function roundTwo(value: number): number {
  return Math.round(value * 100) / 100;
}
