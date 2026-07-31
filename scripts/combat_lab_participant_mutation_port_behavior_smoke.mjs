import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const [contextSource, portSource] = await Promise.all([
  readFile('src/combat-lab/editor/CombatLabParticipantEditContext.ts', 'utf8'),
  readFile('src/combat-lab/editor/CombatLabParticipantMutationPort.ts', 'utf8'),
]);
const source = `${stripImports(contextSource)}\n${stripImports(portSource)}`;
const js = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
}).outputText;
const module = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const { CombatLabParticipantMutationPort } = module;

const unitA = { id: 'unit-a', labels: { ru: 'Альфа' }, position: { x: 1, y: 1 } };
const unitB = { id: 'unit-b', labels: { ru: 'Браво' }, position: { x: 2, y: 2 } };
const initial = {
  revision: 7,
  roles: [
    { roleId: 'role-a', unitId: 'unit-a', titleRu: 'Альфа', parameters: { schemaVersion: 1, accuracy: null } },
    { roleId: 'role-b', unitId: 'unit-b', titleRu: 'Браво', parameters: { schemaVersion: 1, accuracy: null } },
  ],
  sceneSnapshot: { map: { width: 20, height: 20 }, units: [unitA, unitB] },
};
let current = initial;
let reads = 0;
let updates = 0;
let publications = 0;
const state = { units: [unitA, unitB] };
const draft = {
  getExperiment: () => current,
  replaceExperiment: (next) => { current = next; },
};
const port = CombatLabParticipantMutationPort.create({
  state,
  draft,
  onExperimentChanged: () => { publications += 1; },
  readParticipant: (experiment, roleId) => {
    reads += 1;
    const role = experiment.roles.find((candidate) => candidate.roleId === roleId);
    const unit = experiment.sceneSnapshot.units.find((candidate) => candidate.id === role.unitId);
    return { roleId, unitId: role.unitId, titleRu: role.titleRu, unit };
  },
  updateParticipant: (experiment, roleId, patch) => {
    updates += 1;
    const role = experiment.roles.find((candidate) => candidate.roleId === roleId);
    const units = experiment.sceneSnapshot.units.map((unit) => unit.id === role.unitId
      ? { ...unit, labels: { ...unit.labels, ru: patch.titleRu ?? unit.labels.ru }, position: { x: patch.x ?? unit.position.x, y: patch.y ?? unit.position.y } }
      : unit);
    return { ...experiment, revision: experiment.revision + 1, sceneSnapshot: { ...experiment.sceneSnapshot, units } };
  },
});

const context = port.get('role-a');
assert.equal(context.role.roleId, 'role-a');
assert.equal(context.unit.id, 'unit-a');
assert.equal(reads, 1, 'Bounded get must read one participant only.');
assert.equal(Object.isFrozen(context), true);

const beforeOtherUnit = current.sceneSnapshot.units[1];
const next = port.update('role-a', () => ({ scenePatch: { titleRu: 'Альфа-2', x: 5 } }));
assert.equal(updates, 1);
assert.equal(publications, 1);
assert.equal(next.revision, 8, 'One participant edit must create one revision.');
assert.equal(next.roles[0].titleRu, 'Альфа-2', 'Title must stay synchronized between role and scene unit.');
assert.equal(next.sceneSnapshot.units[0].position.x, 5);
assert.equal(next.sceneSnapshot.units[1], beforeOtherUnit, 'Unrelated participant record must be structurally preserved.');
assert.equal(next.sceneSnapshot.map, initial.sceneSnapshot.map, 'Participant edit must not rebuild the map.');

const unchanged = port.update('role-a', () => undefined);
assert.equal(unchanged, next);
assert.equal(updates, 1);
assert.equal(publications, 1);
assert.equal('restoreScene' in port, false, 'UI mutation port must not expose full-scene restore.');
assert.equal('buildScene' in port, false, 'UI mutation port must not expose full-scene build.');

console.log('Combat Lab participant mutation port behavior smoke passed.');

function stripImports(value) {
  return value.replace(/^import[\s\S]*?from ['"][^'"]+['"];\n/mg, '');
}
