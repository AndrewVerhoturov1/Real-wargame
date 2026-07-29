import type {
  CombatLabBatchRunRecordV1,
  CombatLabRepresentativeRunV1,
} from './CombatLabBatchContracts';

const MAX_REPRESENTATIVES = 20;
const CANDIDATE_FALLBACK_LIMIT = 20;

export interface CombatLabRepresentativeCandidatesV1 {
  readonly fastestSuccess: CombatLabBatchRunRecordV1 | null;
  readonly slowestSuccess: CombatLabBatchRunRecordV1 | null;
  readonly highestAmmoUse: CombatLabBatchRunRecordV1 | null;
  readonly lowestAmmoUse: CombatLabBatchRunRecordV1 | null;
  readonly firstFailures: Readonly<Record<string, CombatLabBatchRunRecordV1>>;
  readonly fallbacks: readonly CombatLabBatchRunRecordV1[];
}

export function createCombatLabRepresentativeCandidates(): CombatLabRepresentativeCandidatesV1 {
  return Object.freeze({
    fastestSuccess: null,
    slowestSuccess: null,
    highestAmmoUse: null,
    lowestAmmoUse: null,
    firstFailures: Object.freeze({}),
    fallbacks: Object.freeze([]),
  });
}

export function updateCombatLabRepresentativeCandidates(
  source: CombatLabRepresentativeCandidatesV1,
  run: CombatLabBatchRunRecordV1,
): CombatLabRepresentativeCandidatesV1 {
  const firstFailures = { ...source.firstFailures };
  if (!run.success) {
    const current = firstFailures[run.stopReason];
    if (!current || run.runIndex < current.runIndex) firstFailures[run.stopReason] = run;
  }
  const fallbacks = [...source.fallbacks, run]
    .sort(compareRunIndex)
    .filter((candidate, index, values) => index === 0 || candidate.runIndex !== values[index - 1]!.runIndex)
    .slice(0, CANDIDATE_FALLBACK_LIMIT);
  return Object.freeze({
    fastestSuccess: run.success ? chooseMinimum(source.fastestSuccess, run, (candidate) => candidate.simulatedSeconds) : source.fastestSuccess,
    slowestSuccess: run.success ? chooseMaximum(source.slowestSuccess, run, (candidate) => candidate.simulatedSeconds) : source.slowestSuccess,
    highestAmmoUse: chooseMaximum(source.highestAmmoUse, run, ammoUse),
    lowestAmmoUse: chooseMinimum(source.lowestAmmoUse, run, ammoUse),
    firstFailures: Object.freeze(firstFailures),
    fallbacks: Object.freeze(fallbacks),
  });
}

export function mergeCombatLabRepresentativeCandidates(
  sources: readonly CombatLabRepresentativeCandidatesV1[],
): CombatLabRepresentativeCandidatesV1 {
  let merged = createCombatLabRepresentativeCandidates();
  const candidates: CombatLabBatchRunRecordV1[] = [];
  for (const source of sources) {
    for (const candidate of [
      source.fastestSuccess,
      source.slowestSuccess,
      source.highestAmmoUse,
      source.lowestAmmoUse,
      ...Object.values(source.firstFailures),
      ...source.fallbacks,
    ]) {
      if (candidate) candidates.push(candidate);
    }
  }
  for (const candidate of candidates.sort(compareRunIndex)) merged = updateCombatLabRepresentativeCandidates(merged, candidate);
  return merged;
}

export function selectCombatLabRepresentativeRuns(
  candidates: CombatLabRepresentativeCandidatesV1,
  failureReasons: Readonly<Record<string, number>>,
  requestedLimit: number,
): readonly CombatLabRepresentativeRunV1[] {
  const limit = Math.min(MAX_REPRESENTATIVES, Math.max(1, Math.trunc(requestedLimit)));
  const selected: CombatLabBatchRunRecordV1[] = [];
  const seen = new Set<number>();
  const append = (candidate: CombatLabBatchRunRecordV1 | null | undefined): void => {
    if (!candidate || selected.length >= limit || seen.has(candidate.runIndex)) return;
    seen.add(candidate.runIndex);
    selected.push(candidate);
  };

  append(candidates.fastestSuccess);
  append(candidates.slowestSuccess);
  append(candidates.highestAmmoUse);
  append(candidates.lowestAmmoUse);

  const dominantReasons = Object.entries(failureReasons)
    .sort(([leftReason, leftCount], [rightReason, rightCount]) => rightCount - leftCount || compareText(leftReason, rightReason));
  for (const [reason] of dominantReasons) append(candidates.firstFailures[reason]);
  for (const fallback of candidates.fallbacks) append(fallback);
  return Object.freeze(selected.map(toRepresentative));
}

function chooseMinimum(
  current: CombatLabBatchRunRecordV1 | null,
  candidate: CombatLabBatchRunRecordV1,
  value: (run: CombatLabBatchRunRecordV1) => number,
): CombatLabBatchRunRecordV1 {
  if (!current) return candidate;
  const difference = value(candidate) - value(current);
  return difference < 0 || (difference === 0 && candidate.runIndex < current.runIndex) ? candidate : current;
}

function chooseMaximum(
  current: CombatLabBatchRunRecordV1 | null,
  candidate: CombatLabBatchRunRecordV1,
  value: (run: CombatLabBatchRunRecordV1) => number,
): CombatLabBatchRunRecordV1 {
  if (!current) return candidate;
  const difference = value(candidate) - value(current);
  return difference > 0 || (difference === 0 && candidate.runIndex < current.runIndex) ? candidate : current;
}

function ammoUse(run: CombatLabBatchRunRecordV1): number {
  const value = run.metrics.roundsConsumed;
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function compareRunIndex(left: CombatLabBatchRunRecordV1, right: CombatLabBatchRunRecordV1): number {
  return left.runIndex - right.runIndex;
}

function toRepresentative(run: CombatLabBatchRunRecordV1): CombatLabRepresentativeRunV1 {
  return Object.freeze({
    runIndex: run.runIndex,
    seed: run.seed,
    success: run.success,
    stopReason: run.stopReason,
    simulatedSeconds: run.simulatedSeconds,
    metrics: Object.freeze({ ...run.metrics }),
    eventDigest: run.eventDigest,
    finalStateDigest: run.finalStateDigest,
  });
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
