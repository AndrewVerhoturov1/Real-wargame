import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const [scene, roles, files, store] = await Promise.all([
  readFile('src/combat-lab/scenario-editor/CombatLabScenePanel.ts', 'utf8'),
  readFile('src/combat-lab/scenario-editor/CombatLabRoleEditor.ts', 'utf8'),
  readFile('src/combat-lab/scenario-editor/CombatLabExperimentFileActions.ts', 'utf8'),
  readFile('src/combat-lab/scenario-editor/CombatLabExperimentLocalStore.ts', 'utf8'),
]);

assert.match(scene, /captureCombatLabInitialScene/);
assert.match(scene, /buildExportedScene\(state\)/);
assert.match(scene, /revision:\s*current\.revision \+ 1/);
assert.match(roles, /roleId:\s*existing\?\.roleId \?\? id/);
assert.match(roles, /roleId\.disabled = existing !== null/);
assert.match(files, /\.combat-lab\.json/);
assert.match(files, /errors\.length > 0 \? null : result\.experiment/);
assert.match(files, /Текущий эксперимент сохранён/);
assert.match(store, /MAX_RECENT_EXPERIMENTS = 10/);
assert.match(store, /real-wargame\.combat-lab\.experiment\.v1/);
assert.match(store, /compareOldestFirst/);
assert.match(store, /catch/);

class MemoryStorage {
  #values = new Map();
  get length() { return this.#values.size; }
  clear() { this.#values.clear(); }
  getItem(key) { return this.#values.get(key) ?? null; }
  key(index) { return [...this.#values.keys()][index] ?? null; }
  removeItem(key) { this.#values.delete(key); }
  setItem(key, value) { this.#values.set(key, String(value)); }
}

class ThrowingStorage extends MemoryStorage {
  setItem() { throw new Error('quota'); }
}

const source = stripImports(store);
const js = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
}).outputText;
const { CombatLabExperimentLocalStore } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const storage = new MemoryStorage();
let second = 0;
const codec = {
  serialize: (experiment) => JSON.stringify(experiment),
  parse: (json) => ({ experiment: JSON.parse(json), issues: [] }),
};
const local = new CombatLabExperimentLocalStore(codec, storage, () => new Date(`2026-07-29T12:00:${String(second++).padStart(2, '0')}Z`));
for (let index = 0; index < 12; index += 1) {
  const result = local.save({ experimentId: `exp-${index}`, titleRu: `Опыт ${index}`, revision: index });
  assert.equal(result.ok, true);
}
const listed = local.list();
assert.equal(listed.value.length, 10);
assert.equal(local.load('exp-0').ok, false, 'Oldest entry must be evicted.');
assert.equal(local.load('exp-11').ok, true);
const broken = new CombatLabExperimentLocalStore(codec, new ThrowingStorage());
assert.equal(broken.save({ experimentId: 'broken', titleRu: 'Сбой', revision: 1 }).ok, false);

console.log('Combat Lab scene authoring UI contract smoke passed.');

function stripImports(value) {
  return value.replace(/^import[\s\S]*?from ['"][^'"]+['"];\n/mg, '');
}
