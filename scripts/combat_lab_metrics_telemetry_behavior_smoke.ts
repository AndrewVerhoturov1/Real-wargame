import assert from 'node:assert/strict';
import type { SimulationState } from '../src/core/simulation/SimulationState';
import {
  collectCombatLabTelemetry,
  createCombatLabMeasurementDefinition,
  duplicateCombatLabMeasurementDefinition,
  getCombatLabTelemetryStreamCapability,
  reviseCombatLabMeasurementDefinition,
  setCombatLabMeasurementDefinitionEnabled,
  type CombatLabTelemetryCursorV1,
} from '../src/core/testing/combat-lab/metrics/CombatLabMeasurementTelemetry';

assert.equal(getCombatLabTelemetryStreamCapability('fire.shot_committed').supported, true);
assert.equal(getCombatLabTelemetryStreamCapability('fire.impact').supported, true);
assert.equal(getCombatLabTelemetryStreamCapability('suppression.level').supported, false);

const shots = createCombatLabMeasurementDefinition({
  measurementDefinitionId: 'measurement-shots-u1',
  titleRu: 'Выстрелы бойца U1',
  streamId: 'fire.shot_committed',
  participantUnitIds: ['u1'],
});
const impactsOnU2 = createCombatLabMeasurementDefinition({
  measurementDefinitionId: 'measurement-impacts-u2',
  titleRu: 'Воздействия на U2',
  streamId: 'fire.impact',
  participantUnitIds: ['u2'],
});

assert.equal(shots.revision, 1);
assert.ok(shots.fingerprint.length > 0);
assert.notEqual(
  shots.fingerprint,
  reviseCombatLabMeasurementDefinition(shots, { titleRu: 'Выстрелы U1 — новое имя' }).fingerprint,
);
const duplicate = duplicateCombatLabMeasurementDefinition(shots, 'measurement-shots-copy');
assert.equal(duplicate.revision, 1);
assert.notEqual(duplicate.measurementDefinitionId, shots.measurementDefinitionId);
assert.throws(
  () => createCombatLabMeasurementDefinition({
    measurementDefinitionId: 'unsupported-suppression',
    titleRu: 'Подавление',
    streamId: 'suppression.level',
  }),
  /uses unavailable stream suppression\.level/,
);
assert.throws(
  () => createCombatLabMeasurementDefinition({
    measurementDefinitionId: 'unsupported-state-constraint',
    titleRu: 'Выстрелы только в условии',
    streamId: 'fire.shot_committed',
    stateConstraints: [{ field: 'posture', operator: 'eq', value: 'prone' }],
  }),
  /does not support state constraints yet/,
);

const firstState = telemetryState({
  shots: [shot('u1:shot:1', 'u1', 1), shot('u3:shot:1', 'u3', 1.1)],
  impacts: [impact('impact:1', 'u1:shot:1', 'u1', 'u2', 1.2)],
});
const first = collectCombatLabTelemetry({
  state: firstState,
  runId: 'run-1',
  definitions: [shots, impactsOnU2],
});
assert.equal(first.records.length, 2);
assert.deepEqual(first.records.map((record) => record.streamId), ['fire.shot_committed', 'fire.impact']);
assert.equal(first.records[0]?.runId, 'run-1');
assert.equal(first.records[0]?.measurementDefinitionId, shots.measurementDefinitionId);
assert.ok(first.records[0]?.sourceEntityRefs.some((ref) => ref.kind === 'shot' && ref.id === 'u1:shot:1'));
assert.equal(first.records[1]?.payload.hitUnitId, 'u2');
assert.equal(first.cursor.lastCommittedShotId, 'u3:shot:1');
assert.equal(first.cursor.lastImpactId, 'impact:1');

const noDuplicates = collectCombatLabTelemetry({
  state: firstState,
  runId: 'run-1',
  definitions: [shots, impactsOnU2],
  cursor: first.cursor,
});
assert.equal(noDuplicates.records.length, 0);

const secondState = telemetryState({
  shots: [...firstState.infantryCombatProjectiles.committedShots, shot('u1:shot:2', 'u1', 2)],
  impacts: [...firstState.infantryCombatProjectiles.impacts],
});
const second = collectCombatLabTelemetry({
  state: secondState,
  runId: 'run-1',
  definitions: [shots, impactsOnU2],
  cursor: first.cursor,
});
assert.equal(second.records.length, 1);
assert.equal(second.records[0]?.recordId, 'run-1:measurement-shots-u1:shot:u1:shot:2');

