import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = stripImports(await readFile('src/combat-lab/scenario-editor/CombatLabStepDialog.ts', 'utf8'));
const js = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
}).outputText;
const module = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const { CombatLabStepEditSession, validateCombatLabStepDraft } = module;

const original = sampleStep();
let saves = 0;
let saved = null;
const cancelled = new CombatLabStepEditSession(original, (step) => { saves += 1; saved = step; });
cancelled.patch({ titleRu: 'Новое название', timeoutSeconds: 45 });
cancelled.cancel();
assert.equal(saves, 0, 'Cancel must not mutate the canonical draft.');
assert.equal(original.titleRu, 'Одиночный выстрел');

const session = new CombatLabStepEditSession(original, (step) => { saves += 1; saved = step; });
session.patch({ titleRu: 'Прицельный выстрел', timeoutSeconds: 30 });
assert.deepEqual(validateCombatLabStepDraft(session.getDraft(), sampleExperiment()), { ok: true, reasonRu: null });
session.save();
assert.equal(saves, 1, 'Save must publish exactly one mutation.');
assert.equal(saved.titleRu, 'Прицельный выстрел');
session.save();
assert.equal(saves, 1, 'Repeated Save after completion must do nothing.');

const invalid = { ...original, timeoutSeconds: 0 };
assert.deepEqual(validateCombatLabStepDraft(invalid, sampleExperiment()), {
  ok: false,
  reasonRu: 'Предельное время шага должно быть больше нуля.',
});

const dialog = await readFile('src/combat-lab/scenario-editor/CombatLabStepDialog.ts', 'utf8');
for (const label of ['Исполнитель', 'Цель', 'Условие начала', 'Условие завершения', 'Повтор и предельное время', 'При ошибке', 'Дополнительно']) {
  assert.match(dialog, new RegExp(label));
}
assert.match(dialog, /CombatLabActionEditor/);
assert.match(dialog, /CombatLabConditionEditor/);
assert.match(dialog, /CombatLabRepeatEditor/);
assert.match(dialog, /showModal\(\)/);
assert.match(dialog, /returnFocusTo\?\.focus/);

console.log('Combat Lab step dialog behavior smoke passed.');

function stripImports(value) {
  return value.replace(/^import[\s\S]*?from ['"][^'"]+['"];\n/mg, '');
}

function sampleStep() {
  return {
    stepId: 'step-1', titleRu: 'Одиночный выстрел', enabled: true, breakpointBefore: false,
    startCondition: { kind: 'always' },
    action: { kind: 'fire', actorRoleId: 'shooter', target: { kind: 'role', roleId: 'target' }, mode: 'single', targetRadiusMetres: 0.5, minimumSolutionQuality: 0.5, minimumPerceptionQuality: 0.5, forceFire: false },
    completion: { kind: 'shot_resolved' }, repeat: { kind: 'once', maximumAttempts: 1, retryDelaySeconds: 0 },
    timeoutSeconds: 20, failurePolicy: 'stop_experiment', accuracyOverrides: null,
  };
}

function sampleExperiment() {
  return {
    roles: [{ roleId: 'shooter' }, { roleId: 'target' }],
    markers: [], tracks: [{ trackId: 'track-1', steps: [sampleStep()] }],
  };
}
