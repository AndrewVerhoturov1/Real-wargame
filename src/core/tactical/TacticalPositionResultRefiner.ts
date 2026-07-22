import { normalizeTacticalPositionKind } from '../ai/tactical/TacticalQuery';
import type { GeneralizedTacticalPositionSearchRequest } from './GeneralizedTacticalPositionSearch';
import {
  normalizeTacticalPositionSearchSettings,
  type TacticalPositionSearchSettings,
} from './TacticalPositionNodeSettings';
import { readTacticalPositionSearchSettings } from './TacticalPositionNodeSettingsTransport';
import { rankTacticalPositionMetrics } from './TacticalPositionObjectiveRanker';
import type {
  TacticalPositionCandidateSeedV2,
  TacticalPositionSearchResult,
} from './TacticalPositionSearch';
import type { TacticalPositionQuerySubjectiveFieldSnapshot } from './TacticalPositionQueryWorkerProtocol';

interface ExtendedMetrics {
  readonly tacticalQuality?: number;
  readonly movementObjectiveScore?: number;
  readonly finalScore?: number;
  readonly desiredDistanceFit?: number;
  readonly postureFit?: number;
}

/**
 * Compatibility refinement for callers that still apply the prepared subjective
 * field after exact search. Ranking itself is canonical and uses node settings.
 * The protection fusion below is data calibration, not a tactical preference:
 * defense uses more threat-relative protection because it is the metric's direct
 * subject, while observation/firing keep the geometric component dominant.
 */
export function refineTacticalPositionSearchResult(
  field: TacticalPositionQuerySubjectiveFieldSnapshot,
  request: GeneralizedTacticalPositionSearchRequest,
  result: TacticalPositionSearchResult,
): TacticalPositionSearchResult {
  const kind = normalizeTacticalPositionKind(request.kind);
  const settings = resolveSettings(request, kind);
  const candidates = result.candidates.map((candidate) => {
    const cellIndex = gridCellIndex(field.width, field.height, candidate.position.x, candidate.position.y);
    const subjectiveProtection = cellIndex >= 0
      ? percent(field.expectedProtectionAgainstThreat[cellIndex] ?? 0)
      : 0;
    const protection = fuseProtection(kind, percent(candidate.metrics.protection), subjectiveProtection);
    const rank = rankTacticalPositionMetrics({
      staticPotential: candidate.metrics.staticPotential,
      directionalFit: candidate.metrics.directionalFit,
      lineQuality: candidate.metrics.lineQuality,
      rangeFit: candidate.metrics.rangeFit ?? 100,
      desiredDistanceFit: (candidate.metrics as ExtendedMetrics).desiredDistanceFit ?? 100,
      protection,
      concealment: candidate.metrics.concealment,
      positionDanger: candidate.metrics.positionDanger ?? candidate.metrics.danger,
      routeDanger: candidate.metrics.routeDanger,
      routeCost: candidate.metrics.routeCost,
      uncertainty: candidate.metrics.uncertainty,
      orderAlignment: candidate.metrics.orderAlignment,
      withdrawalQuality: candidate.metrics.withdrawalQuality,
      postureFit: (candidate.metrics as ExtendedMetrics).postureFit ?? 100,
      objectiveAlignment: candidate.metrics.objectiveAlignment,
      threatDistanceDeltaMeters: candidate.metrics.threatDistanceDeltaMeters,
    }, request.objective, settings, { searchRadiusMeters: request.searchRadiusMeters });
    const metrics = {
      ...candidate.metrics,
      blocksThreat: kind === 'defense'
        ? protection >= settings.constraints.minimumProtection
        : candidate.metrics.blocksThreat,
      protection: round(protection),
      tacticalQuality: rank.tacticalQuality,
      movementObjectiveScore: rank.movementObjectiveScore,
      finalScore: rank.finalScore,
    } as TacticalPositionCandidateSeedV2['metrics'] & ExtendedMetrics;
    return { ...candidate, metrics } as TacticalPositionCandidateSeedV2;
  });
  candidates.sort((left, right) => (
    readScore(right, 'finalScore') - readScore(left, 'finalScore')
    || readScore(right, 'tacticalQuality') - readScore(left, 'tacticalQuality')
    || left.id.localeCompare(right.id)
  ));
  return { candidates, diagnostics: result.diagnostics };
}

function resolveSettings(
  request: GeneralizedTacticalPositionSearchRequest,
  kind: 'observation' | 'defense' | 'firing',
): TacticalPositionSearchSettings {
  return normalizeTacticalPositionSearchSettings(
    request.settings ?? readTacticalPositionSearchSettings(request.target),
    kind,
    request.objective,
  );
}

function fuseProtection(
  kind: 'observation' | 'defense' | 'firing',
  geometricProtection: number,
  subjectiveProtection: number,
): number {
  const subjectiveShare = kind === 'defense' ? 0.44 : 0.28;
  return percent(geometricProtection * (1 - subjectiveShare) + subjectiveProtection * subjectiveShare);
}
function readScore(candidate: TacticalPositionCandidateSeedV2, key: 'finalScore' | 'tacticalQuality'): number {
  const value = (candidate.metrics as TacticalPositionCandidateSeedV2['metrics'] & ExtendedMetrics)[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}
function gridCellIndex(width: number, height: number, x: number, y: number): number {
  const cellX = Math.floor(x);
  const cellY = Math.floor(y);
  return cellX < 0 || cellY < 0 || cellX >= width || cellY >= height ? -1 : cellY * width + cellX;
}
function percent(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
}
function round(value: number): number { return Math.round(value * 100) / 100; }
