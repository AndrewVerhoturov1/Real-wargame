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
let lastFacing = null;
const previews = [];
const contributor = module.createCombatLabParticipantFacingContributor({
  metersPerCell: 2,
  participantMutations: {
    update: (_roleId, callback) => {
      mutations += 1;
      lastFacing = callback({ initial: { x: 3.5, y: 2.5, facingDegrees: 15 } }).scenePatch.facingDegrees;
      return {};
    },
  },
  preview: { setParticipantFacingPreview: (value) => previews.push(value) },
});
const transaction = contributor.createTransaction({ roleId: 'role-a', x: 3.5, y: 2.5, facingDegrees: 15 });
assert.equal(transaction.mode, 'rotate_participant');
transaction.preview({ xMetres: 9, yMetres: 6 });
assert.equal(mutations, 0);
transaction.pin({ xMetres: 9, yMetres: 6 });
assert.equal(mutations, 0, 'Facing drag must remain a local preview.');
assert.equal(Math.round(transaction.getCandidateDegrees()), 0);
transaction.confirm();
assert.equal(mutations, 1);
assert.equal(Math.round(lastFacing), 0);
assert.equal(previews.at(-1), null);

const cancelled = contributor.createTransaction({ roleId: 'role-a', x: 3.5, y: 2.5, facingDegrees: 15 });
cancelled.pin({ xMetres: 7, yMetres: 10 });
cancelled.cancel();
assert.equal(mutations, 1);
assert.equal(previews.at(-1), null);

console.log('Combat Lab participant facing behavior smoke passed.');