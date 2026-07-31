import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CombatLabExperimentDraft } from '../src/combat-lab/scenario-editor/CombatLabExperimentDraft';
import {
  buildCombatLabBuiltInExperiment,
  digestCombatLabExperiment,
  getCombatLabScenarioDefinition,
} from '../src/core/testing/combat-lab';

const definition = getCombatLabScenarioDefinition('rifle-distance-baseline');
const experiment = buildCombatLabBuiltInExperiment(definition.scenarioId, definition.defaultSeed);
assert.equal(experiment.stopCondition.maximumSimulationSeconds, 120);
assert.equal(experiment.batchDefaults.maximumSimulationSeconds, 120);
assert.equal(experiment.batchDefaults.seedStrategy.kind, 'sequential');
if (experiment.batchDefaults.seedStrategy.kind === 'sequential') {
  assert.equal(experiment.batchDefaults.seedStrategy.firstSeed, experiment.defaults.seed);
}

const originalStepTimeouts = experiment.tracks.flatMap((track) => track.steps.map((step) => step.timeoutSeconds));
const beforeDigest = digestCombatLabExperiment(experiment);
const draft = new CombatLabExperimentDraft(experiment);
const beforeRevision = draft.getExperiment().revision;
draft.updateExperimentRuntimeSettings({ maximumSimulationSeconds: 60 });
const updated = draft.getExperiment();
assert.equal(updated.revision, beforeRevision + 1);
assert.equal(updated.stopCondition.maximumSimulationSeconds, 60);
assert.equal(updated.batchDefaults.maximumSimulationSeconds, 60);
assert.deepEqual(updated.tracks.flatMap((track) => track.steps.map((step) => step.timeoutSeconds)), originalStepTimeouts, 'Лимит эксперимента не должен менять тайм-ауты отдельных действий.');
assert.notEqual(digestCombatLabExperiment(updated), beforeDigest);

const [toolbar, dialog, summary, executor] = await Promise.all([
  readFile('src/combat-lab/ui/CombatLabExperimentRunToolbar.ts', 'utf8'),
  readFile('src/combat-lab/ui/CombatLabExperimentSettingsDialog.ts', 'utf8'),
  readFile('src/combat-lab/ui/CombatLabExperimentSettingsSummary.ts', 'utf8'),
  readFile('src/core/testing/combat-lab/experiment/CombatLabScenarioExecutor.ts', 'utf8'),
]);
assert.match(toolbar, /Настройки/);
assert.match(summary, /Seed:/);
assert.match(summary, /Лимит:/);
for (const preset of [30, 60, 120, 300]) assert.match(dialog, new RegExp(`value[^\n]*${preset}|${preset}[^\n]*с`));
assert.match(dialog, /Произвольн/);
assert.match(executor, /Достигнут лимит длительности эксперимента/);

console.log('Combat Lab experiment duration behavior smoke passed.');
