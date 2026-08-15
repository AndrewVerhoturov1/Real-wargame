import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile('src/core/testing/combat-lab/experiment/CombatLabSeriesAnalysis.ts', 'utf8').catch(() => '');
assert.ok(source.length > 0, 'Series analysis owner is missing.');
const result = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
  reportDiagnostics: true,
});
assert.equal(result.diagnostics?.length ?? 0, 0, 'Series analysis owner contains TypeScript syntax diagnostics.');
assert.match(source, /summarizeCombatLabSeriesMeasurement/);
assert.match(source, /median/);
assert.match(source, /buildCombatLabSeriesDistribution/);
assert.match(source, /runIds/);
assert.match(source, /filterCombatLabSeriesRuns/);
assert.match(source, /findCombatLabSeriesOutliers/);
assert.match(source, /reasonRu/);
assert.match(source, /measurementDefinitionId/);
assert.doesNotMatch(source, /Math\.random|synthetic|window\.|localStorage/);
console.log('Combat Lab Series analysis contract smoke passed.');
