import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile('src/combat-lab/scenario-editor/CombatLabExperimentEnvelopeFileActions.ts', 'utf8').catch(() => '');
assert.ok(source.length > 0, 'ExperimentEnvelope file actions are missing.');
const result = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
  reportDiagnostics: true,
});
assert.equal(result.diagnostics?.length ?? 0, 0, 'ExperimentEnvelope file actions contain TypeScript syntax diagnostics.');
assert.match(source, /downloadCombatLabExperimentEnvelope/);
assert.match(source, /readCombatLabExperimentEnvelopeFile/);
assert.match(source, /prepareCombatLabExperimentEnvelopeOpen/);
assert.match(source, /\.polygon-experiment\.json/);
console.log('Combat Lab ExperimentEnvelope file actions contract smoke passed.');
