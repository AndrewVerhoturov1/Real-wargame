import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';

const names = [
  'CombatLabExperimentRunner',
  'CombatLabBatchContracts',
  'CombatLabBatchRunner',
  'CombatLabBatchStatistics',
  'CombatLabRepresentativeRuns',
];
for (const name of names) {
  await access(`src/core/testing/combat-lab/experiment/${name}.ts`);
  await assert.rejects(access(`src/core/testing/combat-lab/${name}.ts`));
}
const [
  worker,
  client,
  panel,
  setup,
  progress,
  diagnostics,
  results,
  distribution,
] = await Promise.all([
  readFile('src/combat-lab/workers/combat-lab-batch.worker.ts', 'utf8'),
  readFile('src/combat-lab/runtime/CombatLabBatchClient.ts', 'utf8'),
  readFile('src/combat-lab/ui/CombatLabBatchPanel.ts', 'utf8'),
  readFile('src/combat-lab/ui/CombatLabBatchSetupView.ts', 'utf8'),
  readFile('src/combat-lab/ui/CombatLabBatchProgressView.ts', 'utf8'),
  readFile('src/combat-lab/ui/CombatLabBatchDiagnosticsView.ts', 'utf8'),
  readFile('src/combat-lab/ui/CombatLabBatchResultsView.ts', 'utf8'),
  readFile('src/combat-lab/ui/CombatLabMetricDistributionView.ts', 'utf8'),
]);
for (const source of [worker, client]) {
  assert.match(source, /core\/testing\/combat-lab\/experiment\/CombatLabBatchContracts/);
  assert.match(source, /core\/testing\/combat-lab\/experiment\/CombatLabBatchRunner/);
}
for (const source of [panel, setup, progress, diagnostics, results, distribution]) {
  assert.match(
    source,
    /core\/testing\/combat-lab(?:\/experiment\/CombatLabBatchContracts)?/,
    'Batch UI must use the public Combat Lab entry point or the canonical experiment contract file.',
  );
  assert.doesNotMatch(
    source,
    /core\/testing\/combat-lab\/CombatLabBatchContracts/,
    'The removed duplicate root-level batch contract path must not return.',
  );
}
console.log('Combat Lab batch path contract smoke passed.');
