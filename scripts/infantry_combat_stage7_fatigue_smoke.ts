import assert from 'node:assert/strict';
import {
  applyFatigueBoundary,
  calculateFatigueFactorSample,
  createFatigueRuntime,
  sampleFatigueRateForNextInterval,
} from '../src/core/infantry-combat/runtime';

const rest = calculateFatigueFactorSample({
  actualMovementSpeedMetresPerSecond: 0,
  referenceRunSpeedMetresPerSecond: 4,
  posture: 'standing',
  isAiming: false,
  isApplyingFirstAid: false,
  isHeavyWeaponActive: false,
  isDeployActionActive: false,
  woundBurden: 0,
  bloodState: 'stable',
});
assert.equal(rest.netRatePerSecond, -0.02);

const moving = calculateFatigueFactorSample({
  actualMovementSpeedMetresPerSecond: 4,
  referenceRunSpeedMetresPerSecond: 4,
  posture: 'standing',
  isAiming: true,
  isApplyingFirstAid: true,
  isHeavyWeaponActive: false,
  isDeployActionActive: false,
  woundBurden: 0,
  bloodState: 'stable',
});
assert.equal(moving.movementIntensity, 1);
assert.equal(moving.netRatePerSecond, 0.05);

const burdened = calculateFatigueFactorSample({
  actualMovementSpeedMetresPerSecond: 4,
  referenceRunSpeedMetresPerSecond: 4,
  posture: 'prone',
  isAiming: false,
  isApplyingFirstAid: false,
  isHeavyWeaponActive: false,
  isDeployActionActive: false,
  woundBurden: 1,
  bloodState: 'critical',
});
assert.ok(burdened.netRatePerSecond > moving.netRatePerSecond);

const runtime = createFatigueRuntime(0, 0.5);
sampleFatigueRateForNextInterval(runtime, moving);
assert.equal(applyFatigueBoundary(runtime, 0.25), true);
assert.equal(runtime.fatigue, 0.5125);
assert.equal(runtime.updateCount, 1);
assert.equal(applyFatigueBoundary(runtime, 0.25), false);

sampleFatigueRateForNextInterval(runtime, rest);
assert.equal(applyFatigueBoundary(runtime, 0.5), true);
assert.equal(runtime.fatigue, 0.5075);

console.log('Infantry combat Stage 7 fatigue smoke passed: pure factors, burden multipliers, exact 4 Hz sampling and rest recovery.');
