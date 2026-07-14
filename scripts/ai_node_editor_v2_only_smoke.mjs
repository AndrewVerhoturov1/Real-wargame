import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const main = readFileSync('src/ai-node-editor/main.ts', 'utf8');
const clickGuard = readFileSync('src/ai-node-editor/editor-click-guard.ts', 'utf8');
const bundled = JSON.parse(readFileSync('src/data/ai/soldier_default_survival_graph.json', 'utf8'));

assert.equal(bundled.version, 2, 'Bundled AI editor graph must be Graph v2.');
assert.ok(Array.isArray(bundled.blackboardSchema), 'Bundled Graph v2 must include blackboardSchema.');
assert.ok(Array.isArray(bundled.subgraphRefs), 'Bundled Graph v2 must include subgraphRefs.');

for (const forbidden of [
  'graph-v1-warning',
  'migrate-graph',
  'migrateGraphFromUi',
  'Graph v1 успешно обновлён',
  "raw.version===2?2:1",
  "raw.version === 2 ? 2 : 1",
]) {
  assert.equal(main.includes(forbidden), false, `AI editor must not expose or retain Graph v1 mode: ${forbidden}`);
}

assert.ok(main.includes('migrateAiGraphToV2'), 'Legacy stored/imported data should still be converted automatically at the load boundary.');
assert.ok(main.includes('version: 2'), 'The editor graph model must always normalize to version 2.');
assert.ok(clickGuard.includes("'.ai-debug-panel-dock'"), 'Document click guard must not rerender the editor when diagnostics summaries are clicked.');

console.log('AI node editor Graph v2-only smoke passed: Graph v1 UI is absent, legacy input is converted at the boundary, and diagnostics controls remain interactive.');
