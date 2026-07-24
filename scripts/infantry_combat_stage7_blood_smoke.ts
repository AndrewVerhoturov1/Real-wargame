import assert from 'node:assert/strict';
import {
  advanceBloodRuntimeTo,
  aggregateWoundCandidate,
  changeBloodRuntimeRateAt,
  createBloodRuntime,
  createUnitWoundRuntime,
  deriveBloodState,
  normalizeUnitWoundRuntime,
  type WoundCandidateV1,
  type WoundSeverity,
} from '../src/core/infantry-combat/runtime';

const migrated = normalizeUnitWoundRuntime({
  schemaVersion: 1,
  slots: [{
    schemaVersion: 1,
    zone: 'torso',
    severity: 'severe',
    hitCount: 2,
    bleedingRatePerSecond: 0.0042,
    maximumTraumaScore: 0.8,
    lastImpactEnergyJoules: 2400,
    firstImpactId: 'legacy:first',
    lastImpactId: 'legacy:last',
    firstAppliedSeconds: 2,
    lastAppliedSeconds: 3,
  }],
  appliedImpactIds: ['legacy:first', 'legacy:last'],
  capabilities: {},
  lastApplication: null,
  revision: 2,
});
assert.equal(migrated.schemaVersion, 2);
assert.equal(migrated.slots[0]?.schemaVersion, 2);
assert.equal(migrated.slots[0]?.severity, 'severe');
assert.equal(migrated.slots[0]?.bleedingState, 'severe');
assert.equal(migrated.slots[0]?.bleedingRatePerSecond, 0.0042);
assert.equal(migrated.slots[0]?.firstAidApplicationCount, 0);
assert.equal(migrated.slots[0]?.lastFirstAidActionId, null);

for (const [severity, expected] of [
  ['light', 'none'],
  ['severe', 'severe'],
  ['critical', 'critical'],
] as const) {
  const runtime = createUnitWoundRuntime();
  const result = aggregateWoundCandidate(runtime, candidate(`new:${severity}`, severity));
  assert.equal(result.runtime.slots[0]?.bleedingState, expected);
}

const reopened = aggregateWoundCandidate(createUnitWoundRuntime(), candidate('reopen:first', 'severe')).runtime;
reopened.slots[0]!.bleedingState = 'stopped';
reopened.slots[0]!.bleedingRatePerSecond = 0;
const reopenedBySevere = aggregateWoundCandidate(reopened, candidate('reopen:second', 'severe')).runtime;
assert.equal(reopenedBySevere.slots[0]?.bleedingState, 'severe');
assert.ok((reopenedBySevere.slots[0]?.bleedingRatePerSecond ?? 0) > 0);
reopenedBySevere.slots[0]!.bleedingState = 'stopped';
reopenedBySevere.slots[0]!.bleedingRatePerSecond = 0;
const lightAfterTreatment = aggregateWoundCandidate(reopenedBySevere, candidate('reopen:light', 'light')).runtime;
assert.equal(lightAfterTreatment.slots[0]?.bleedingState, 'stopped');
assert.equal(lightAfterTreatment.slots[0]?.bleedingRatePerSecond, 0);

const boundary = createBloodRuntime(0, 0.1);
advanceBloodRuntimeTo(boundary, 0.5);
assert.equal(boundary.bloodLoss, 0);
assert.equal(boundary.pendingBloodLoss, 0.05);
advanceBloodRuntimeTo(boundary, 1);
assert.equal(boundary.bloodLoss, 0.1);
assert.equal(boundary.pendingBloodLoss, 0);
assert.equal(boundary.updateCount, 1);

const coarse = createBloodRuntime(0, 0.08);
const fine = createBloodRuntime(0, 0.08);
advanceBloodRuntimeTo(coarse, 3.4);
for (const time of [0.25, 0.9, 1, 1.7, 2, 2.75, 3, 3.4]) advanceBloodRuntimeTo(fine, time);
assert.deepEqual(fine, coarse);

const changed = createBloodRuntime(0, 0.1);
changeBloodRuntimeRateAt(changed, 0.4, 0.02);
advanceBloodRuntimeTo(changed, 1);
assert.equal(changed.bloodLoss, 0.052);

assert.equal(deriveBloodState(0), 'stable');
assert.equal(deriveBloodState(0.2), 'weakened');
assert.equal(deriveBloodState(0.5), 'critical');
assert.equal(deriveBloodState(0.75), 'unconscious');
assert.equal(deriveBloodState(1), 'dead');

console.log('Infantry combat Stage 7 blood smoke passed: wound V2 migration, reopening rules, exact 1 Hz exposure, rate changes and thresholds.');

function candidate(impactId: string, severity: WoundSeverity): WoundCandidateV1 {
  return {
    schemaVersion: 1,
    impactId,
    shotId: `${impactId}:shot`,
    projectileId: `${impactId}:projectile`,
    sourceUnitId: 'source',
    affectedUnitId: 'target',
    zone: 'torso',
    severity,
    impactEnergyJoules: 2500,
    traumaScore: severity === 'critical' ? 1 : severity === 'severe' ? 0.6 : 0.2,
    bleedingRatePerSecond: severity === 'critical' ? 0.0104 : severity === 'severe' ? 0.0039 : 0,
    functionalPenalty: severity === 'critical' ? 1 : severity === 'severe' ? 0.6 : 0.2,
    appliedSeconds: 1,
  };
}
