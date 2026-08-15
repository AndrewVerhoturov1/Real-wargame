import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile('src/core/testing/combat-lab/experiment/CombatLabExperimentEnvelope.ts', 'utf8').catch(() => '');
assert.ok(source.length > 0, 'Experiment envelope owner is missing.');
const result = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
  reportDiagnostics: true,
});
assert.equal(result.diagnostics?.length ?? 0, 0, 'Experiment envelope owner contains TypeScript syntax diagnostics.');
assert.match(source, /interface CombatLabExperimentEnvelopeV1/);
assert.match(source, /experiment:\s*CombatLabExperimentV1/);
assert.match(source, /laboratory:\s*CombatLabLaboratoryStateV1/);
assert.match(source, /measurementDefinitions:\s*readonly CombatLabMeasurementDefinitionV1/);
assert.match(source, /envelopeFingerprint/);
assert.match(source, /serializeCombatLabExperimentEnvelope/);
assert.match(source, /parseCombatLabExperimentEnvelope/);
assert.match(source, /prepareCombatLabExperimentEnvelopeOpen/);
assert.doesNotMatch(source, /HistoryProvider|viewTime|window\.|localStorage/);
console.log('Combat Lab full ExperimentEnvelope contract smoke passed.');
