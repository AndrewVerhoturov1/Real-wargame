import { stableStringify } from '../CombatLabDigest';
import type { CombatLabTelemetryDatasetV1 } from './CombatLabTelemetryDataset';
import type { CombatLabTelemetryRecordV1 } from './CombatLabMeasurementTelemetry';

export type CombatLabMetricsReportBlockTypeV1 =
  | 'summary'
  | 'change_over_time'
  | 'distribution'
  | 'comparison'
  | 'relation'
  | 'timeline'
  | 'data_table'
  | 'event_chain';

export type CombatLabMetricsReportFilterOperatorV1 = 'eq' | 'neq' | 'lt' | 'lte' | 'gt' | 'gte';

export interface CombatLabMetricsReportFilterV1 {
  readonly payloadField: string;
  readonly operator: CombatLabMetricsReportFilterOperatorV1;
  readonly value: string | number | boolean | null;
}

export interface CombatLabMetricsReportBlockV1 {
  readonly schemaVersion: 1;
  readonly blockId: string;
  readonly type: CombatLabMetricsReportBlockTypeV1;
  readonly titleRu: string;
  readonly measurementDefinitionIds: readonly string[];
  readonly fromSeconds?: number;
  readonly toSeconds?: number;
  readonly filters?: readonly CombatLabMetricsReportFilterV1[];
  readonly valueField?: string;
  readonly xValueField?: string;
  readonly yValueField?: string;
  readonly bucketCount?: number;
  readonly tableFields?: readonly string[];
}

export interface CombatLabMetricsNumericSummaryV1 {
  readonly count: number;
  readonly mean: number | null;
  readonly median: number | null;
  readonly min: number | null;
  readonly max: number | null;
  readonly range: number | null;
}

export interface CombatLabMetricsReportBlockResultV1 {
  readonly schemaVersion: 1;
  readonly blockId: string;
  readonly type: CombatLabMetricsReportBlockTypeV1;
  readonly titleRu: string;
  readonly measurementDefinitionIds: readonly string[];
  readonly recordIds: readonly string[];
  readonly rows: readonly Readonly<Record<string, unknown>>[];
  readonly summary: Readonly<Record<string, CombatLabMetricsNumericSummaryV1>> | null;
}

export interface CombatLabMetricsReportV1 {
  readonly schemaVersion: 1;
  readonly runId: string;
  readonly blocks: readonly CombatLabMetricsReportBlockResultV1[];
}

