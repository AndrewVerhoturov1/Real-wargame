import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { accuracy } from './combat_lab_participant_test_support.mjs';
import {
  parameters,
  digest,
  fixture,
  execute,
  runHeadlessPath,
  runVisualPath,
} from './combat_lab_participant_execution_test_environment.mjs';

const common = accuracy(1, 1.1);
const participant = accuracy(2, 1.2);
const step = accuracy(3, 1.3);
const seed = 777;

for (const [label, input, expectedDispersion, expectedSource] of [
  ['production', {}, null, 'production'],
  ['experiment', { defaultsAccuracy: common }, 1.1, 'experiment'],
  ['participant', { defaultsAccuracy: common, participantAccuracy: participant }, 1.2, 'participant'],
  ['step', { defaultsAccuracy: common, participantAccuracy: participant, stepAccuracy: step }, 1.3, 'step'],
]) {
  const source = fixture(input);
  const prepared = parameters.prepareCombatLabExperimentForRun(source, seed);
  const fireStep = prepared.tracks[0].steps[0];
  const resolved = parameters.resolveCombatLabParticipantAccuracy(source, 'bravo', source.tracks[0].steps[0], seed);
  assert.equal(resolved.source, expectedSource, label);
  assert.equal(fireStep.accuracyOverrides?.dispersionMultiplier ?? null, expectedDispersion, label);
  if (expectedDispersion !== null) {
    assert.equal(
      fireStep.accuracyOverrides.randomSeed,
      parameters.deriveCombatLabParticipantStepSeed(seed, 'bravo', 'fire-bravo'),
      `${label}: seed`,
    );
  }
  const executed = execute(prepared);
  assert.equal(executed.commands[0].accuracyOverrides?.dispersionMultiplier ?? null, expectedDispersion, `${label}: command`);
}

const source = fixture({ defaultsAccuracy: common, participantAccuracy: participant, stepAccuracy: step, twoTracks: true });
const visual = runVisualPath(source, seed);
const headless = runHeadlessPath(source, seed);
assert.deepEqual(visual.commands, headless.commands, 'Визуальный и невизуальный пути должны выдавать одинаковые команды.');
assert.deepEqual(visual.results, headless.results, 'Визуальный и невизуальный пути должны получать одинаковые результаты команд.');
assert.equal(visual.digest, headless.digest, 'Digest команд и результатов должен совпадать.');

const reordered = structuredClone(source);
reordered.roles.reverse();
reordered.tracks.reverse();
const reorderedVisual = runVisualPath(reordered, seed);
const reorderedHeadless = runHeadlessPath(reordered, seed);
assert.deepEqual(visual.commands, reorderedVisual.commands);
assert.deepEqual(headless.commands, reorderedHeadless.commands);
assert.equal(visual.digest, reorderedVisual.digest);
assert.equal(headless.digest, reorderedHeadless.digest);
assert.equal(headless.result.eventDigest, reorderedHeadless.result.eventDigest);
assert.equal(headless.result.finalStateDigest, reorderedHeadless.result.finalStateDigest);
assert.equal(digest.digestCombatLabExperiment(source), digest.digestCombatLabExperiment(reordered));

const runnerSource = readFileSync('src/core/testing/combat-lab/experiment/CombatLabExperimentRunner.ts', 'utf8');
const visualSource = readFileSync('src/combat-lab/runtime/CombatLabExperimentVisualController.ts', 'utf8');
assert.match(runnerSource, /prepareCombatLabExperimentForRun/);
assert.match(visualSource, /prepareCombatLabExperimentForRun/);
assert.match(runnerSource, /CombatLabScenarioExecutor\.create/);
assert.match(visualSource, /CombatLabScenarioExecutor\.create/);
assert.doesNotMatch(`${runnerSource}\n${visualSource}`, /CombatLabParticipantScenarioExecutor|applyVisualSeed|withRandomSeed/);
assert.equal(existsSync('src/core/testing/combat-lab/experiment/CombatLabParticipantScenarioExecutor.ts'), false);

console.log('combat_lab_participant_parameters_smoke: PASS');
