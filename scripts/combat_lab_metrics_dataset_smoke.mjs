import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile('src/core/testing/combat-lab/metrics/CombatLabTelemetryDataset.ts', 'utf8').catch(() => '');
assert.ok(source.length > 0, 'Telemetry dataset owner is missing.');
const result = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
  reportDiagnostics: true,
});
assert.equal(result.diagnostics?.length ?? 0, 0, 'Telemetry dataset owner contains TypeScript syntax diagnostics.');
assert.match(source, /interface CombatLabTelemetryDatasetV1/);
assert.match(source, /measurementDefinitions/);
assert.match(source, /records/);
assert.match(source, /recordCountByMeasurement/);
assert.match(source, /createCombatLabTelemetryDataset/);
assert.match(source, /Duplicate telemetry recordId/);
assert.match(source, /fingerprint/);
assert.doesNotMatch(source, /window\.|localStorage|HistoryProvider|viewTime/);
console.log('Combat Lab telemetry dataset contract smoke passed.');
