import type {
  CombatLabRunMeasurementValueV1,
  CombatLabRunRecordV1,
  CombatLabSeriesArchiveV1,
} from './CombatLabSeriesRecords';

export interface CombatLabSeriesMeasurementSummaryV1 {
  readonly measurementDefinitionId: string;
  readonly runCount: number;
  readonly mean: number | null;
  readonly median: number | null;
  readonly min: number | null;
  readonly max: number | null;
  readonly range: number | null;
  readonly q1: number | null;
  readonly q3: number | null;
}

export interface CombatLabSeriesDistributionBucketV1 {
  readonly bucketIndex: number;
  readonly minInclusive: number;
  readonly maxInclusive: number;
  readonly count: number;
  readonly runIds: readonly string[];
}

export interface CombatLabSeriesDistributionV1 {
  readonly measurementDefinitionId: string;
  readonly min: number | null;
  readonly max: number | null;
  readonly buckets: readonly CombatLabSeriesDistributionBucketV1[];
}

export type CombatLabSeriesRunFilterOperatorV1 = 'eq' | 'neq' | 'lt' | 'lte' | 'gt' | 'gte' | 'between';

export interface CombatLabSeriesRunFilterV1 {
  readonly measurementDefinitionId: string;
  readonly operator: CombatLabSeriesRunFilterOperatorV1;
  readonly value: number;
  readonly maxValue?: number;
}

export interface CombatLabSeriesOutlierV1 {
  readonly runId: string;
  readonly runIndex: number;
  readonly seed: number;
  readonly measurementDefinitionId: string;
  readonly value: number;
  readonly median: number;
  readonly q1: number;
  readonly q3: number;
  readonly lowerFence: number;
  readonly upperFence: number;
  readonly reasonRu: string;
}

export function listCombatLabSeriesRuns(archive: CombatLabSeriesArchiveV1): readonly CombatLabRunRecordV1[] {
  return Object.freeze([...archive.runs].sort((left, right) => left.runIndex - right.runIndex));
}

export function summarizeCombatLabSeriesMeasurement(
  archive: CombatLabSeriesArchiveV1,
  measurementDefinitionId: string,
): CombatLabSeriesMeasurementSummaryV1 {
  const id = requireMeasurement(archive, measurementDefinitionId);
  const values = numericValues(archive.runs, id).map((item) => item.value).sort((left, right) => left - right);
  if (values.length === 0) {
    return Object.freeze({
      measurementDefinitionId: id,
      runCount: 0,
      mean: null,
      median: null,
      min: null,
      max: null,
      range: null,
      q1: null,
      q3: null,
    });
  }
  const min = values[0]!;
  const max = values.at(-1)!;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Object.freeze({
    measurementDefinitionId: id,
    runCount: values.length,
    mean,
    median: quantile(values, 0.5),
    min,
    max,
    range: max - min,
    q1: quantile(values, 0.25),
    q3: quantile(values, 0.75),
  });
}

export function buildCombatLabSeriesDistribution(
  archive: CombatLabSeriesArchiveV1,
  measurementDefinitionId: string,
  bucketCount = 10,
): CombatLabSeriesDistributionV1 {
  const id = requireMeasurement(archive, measurementDefinitionId);
  if (!Number.isInteger(bucketCount) || bucketCount < 1 || bucketCount > 1_000) {
    throw new Error('Series distribution bucketCount must be an integer in 1..1000.');
  }
  const values = numericValues(archive.runs, id);
  if (values.length === 0) {
    return Object.freeze({ measurementDefinitionId: id, min: null, max: null, buckets: Object.freeze([]) });
  }
  const min = Math.min(...values.map((item) => item.value));
  const max = Math.max(...values.map((item) => item.value));
  if (min === max) {
    return Object.freeze({
      measurementDefinitionId: id,
      min,
      max,
      buckets: Object.freeze([Object.freeze({
        bucketIndex: 0,
        minInclusive: min,
        maxInclusive: max,
        count: values.length,
        runIds: Object.freeze(values.map((item) => item.run.runId)),
      })]),
    });
  }

  const width = (max - min) / bucketCount;
  const runIdsByBucket = Array.from({ length: bucketCount }, () => [] as string[]);
  for (const item of values) {
    const rawIndex = Math.floor((item.value - min) / width);
    runIdsByBucket[Math.min(bucketCount - 1, Math.max(0, rawIndex))]!.push(item.run.runId);
  }
  const buckets = runIdsByBucket.map((runIds, bucketIndex) => Object.freeze({
    bucketIndex,
    minInclusive: min + width * bucketIndex,
    maxInclusive: bucketIndex === bucketCount - 1 ? max : min + width * (bucketIndex + 1),
    count: runIds.length,
    runIds: Object.freeze(runIds),
  }));
  return Object.freeze({ measurementDefinitionId: id, min, max, buckets: Object.freeze(buckets) });
}

export function filterCombatLabSeriesRuns(
  archive: CombatLabSeriesArchiveV1,
  filters: readonly CombatLabSeriesRunFilterV1[],
): readonly CombatLabRunRecordV1[] {
  const normalized = filters.map((filter) => normalizeFilter(archive, filter));
  return Object.freeze(archive.runs.filter((run) => normalized.every((filter) => {
    const value = findMeasurementValue(run, filter.measurementDefinitionId)?.value;
    return value !== undefined && matchesFilter(value, filter);
  })));
}

