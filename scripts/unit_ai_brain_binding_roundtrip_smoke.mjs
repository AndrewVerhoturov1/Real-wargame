import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const [bindingSource, sceneExportSource, catalogSource] = await Promise.all([
  readFile('src/core/units/UnitAiBrainBinding.ts', 'utf8'),
  readFile('src/ui/SceneExport.ts', 'utf8'),
  readFile('src/core/ai/AiGraphCatalog.ts', 'utf8'),
]);
const js = ts.transpileModule(bindingSource, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
}).outputText;
const binding = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);

assert.deepEqual(binding.normalizeUnitAiBrainBinding({ kind: 'manual' }), { schemaVersion: 1, kind: 'manual' });
assert.deepEqual(
  binding.normalizeUnitAiBrainBinding({ kind: 'graph', graphId: 'graph-alpha' }),
  { schemaVersion: 1, kind: 'graph', graphId: 'graph-alpha' },
);
assert.deepEqual(
  binding.normalizeUnitAiBrainBinding(undefined, 'manual'),
  { schemaVersion: 1, kind: 'manual' },
  'Legacy manual control must migrate without enabling a graph.',
);
assert.equal(
  binding.normalizeUnitAiBrainBinding(undefined, 'graph').graphId,
  binding.DEFAULT_UNIT_AI_GRAPH_ID,
  'Legacy graph control must migrate to the explicit bundled graph ID.',
);
assert.throws(
  () => binding.normalizeUnitAiBrainBinding({ kind: 'graph', graphId: '   ' }),
  /граф|graph/i,
  'A graph binding without an exact graphId must be rejected.',
);
const graphBinding = binding.createUnitGraphBrainBinding('graph-alpha');
assert.deepEqual(binding.serializeUnitAiBrainBinding(graphBinding), graphBinding);
assert.equal(Object.isFrozen(graphBinding), true);

assert.match(bindingSource, /interface UnitData[\s\S]*aiBrain\?: UnitAiBrainBindingInputV1/);
assert.match(bindingSource, /interface UnitModel[\s\S]*aiBrain\?: UnitAiBrainBindingV1/);
assert.match(sceneExportSource, /aiBrain:\s*serializeUnitAiBrainBinding\(unit\.aiBrain\)/);
assert.match(sceneExportSource, /writeAiGraphCatalogToScene/);
assert.match(sceneExportSource, /installSceneBrainData/);
assert.match(catalogSource, /export interface AiGraphCatalogV1/);
assert.match(catalogSource, /resolveAiGraphCatalogEntry/);

console.log('Unit AI brain binding roundtrip smoke passed.');