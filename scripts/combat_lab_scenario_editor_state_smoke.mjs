import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const [draftSource, historySource] = await Promise.all([
  readFile('src/combat-lab/scenario-editor/CombatLabExperimentDraft.ts', 'utf8'),
  readFile('src/combat-lab/scenario-editor/CombatLabEditorHistory.ts', 'utf8'),
]);

const source = `
const COMBAT_LAB_EXPERIMENT_LIMITS_V1 = { maximumTracks: 64, maximumSteps: 512, maximumMarkers: 256, maximumUndoStates: 100 };
${stripImports(draftSource)}
${stripImports(historySource)}
`;
const js = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
}).outputText;
const module = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const { CombatLabExperimentDraft, CombatLabEditorHistory, CombatLabDraftReferenceError } = module;

const initial = sampleExperiment();
const frozenSnapshot = structuredClone(initial);
const draft = new CombatLabExperimentDraft(initial);
const trackId = draft.addTrack('shooter');
assert.equal(draft.getExperiment().revision, 2);
assert.deepEqual(initial, frozenSnapshot, 'Source experiment must not be mutated.');
assert.equal(
  draft.getExperiment().sceneSnapshot,
  initial.sceneSnapshot,
  'Editing bounded program data must structurally share the full-map scene snapshot.',
);
assert.equal(Object.isFrozen(draft.getExperiment()), true, 'Published experiment must be immutable.');
assert.equal(Object.isFrozen(draft.getExperiment().tracks), true, 'Published tracks must be immutable.');

const step = sampleStep('step-manual', 'shooter', 'target');
draft.addStep(trackId, step);
assert.equal(draft.getExperiment().revision, 3);
draft.updateStep(trackId, step.stepId, { titleRu: 'Изменённый шаг' });
assert.equal(draft.getExperiment().revision, 4);
assert.equal(draft.getExperiment().tracks[0].steps[0].stepId, step.stepId);

const second = sampleStep('step-second', 'shooter', 'target');
draft.addStep(trackId, second);
draft.moveStep(trackId, second.stepId, 0);
assert.deepEqual(draft.getExperiment().tracks[0].steps.map((item) => item.stepId), ['step-second', 'step-manual']);
const duplicateId = draft.duplicateStep(trackId, second.stepId);
assert.notEqual(duplicateId, second.stepId);
assert.equal(draft.getExperiment().tracks[0].steps.length, 3);
draft.removeStep(trackId, duplicateId);
assert.equal(draft.getExperiment().tracks[0].steps.length, 2);

assert.throws(() => draft.removeRole('target'), CombatLabDraftReferenceError);
const marker = { markerId: 'point-1', kind: 'point', titleRu: 'Точка', xMetres: 10, yMetres: 20, zMetres: 0 };
draft.addMarker(marker);
const markerStep = {
  ...sampleStep('step-move', 'shooter', 'target'),
  action: { kind: 'move', actorRoleId: 'shooter', markerId: marker.markerId },
  completion: { kind: 'production_action' },
};
draft.addStep(trackId, markerStep);
assert.throws(() => draft.removeMarker(marker.markerId), CombatLabDraftReferenceError);

const history = new CombatLabEditorHistory(initial);
for (let index = 0; index < 105; index += 1) history.execute({ ...initial, revision: index + 2, titleRu: `Опыт ${index}` });
assert.equal(history.undoDepth, 100, 'History must evict deterministically at capacity 100.');
const undone = history.undo();
assert.equal(undone.titleRu, 'Опыт 103');
const redone = history.redo();
assert.equal(redone.titleRu, 'Опыт 104');
history.undo();
history.execute({ ...initial, revision: 999, titleRu: 'Новая ветка' });
assert.equal(history.redo(), null, 'A new operation after undo must clear the redo tail.');
history.clear();
assert.equal(history.undo(), null);

console.log('Combat Lab scenario editor state smoke passed.');

function stripImports(value) {
  return value.replace(/^import[\s\S]*?from ['"][^'"]+['"];\n/mg, '');
}

function sampleExperiment() {
  return {
    schemaVersion: 1,
    experimentId: 'editor-smoke',
    revision: 1,
    titleRu: 'Проверка редактора',
    descriptionRu: '',
    baseScenarioId: null,
    sceneSnapshot: {
      version: 'scene', exportedAt: '', noteRu: '', simulationTimeSeconds: 0, infantryCombatRuntime: {},
      map: { width: 20, height: 20, cellSize: 10, metersPerCell: 2, defaultTerrain: 'field', defaultHeight: 0, environmentProfileId: 'default', heightMap: [], forestMap: [], surfaceMaterialMap: [], vegetationMaterialMap: [], objects: [] },
      environmentProfiles: {}, movementProfiles: {},
      units: [{ id: 'unit-a' }, { id: 'unit-b' }], pressureZones: [],
    },
    roles: [
      { roleId: 'shooter', unitId: 'unit-a', titleRu: 'Стрелок', selectableAs: ['shooter'] },
      { roleId: 'target', unitId: 'unit-b', titleRu: 'Цель', selectableAs: ['target'] },
    ],
    markers: [], tracks: [],
    defaults: { seed: 1, stepTimeoutSeconds: 20, failurePolicy: 'stop_experiment', repeat: { kind: 'once', maximumAttempts: 1, retryDelaySeconds: 0 }, accuracyOverrides: null },
    successCondition: { kind: 'always' },
    stopCondition: { kind: 'program_complete', maximumSimulationSeconds: 60 },
    batchDefaults: { runCount: 1, seedStrategy: { kind: 'fixed', seed: 1 }, maximumSimulationSeconds: 60, workerCount: 1, representativeRunCount: 1, metricIds: [] },
  };
}

function sampleStep(stepId, actorRoleId, targetRoleId) {
  return {
    stepId,
    titleRu: 'Одиночный выстрел',
    enabled: true,
    breakpointBefore: false,
    startCondition: { kind: 'always' },
    action: { kind: 'fire', actorRoleId, target: { kind: 'role', roleId: targetRoleId }, mode: 'single', targetRadiusMetres: 0.5, minimumSolutionQuality: 0.5, minimumPerceptionQuality: 0.5, forceFire: false },
    completion: { kind: 'shot_resolved' },
    repeat: { kind: 'once', maximumAttempts: 1, retryDelaySeconds: 0 },
    timeoutSeconds: 20,
    failurePolicy: 'stop_experiment',
    accuracyOverrides: null,
  };
}
