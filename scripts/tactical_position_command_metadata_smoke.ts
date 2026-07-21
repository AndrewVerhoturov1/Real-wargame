import assert from 'node:assert/strict';
import {
  createPlayerMoveCommand,
  normalizePlayerCommand,
  withPlayerCommandTacticalPositionMetadata,
} from '../src/core/orders/PlayerCommand';

const command = withPlayerCommandTacticalPositionMetadata(
  createPlayerMoveCommand(
    'unit-1',
    { x: 12.5, y: 8.5 },
    null,
    1000,
    'normal',
    null,
    Math.PI / 3,
    'prone',
    'crouched',
  ),
  {
    kind: 'firing',
    requestIdentity: 'request-identity-42',
    candidateId: 'firing:44:prone',
  },
);

const restored = normalizePlayerCommand(JSON.parse(JSON.stringify(command)), 'unit-1');
assert.ok(restored);
assert.equal(restored.tacticalPositionKind, 'firing');
assert.equal(restored.tacticalPositionRequestIdentity, 'request-identity-42');
assert.equal(restored.tacticalPositionCandidateId, 'firing:44:prone');
assert.equal(restored.arrivalPosture, 'prone');
assert.equal(restored.approachPosture, 'crouched');
assert.ok(typeof restored.finalFacingRadians === 'number');

console.log('tactical position command metadata smoke: ok');
