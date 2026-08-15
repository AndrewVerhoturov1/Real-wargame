import assert from 'node:assert/strict';
import type { SimulationState } from '../src/core/simulation/SimulationState';
import {
  collectCombatLabLiveJournalEvents,
  filterCombatLabLiveJournalEvents,
  getCombatLabJournalEventsForProgramStep,
} from '../src/combat-lab/runtime/CombatLabLiveJournal';
import type {
  CombatLabExperimentJournalEntryV1,
  CombatLabRunIdentityV1,
} from '../src/combat-lab/runtime/CombatLabExperimentRunState';

const runIdentity: CombatLabRunIdentityV1 = {
  schemaVersion: 1,
  runId: 'run-live-journal',
  experimentId: 'exp-1',
  experimentRevision: 2,
  sourceDigest: 'digest',
  seed: 123,
};
const programStepRef = {
  experimentId: 'exp-1',
  experimentRevision: 2,
  trackId: 'track-1',
  stepId: 'step-1',
} as const;
const programJournal: CombatLabExperimentJournalEntryV1[] = [{
  runId: runIdentity.runId,
  eventId: `${runIdentity.runId}:event:1`,
  sequence: 1,
  simulatedSeconds: 0.5,
  kind: 'step_started',
  messageRu: 'Начат шаг «Огонь».',
  programStepRef,
  trackId: 'track-1',
  stepId: 'step-1',
  attempt: 1,
}];
const state = fakeState();

const collected = collectCombatLabLiveJournalEvents({ runIdentity, programJournal, state });
assert.equal(collected.events.length, 4);
assert.deepEqual(collected.events.map((event) => event.category), [
  'program.step_started',
  'fire.shot_committed',
  'fire.impact.unit',
  'fire.impact.terrain',
]);
assert.equal(collected.events.every((event) => event.mandatoryCore), true);
assert.equal(collected.events.find((event) => event.category === 'fire.impact.terrain')?.tier, 'T3');
assert.equal(collected.events.find((event) => event.category === 'fire.impact.unit')?.tier, 'T2');

assert.deepEqual(
  filterCombatLabLiveJournalEvents(collected.events, { participantUnitId: 'u2' }).map((event) => event.category),
  ['fire.impact.unit'],
);
assert.deepEqual(
  filterCombatLabLiveJournalEvents(collected.events, { tiers: ['T3'] }).map((event) => event.category),
  ['fire.impact.terrain'],
);
assert.deepEqual(
  filterCombatLabLiveJournalEvents(collected.events, { searchText: 'weapon-u1' }).map((event) => event.category),
  ['fire.shot_committed'],
);
assert.deepEqual(
  getCombatLabJournalEventsForProgramStep(collected.events, programStepRef).map((event) => event.category),
  ['program.step_started'],
);

const noDuplicates = collectCombatLabLiveJournalEvents({
  runIdentity,
  programJournal,
  state,
  cursor: collected.cursor,
});
assert.equal(noDuplicates.events.length, 0);

assert.throws(
  () => collectCombatLabLiveJournalEvents({
    runIdentity,
    programJournal,
    state: fakeState(1),
    cursor: collected.cursor,
  }),
  /projectile event source overflowed/,
);

console.log('Combat Lab full LIVE Journal scope behavior smoke passed.');

function fakeState(eventOverflowCount = 0): SimulationState {
  return {
    infantryCombatProjectiles: {
      committedShots: [{
        schemaVersion: 1,
        shotId: 'shot-1',
        shooterId: 'u1',
        fireTaskId: 'task-1',
        weaponInstanceId: 'weapon-u1',
        weaponDefinitionRef: { definitionId: 'rifle', revision: 1 },
        ammoDefinitionRef: { definitionId: 'ammo', revision: 1 },
        committedSimulationSeconds: 1,
        muzzlePosition: { xMetres: 0, yMetres: 0, zMetres: 1 },
        initialVelocityMetresPerSecond: { x: 1, y: 0, z: 0 },
        roundsBefore: 5,
        roundsAfter: 4,
      }],
      impacts: [{
        schemaVersion: 2,
        impactId: 'impact-1',
        projectileId: 'projectile-1',
        shotId: 'shot-1',
        shooterId: 'u1',
        hitType: 'unit',
        impactSeconds: 1.5,
        projectileAgeSeconds: 0.5,
        point: { xMetres: 1, yMetres: 1, zMetres: 1 },
        hitObjectId: null,
        hitUnitId: 'u2',
        hitZone: 'torso',
        materialId: null,
        normal: null,
        velocityBeforeImpact: { x: 1, y: 0, z: 0 },
      }, {
        schemaVersion: 2,
        impactId: 'impact-2',
        projectileId: 'projectile-2',
        shotId: 'shot-1',
        shooterId: 'u1',
        hitType: 'terrain',
        impactSeconds: 2,
        projectileAgeSeconds: 1,
        point: { xMetres: 2, yMetres: 2, zMetres: 0 },
        hitObjectId: null,
        hitUnitId: null,
        hitZone: null,
        materialId: null,
        normal: null,
        velocityBeforeImpact: { x: 1, y: 0, z: 0 },
      }],
      diagnostics: { eventOverflowCount },
    },
  } as unknown as SimulationState;
}
