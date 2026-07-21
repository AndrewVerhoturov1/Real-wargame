import assert from 'node:assert/strict';
import {
  createDefaultTacticalPositionNodeParameters,
  readTacticalPositionNodeSettings,
  tacticalPositionSearchSettingsDigest,
} from '../src/core/tactical/TacticalPositionNodeSettings';
import {
  attachTacticalPositionSearchSettings,
  readTacticalPositionSearchSettings,
} from '../src/core/tactical/TacticalPositionNodeSettingsTransport';

const base = readTacticalPositionNodeSettings({
  ...createDefaultTacticalPositionNodeParameters('firing', 'advance_to_threat'),
  movementObjectiveWeight: 0.73,
  dangerWeight: 1.8,
  exactRayLimit: 47,
  maximumRouteCost: 54321,
}).search;
const target = attachTacticalPositionSearchSettings({
  mode: 'known_target',
  point: { x: 18.25, y: 9.75 },
  minimumRangeMeters: 10,
  effectiveRangeMeters: 280,
  maximumRangeMeters: 600,
}, base);

const workerClone = structuredClone(target);
const received = readTacticalPositionSearchSettings(workerClone);
assert.ok(received);
assert.deepEqual(received, base, 'worker structured clone must preserve every normalized setting');
assert.equal(received.searchBudget.exactRayLimit, 47);
assert.equal(received.searchBudget.maximumRouteCost, 54321);
assert.equal(received.ranking.movementObjectiveWeight, 0.73);
assert.equal(received.ranking.weights.danger, 1.8);
assert.equal('nodeSearchSettings' in target, true);
assert.equal(JSON.stringify(target).includes('nodeSearchSettings'), true, 'service JSON cloning must preserve settings');

const changed = readTacticalPositionNodeSettings({
  ...createDefaultTacticalPositionNodeParameters('firing', 'advance_to_threat'),
  movementObjectiveWeight: 0,
}).search;
assert.notEqual(
  tacticalPositionSearchSettingsDigest(base),
  tacticalPositionSearchSettingsDigest(changed),
  'changing subjective settings must create a new identity digest',
);

const buffers = collectArrayBuffers(received);
assert.equal(buffers.length, 0, 'settings must not own or detach worker transfer buffers');
console.log('tactical position settings transport smoke passed');

function collectArrayBuffers(value: unknown, found: ArrayBuffer[] = []): ArrayBuffer[] {
  if (value instanceof ArrayBuffer) found.push(value);
  else if (Array.isArray(value)) value.forEach((entry) => collectArrayBuffers(entry, found));
  else if (value && typeof value === 'object') Object.values(value as Record<string, unknown>).forEach((entry) => collectArrayBuffers(entry, found));
  return found;
}
