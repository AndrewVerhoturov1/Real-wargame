import {
  COMBAT_LAB_BATCH_MAX_HISTOGRAM_BUCKETS,
  type CombatLabDistributionBucketV1,
  type CombatLabDistributionSummaryV1,
} from './CombatLabBatchContracts';

const ROUND_SCALE = 1_000_000_000;

export function summarizeCombatLabDistribution(
  sourceValues: readonly number[],
  maximumBucketCount = COMBAT_LAB_BATCH_MAX_HISTOGRAM_BUCKETS,
): CombatLabDistributionSummaryV1 {
  if (sourceValues.length === 0) throw new Error('Combat Lab distribution must contain at least one value.');
  if (!Number.isInteger(maximumBucketCount) || maximumBucketCount < 1 || maximumBucketCount > COMBAT_LAB_BATCH_MAX_HISTOGRAM_BUCKETS) {
    throw new Error(`Combat Lab histogram bucket count must be in 1..${COMBAT_LAB_BATCH_MAX_HISTOGRAM_BUCKETS}.`);
  }
  const values = sourceValues.map(requireFinite).sort((left, right) => left - right);
  const sum = values.reduce((total, value) => total + value, 0);
  return Object.freeze({
    count: values.length,
    minimum: values[0]!,
    maximum: values[values.length - 1]!,
    mean: canonicalNumber(sum / values.length),
    median: percentileLinear(values, 0.5),
    p05: percentileLinear(values, 0.05),
    p95: percentileLinear(values, 0.95),
    histogram: buildHistogram(values, maximumBucketCount),
  });
}

/** Linear interpolation at index (count - 1) * percentile. */
export function percentileLinear(sortedValues: readonly number[], percentile: number): number {
  if (sortedValues.length === 0) throw new Error('Cannot calculate a percentile for an empty distribution.');
  if (!Number.isFinite(percentile) || percentile < 0 || percentile > 1) {
    throw new Error('Percentile must be in the range 0..1.');
  }
  const index = (sortedValues.length - 1) * percentile;
  const lowerIndex = Math.floor(index);
  const upperIndex = Math.ceil(index);
  const lower = requireFinite(sortedValues[lowerIndex]);
  const upper = requireFinite(sortedValues[upperIndex]);
  if (lowerIndex === upperIndex) return lower;
  return canonicalNumber(lower + (upper - lower) * (index - lowerIndex));
}

export function mergeCombatLabMetricValues(
  sources: readonly Readonly<Record<string, readonly number[]>>[],
): Readonly<Record<string, readonly number[]>> {
  const merged = new Map<string, number[]>();
  for (const source of sources) {
    for (const [metricId, values] of Object.entries(source)) {
      const target = merged.get(metricId) ?? [];
      for (const value of values) target.push(requireFinite(value));
      merged.set(metricId, target);
    }
  }
  return Object.freeze(Object.fromEntries(
    [...merged.entries()]
      .sort(([left], [right]) => compareText(left, right))
      .map(([metricId, values]) => [metricId, Object.freeze(values.sort((left, right) => left - right))]),
  ));
}

function buildHistogram(
  sortedValues: readonly number[],
  maximumBucketCount: number,
): readonly CombatLabDistributionBucketV1[] {
  const minimum = sortedValues[0]!;
  const maximum = sortedValues[sortedValues.length - 1]!;
  if (minimum === maximum) {
    return Object.freeze([{ minimum, maximum, count: sortedValues.length }]);
  }
  const bucketCount = Math.min(maximumBucketCount, Math.max(1, Math.ceil(Math.sqrt(sortedValues.length))));
  const width = (maximum - minimum) / bucketCount;
  const counts = Array.from({ length: bucketCount }, () => 0);
  for (const value of sortedValues) {
    const rawIndex = Math.floor((value - minimum) / width);
    counts[Math.min(bucketCount - 1, Math.max(0, rawIndex))] += 1;
  }
  return Object.freeze(counts.map((count, index) => Object.freeze({
    minimum: canonicalNumber(minimum + width * index),
    maximum: index === bucketCount - 1 ? maximum : canonicalNumber(minimum + width * (index + 1)),
    count,
  })));
}

function requireFinite(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('Combat Lab distribution values must be finite numbers.');
  return canonicalNumber(value);
}

function canonicalNumber(value: number): number {
  return Math.round(value * ROUND_SCALE) / ROUND_SCALE;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
