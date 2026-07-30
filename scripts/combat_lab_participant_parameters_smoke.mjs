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
assert.equal(visual.commands[0]?.shooterUnitId, 'unit-bravo', 'Подготовка запуска обязана сохранять авторский порядок дорожек.');

const roleReordered = structuredClone(source);
roleReordered.roles.reverse();
const trackReordered = structuredClone(source);
trackReordered.tracks.reverse();

const preparedSource = parameters.prepareCombatLabExperimentForRun(source, seed);
const preparedRoleReordered = parameters.prepareCombatLabExperimentForRun(roleReordered, seed);
const preparedTrackReordered = parameters.prepareCombatLabExperimentForRun(trackReordered, seed);
assert.deepEqual(
  preparedSource.roles.map((role) => role.roleId),
  source.roles.map((role) => role.roleId),
  'Подготовка запуска не должна переставлять роли.',
);
assert.deepEqual(
  preparedSource.tracks.map((track) => track.trackId),
  source.tracks.map((track) => track.trackId),
  'Подготовка запуска не должна переставлять дорожки.',
);
assert.deepEqual(
  preparedTrackReordered.tracks.map((track) => track.trackId),
  trackReordered.tracks.map((track) => track.trackId),
  'Переставленный автором порядок дорожек должен сохраняться.',
);
assert.deepEqual(seedByStep(preparedSource), seedByStep(preparedRoleReordered), 'Seed шага не должен зависеть от порядка ролей.');
assert.deepEqual(seedByStep(preparedSource), seedByStep(preparedTrackReordered), 'Seed шага не должен зависеть от порядка дорожек.');

const reorderedVisual = runVisualPath(trackReordered, seed);
const reorderedHeadless = runHeadlessPath(trackReordered, seed);
assert.deepEqual(reorderedVisual.commands, reorderedHeadless.commands, 'Visual/headless parity должна сохраняться после авторской перестановки дорожек.');
assert.deepEqual(reorderedVisual.results, reorderedHeadless.results);
assert.equal(reorderedVisual.digest, reorderedHeadless.digest);
assert.equal(reorderedVisual.commands[0]?.shooterUnitId, 'unit-alpha', 'Исполнение обязано учитывать изменённый автором порядок дорожек.');
assert.notEqual(
  digest.digestCombatLabExperiment(source),
  digest.digestCombatLabExperiment(trackReordered),
  'Порядок дорожек влияет на исполнение и обязан входить в digest эксперимента.',
);

const runnerSource = readFileSync('src/core/testing/combat-lab/experiment/CombatLabExperimentRunner.ts', 'utf8');
const visualSource = readFileSync('src/combat-lab/runtime/CombatLabExperimentVisualController.ts', 'utf8');
assert.match(runnerSource, /prepareCombatLabExperimentForRun/);
assert.match(visualSource, /prepareCombatLabExperimentForRun/);
assert.match(runnerSource, /CombatLabScenarioExecutor\.create/);
assert.match(visualSource, /CombatLabScenarioExecutor\.create/);
assert.doesNotMatch(`${runnerSource}\n${visualSource}`, /CombatLabParticipantScenarioExecutor|applyVisualSeed|withRandomSeed/);
assert.equal(existsSync('src/core/testing/combat-lab/experiment/CombatLabParticipantScenarioExecutor.ts'), false);

console.log('combat_lab_participant_parameters_smoke: PASS');

function seedByStep(experiment) {
  return Object.fromEntries(experiment.tracks
    .flatMap((track) => track.steps)
    .filter((candidate) => candidate.action.kind === 'fire')
    .map((candidate) => [candidate.stepId, candidate.accuracyOverrides?.randomSeed ?? null])
    .sort(([left], [right]) => left.localeCompare(right)));
}
