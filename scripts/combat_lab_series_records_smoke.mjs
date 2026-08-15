import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile('src/core/testing/combat-lab/experiment/CombatLabSeriesRecords.ts', 'utf8').catch(() => '');
assert.ok(source.length > 0, 'Series/Run record owner is missing.');
const result = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
  reportDiagnostics: true,
});
assert.equal(result.diagnostics?.length ?? 0, 0, 'Series/Run record owner contains TypeScript syntax diagnostics.');
assert.match(source, /interface CombatLabSeriesRecordV1/);
assert.match(source, /readonly seriesId:\s*string/);
assert.match(source, /interface CombatLabRunRecordV1/);
assert.match(source, /readonly runId:\s*string/);
assert.match(source, /runtimeVersionId:\s*string/);
assert.match(source, /frozenInputRef/);
assert.match(source, /measurementSetSnapshot/);
assert.match(source, /seed:\s*number/);
assert.match(source, /eventDigest:\s*string/);
assert.match(source, /finalStateDigest:\s*string/);
assert.match(source, /interface CombatLabSeriesArchiveV1/);
assert.match(source, /serializeCombatLabSeriesArchive/);
assert.match(source, /parseCombatLabSeriesArchive/);
assert.match(source, /runIds/);
assert.doesNotMatch(source, /localStorage|window\.|HistoryProvider|viewTime/);
console.log('Combat Lab durable Series/Run record contract smoke passed.');
