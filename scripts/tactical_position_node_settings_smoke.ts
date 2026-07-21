import assert from 'node:assert/strict';
import {
  createDefaultTacticalPositionNodeParameters,
  readTacticalPositionNodeSettings,
  normalizeTacticalPositionNodeParameters,
  resetTacticalPositionNodeParameter,
  resetTacticalPositionNodeParameterGroup,
  tacticalPositionSearchSettingsDigest,
} from '../src/core/tactical/TacticalPositionNodeSettings';

const defaults = createDefaultTacticalPositionNodeParameters('defense', 'advance_to_threat');
assert.equal(defaults.tacticalQualityWeight, 0.58);
assert.equal(defaults.movementObjectiveWeight, 0.42);
assert.equal(defaults.maxCandidates, 12);
assert.equal(defaults.preliminaryCandidates, 36);
assert.equal(defaults.exactCandidates, 12);
assert.equal(defaults.exactRayLimit, 32);

const oldGraphNode = normalizeTacticalPositionNodeParameters({
  queryKey: 'old_graph_query',
  maxCandidates: 8,
});
assert.equal(oldGraphNode.kind, 'defense');
assert.equal(oldGraphNode.objective, 'balanced');
assert.equal(oldGraphNode.tacticalQualityWeight, 0.58);
assert.equal(oldGraphNode.movementObjectiveWeight, 0.42);
assert.equal(oldGraphNode.maxPositionDanger, 78);

const legacyCoverNode = normalizeTacticalPositionNodeParameters({
  kind: 'cover',
  queryKey: 'cover_query',
  maxCandidates: 8,
});
assert.equal(legacyCoverNode.kind, 'defense');
assert.equal(legacyCoverNode.objective, 'balanced');
assert.equal(legacyCoverNode.queryKey, 'cover_query');

const normalized = normalizeTacticalPositionNodeParameters({
  kind: 'firing',
  objective: 'withdraw_from_threat',
  maxCandidates: -20,
  preliminaryCandidates: 9999,
  exactCandidates: Number.NaN,
  exactRayLimit: Number.POSITIVE_INFINITY,
  maximumRouteCost: -1,
  dangerWeight: 999,
  minimumTargetDistanceMeters: 200,
  maximumTargetDistanceMeters: 100,
  allowStanding: false,
  allowCrouched: false,
  allowProne: false,
  unknownFutureField: 73,
  unknownComplexField: { future: true },
});
assert.equal(normalized.maxCandidates, 1);
assert.equal(normalized.preliminaryCandidates, 128);
assert.equal(normalized.exactCandidates, 12);
assert.equal(normalized.exactRayLimit, 32);
assert.equal(normalized.maximumRouteCost, 1);
assert.equal(normalized.dangerWeight, 10);
assert.equal(normalized.maximumTargetDistanceMeters, 200);
assert.equal(normalized.allowStanding, true, 'at least one posture must stay legal');
assert.equal(normalized.unknownFutureField, 73, 'unknown primitive fields must survive graph loading');
assert.equal('unknownComplexField' in normalized, false, 'unsupported complex fields must be ignored without breaking loading');

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

const resetField = resetTacticalPositionNodeParameter({ ...defaults, dangerWeight: 7 }, 'dangerWeight');
assert.equal(resetField.dangerWeight, createDefaultTacticalPositionNodeParameters('defense', 'advance_to_threat').dangerWeight);
const resetGroup = resetTacticalPositionNodeParameterGroup({
  ...defaults,
  dangerWeight: 7,
  protectionWeight: 8,
  maxPositionDanger: 20,
}, 'ranking');
assert.equal(resetGroup.dangerWeight, defaults.dangerWeight);
assert.equal(resetGroup.protectionWeight, defaults.protectionWeight);
assert.equal(resetGroup.maxPositionDanger, 20, 'group reset must not alter another group');

const baseDigest = tacticalPositionSearchSettingsDigest(settings.search);
const changedDigest = tacticalPositionSearchSettingsDigest(readTacticalPositionNodeSettings({
  ...normalized,
  movementObjectiveWeight: 0,
}).search);
assert.notEqual(baseDigest, changedDigest);

console.log('tactical position node settings smoke passed');
