import assert from 'node:assert/strict';
import { loadTypescriptModule } from './combat_lab_participant_test_support.mjs';

const { MapInputOwnership } = loadTypescriptModule('src/input/MapInputOwnership.ts');
const ownership = new MapInputOwnership();
assert.equal(ownership.currentOwnerId, null);
const authoring = ownership.acquire('combat-lab-authoring');
assert.ok(authoring);
assert.equal(ownership.isOwnedBy('combat-lab-authoring'), true);
assert.equal(ownership.acquire('tactical-orders'), null, 'radial input must not start while authoring owns the map');
authoring.release();
const tactical = ownership.acquire('tactical-orders');
assert.ok(tactical);
assert.equal(ownership.acquire('combat-lab-authoring'), null, 'authoring must not steal an active tactical gesture');
tactical.release();
const next = ownership.acquire('combat-lab-authoring');
assert.ok(next);
ownership.release('combat-lab-authoring');
assert.equal(ownership.currentOwnerId, null);
next.release();
assert.equal(ownership.currentOwnerId, null, 'stale lease release must be harmless');

console.log('combat_lab_map_input_ownership_smoke: PASS');