const disabled = setCombatLabMeasurementDefinitionEnabled(shots, false);
assert.equal(disabled.enabled, false);
assert.equal(disabled.revision, 2);
assert.equal(collectCombatLabTelemetry({ state: firstState, runId: 'run-disabled', definitions: [disabled] }).records.length, 0);

const timed = createCombatLabMeasurementDefinition({
  measurementDefinitionId: 'measurement-timed-shots',
  titleRu: 'Поздние выстрелы',
  streamId: 'fire.shot_committed',
  collectionPeriod: {
    start: { kind: 'simulation_time', seconds: 1.5 },
    end: { kind: 'run_end' },
  },
});
const timedResult = collectCombatLabTelemetry({ state: secondState, runId: 'run-time', definitions: [timed] });
assert.deepEqual(timedResult.records.map((record) => record.payload.shotId), ['u1:shot:2']);

const anchored = createCombatLabMeasurementDefinition({
  measurementDefinitionId: 'measurement-anchor',
  titleRu: 'От шага программы',
  streamId: 'fire.shot_committed',
  collectionPeriod: {
    start: {
      kind: 'program_step',
      experimentId: 'exp-1',
      experimentRevision: 1,
      trackId: 'track-1',
      stepId: 'step-1',
      edge: 'enter',
    },
    end: { kind: 'run_end' },
  },
});
assert.throws(
  () => collectCombatLabTelemetry({ state: secondState, runId: 'run-anchor', definitions: [anchored] }),
  /requires resolved Program-anchor collection bounds/,
);
const anchoredResult = collectCombatLabTelemetry({
  state: secondState,
  runId: 'run-anchor',
  definitions: [anchored],
  resolvedPeriods: [{
    measurementDefinitionId: anchored.measurementDefinitionId,
    measurementDefinitionRevision: anchored.revision,
    startSeconds: 1.5,
    endSeconds: null,
  }],
});
assert.deepEqual(anchoredResult.records.map((record) => record.payload.shotId), ['u1:shot:2']);

const lostCursor: CombatLabTelemetryCursorV1 = {
  lastCommittedShotId: 'evicted-shot',
  lastImpactId: null,
  sourceEventOverflowCount: 0,
};
assert.throws(
  () => collectCombatLabTelemetry({ state: secondState, runId: 'run-lost', definitions: [shots], cursor: lostCursor }),
  /lost committed shot cursor evicted-shot/,
);
const overflowState = telemetryState({ shots: [], impacts: [], eventOverflowCount: 2 });
assert.throws(
  () => collectCombatLabTelemetry({ state: overflowState, runId: 'run-overflow', definitions: [shots] }),
  /source overflowed before collection completed/,
);

console.log('Combat Lab MeasurementDefinition/telemetry behavior smoke passed.');

function shot(shotId: string, shooterId: string, seconds: number) {
  return {
    schemaVersion: 1 as const,
    shotId,
    shooterId,
    fireTaskId: `${shooterId}:fire-task`,
    weaponInstanceId: `${shooterId}:weapon`,
    weaponDefinitionRef: { definitionId: 'weapon.rifle', revision: 1 },
    ammoDefinitionRef: { definitionId: 'ammo.rifle', revision: 1 },
    committedSimulationSeconds: seconds,
    muzzlePosition: { xMetres: 0, yMetres: 0, zMetres: 1 },
    initialVelocityMetresPerSecond: { x: 1, y: 0, z: 0 },
    roundsBefore: 5,
    roundsAfter: 4,
  };
}

function impact(
  impactId: string,
  shotId: string,
  shooterId: string,
  hitUnitId: string | null,
  seconds: number,
) {
  return {
    schemaVersion: 2 as const,
    impactId,
    projectileId: `${shotId}:projectile`,
    shotId,
    shooterId,
    hitType: hitUnitId ? 'unit' as const : 'terrain' as const,
    impactSeconds: seconds,
    projectileAgeSeconds: 0.2,
    point: { xMetres: 3, yMetres: 4, zMetres: 0 },
    hitObjectId: null,
    hitUnitId,
    hitZone: hitUnitId ? 'torso' as const : null,
    materialId: null,
    normal: null,
    velocityBeforeImpact: { x: 1, y: 0, z: 0 },
  };
}

function telemetryState(input: {
  shots: readonly ReturnType<typeof shot>[];
  impacts: readonly ReturnType<typeof impact>[];
  eventOverflowCount?: number;
}): SimulationState {
  return {
    infantryCombatProjectiles: {
      committedShots: [...input.shots],
      impacts: [...input.impacts],
      diagnostics: { eventOverflowCount: input.eventOverflowCount ?? 0 },
    },
  } as unknown as SimulationState;
}
