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
assert.deepEqual(restored.target, { x: 12.5, y: 8.5 });
assert.equal(restored.tacticalPositionKind, 'firing');
assert.equal(restored.tacticalPositionRequestIdentity, 'request-identity-42');
assert.equal(restored.tacticalPositionCandidateId, 'firing:44:prone');
assert.equal(restored.arrivalPosture, 'prone');
assert.equal(restored.approachPosture, 'crouched');
assert.ok(typeof restored.finalFacingRadians === 'number');

const ordinary = createPlayerMoveCommand('unit-2', { x: 3.5, y: 4.5 }, null, 2000, 'normal');
const restoredOrdinary = normalizePlayerCommand(JSON.parse(JSON.stringify(ordinary)), 'unit-2');
assert.ok(restoredOrdinary);
assert.equal(restoredOrdinary.arrivalPosture, undefined);
assert.equal(restoredOrdinary.approachPosture, undefined);
assert.equal(restoredOrdinary.tacticalPositionKind, undefined);
assert.equal(restoredOrdinary.tacticalPositionRequestIdentity, undefined);
assert.equal(restoredOrdinary.tacticalPositionCandidateId, undefined);
assert.equal(restoredOrdinary.tacticalPositionOccupationStatus, undefined);

const restoredLegacy = normalizePlayerCommand({
  id: 'legacy-command',
  unitId: 'unit-3',
  type: 'move_to_position',
  target: { x: 1.5, y: 2.5 },
  movementMode: 'normal',
  status: 'active',
  revision: 1,
  issuedAtMs: 0,
  reason: 'Legacy command',
  reasonRu: 'Старый приказ',
}, 'unit-3');
assert.ok(restoredLegacy);
assert.deepEqual(restoredLegacy.target, { x: 1.5, y: 2.5 });
assert.equal(restoredLegacy.arrivalPosture, undefined);
assert.equal(restoredLegacy.finalFacingRadians, undefined);
assert.equal(restoredLegacy.tacticalPositionKind, undefined);
assert.equal(restoredLegacy.tacticalPositionRequestIdentity, undefined);
assert.equal(restoredLegacy.tacticalPositionCandidateId, undefined);

console.log('tactical position command metadata smoke: ok');
