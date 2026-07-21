import { normalizeTacticalPositionKind } from '../ai/tactical/TacticalQuery';
import type { GeneralizedTacticalPositionSearchRequest } from './GeneralizedTacticalPositionSearch';
import type {
  TacticalPositionCandidateSeedV2,
  TacticalPositionSearchResult,
} from './TacticalPositionSearch';
import type { TacticalPositionQuerySubjectiveFieldSnapshot } from './TacticalPositionQueryWorkerProtocol';

interface ExtendedMetrics {
  readonly finalScore?: number;
}

/**
 * Applies the already prepared subjective threat field to exact candidates.
 * The field is built only from legal per-unit knowledge, so this refinement can
 * account for the combined known-threat picture without reading live enemies.
 */
export function refineTacticalPositionSearchResult(
  field: TacticalPositionQuerySubjectiveFieldSnapshot,
  request: GeneralizedTacticalPositionSearchRequest,
  result: TacticalPositionSearchResult,
): TacticalPositionSearchResult {
  const kind = normalizeTacticalPositionKind(request.kind);
  const candidates = result.candidates.map((candidate) => {
    const cellIndex = gridCellIndex(field.width, field.height, candidate.position.x, candidate.position.y);
    const subjectiveProtection = cellIndex >= 0
      ? percent(field.expectedProtectionAgainstThreat[cellIndex] ?? 0)
      : 0;
    const danger = percent(candidate.metrics.positionDanger ?? candidate.metrics.danger);
    const routeDanger = percent(candidate.metrics.routeDanger);
    const uncertainty = percent(candidate.metrics.uncertainty);
    const staticPotential = percent(candidate.metrics.staticPotential);
    const directionalFit = percent(candidate.metrics.directionalFit);
    const lineQuality = percent(candidate.metrics.lineQuality);
    const rangeFit = percent(candidate.metrics.rangeFit ?? 100);
    const concealment = percent(candidate.metrics.concealment);
    const protection = kind === 'defense'
      ? percent(candidate.metrics.protection * 0.56 + subjectiveProtection * 0.44)
      : percent(candidate.metrics.protection * 0.72 + subjectiveProtection * 0.28);
    const orderAlignment = percent(candidate.metrics.orderAlignment);
    const withdrawal = percent(candidate.metrics.withdrawalQuality);
    const finalScore = score(kind, {
      staticPotential,
      directionalFit,
      lineQuality,
      rangeFit,
      concealment,
      protection,
      danger,
      routeDanger,
      uncertainty,
      orderAlignment,
      withdrawal,
    });
    const metrics = {
      ...candidate.metrics,
      blocksThreat: kind === 'defense' ? protection >= 18 : candidate.metrics.blocksThreat,
      protection: round(protection),
      finalScore: round(finalScore),
    } as TacticalPositionCandidateSeedV2['metrics'] & ExtendedMetrics;
    return {
      ...candidate,
      metrics,
    } as TacticalPositionCandidateSeedV2;
  });
  candidates.sort((left, right) => (
    readFinalScore(right) - readFinalScore(left)
    || right.id.localeCompare(left.id)
  ));
  return {
    candidates,
    diagnostics: result.diagnostics,
  };
}

function score(kind: 'observation' | 'defense' | 'firing', value: {
  readonly staticPotential: number;
  readonly directionalFit: number;
  readonly lineQuality: number;
  readonly rangeFit: number;
  readonly concealment: number;
  readonly protection: number;
  readonly danger: number;
  readonly routeDanger: number;
  readonly uncertainty: number;
  readonly orderAlignment: number;
  readonly withdrawal: number;
}): number {
  const safety = 100 - value.danger;
  const routeSafety = 100 - value.routeDanger;
  const certainty = 100 - value.uncertainty;
  if (kind === 'observation') {
    return percent(
      value.lineQuality * 0.25
        + value.staticPotential * 0.19
        + value.directionalFit * 0.13
        + value.concealment * 0.12
        + value.protection * 0.08
        + safety * 0.09
        + routeSafety * 0.05
        + certainty * 0.04
        + value.orderAlignment * 0.03
        + value.withdrawal * 0.02,
    );
  }
  if (kind === 'defense') {
    return percent(
      value.protection * 0.29
        + value.staticPotential * 0.18
        + value.directionalFit * 0.16
        + value.concealment * 0.09
        + safety * 0.10
        + routeSafety * 0.06
        + certainty * 0.04
        + value.lineQuality * 0.03
        + value.orderAlignment * 0.03
        + value.withdrawal * 0.02,
    );
  }
  return percent(
    value.lineQuality * 0.24
      + value.rangeFit * 0.16
      + value.staticPotential * 0.16
      + value.directionalFit * 0.12
      + value.protection * 0.08
      + value.concealment * 0.06
      + safety * 0.07
      + routeSafety * 0.04
      + certainty * 0.02
      + value.orderAlignment * 0.03
      + value.withdrawal * 0.02,
  );
}

function readFinalScore(candidate: TacticalPositionCandidateSeedV2): number {
  const value = (candidate.metrics as TacticalPositionCandidateSeedV2['metrics'] & ExtendedMetrics).finalScore;
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function gridCellIndex(width: number, height: number, x: number, y: number): number {
  const cellX = Math.floor(x);
  const cellY = Math.floor(y);
  if (cellX < 0 || cellY < 0 || cellX >= width || cellY >= height) return -1;
  return cellY * width + cellX;
}

function percent(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(100, value))
    : 0;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
