import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const [typesSource, controllerSource] = await Promise.all([
  readFile('src/combat-lab/selection/CombatLabSelectionTypes.ts', 'utf8'),
  readFile('src/combat-lab/selection/CombatLabSelectionController.ts', 'utf8'),
]);

const source = `
const selectUnit = (state, unitId) => {
  state.selectedUnitId = unitId;
  state.selectedUnitIds = unitId ? [unitId] : [];
};
${stripImports(typesSource)}
${stripImports(controllerSource)}
`;
const js = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
}).outputText;
const module = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const { CombatLabSelectionController } = module;

const state = { selectedUnitId: null, selectedUnitIds: [] };
const participants = new Map([
  ['unit-a', { kind: 'participant', roleId: 'role-a', unitId: 'unit-a' }],
  ['unit-b', { kind: 'participant', roleId: 'role-b', unitId: 'unit-b' }],
]);
const controller = CombatLabSelectionController.create({
  state,
  resolveParticipantByUnitId: (unitId) => participants.get(unitId) ?? null,
});

assert.deepEqual(controller.get(), { kind: 'none' });
const published = [];
const unsubscribe = controller.subscribe((selection) => published.push(selection));

const participantA = { kind: 'participant', roleId: 'role-a', unitId: 'unit-a' };
const publishFromMap = () => controller.select(participantA);
const publishFromRoleList = () => controller.select(participantA);
const publishFromProgramStep = () => controller.select({ kind: 'participant', roleId: 'role-b', unitId: 'unit-b' });

publishFromMap();
assert.equal(state.selectedUnitId, 'unit-a');
assert.deepEqual(state.selectedUnitIds, ['unit-a']);
assert.deepEqual(published, [participantA]);

publishFromRoleList();
assert.equal(published.length, 1, 'Equal selection must not be published twice.');

publishFromProgramStep();
assert.equal(state.selectedUnitId, 'unit-b');
assert.deepEqual(controller.get(), { kind: 'participant', roleId: 'role-b', unitId: 'unit-b' });
assert.equal(published.length, 2);

state.selectedUnitId = 'unit-a';
state.selectedUnitIds = ['unit-a'];
controller.syncFromState();
assert.deepEqual(controller.get(), participantA, 'Production map selection must enter the same controller.');
assert.equal(published.length, 3);

controller.select({ kind: 'marker', markerId: 'marker-1' });
assert.equal(state.selectedUnitId, null, 'Non-participant selection must clear production unit selection.');
assert.deepEqual(state.selectedUnitIds, []);

unsubscribe();
controller.select({ kind: 'scene' });
assert.equal(published.length, 4, 'Unsubscribed listener must not receive later changes.');
controller.destroy();
controller.select({ kind: 'none' });
assert.deepEqual(controller.get(), { kind: 'scene' }, 'Destroyed controller must ignore writes.');

console.log('Combat Lab selection controller behavior smoke passed.');

function stripImports(value) {
  return value.replace(/^import[\s\S]*?from ['"][^'"]+['"];\n/mg, '');
}
