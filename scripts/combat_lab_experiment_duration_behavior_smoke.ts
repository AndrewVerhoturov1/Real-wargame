import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { updateCombatLabExperimentRuntimeSettings } from '../src/combat-lab/scenario-editor/CombatLabExperimentRuntimeSettings';
import {
  buildCombatLabBuiltInExperiment,
  digestCombatLabExperiment,
  getCombatLabScenarioDefinition,
} from '../src/core/testing/combat-lab';

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

async function main(): Promise<void> {
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
  const beforeRevision = experiment.revision;
  const updated = updateCombatLabExperimentRuntimeSettings(experiment, { maximumSimulationSeconds: 60 });
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
  assert.match(toolbar, /CombatLabExperimentSettingsSummary/);
  assert.match(toolbar, /CombatLabExperimentSettingsDialog/);
  assert.match(summary, /Seed:/);
  assert.match(summary, /Лимит:/);
  assert.match(dialog, /PRESET_SECONDS\s*=\s*\[30,\s*60,\s*120,\s*300\]/);
  assert.match(dialog, /Произвольн/);
  assert.match(executor, /combat_lab_stop_time_reached/);

  console.log('Combat Lab experiment duration behavior smoke passed.');
}
