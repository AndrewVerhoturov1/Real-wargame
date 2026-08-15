import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const [runState, controller] = await Promise.all([
  readFile('src/combat-lab/runtime/CombatLabExperimentRunState.ts', 'utf8'),
  readFile('src/combat-lab/runtime/CombatLabExperimentVisualController.ts', 'utf8'),
]);

for (const [source, name] of [[runState, 'run state'], [controller, 'visual controller']]) {
  const result = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
    reportDiagnostics: true,
  });
  assert.equal(result.diagnostics?.length ?? 0, 0, `${name} contains TypeScript syntax diagnostics`);
}

// C1 contract: a visual run has one stable identity and every structured
// journal entry carries a stable event identity within that run.
assert.match(runState, /export interface CombatLabRunIdentityV1/);
assert.match(runState, /readonly runId:\s*string/);
assert.match(runState, /readonly sourceDigest:\s*string/);
assert.match(runState, /export interface CombatLabProgramStepRefV1/);
assert.match(runState, /readonly eventId:\s*string/);
assert.match(runState, /readonly programStepRef:\s*CombatLabProgramStepRefV1 \| null/);
assert.match(runState, /readonly runIdentity:\s*CombatLabRunIdentityV1/);
assert.match(runState, /eventId:\s*`\$\{this\.runIdentity\.runId\}:event:\$\{this\.sequence\}`/);

// A reset creates a new run identity from the exact prepared experiment and
// seed, then gives that identity to the bounded structured journal.
assert.match(controller, /createCombatLabRunIdentity/);
assert.match(controller, /this\.runIdentity\s*=\s*createCombatLabRunIdentity/);
assert.match(controller, /new CombatLabExperimentRunJournal\(this\.runIdentity\)/);

// History is deliberately a separate executor. C1 must not add viewTime or
// a history store as an implementation shortcut.
assert.doesNotMatch(runState + controller, /HistoryProvider|viewTime|historicalSnapshot|historyStore/);
assert.match(runState, /COMBAT_LAB_EXPERIMENT_JOURNAL_LIMIT = 256/);

console.log('Combat Lab LIVE journal run/event identity smoke passed.');
