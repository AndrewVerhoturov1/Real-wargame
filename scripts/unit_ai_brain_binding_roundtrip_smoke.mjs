import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const [bindingSource, unitSource, snapshotSource] = await Promise.all([
  readFile('src/core/units/UnitAiBrainBinding.ts', 'utf8'),
  readFile('src/core/units/UnitModel.ts', 'utf8'),
  readFile('src/core/simulation/SceneSnapshot.ts', 'utf8'),
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

assert.match(unitSource, /aiBrain\??:\s*UnitAiBrainBindingV1/);
assert.match(unitSource, /aiBrain:\s*UnitAiBrainBindingV1/);
assert.match(unitSource, /normalizeUnitAiBrainBinding/);
assert.match(snapshotSource, /aiBrain:\s*serializeUnitAiBrainBinding\(unit\.aiBrain\)/);
assert.match(snapshotSource, /aiGraphCatalog/);

console.log('Unit AI brain binding roundtrip smoke passed.');