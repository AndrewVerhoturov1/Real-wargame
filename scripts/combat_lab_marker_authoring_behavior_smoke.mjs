import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const [summarySource, managerSource] = await Promise.all([
  readFile('src/combat-lab/scenario-editor/CombatLabMarkerReferenceSummary.ts', 'utf8'),
  readFile('src/combat-lab/scenario-editor/CombatLabMarkerManager.ts', 'utf8'),
]);
const source = `${stripImports(summarySource)}\n${stripImports(managerSource)}`;
const js = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
}).outputText;
const module = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const { buildCombatLabMarkerReferenceSummary, createCombatLabMarkerCascadeResult, CombatLabMarkerEditTransaction } = module;

const experiment = sampleExperiment();
const summary = buildCombatLabMarkerReferenceSummary(experiment, 'marker-a');
assert.equal(summary.references.length, 2);
assert.deepEqual(summary.references.map((item) => item.location), ['action_target', 'action_target']);
assert.match(summary.messageRu, /Дорожка огня/);
assert.match(summary.messageRu, /Дорожка движения/);

const cascade = createCombatLabMarkerCascadeResult(experiment, 'marker-a');
assert.equal(cascade.markers.length, 0);
assert.equal(cascade.tracks[0].steps.length, 0);
assert.equal(cascade.tracks[1].steps.length, 0);
assert.equal(cascade.revision, experiment.revision + 1);

let committed = null;
let preview = null;
const original = experiment.markers[0];
const cancelled = new CombatLabMarkerEditTransaction(original, {
  onPreview: (marker) => { preview = marker; },
  onCommit: (marker) => { committed = marker; },
  onClearPreview: () => { preview = null; },
});
cancelled.preview({ xMetres: 20, yMetres: 30 });
assert.equal(preview.xMetres, 20);
assert.equal(original.xMetres, 10, 'Preview must not mutate canonical marker.');
cancelled.cancel();
assert.equal(committed, null);
assert.equal(preview, null);

const confirmed = new CombatLabMarkerEditTransaction(original, {
  onPreview: (marker) => { preview = marker; },
  onCommit: (marker) => { committed = marker; },
  onClearPreview: () => { preview = null; },
});
confirmed.preview({ xMetres: 25, yMetres: 35 });
confirmed.confirm();
assert.equal(committed.markerId, original.markerId, 'Move keeps stable markerId.');
assert.equal(committed.xMetres, 25);
assert.equal(preview, null);
confirmed.confirm();
assert.equal(committed.xMetres, 25, 'Confirm is idempotent.');

console.log('Combat Lab marker authoring behavior smoke passed.');

function stripImports(value) {
  return value.replace(/^import[\s\S]*?from ['"][^'"]+['"];\n/mg, '');
}

function sampleExperiment() {
  return {
    revision: 7,
    markers: [{ markerId: 'marker-a', kind: 'point', titleRu: 'Точка А', xMetres: 10, yMetres: 12, zMetres: 0 }],
    tracks: [
      { trackId: 'track-fire', titleRu: 'Дорожка огня', actorRoleId: 'shooter', enabled: true, steps: [{ stepId: 'fire-a', titleRu: 'Огонь по точке', startCondition: { kind: 'always' }, completion: { kind: 'shot_resolved' }, repeat: { kind: 'once' }, action: { kind: 'fire', actorRoleId: 'shooter', target: { kind: 'marker', markerId: 'marker-a' } } }] },
      { trackId: 'track-move', titleRu: 'Дорожка движения', actorRoleId: 'target', enabled: true, steps: [{ stepId: 'move-a', titleRu: 'Идти к точке', startCondition: { kind: 'always' }, completion: { kind: 'production_action' }, repeat: { kind: 'once' }, action: { kind: 'move', actorRoleId: 'target', markerId: 'marker-a' } }] },
    ],
    successCondition: { kind: 'always' },
    stopCondition: { kind: 'program_complete', maximumSimulationSeconds: 60 },
  };
}
