import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile('src/core/testing/combat-lab/metrics/CombatLabMetricsReport.ts', 'utf8').catch(() => '');
assert.ok(source.length > 0, 'Metrics report owner is missing.');
const result = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
  reportDiagnostics: true,
});
assert.equal(result.diagnostics?.length ?? 0, 0, 'Metrics report owner contains TypeScript syntax diagnostics.');

for (const block of ['summary', 'change_over_time', 'distribution', 'comparison', 'relation', 'timeline', 'data_table', 'event_chain']) {
  assert.match(source, new RegExp(`['\"]${block}['\"]`));
}
assert.match(source, /runCombatLabMetricsReportBlock/);
assert.match(source, /exportCombatLabMetricsLlmJson/);
assert.match(source, /exportCombatLabTelemetryJsonl/);
assert.match(source, /exportCombatLabMetricsCsv/);
assert.match(source, /measurementDefinitionIds/);
assert.match(source, /fromSeconds/);
assert.match(source, /toSeconds/);
assert.match(source, /recordIds/);
assert.doesNotMatch(source, /HistoryProvider|viewTime|window\.|localStorage|Math\.random/);
console.log('Combat Lab Metrics report/export contract smoke passed.');
