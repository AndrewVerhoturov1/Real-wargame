import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = stripImports(await readFile('src/combat-lab/scenario-editor/CombatLabTrackDialog.ts', 'utf8'));
const js = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
}).outputText;
const module = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const { validateCombatLabTrackCreation, resolveCombatLabTrackInsertionIndex } = module;

const experiment = {
  roles: [
    { roleId: 'shooter', titleRu: 'Стрелок' },
    { roleId: 'target', titleRu: 'Цель' },
    { roleId: 'reserve', titleRu: 'Резерв' },
  ],
  tracks: [
    { trackId: 'track-a', actorRoleId: 'shooter', titleRu: 'Огонь' },
    { trackId: 'track-b', actorRoleId: 'target', titleRu: 'Манёвр' },
  ],
};

assert.deepEqual(validateCombatLabTrackCreation(experiment, {
  titleRu: '', actorRoleId: '', insertion: 'end', selectedTrackId: null,
}), { ok: false, reasonRu: 'Выберите исполнителя дорожки.' });
assert.deepEqual(validateCombatLabTrackCreation(experiment, {
  titleRu: 'Вторая дорожка', actorRoleId: 'shooter', insertion: 'end', selectedTrackId: null,
}), { ok: false, reasonRu: 'Для этого бойца дорожка уже существует.' });
assert.deepEqual(validateCombatLabTrackCreation(experiment, {
  titleRu: '  ', actorRoleId: 'reserve', insertion: 'end', selectedTrackId: null,
}), { ok: false, reasonRu: 'Введите понятное название дорожки.' });
assert.equal(resolveCombatLabTrackInsertionIndex(experiment.tracks, 'before_selected', 'track-b'), 1);
assert.equal(resolveCombatLabTrackInsertionIndex(experiment.tracks, 'after_selected', 'track-a'), 1);
assert.equal(resolveCombatLabTrackInsertionIndex(experiment.tracks, 'end', 'track-a'), 2);

const dialogSource = await readFile('src/combat-lab/scenario-editor/CombatLabTrackDialog.ts', 'utf8');
assert.match(dialogSource, /showModal\(\)/);
assert.match(dialogSource, /Отмена/);
assert.match(dialogSource, /Сохранить/);
assert.match(dialogSource, /returnFocusTo\?\.focus/);
assert.match(dialogSource, /selectedActorRoleId/);

console.log('Combat Lab track dialog behavior smoke passed.');

function stripImports(value) {
  return value.replace(/^import[\s\S]*?from ['"][^'"]+['"];\n/mg, '');
}