export function findCombatLabSeriesOutliers(
  archive: CombatLabSeriesArchiveV1,
  measurementDefinitionId: string,
): readonly CombatLabSeriesOutlierV1[] {
  const id = requireMeasurement(archive, measurementDefinitionId);
  const values = numericValues(archive.runs, id);
  if (values.length < 4) return Object.freeze([]);
  const sorted = values.map((item) => item.value).sort((left, right) => left - right);
  const median = quantile(sorted, 0.5);
  const q1 = quantile(sorted, 0.25);
  const q3 = quantile(sorted, 0.75);
  const iqr = q3 - q1;
  const lowerFence = iqr === 0 ? median : q1 - 1.5 * iqr;
  const upperFence = iqr === 0 ? median : q3 + 1.5 * iqr;
  const outliers = values
    .filter((item) => item.value < lowerFence || item.value > upperFence)
    .sort((left, right) => left.run.runIndex - right.run.runIndex)
    .map((item) => Object.freeze({
      runId: item.run.runId,
      runIndex: item.run.runIndex,
      seed: item.run.seed,
      measurementDefinitionId: id,
      value: item.value,
      median,
      q1,
      q3,
      lowerFence,
      upperFence,
      reasonRu: item.value < lowerFence
        ? `Значение ${formatNumber(item.value)} заметно ниже типичного диапазона серии (медиана ${formatNumber(median)}).`
        : `Значение ${formatNumber(item.value)} заметно выше типичного диапазона серии (медиана ${formatNumber(median)}).`,
    }));
  return Object.freeze(outliers);
}

export function getCombatLabSeriesRunById(
  archive: CombatLabSeriesArchiveV1,
  runId: string,
): CombatLabRunRecordV1 | null {
  const normalizedRunId = nonEmpty(runId, 'RunId');
  return archive.runs.find((run) => run.runId === normalizedRunId) ?? null;
}

function numericValues(
  runs: readonly CombatLabRunRecordV1[],
  measurementDefinitionId: string,
): Array<{ run: CombatLabRunRecordV1; value: number }> {
  const output: Array<{ run: CombatLabRunRecordV1; value: number }> = [];
  for (const run of runs) {
    const item = findMeasurementValue(run, measurementDefinitionId);
    if (!item || !Number.isFinite(item.value)) continue;
    output.push({ run, value: item.value });
  }
  return output;
}

function findMeasurementValue(
  run: CombatLabRunRecordV1,
  measurementDefinitionId: string,
): CombatLabRunMeasurementValueV1 | null {
  return run.measurementValues.find((item) => item.measurementDefinitionId === measurementDefinitionId) ?? null;
}

function requireMeasurement(archive: CombatLabSeriesArchiveV1, measurementDefinitionId: string): string {
  const id = nonEmpty(measurementDefinitionId, 'MeasurementDefinitionId');
  if (!archive.series.measurementSetSnapshot.some((item) => item.measurementDefinitionId === id)) {
    throw new Error(`Series ${archive.series.seriesId} does not contain measurement ${id}.`);
  }
  return id;
}

function normalizeFilter(
  archive: CombatLabSeriesArchiveV1,
  filter: CombatLabSeriesRunFilterV1,
): CombatLabSeriesRunFilterV1 {
  const measurementDefinitionId = requireMeasurement(archive, filter.measurementDefinitionId);
  if (!Number.isFinite(filter.value)) throw new Error(`Series filter ${measurementDefinitionId} value must be finite.`);
  if (filter.operator === 'between') {
    if (!Number.isFinite(filter.maxValue) || filter.maxValue! < filter.value) {
      throw new Error(`Series between-filter ${measurementDefinitionId} requires maxValue >= value.`);
    }
  }
  return Object.freeze({
    measurementDefinitionId,
    operator: filter.operator,
    value: filter.value,
    maxValue: filter.operator === 'between' ? filter.maxValue : undefined,
  });
}

function matchesFilter(value: number, filter: CombatLabSeriesRunFilterV1): boolean {
  if (filter.operator === 'eq') return value === filter.value;
  if (filter.operator === 'neq') return value !== filter.value;
  if (filter.operator === 'lt') return value < filter.value;
  if (filter.operator === 'lte') return value <= filter.value;
  if (filter.operator === 'gt') return value > filter.value;
  if (filter.operator === 'gte') return value >= filter.value;
  return value >= filter.value && value <= filter.maxValue!;
}

function quantile(sorted: readonly number[], probability: number): number {
  if (sorted.length === 0) throw new Error('Cannot compute quantile of empty values.');
  if (sorted.length === 1) return sorted[0]!;
  const position = (sorted.length - 1) * probability;
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  const lower = sorted[lowerIndex]!;
  const upper = sorted[upperIndex]!;
  return lower + (upper - lower) * (position - lowerIndex);
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
}

function nonEmpty(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(`${label} must be a non-empty string.`);
  return value.trim();
}
