import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

class FakeEventTarget {
  #listeners = new Map();
  addEventListener(type, listener) { const set = this.#listeners.get(type) ?? new Set(); set.add(listener); this.#listeners.set(type, set); }
  removeEventListener(type, listener) { this.#listeners.get(type)?.delete(listener); }
  listenerCount(type) { return this.#listeners.get(type)?.size ?? 0; }
}

const paths = [
  'src/combat-lab/selection/CombatLabSelectionTypes.ts',
  'src/combat-lab/selection/CombatLabSelectionController.ts',
  'src/combat-lab/map-tools/CombatLabMapToolTypes.ts',
  'src/combat-lab/map-tools/CombatLabMapToolCoordinator.ts',
  'src/combat-lab/editor/CombatLabParticipantEditContext.ts',
  'src/combat-lab/editor/CombatLabParticipantMutationPort.ts',
  'src/combat-lab/CombatLabWorkspaceServices.ts',
];
const sources = await Promise.all(paths.map((path) => readFile(path, 'utf8')));
const source = `
const selectUnit = (state, unitId) => { state.selectedUnitId = unitId; state.selectedUnitIds = unitId ? [unitId] : []; };
const readCombatLabParticipantInitialDraft = (experiment, roleId) => {
  const role = experiment.roles.find((candidate) => candidate.roleId === roleId);
  return { roleId, unitId: role.unitId, titleRu: role.titleRu, unit: experiment.sceneSnapshot.units.find((unit) => unit.id === role.unitId) };
};
const updateCombatLabParticipantInitialState = (experiment, roleId, patch) => {
  const role = experiment.roles.find((candidate) => candidate.roleId === roleId);
  return {
    ...experiment,
    revision: experiment.revision + 1,
    sceneSnapshot: { ...experiment.sceneSnapshot, units: experiment.sceneSnapshot.units.map((unit) => unit.id === role.unitId ? { ...unit, x: patch.x ?? unit.x } : unit) },
  };
};
${sources.map(stripImports).join('\n')}
`;
const js = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
}).outputText;
const module = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const { CombatLabWorkspaceServices, registerCombatLabWorkspaceServices, getCombatLabWorkspaceServices } = module;

let experiment = {
  revision: 1,
  roles: [{ roleId: 'role-a', unitId: 'unit-a', titleRu: 'Альфа', parameters: { schemaVersion: 1, accuracy: null } }],
  sceneSnapshot: { units: [{ id: 'unit-a', x: 1 }] },
};
const state = { selectedUnitId: null, selectedUnitIds: [], units: [{ id: 'unit-a' }] };
const draft = {
  getExperiment: () => experiment,
  replaceExperiment: (next) => { experiment = next; },
};
const events = new FakeEventTarget();
const status = { textContent: '', dataset: {} };
const publishedDrafts = [];
const services = CombatLabWorkspaceServices.create({
  state,
  draft,
  mapToolEventTarget: events,
  mapToolStatusHost: status,
  onExperimentChanged: (next) => publishedDrafts.push(next),
});

const workspaceRoot = {};
const unregisterWorkspace = registerCombatLabWorkspaceServices(workspaceRoot, services);
assert.equal(getCombatLabWorkspaceServices(workspaceRoot), services, 'Consumers must resolve the same registered services object.');

const sceneConsumer = services.selection;
const programConsumer = services.selection;
const parameterConsumer = services.participantMutations;
assert.equal(sceneConsumer, programConsumer, 'All panels must share one selection controller instance.');
assert.equal(parameterConsumer, services.participantMutations, 'All participant editors must share one mutation port instance.');
assert.equal(services.mapTools, services.mapTools, 'All map contributors must share one coordinator instance.');

let draftEvents = 0;
const removeDraftSubscription = services.draft.subscribe(() => { draftEvents += 1; });
services.selection.select({ kind: 'participant', roleId: 'role-a', unitId: 'unit-a' });
services.participantMutations.update('role-a', () => ({ scenePatch: { x: 4 } }));
assert.equal(experiment.sceneSnapshot.units[0].x, 4);
assert.equal(publishedDrafts.length, 1);
assert.equal(draftEvents, 1, 'Participant mutation must publish through the shared draft service once.');

services.draft.replace({ ...experiment, revision: 3 }, 'external');
assert.equal(draftEvents, 2);
removeDraftSubscription();
services.draft.replace({ ...experiment, revision: 4 }, 'external');
assert.equal(draftEvents, 2, 'Draft listener must be safely removable.');

services.mapTools.registerContributor({
  mode: 'move_marker',
  createTransaction: () => ({ mode: 'move_marker', preview() {}, confirm() {}, cancel() {} }),
});
services.mapTools.begin('move_marker', { markerId: 'marker-1' });
unregisterWorkspace();
assert.throws(() => getCombatLabWorkspaceServices(workspaceRoot), /ещё не подключены/);
services.destroy();
assert.equal(events.listenerCount('keydown'), 0, 'Destroy must release coordinator listeners.');
assert.equal(services.destroyed, true);

console.log('Combat Lab workspace services behavior smoke passed.');

function stripImports(value) {
  return value.replace(/^import[\s\S]*?from ['"][^'"]+['"];\n/mg, '');
}
