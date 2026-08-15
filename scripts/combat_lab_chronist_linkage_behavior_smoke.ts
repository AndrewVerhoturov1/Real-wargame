import assert from 'node:assert/strict';
import {
  createCombatLabTelemetryDataset,
  type CombatLabMeasurementDefinitionV1,
  type CombatLabTelemetryRecordV1,
} from '../src/core/testing/combat-lab';
import {
  buildCombatLabProgramJournalLink,
  buildCombatLabSeriesMeasurementLink,
  linkCombatLabTelemetryIntoLiveJournal,
} from '../src/combat-lab/runtime/CombatLabChronistLinkage';
import type { CombatLabLiveJournalEventV1 } from '../src/combat-lab/runtime/CombatLabLiveJournal';

const measurement: CombatLabMeasurementDefinitionV1 = {
  schemaVersion: 1,
  measurementDefinitionId: 'measurement-shots',
  revision: 2,
  fingerprint: 'measurement-shots-fp',
  titleRu: 'Выстрелы',
  streamId: 'fire.shot_committed',
  participantUnitIds: [],
  stateConstraints: [],
  collectionPeriod: { start: { kind: 'run_start' }, end: { kind: 'run_end' } },
  enabled: true,
};
const programStepRef = {
  experimentId: 'exp-1',
  experimentRevision: 4,
  trackId: 'track-1',
  stepId: 'step-1',
} as const;
const coreEvents: CombatLabLiveJournalEventV1[] = [{
  schemaVersion: 1,
  eventId: 'run-1:event:1',
  runId: 'run-1',
  simulatedSeconds: 0.5,
  tier: 'T2',
  source: 'core',
  category: 'program.step_started',
  titleRu: 'Шаг программы начат',
  detailsRu: 'Начат шаг.',
  mandatoryCore: true,
  programStepRef,
  entityRefs: [],
  metricRefs: [],
}, {
  schemaVersion: 1,
  eventId: 'run-1:shot:shot-1',
  runId: 'run-1',
  simulatedSeconds: 1,
  tier: 'T2',
  source: 'core',
  category: 'fire.shot_committed',
  titleRu: 'Выстрел',
  detailsRu: 'Выстрел U1.',
  mandatoryCore: true,
  programStepRef: null,
  entityRefs: [{ kind: 'unit', id: 'u1', role: 'participant' }, { kind: 'shot', id: 'shot-1', role: 'subject' }],
  metricRefs: [],
}];
const telemetry: CombatLabTelemetryRecordV1[] = [{
  schemaVersion: 1,
  recordId: 'telemetry-shot-1',
  runId: 'run-1',
  measurementDefinitionId: measurement.measurementDefinitionId,
  measurementDefinitionRevision: measurement.revision,
  measurementDefinitionFingerprint: measurement.fingerprint,
  streamId: 'fire.shot_committed',
  simulatedSeconds: 1,
  sourceEntityRefs: [{ kind: 'unit', id: 'u1' }, { kind: 'shot', id: 'shot-1' }],
  payload: { roundsConsumed: 1 },
}, {
  schemaVersion: 1,
  recordId: 'telemetry-shot-2',
  runId: 'run-1',
  measurementDefinitionId: measurement.measurementDefinitionId,
  measurementDefinitionRevision: measurement.revision,
  measurementDefinitionFingerprint: measurement.fingerprint,
  streamId: 'fire.shot_committed',
  simulatedSeconds: 2,
  sourceEntityRefs: [{ kind: 'unit', id: 'u1' }, { kind: 'shot', id: 'shot-2' }],
  payload: { roundsConsumed: 1 },
}];
const dataset = createCombatLabTelemetryDataset('run-1', [measurement], telemetry);

const linked = linkCombatLabTelemetryIntoLiveJournal(coreEvents, dataset);
assert.equal(linked.length, 3, 'Matched telemetry must not duplicate the core shot event.');
const shot = linked.find((event) => event.eventId === 'run-1:shot:shot-1');
assert.equal(shot?.metricRefs.length, 1);
assert.deepEqual(shot?.metricRefs[0]?.telemetryRecordIds, ['telemetry-shot-1']);
const metricsOnly = linked.find((event) => event.source === 'metrics');
assert.equal(metricsOnly?.mandatoryCore, false);
assert.equal(metricsOnly?.metricRefs[0]?.measurementDefinitionId, 'measurement-shots');
assert.ok(metricsOnly?.entityRefs.some((ref) => ref.kind === 'shot' && ref.id === 'shot-2'));

const programLink = buildCombatLabProgramJournalLink(programStepRef, linked);
assert.deepEqual(programLink.journalEventIds, ['run-1:event:1']);

const seriesLink = buildCombatLabSeriesMeasurementLink({
  measurementDefinitionId: measurement.measurementDefinitionId,
  revision: measurement.revision,
  fingerprint: measurement.fingerprint,
  titleRu: measurement.titleRu,
  streamId: measurement.streamId,
});
assert.equal(seriesLink.measurementDefinitionId, measurement.measurementDefinitionId);
assert.equal(seriesLink.measurementDefinitionFingerprint, measurement.fingerprint);

assert.throws(
  () => linkCombatLabTelemetryIntoLiveJournal([{ ...coreEvents[0]!, runId: 'other-run' }], dataset),
  /RunId does not match telemetry dataset/,
);

console.log('Combat Lab non-History CHRONIST linkage behavior smoke passed.');
