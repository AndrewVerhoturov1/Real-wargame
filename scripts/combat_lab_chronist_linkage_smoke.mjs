import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile('src/combat-lab/runtime/CombatLabChronistLinkage.ts', 'utf8').catch(() => '');
assert.ok(source.length > 0, 'CHRONIST linkage owner is missing.');
const result = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
  reportDiagnostics: true,
});
assert.equal(result.diagnostics?.length ?? 0, 0, 'CHRONIST linkage owner contains TypeScript syntax diagnostics.');
assert.match(source, /linkCombatLabTelemetryIntoLiveJournal/);
assert.match(source, /measurementDefinitionFingerprint/);
assert.match(source, /telemetryRecordIds/);
assert.match(source, /source:\s*'metrics'/);
assert.match(source, /mandatoryCore:\s*false/);
assert.match(source, /buildCombatLabProgramJournalLink/);
assert.match(source, /buildCombatLabSeriesMeasurementLink/);
assert.doesNotMatch(source, /HistoryProvider|viewTime|historicalSnapshot|recordedReplay/);
console.log('Combat Lab non-History CHRONIST linkage contract smoke passed.');
