import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile('src/combat-lab/runtime/CombatLabLiveJournal.ts', 'utf8').catch(() => '');
assert.ok(source.length > 0, 'LIVE Journal owner is missing.');
const result = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
  reportDiagnostics: true,
});
assert.equal(result.diagnostics?.length ?? 0, 0, 'LIVE Journal owner contains TypeScript syntax diagnostics.');
assert.match(source, /type CombatLabJournalTierV1 = 'T1' \| 'T2' \| 'T3'/);
assert.match(source, /source:\s*'core' \| 'metrics'/);
assert.match(source, /interface CombatLabLiveJournalEventV1/);
assert.match(source, /programStepRef/);
assert.match(source, /entityRefs/);
assert.match(source, /collectCombatLabLiveJournalEvents/);
assert.match(source, /committedShots/);
assert.match(source, /impacts/);
assert.match(source, /filterCombatLabLiveJournalEvents/);
assert.match(source, /searchText/);
assert.match(source, /participantUnitId/);
assert.match(source, /programStepRef/);
assert.doesNotMatch(source, /HistoryProvider|viewTime|historicalSnapshot|window\.|localStorage/);
console.log('Combat Lab full LIVE Journal scope contract smoke passed.');
