import assert from 'node:assert/strict';
import {
  createDefaultTacticalPositionNodeParameters,
  readTacticalPositionNodeSettings,
  normalizeTacticalPositionNodeParameters,
  tacticalPositionSearchSettingsDigest,
} from '../src/core/tactical/TacticalPositionNodeSettings';

const defaults = createDefaultTacticalPositionNodeParameters('defense', 'advance_to_threat');
assert.equal(defaults.tacticalQualityWeight, 0.58);
assert.equal(defaults.movementObjectiveWeight, 0.42);
assert.equal(defaults.maxCandidates, 12);
assert.equal(defaults.preliminaryCandidates, 36);
assert.equal(defaults.exactCandidates, 12);
assert.equal(defaults.exactRayLimit, 32);

const normalized = normalizeTacticalPositionNodeParameters({
  kind: 'firing',
  objective: 'withdraw_from_threat',
  maxCandidates: -20,
  preliminaryCandidates: 9999,
  exactCandidates: Number.NaN,
  exactRayLimit: Number.POSITIVE_INFINITY,
  maximumRouteCost: -1,
  dangerWeight: 999,
  allowStanding: false,
  allowCrouched: false,
  allowProne: false,
  unknownFutureField: 73,
});
assert.equal(normalized.maxCandidates, 1);
assert.equal(normalized.preliminaryCandidates, 128);
assert.equal(normalized.exactCandidates, 12);
assert.equal(normalized.exactRayLimit, 32);
assert.equal(normalized.maximumRouteCost, 1);
assert.equal(normalized.dangerWeight, 10);
assert.equal(normalized.allowStanding, true, 'at least one posture must stay legal');
assert.equal(normalized.unknownFutureField, 73, 'unknown fields must survive graph loading');

const settings = readTacticalPositionNodeSettings(normalized);
assert.equal(settings.kind, 'firing');
assert.equal(settings.objective, 'withdraw_from_threat');
assert.equal(settings.searchBudget.maxCandidates, 1);
assert.equal(settings.searchBudget.preliminaryCandidates, 128);
assert.equal(settings.constraints.allowedPostures.standing, true);
assert.equal(settings.constraints.allowedPostures.crouched, false);
assert.equal(settings.constraints.allowedPostures.prone, false);
assert.ok(Number.isFinite(settings.ranking.weights.danger));

const roundTrip = JSON.parse(JSON.stringify(normalized));
assert.deepEqual(normalizeTacticalPositionNodeParameters(roundTrip), normalized);

const baseDigest = tacticalPositionSearchSettingsDigest(settings.search);
const changedDigest = tacticalPositionSearchSettingsDigest(readTacticalPositionNodeSettings({
  ...normalized,
  movementObjectiveWeight: 0,
}).search);
assert.notEqual(baseDigest, changedDigest);

console.log('tactical position node settings smoke passed');
