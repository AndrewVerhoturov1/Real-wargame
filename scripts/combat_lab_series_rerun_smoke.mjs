import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile('src/core/testing/combat-lab/experiment/CombatLabSeriesRerun.ts', 'utf8').catch(() => '');
assert.ok(source.length > 0, 'Series rerun owner is missing.');
const result = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
  reportDiagnostics: true,
});
assert.equal(result.diagnostics?.length ?? 0, 0, 'Series rerun owner contains TypeScript syntax diagnostics.');
assert.match(source, /rerunCombatLabRunFromFrozenInput/);
assert.match(source, /runtimeVersionId/);
assert.match(source, /frozenInputRef/);
assert.match(source, /runCombatLabExperiment/);
assert.match(source, /eventDigest/);
assert.match(source, /finalStateDigest/);
assert.match(source, /verified/);
assert.doesNotMatch(source, /HistoryProvider|viewTime|recordedReplay|window\.|localStorage/);
console.log('Combat Lab frozen deterministic rerun contract smoke passed.');
