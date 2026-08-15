import assert from 'node:assert/strict';
import {
  createCombatLabTelemetryDataset,
  exportCombatLabMetricsCsv,
  exportCombatLabMetricsLlmJson,
  exportCombatLabTelemetryJsonl,
  runCombatLabMetricsReport,
  runCombatLabMetricsReportBlock,
  type CombatLabMeasurementDefinitionV1,
  type CombatLabTelemetryRecordV1,
} from '../src/core/testing/combat-lab';

const definitions: CombatLabMeasurementDefinitionV1[] = [definition('m-shot', 'fire.shot_committed'), definition('m-impact', 'fire.impact')];
const records: CombatLabTelemetryRecordV1[] = [
  record('r1', 'm-shot', 'fire.shot_committed', 1, { roundsConsumed: 1, shooter: 'u1' }),
  record('r2', 'm-shot', 'fire.shot_committed', 2, { roundsConsumed: 2, shooter: 'u1' }),
  record('r3', 'm-impact', 'fire.impact', 2.5, { damage: 10, target: 'u2' }),
  record('r4', 'm-impact', 'fire.impact', 3.5, { damage: 20, target: 'u3' }),
];
const dataset = createCombatLabTelemetryDataset('run-report', definitions, records);

const blockTypes = ['summary', 'change_over_time', 'distribution', 'comparison', 'relation', 'timeline', 'data_table', 'event_chain'] as const;
const blocks = blockTypes.map((type, index) => ({
  schemaVersion: 1 as const,
  blockId: `b${index}`,
  type,
  titleRu: type,
  measurementDefinitionIds: type === 'relation' || type === 'comparison' ? ['m-shot', 'm-impact'] : ['m-shot'],
  valueField: type === 'summary' || type === 'change_over_time' || type === 'distribution' || type === 'comparison' ? 'roundsConsumed' : undefined,
  xValueField: type === 'relation' ? 'roundsConsumed' : undefined,
  yValueField: type === 'relation' ? 'damage' : undefined,
  tableFields: type === 'data_table' ? ['roundsConsumed', 'shooter'] : undefined,
}));
const report = runCombatLabMetricsReport(dataset, blocks);
assert.equal(report.blocks.length, 8);
assert.equal(report.blocks.find((block) => block.type === 'timeline')?.recordIds.length, 2);
assert.equal(report.blocks.find((block) => block.type === 'relation')?.rows.length, 2);

const filtered = runCombatLabMetricsReportBlock(dataset, {
  schemaVersion: 1,
  blockId: 'filtered',
  type: 'timeline',
  titleRu: 'Только позднее',
  measurementDefinitionIds: ['m-shot'],
  fromSeconds: 1.5,
  filters: [{ payloadField: 'shooter', operator: 'eq', value: 'u1' }],
});
assert.deepEqual(filtered.recordIds, ['r2']);

const llmJson = exportCombatLabMetricsLlmJson(dataset, report);
assert.match(llmJson, /combat_lab_metrics_llm_export/);
assert.equal(exportCombatLabTelemetryJsonl(dataset).split('\n').length, 4);
const csv = exportCombatLabMetricsCsv(report.blocks.find((block) => block.type === 'data_table')!);
assert.match(csv, /recordId/);
assert.match(csv, /roundsConsumed/);

console.log('Combat Lab Metrics report/export behavior smoke passed.');

function definition(id: string, streamId: CombatLabMeasurementDefinitionV1['streamId']): CombatLabMeasurementDefinitionV1 {
  return {
    schemaVersion: 1,
    measurementDefinitionId: id,
    revision: 1,
    fingerprint: `${id}-fp`,
    titleRu: id,
    streamId,
    participantUnitIds: [],
    stateConstraints: [],
    collectionPeriod: { start: { kind: 'run_start' }, end: { kind: 'run_end' } },
    enabled: true,
  };
}
function record(id: string, measurementDefinitionId: string, streamId: CombatLabTelemetryRecordV1['streamId'], seconds: number, payload: Record<string, string | number | boolean | null>): CombatLabTelemetryRecordV1 {
  return {
    schemaVersion: 1,
    recordId: id,
    runId: 'run-report',
    measurementDefinitionId,
    measurementDefinitionRevision: 1,
    measurementDefinitionFingerprint: `${measurementDefinitionId}-fp`,
    streamId,
    simulatedSeconds: seconds,
    sourceEntityRefs: [],
    payload,
  };
}
