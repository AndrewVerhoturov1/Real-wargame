import assert from 'node:assert/strict';
import {
  buildCombatLabBuiltInExperiment,
  getCombatLabScenarioDefinition,
  type CombatLabScenarioRuntimeSnapshotV1,
  type CombatLabStepRuntimeSnapshotV1,
} from '../src/core/testing/combat-lab';
import {
  CombatLabExperimentRunJournal,
  createCombatLabRunIdentity,
} from '../src/combat-lab/runtime/CombatLabExperimentRunState';

const definition = getCombatLabScenarioDefinition('rifle-distance-baseline');
const experiment = buildCombatLabBuiltInExperiment(definition.scenarioId, definition.defaultSeed);
const firstStep = experiment.tracks.flatMap((track) => track.steps.map((step) => ({ track, step })))[0];
assert.ok(firstStep, 'Built-in experiment must contain at least one Program step.');

const runIdentity = createCombatLabRunIdentity(experiment, experiment.defaults.seed, 'combat-lab-run:test-1');
assert.equal(runIdentity.runId, 'combat-lab-run:test-1');
assert.equal(runIdentity.experimentId, experiment.experimentId);
assert.equal(runIdentity.experimentRevision, experiment.revision);
assert.ok(runIdentity.sourceDigest.length > 0);
assert.equal(runIdentity.seed, experiment.defaults.seed);

const pendingStep = runtimeStep(firstStep.track.trackId, firstStep.step.stepId, 'pending', 0, null);
const runningStep = runtimeStep(firstStep.track.trackId, firstStep.step.stepId, 'running', 1, 'owner:test');
const previous = runtimeSnapshot(experiment.experimentId, experiment.revision, 0, 'idle', pendingStep);
const next = runtimeSnapshot(experiment.experimentId, experiment.revision, 0.1, 'running', runningStep);

const journal = new CombatLabExperimentRunJournal(runIdentity);
const appended = journal.recordTransitions(experiment, previous, next);
assert.equal(appended.length, 1);
assert.equal(appended[0]?.runId, runIdentity.runId);
assert.equal(appended[0]?.eventId, `${runIdentity.runId}:event:1`);
assert.equal(appended[0]?.sequence, 1);
assert.equal(appended[0]?.kind, 'step_started');
assert.deepEqual(appended[0]?.programStepRef, {
  experimentId: experiment.experimentId,
  experimentRevision: experiment.revision,
  trackId: firstStep.track.trackId,
  stepId: firstStep.step.stepId,
});

const frozen = journal.snapshot();
assert.equal(frozen.length, 1);
assert.equal(frozen[0]?.eventId, appended[0]?.eventId);

const secondIdentity = createCombatLabRunIdentity(experiment, experiment.defaults.seed, 'combat-lab-run:test-2');
const secondJournal = new CombatLabExperimentRunJournal(secondIdentity);
const second = secondJournal.recordTransitions(experiment, previous, next);
assert.equal(second[0]?.eventId, 'combat-lab-run:test-2:event:1');
assert.notEqual(second[0]?.eventId, appended[0]?.eventId);

const changedRevision = Object.freeze({ ...experiment, revision: experiment.revision + 1 });
assert.throws(
  () => journal.recordTransitions(changedRevision, previous, next),
  /run identity does not match the experiment/,
);

console.log('Combat Lab LIVE journal identity behavior smoke passed.');

function runtimeStep(
  trackId: string,
  stepId: string,
  state: CombatLabStepRuntimeSnapshotV1['state'],
  attempt: number,
  ownerToken: string | null,
): CombatLabStepRuntimeSnapshotV1 {
  return Object.freeze({
    trackId,
    stepId,
    state,
    attempt,
    ownerToken,
    startedSeconds: state === 'running' ? 0.1 : null,
    completedSeconds: null,
    nextRetrySeconds: null,
    reasonCode: null,
    reasonRu: null,
  });
}

function runtimeSnapshot(
  experimentId: string,
  experimentRevision: number,
  simulatedSeconds: number,
  status: CombatLabScenarioRuntimeSnapshotV1['status'],
  step: CombatLabStepRuntimeSnapshotV1,
): CombatLabScenarioRuntimeSnapshotV1 {
  return Object.freeze({
    schemaVersion: 1,
    experimentId,
    experimentRevision,
    status,
    simulatedSeconds,
    success: null,
    stopReasonCode: null,
    stopReasonRu: null,
    steps: Object.freeze([step]),
  });
}
