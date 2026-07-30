import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

class FakeEventTarget {
  #listeners = new Map();
  addEventListener(type, listener) {
    const listeners = this.#listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.#listeners.set(type, listeners);
  }
  removeEventListener(type, listener) { this.#listeners.get(type)?.delete(listener); }
  dispatch(event) { for (const listener of this.#listeners.get('keydown') ?? []) listener(event); }
  listenerCount(type) { return this.#listeners.get(type)?.size ?? 0; }
}

const [typesSource, coordinatorSource] = await Promise.all([
  readFile('src/combat-lab/map-tools/CombatLabMapToolTypes.ts', 'utf8'),
  readFile('src/combat-lab/map-tools/CombatLabMapToolCoordinator.ts', 'utf8'),
]);
const source = `${stripImports(typesSource)}\n${stripImports(coordinatorSource)}`;
const js = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
}).outputText;
const module = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const { CombatLabMapToolCoordinator } = module;

const events = new FakeEventTarget();
const status = { textContent: '', dataset: {} };
const coordinator = CombatLabMapToolCoordinator.create({
  initialPersistentMode: 'program_authoring',
  eventTarget: events,
  statusHost: status,
});
const modes = [];
coordinator.subscribe((mode) => modes.push(mode));

let canonicalMutations = 0;
let previews = 0;
let confirms = 0;
let cancels = 0;
const contributor = {
  mode: 'place_participant',
  createTransaction: () => ({
    mode: 'place_participant',
    preview: () => { previews += 1; },
    confirm: () => { confirms += 1; canonicalMutations += 1; },
    cancel: () => { cancels += 1; },
  }),
};
const unregister = coordinator.registerContributor(contributor);

coordinator.begin('place_participant', { roleId: 'role-a' });
coordinator.preview({ xMetres: 12, yMetres: 8 });
assert.equal(previews, 1);
assert.equal(canonicalMutations, 0, 'Preview must not mutate the canonical draft.');
assert.equal(coordinator.getMode(), 'place_participant');
assert.match(status.textContent, /Esc/);

events.dispatch({ key: 'Escape', preventDefault() {}, stopImmediatePropagation() {} });
assert.equal(cancels, 1, 'Escape must cancel the active temporary transaction.');
assert.equal(canonicalMutations, 0);
assert.equal(coordinator.getMode(), 'program_authoring');

coordinator.begin('place_participant', { roleId: 'role-a' });
coordinator.preview({ xMetres: 20, yMetres: 10 });
coordinator.confirm();
coordinator.confirm();
assert.equal(confirms, 1, 'One transaction may confirm at most once.');
assert.equal(canonicalMutations, 1, 'Confirm must produce at most one canonical mutation.');

coordinator.setPersistentMode('manual_control');
coordinator.setPersistentMode('manual_control');
assert.equal(canonicalMutations, 1, 'Persistent mode switching must not commit the draft.');
assert.equal(coordinator.getMode(), 'manual_control');
assert.equal(modes.filter((mode) => mode === 'manual_control').length, 1, 'Equal persistent mode must not republish.');

coordinator.begin('place_participant', { roleId: 'role-a' });
coordinator.destroy();
assert.equal(cancels, 2, 'Destroy must cancel an active temporary transaction.');
assert.equal(events.listenerCount('keydown'), 0, 'Destroy must release key listeners.');
unregister();

console.log('Combat Lab map tool transaction behavior smoke passed.');

function stripImports(value) {
  return value.replace(/^import[\s\S]*?from ['"][^'"]+['"];\n/mg, '');
}
