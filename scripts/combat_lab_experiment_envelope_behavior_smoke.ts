import assert from 'node:assert/strict';
import {
  buildCombatLabBuiltInExperiment,
  createCombatLabMeasurementDefinition,
  getCombatLabScenarioDefinition,
} from '../src/core/testing/combat-lab';
import {
  createEmptyCombatLabLaboratoryState,
  upsertCombatLabLaboratoryArea,
  upsertCombatLabLaboratoryOverride,
} from '../src/combat-lab/parameters/CombatLabLaboratoryRuntime';
import {
  createCombatLabExperimentEnvelope,
  parseCombatLabExperimentEnvelope,
  prepareCombatLabExperimentEnvelopeOpen,
  serializeCombatLabExperimentEnvelope,
} from '../src/combat-lab/scenario-editor/CombatLabExperimentEnvelope';

const definition = getCombatLabScenarioDefinition('rifle-distance-baseline');
const experiment = buildCombatLabBuiltInExperiment(definition.scenarioId, definition.defaultSeed);
let laboratory = createEmptyCombatLabLaboratoryState();
laboratory = upsertCombatLabLaboratoryArea(laboratory, {
  areaId: 'area-1',
  titleRu: 'Зона испытания',
  vertices: [
    { xMetres: 0, yMetres: 0 },
    { xMetres: 10, yMetres: 0 },
    { xMetres: 10, yMetres: 10 },
    { xMetres: 0, yMetres: 10 },
  ],
});
laboratory = upsertCombatLabLaboratoryOverride(laboratory, {
  overrideId: 'override-1',
  parameterId: 'accuracy.dispersion_multiplier',
  target: { kind: 'area', areaId: 'area-1' },
  value: 1.25,
  enabled: true,
});
const measurement = createCombatLabMeasurementDefinition({
  measurementDefinitionId: 'measurement-shots',
  titleRu: 'Все выстрелы',
  streamId: 'fire.shot_committed',
});

const envelope = createCombatLabExperimentEnvelope({
  experiment,
  laboratory,
  measurementDefinitions: [measurement],
});
assert.ok(envelope.envelopeFingerprint.length > 0);
assert.equal(envelope.experiment.experimentId, experiment.experimentId);
assert.equal(envelope.laboratory.overrides.length, 1);
assert.equal(envelope.measurementDefinitions[0]?.measurementDefinitionId, 'measurement-shots');

const serialized = serializeCombatLabExperimentEnvelope(envelope);
const restored = parseCombatLabExperimentEnvelope(serialized);
assert.deepEqual(restored, envelope);
assert.deepEqual(prepareCombatLabExperimentEnvelopeOpen(serialized), envelope);

const tampered = JSON.parse(serialized) as Record<string, unknown>;
tampered.envelopeFingerprint = 'tampered';
assert.throws(
  () => prepareCombatLabExperimentEnvelopeOpen(JSON.stringify(tampered)),
  /ExperimentEnvelope fingerprint mismatch/,
);

const partial = JSON.parse(serialized) as Record<string, unknown>;
delete partial.laboratory;
assert.throws(
  () => prepareCombatLabExperimentEnvelopeOpen(JSON.stringify(partial)),
  /laboratory is required/,
);

const badMeasurement = JSON.parse(serialized) as {
  measurementDefinitions: Array<Record<string, unknown>>;
};
badMeasurement.measurementDefinitions[0]!.fingerprint = 'wrong';
assert.throws(
  () => prepareCombatLabExperimentEnvelopeOpen(JSON.stringify(badMeasurement)),
  /Measurement measurement-shots fingerprint mismatch/,
);

console.log('Combat Lab full ExperimentEnvelope behavior smoke passed.');
