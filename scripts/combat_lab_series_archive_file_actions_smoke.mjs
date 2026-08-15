import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile('src/combat-lab/ui/CombatLabSeriesArchiveFileActions.ts', 'utf8').catch(() => '');
assert.ok(source.length > 0, 'Series archive file actions are missing.');
const result = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
  reportDiagnostics: true,
});
assert.equal(result.diagnostics?.length ?? 0, 0, 'Series archive file actions contain TypeScript syntax diagnostics.');
assert.match(source, /downloadCombatLabSeriesArchive/);
assert.match(source, /readCombatLabSeriesArchiveFile/);
assert.match(source, /parseCombatLabSeriesArchive/);
assert.match(source, /\.combat-lab-series\.json/);
assert.doesNotMatch(source, /localStorage/);
console.log('Combat Lab Series archive file persistence contract smoke passed.');