export function runCombatLabMetricsReportBlock(
  dataset: CombatLabTelemetryDatasetV1,
  block: CombatLabMetricsReportBlockV1,
): CombatLabMetricsReportBlockResultV1 {
  const normalized = normalizeBlock(dataset, block);
  const records = selectRecords(dataset, normalized);
  const recordIds = Object.freeze(records.map((record) => record.recordId));
  let rows: readonly Readonly<Record<string, unknown>>[];
  let summary: Readonly<Record<string, CombatLabMetricsNumericSummaryV1>> | null = null;

  switch (normalized.type) {
    case 'summary': {
      summary = buildSummary(records, normalized.valueField);
      rows = Object.freeze(Object.entries(summary).map(([key, value]) => Object.freeze({ key, ...value })));
      break;
    }
    case 'change_over_time': {
      const field = requireField(normalized.valueField, normalized.type);
      rows = Object.freeze(records.flatMap((record) => {
        const value = numericPayload(record, field);
        return value === null ? [] : [Object.freeze({
          recordId: record.recordId,
          simulatedSeconds: record.simulatedSeconds,
          measurementDefinitionId: record.measurementDefinitionId,
          value,
        })];
      }));
      break;
    }
    case 'distribution': {
      const field = requireField(normalized.valueField, normalized.type);
      rows = buildDistribution(records, field, normalized.bucketCount ?? 10);
      break;
    }
    case 'comparison': {
      const field = requireField(normalized.valueField, normalized.type);
      const grouped: Record<string, CombatLabMetricsNumericSummaryV1> = {};
      for (const measurementId of normalized.measurementDefinitionIds) {
        grouped[measurementId] = summarizeNumbers(
          records
            .filter((record) => record.measurementDefinitionId === measurementId)
            .map((record) => numericPayload(record, field))
            .filter((value): value is number => value !== null),
        );
      }
      summary = Object.freeze(grouped);
      rows = Object.freeze(Object.entries(grouped).map(([measurementDefinitionId, value]) => Object.freeze({
        measurementDefinitionId,
        ...value,
      })));
      break;
    }
    case 'relation': {
      if (normalized.measurementDefinitionIds.length !== 2) {
        throw new Error('Metrics relation block requires exactly two measurementDefinitionIds.');
      }
      const xField = requireField(normalized.xValueField, 'relation x');
      const yField = requireField(normalized.yValueField, 'relation y');
      const [xMeasurementId, yMeasurementId] = normalized.measurementDefinitionIds;
      const xs = records.filter((record) => record.measurementDefinitionId === xMeasurementId);
      const ys = records.filter((record) => record.measurementDefinitionId === yMeasurementId);
      const pairCount = Math.min(xs.length, ys.length);
      const relationRows: Readonly<Record<string, unknown>>[] = [];
      for (let index = 0; index < pairCount; index += 1) {
        const xRecord = xs[index]!;
        const yRecord = ys[index]!;
        const x = numericPayload(xRecord, xField);
        const y = numericPayload(yRecord, yField);
        if (x === null || y === null) continue;
        relationRows.push(Object.freeze({
          pairIndex: index,
          xRecordId: xRecord.recordId,
          yRecordId: yRecord.recordId,
          x,
          y,
          pairing: 'ordinal_within_filtered_measurements',
        }));
      }
      rows = Object.freeze(relationRows);
      break;
    }
    case 'timeline': {
      rows = Object.freeze(records.map((record) => Object.freeze({
        recordId: record.recordId,
        simulatedSeconds: record.simulatedSeconds,
        measurementDefinitionId: record.measurementDefinitionId,
        streamId: record.streamId,
        sourceEntityRefs: record.sourceEntityRefs,
        payload: record.payload,
      })));
      break;
    }
    case 'data_table': {
      const fields = normalized.tableFields ?? [];
      rows = Object.freeze(records.map((record) => buildTableRow(record, fields)));
      break;
    }
    case 'event_chain': {
      rows = Object.freeze(records.map((record, index) => Object.freeze({
        chainIndex: index,
        recordId: record.recordId,
        previousRecordId: index > 0 ? records[index - 1]!.recordId : null,
        nextRecordId: index + 1 < records.length ? records[index + 1]!.recordId : null,
        simulatedSeconds: record.simulatedSeconds,
        measurementDefinitionId: record.measurementDefinitionId,
        sourceEntityRefs: record.sourceEntityRefs,
        payload: record.payload,
      })));
      break;
    }
    default: {
      const neverType: never = normalized.type;
      throw new Error(`Unsupported Metrics report block: ${String(neverType)}.`);
    }
  }

  return Object.freeze({
    schemaVersion: 1,
    blockId: normalized.blockId,
    type: normalized.type,
    titleRu: normalized.titleRu,
    measurementDefinitionIds: Object.freeze([...normalized.measurementDefinitionIds]),
    recordIds,
    rows,
    summary,
  });
}

export function runCombatLabMetricsReport(
  dataset: CombatLabTelemetryDatasetV1,
  blocks: readonly CombatLabMetricsReportBlockV1[],
): CombatLabMetricsReportV1 {
  const ids = new Set<string>();
  const results = blocks.map((block) => {
    const id = nonEmpty(block.blockId, 'Metrics report blockId');
    if (ids.has(id)) throw new Error(`Duplicate Metrics report blockId: ${id}.`);
    ids.add(id);
    return runCombatLabMetricsReportBlock(dataset, block);
  });
  return Object.freeze({ schemaVersion: 1, runId: dataset.runId, blocks: Object.freeze(results) });
}

export function exportCombatLabMetricsLlmJson(
  dataset: CombatLabTelemetryDatasetV1,
  report: CombatLabMetricsReportV1,
): string {
  if (report.runId !== dataset.runId) throw new Error('Metrics report runId does not match telemetry dataset.');
  return stableStringify({
    schemaVersion: 1,
    kind: 'combat_lab_metrics_llm_export',
    runId: dataset.runId,
    measurementDefinitions: dataset.measurementDefinitions,
    recordCountByMeasurement: dataset.recordCountByMeasurement,
    report,
  });
}

export function exportCombatLabTelemetryJsonl(dataset: CombatLabTelemetryDatasetV1): string {
  return dataset.records.map((record) => stableStringify(record)).join('\n');
}

