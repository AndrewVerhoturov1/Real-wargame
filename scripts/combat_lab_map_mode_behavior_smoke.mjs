import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const modeSource = await readFile('src/combat-lab/scenario-editor/CombatLabProgramMapMode.ts', 'utf8');
const source = stripImports(modeSource);
const js = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
}).outputText;
const module = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const { CombatLabProgramMapMode } = module;

const calls = [];
const listeners = new Set();
const coordinator = {
  current: 'program_authoring',
  getPersistentMode() { return this.current; },
  setPersistentMode(mode) { this.current = mode; calls.push(mode); for (const listener of listeners) listener(mode); },
  subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
};
const mode = new CombatLabProgramMapMode(coordinator);
const published = [];
const unsubscribe = mode.subscribe((value) => published.push(value));

mode.set('manual_control');
assert.equal(mode.get(), 'manual_control');
assert.deepEqual(calls, ['manual_control']);
mode.set('manual_control');
assert.deepEqual(calls, ['manual_control'], 'Equal mode must not be written twice.');
mode.set('program_authoring');
assert.equal(mode.get(), 'program_authoring');
assert.deepEqual(published, ['manual_control', 'program_authoring']);

unsubscribe();
mode.destroy();
assert.equal(listeners.size, 0, 'Destroy must release the coordinator subscription.');

const [panel, controller] = await Promise.all([
  readFile('src/combat-lab/scenario-editor/CombatLabScenarioEditorPanel.ts', 'utf8'),
  readFile('src/combat-lab/scenario-editor/CombatLabMapAuthoringController.ts', 'utf8'),
]);
assert.doesNotMatch(panel, /sharedMapInputOwnership/);
assert.match(panel, /aria-pressed/);
assert.match(controller, /program_authoring/);
assert.match(`${modeSource}\n${panel}`, /manual_control/);
assert.match(controller, /stopImmediatePropagation/);

console.log('Combat Lab map mode behavior smoke passed.');

function stripImports(value) {
  return value.replace(/^import[\s\S]*?from ['"][^'"]+['"];\n/mg, '');
}
