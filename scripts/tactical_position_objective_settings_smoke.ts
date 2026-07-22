import assert from 'node:assert/strict';
import {
  createDefaultTacticalPositionNodeParameters,
  readTacticalPositionNodeSettings,
} from '../src/core/tactical/TacticalPositionNodeSettings';
import {
  rankTacticalPositionMetrics,
  sortTacticalPositionRanked,
  type TacticalPositionRankMetrics,
} from '../src/core/tactical/TacticalPositionObjectiveRanker';

const baseMetrics: TacticalPositionRankMetrics = {
  staticPotential: 80,
  directionalFit: 80,
  lineQuality: 80,
  rangeFit: 80,
  desiredDistanceFit: 80,
  protection: 60,
  concealment: 50,
  danger: 20,
  routeDanger: 20,
  routeCost: 20,
  uncertainty: 10,
  orderAlignment: 50,
  withdrawalQuality: 70,
  postureFit: 80,
  threatDistanceDeltaMeters: 0,
};

const advanceCandidate = { id: 'advance-side', metrics: { ...baseMetrics, threatDistanceDeltaMeters: -12 } };
const withdrawCandidate = { id: 'withdraw-side', metrics: { ...baseMetrics, threatDistanceDeltaMeters: 12 } };

const movementOff = readTacticalPositionNodeSettings({
  ...createDefaultTacticalPositionNodeParameters('defense', 'advance_to_threat'),
  tacticalQualityWeight: 1,
  movementObjectiveWeight: 0,
}).search;
assert.deepEqual(
  sortTacticalPositionRanked([advanceCandidate, withdrawCandidate], 'advance_to_threat', movementOff, { searchRadiusMeters: 40 }).map((candidate) => candidate.id),
  ['advance-side', 'withdraw-side'],
  'zero movement weight must make objective direction neutral and preserve deterministic id order',
);
assert.deepEqual(
  sortTacticalPositionRanked([advanceCandidate, withdrawCandidate], 'withdraw_from_threat', movementOff, { searchRadiusMeters: 40 }).map((candidate) => candidate.id),
  ['advance-side', 'withdraw-side'],
);

const movementStrong = readTacticalPositionNodeSettings({
  ...createDefaultTacticalPositionNodeParameters('defense', 'advance_to_threat'),
  tacticalQualityWeight: 0.2,
  movementObjectiveWeight: 1,
}).search;
assert.equal(
  sortTacticalPositionRanked([withdrawCandidate, advanceCandidate], 'advance_to_threat', movementStrong, { searchRadiusMeters: 40 })[0]?.id,
  'advance-side',
);
assert.equal(
  sortTacticalPositionRanked([advanceCandidate, withdrawCandidate], 'withdraw_from_threat', movementStrong, { searchRadiusMeters: 40 })[0]?.id,
  'withdraw-side',
);

const open = { ...baseMetrics, danger: 75, protection: 20 };
const protectedPosition = { ...baseMetrics, danger: 25, protection: 85 };
const dangerHeavy = readTacticalPositionNodeSettings({
  ...createDefaultTacticalPositionNodeParameters('defense'),
  dangerWeight: 4,
  protectionWeight: 0,
}).search;
assert.ok(
  rankTacticalPositionMetrics(protectedPosition, 'balanced', dangerHeavy, { searchRadiusMeters: 40 }).finalScore
    > rankTacticalPositionMetrics(open, 'balanced', dangerHeavy, { searchRadiusMeters: 40 }).finalScore,
);
const protectionHeavy = readTacticalPositionNodeSettings({
  ...createDefaultTacticalPositionNodeParameters('defense'),
  dangerWeight: 0,
  protectionWeight: 4,
}).search;
assert.ok(
  rankTacticalPositionMetrics(protectedPosition, 'balanced', protectionHeavy, { searchRadiusMeters: 40 }).finalScore
    > rankTacticalPositionMetrics(open, 'balanced', protectionHeavy, { searchRadiusMeters: 40 }).finalScore,
);

const near = { ...baseMetrics, routeCost: 8 };
const far = { ...baseMetrics, routeCost: 80 };
const routeHeavy = readTacticalPositionNodeSettings({
  ...createDefaultTacticalPositionNodeParameters('defense'),
  routeCostWeight: 4,
}).search;
assert.ok(
  rankTacticalPositionMetrics(near, 'balanced', routeHeavy, { searchRadiusMeters: 40 }).finalScore
    > rankTacticalPositionMetrics(far, 'balanced', routeHeavy, { searchRadiusMeters: 40 }).finalScore,
);

const desiredNear = { ...baseMetrics, desiredDistanceFit: 95 };
const desiredFar = { ...baseMetrics, desiredDistanceFit: 20 };
const distanceHeavy = readTacticalPositionNodeSettings({
  ...createDefaultTacticalPositionNodeParameters('firing'),
  desiredDistanceWeight: 4,
}).search;
assert.ok(
  rankTacticalPositionMetrics(desiredNear, 'balanced', distanceHeavy, { searchRadiusMeters: 40 }).finalScore
    > rankTacticalPositionMetrics(desiredFar, 'balanced', distanceHeavy, { searchRadiusMeters: 40 }).finalScore,
);

console.log('tactical position objective settings smoke passed');