export function exportCombatLabMetricsCsv(block: CombatLabMetricsReportBlockResultV1): string {
  if (block.rows.length === 0) return '';
  const columns = collectColumns(block.rows);
  const lines = [columns.map(csvCell).join(',')];
  for (const row of block.rows) {
    lines.push(columns.map((column) => csvCell(serializeCell(row[column]))).join(','));
  }
  return lines.join('\r\n');
}

function normalizeBlock(
  dataset: CombatLabTelemetryDatasetV1,
  block: CombatLabMetricsReportBlockV1,
): CombatLabMetricsReportBlockV1 {
  if (block.schemaVersion !== 1) throw new Error('Unsupported Metrics report block schemaVersion.');
  const blockId = nonEmpty(block.blockId, 'Metrics report blockId');
  const titleRu = nonEmpty(block.titleRu, 'Metrics report block titleRu');
  const definitionIds = new Set(dataset.measurementDefinitions.map((item) => item.measurementDefinitionId));
  const measurementDefinitionIds = block.measurementDefinitionIds.map((id) => nonEmpty(id, 'MeasurementDefinitionId'));
  if (measurementDefinitionIds.length === 0) throw new Error(`Metrics report block ${blockId} requires at least one measurement.`);
  assertUnique(measurementDefinitionIds, `Metrics report block ${blockId} measurementDefinitionId`);
  for (const id of measurementDefinitionIds) {
    if (!definitionIds.has(id)) throw new Error(`Metrics report block ${blockId} references missing measurement ${id}.`);
  }
  const fromSeconds = normalizeOptionalTime(block.fromSeconds, 'fromSeconds');
  const toSeconds = normalizeOptionalTime(block.toSeconds, 'toSeconds');
  if (fromSeconds !== undefined && toSeconds !== undefined && toSeconds < fromSeconds) {
    throw new Error(`Metrics report block ${blockId} has inverted analysis period.`);
  }
  return Object.freeze({
    ...block,
    blockId,
    titleRu,
    measurementDefinitionIds: Object.freeze(measurementDefinitionIds),
    fromSeconds,
    toSeconds,
    filters: block.filters ? Object.freeze(block.filters.map(normalizeFilter)) : undefined,
    tableFields: block.tableFields ? Object.freeze(block.tableFields.map((field) => nonEmpty(field, 'Metrics table field'))) : undefined,
  });
}

function selectRecords(
  dataset: CombatLabTelemetryDatasetV1,
  block: CombatLabMetricsReportBlockV1,
): readonly CombatLabTelemetryRecordV1[] {
  const measurements = new Set(block.measurementDefinitionIds);
  return Object.freeze(dataset.records.filter((record) => {
    if (!measurements.has(record.measurementDefinitionId)) return false;
    if (block.fromSeconds !== undefined && record.simulatedSeconds < block.fromSeconds) return false;
    if (block.toSeconds !== undefined && record.simulatedSeconds > block.toSeconds) return false;
    return (block.filters ?? []).every((filter) => matchesFilter(record.payload[filter.payloadField] ?? null, filter));
  }));
}

function buildSummary(
  records: readonly CombatLabTelemetryRecordV1[],
  requestedField: string | undefined,
): Readonly<Record<string, CombatLabMetricsNumericSummaryV1>> {
  const fields = requestedField ? [requestedField] : discoverNumericFields(records);
  const result: Record<string, CombatLabMetricsNumericSummaryV1> = {};
  for (const field of fields) {
    result[field] = summarizeNumbers(
      records.map((record) => numericPayload(record, field)).filter((value): value is number => value !== null),
    );
  }
  return Object.freeze(result);
}

