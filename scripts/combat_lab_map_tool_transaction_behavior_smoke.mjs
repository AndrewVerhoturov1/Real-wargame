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
  dispatchKey(key) {
    const effects = { prevented: 0, stopped: 0 };
    this.dispatch({
      key,
      preventDefault: () => { effects.prevented += 1; },
      stopImmediatePropagation: () => { effects.stopped += 1; },
    });
    return effects;
  }
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
let mismatchCancels = 0;
const contributor = {
  mode: 'place_participant',
  createTransaction: (request) => request.mismatched
    ? {
        mode: 'move_marker',
        preview: () => undefined,
        confirm: () => undefined,
        cancel: () => {
          mismatchCancels += 1;
          throw new Error('Intentional mismatched transaction cleanup failure.');
        },
      }
    : {
        mode: 'place_participant',
        preview: () => { previews += 1; },
        confirm: () => { confirms += 1; canonicalMutations += 1; },
        cancel: () => { cancels += 1; },
      },
};
const unregister = coordinator.registerContributor(contributor);

coordinator.begin('place_participant', { roleId: 'role-a' });
coordinator.preview({ xMetres: 12, yMetres: 8 });
assert.equal(previews, 1);
assert.equal(canonicalMutations, 0, 'Preview must not mutate the canonical draft.');
assert.equal(coordinator.getMode(), 'place_participant');
assert.match(status.textContent, /Esc/);

assert.deepEqual(events.dispatchKey('Escape'), { prevented: 1, stopped: 1 });
assert.equal(cancels, 1, 'Escape must cancel the active temporary transaction.');
assert.equal(canonicalMutations, 0);
assert.equal(coordinator.getMode(), 'program_authoring');

coordinator.begin('place_participant', { roleId: 'role-a' });
coordinator.preview({ xMetres: 20, yMetres: 10 });
assert.deepEqual(events.dispatchKey('Enter'), { prevented: 1, stopped: 1 });
assert.equal(confirms, 1, 'Enter must confirm the active temporary transaction once.');
assert.equal(canonicalMutations, 1);
assert.equal(coordinator.getMode(), 'program_authoring');
assert.deepEqual(events.dispatchKey('Enter'), { prevented: 0, stopped: 0 });
assert.equal(confirms, 1, 'Repeated Enter after completion must do nothing.');
assert.deepEqual(events.dispatchKey('Escape'), { prevented: 0, stopped: 0 });
assert.equal(cancels, 1, 'Escape after completion must do nothing.');

assert.throws(
  () => coordinator.begin('place_participant', { mismatched: true }),
  'A contributor returning another mode must still fail the begin contract.',
);
assert.equal(mismatchCancels, 1, 'Mismatched transaction must be cancelled before the error escapes.');
assert.equal(coordinator.getMode(), 'program_authoring', 'Failed mismatched begin must stay in persistent mode.');
coordinator.begin('place_participant', { roleId: 'role-a-after-mismatch' });
coordinator.confirm();
assert.equal(confirms, 2, 'Contributor must remain registered after a mismatched transaction.');
assert.equal(canonicalMutations, 2);
coordinator.confirm();
assert.equal(confirms, 2, 'One transaction may confirm at most once.');

coordinator.setPersistentMode('manual_control');
coordinator.setPersistentMode('manual_control');
assert.equal(canonicalMutations, 2, 'Persistent mode switching must not commit the draft.');
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
