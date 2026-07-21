import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const orders = readFileSync('src/core/tactical/TacticalPositionOrders.ts', 'utf8');
assert.ok(orders.includes('approachPosture,'), 'approach posture must remain serialized in the common movement command');
assert.ok(!orders.includes('applyApproachPosture('), 'tactical order issue must not apply posture immediately');
assert.ok(!orders.includes('unit.behaviorRuntime.posture ='), 'tactical order issue must not bypass common posture handling');

console.log('tactical position posture path smoke: ok');