function buildDistribution(
  records: readonly CombatLabTelemetryRecordV1[],
  field: string,
  bucketCount: number,
): readonly Readonly<Record<string, unknown>>[] {
  if (!Number.isInteger(bucketCount) || bucketCount < 1 || bucketCount > 1_000) {
    throw new Error('Metrics distribution bucketCount must be an integer in 1..1000.');
  }
  const values = records
    .map((record) => ({ record, value: numericPayload(record, field) }))
    .filter((item): item is { record: CombatLabTelemetryRecordV1; value: number } => item.value !== null);
  if (values.length === 0) return Object.freeze([]);
  const min = Math.min(...values.map((item) => item.value));
  const max = Math.max(...values.map((item) => item.value));
  if (min === max) {
    return Object.freeze([Object.freeze({
      bucketIndex: 0,
      minInclusive: min,
      maxInclusive: max,
      count: values.length,
      recordIds: Object.freeze(values.map((item) => item.record.recordId)),
    })]);
  }
  const width = (max - min) / bucketCount;
  const ids = Array.from({ length: bucketCount }, () => [] as string[]);
  for (const item of values) {
    const raw = Math.floor((item.value - min) / width);
    ids[Math.min(bucketCount - 1, Math.max(0, raw))]!.push(item.record.recordId);
  }
  return Object.freeze(ids.map((recordIds, bucketIndex) => Object.freeze({
    bucketIndex,
    minInclusive: min + width * bucketIndex,
    maxInclusive: bucketIndex === bucketCount - 1 ? max : min + width * (bucketIndex + 1),
    count: recordIds.length,
    recordIds: Object.freeze(recordIds),
  })));
}

function buildTableRow(record: CombatLabTelemetryRecordV1, fields: readonly string[]): Readonly<Record<string, unknown>> {
  const row: Record<string, unknown> = {
    recordId: record.recordId,
    simulatedSeconds: record.simulatedSeconds,
    measurementDefinitionId: record.measurementDefinitionId,
    streamId: record.streamId,
  };
  for (const field of fields) row[field] = record.payload[field] ?? null;
  return Object.freeze(row);
}

function summarizeNumbers(values: readonly number[]): CombatLabMetricsNumericSummaryV1 {
  if (values.length === 0) return Object.freeze({ count: 0, mean: null, median: null, min: null, max: null, range: null });
  const sorted = [...values].sort((left, right) => left - right);
  const min = sorted[0]!;
  const max = sorted.at(-1)!;
  return Object.freeze({
    count: sorted.length,
    mean: sorted.reduce((sum, value) => sum + value, 0) / sorted.length,
    median: quantile(sorted, 0.5),
    min,
    max,
    range: max - min,
  });
}

function discoverNumericFields(records: readonly CombatLabTelemetryRecordV1[]): readonly string[] {
  const fields = new Set<string>();
  for (const record of records) {
    for (const [key, value] of Object.entries(record.payload)) {
      if (typeof value === 'number' && Number.isFinite(value)) fields.add(key);
    }
  }
  return Object.freeze([...fields].sort());
}

function numericPayload(record: CombatLabTelemetryRecordV1, field: string): number | null {
  const value = record.payload[field];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizeFilter(filter: CombatLabMetricsReportFilterV1): CombatLabMetricsReportFilterV1 {
  return Object.freeze({
    payloadField: nonEmpty(filter.payloadField, 'Metrics report filter field'),
    operator: filter.operator,
    value: filter.value,
  });
}

function matchesFilter(actual: string | number | boolean | null, filter: CombatLabMetricsReportFilterV1): boolean {
  if (filter.operator === 'eq') return actual === filter.value;
  if (filter.operator === 'neq') return actual !== filter.value;
  if (typeof actual !== 'number' || typeof filter.value !== 'number') return false;
  if (filter.operator === 'lt') return actual < filter.value;
  if (filter.operator === 'lte') return actual <= filter.value;
  if (filter.operator === 'gt') return actual > filter.value;
  return actual >= filter.value;
}

function quantile(sorted: readonly number[], probability: number): number {
  if (sorted.length === 1) return sorted[0]!;
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return sorted[lower]! + (sorted[upper]! - sorted[lower]!) * (position - lower);
}

function collectColumns(rows: readonly Readonly<Record<string, unknown>>[]): readonly string[] {
  const columns = new Set<string>();
  for (const row of rows) for (const key of Object.keys(row)) columns.add(key);
  return Object.freeze([...columns]);
}

function serializeCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return stableStringify(value);
  return String(value);
}

function csvCell(value: unknown): string {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function requireField(value: string | undefined, blockType: string): string {
  if (value === undefined) throw new Error(`Metrics ${blockType} block requires a numeric payload field.`);
  return nonEmpty(value, `Metrics ${blockType} field`);
}

function normalizeOptionalTime(value: number | undefined, label: string): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isFinite(value) || value < 0) throw new Error(`Metrics report ${label} must be finite and non-negative.`);
  return value;
}

function assertUnique(values: readonly string[], label: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) throw new Error(`${label} must be unique: ${value}.`);
    seen.add(value);
  }
}

function nonEmpty(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(`${label} must be a non-empty string.`);
  return value.trim();
}
