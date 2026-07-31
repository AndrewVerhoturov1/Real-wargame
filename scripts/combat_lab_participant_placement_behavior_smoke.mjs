import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile('src/combat-lab/editor/CombatLabParticipantMapTools.ts', 'utf8');
const runnable = source.replace(/^import[\s\S]*?from ['"][^'"]+['"];\n/mg, '');
const js = ts.transpileModule(runnable, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
}).outputText;
const module = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);

let mutations = 0;
let lastPatch = null;
const previews = [];
const contributor = module.createCombatLabParticipantPlacementContributor({
  metersPerCell: 2,
  participantMutations: {
    update: (_roleId, callback) => {
      mutations += 1;
      lastPatch = callback({ initial: { x: 1, y: 2 } }).scenePatch;
      return {};
    },
  },
  preview: { setParticipantPlacementPreview: (value) => previews.push(value) },
});
const transaction = contributor.createTransaction({ roleId: 'role-a', initialX: 1, initialY: 2 });
assert.equal(transaction.mode, 'place_participant');
transaction.preview({ xMetres: 8, yMetres: 6 });
assert.equal(mutations, 0, 'Preview must not mutate the experiment.');
transaction.pin({ xMetres: 8, yMetres: 6 });
assert.equal(mutations, 0, 'Pinning a candidate must remain local.');
assert.deepEqual(transaction.getCandidate(), { x: 3.5, y: 2.5 });
transaction.confirm();
assert.equal(mutations, 1, 'Confirm must publish one participant mutation.');
assert.deepEqual(lastPatch, { x: 3.5, y: 2.5 });
assert.equal(previews.at(-1), null, 'Confirmation must clear renderer preview.');

const cancelled = contributor.createTransaction({ roleId: 'role-a', initialX: 1, initialY: 2 });
cancelled.pin({ xMetres: 4, yMetres: 4 });
cancelled.cancel();
assert.equal(mutations, 1, 'Cancel must not publish a mutation.');
assert.equal(previews.at(-1), null);

console.log('Combat Lab participant placement behavior smoke passed.');