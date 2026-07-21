import assert from 'node:assert/strict';
import { normalizeMap } from '../src/core/map/MapModel';
import {
  buildTacticalPositionQueryField,
  type TacticalPositionQuerySubjectiveFieldSnapshot,
} from '../src/core/tactical/TacticalPositionQueryWorkerProtocol';
import { buildHighQualityStaticTacticalPositionBasis } from '../src/core/tactical/static/HighQualityStaticTacticalPositionBuilder';
import { createStaticTacticalPositionBasisIdentity } from '../src/core/tactical/static/StaticTacticalPositionIdentity';
import { createDefaultStaticTacticalPositionSettings } from '../src/core/tactical/static/StaticTacticalPositionSettings';
import { staticTacticalPositionWorkerTransferables } from '../src/core/tactical/static/StaticTacticalPositionWorkerProtocol';

verifySubjectiveFieldCopiesBeforeTransfer();
verifyStaticBasisTransferListIsUniqueAndComplete();

console.log('tactical position worker transfer smoke: ok');

function verifySubjectiveFieldCopiesBeforeTransfer(): void {
  const source = sourceField();
  const copy = buildTacticalPositionQueryField(source);
  const keys = fieldArrayKeys();
  for (const key of keys) {
    assert.notEqual(copy[key], source[key], `${key} must be a distinct typed array`);
    assert.notEqual(copy[key].buffer, source[key].buffer, `${key} must own a distinct ArrayBuffer`);
    assert.deepEqual(copy[key], source[key], `${key} contents must be preserved`);
  }
  const transferables = keys.map((key) => copy[key].buffer);
  assert.equal(new Set(transferables).size, transferables.length, 'subjective transfer list must not contain duplicate buffers');
  const transferred = structuredClone(copy, { transfer: transferables }) as TacticalPositionQuerySubjectiveFieldSnapshot;
  for (const key of keys) {
    assert.equal(copy[key].byteLength, 0, `${key} copy should be detached by the transfer simulation`);
    assert.ok(source[key].byteLength > 0, `${key} source must remain usable after the copy is transferred`);
    assert.deepEqual(transferred[key], source[key]);
  }
}

function verifyStaticBasisTransferListIsUniqueAndComplete(): void {
  const settings = createDefaultStaticTacticalPositionSettings();
  const map = normalizeMap({
    width: 3,
    height: 2,
    cellSize: 4,
    metersPerCell: 2,
    defaultTerrain: 'field',
    defaultHeight: 0,
  });
  const identity = createStaticTacticalPositionBasisIdentity(map, settings);
  const snapshot = buildHighQualityStaticTacticalPositionBasis(map, identity, settings).snapshot;
  const transferables = staticTacticalPositionWorkerTransferables({
    type: 'result',
    jobId: 1,
    identity,
    snapshot,
  });
  assert.equal(transferables.length, 29, '14 basis arrays and 15 candidate-index arrays must be transferred');
  assert.equal(new Set(transferables).size, transferables.length, 'static transfer list must not contain duplicate buffers');
  assert.ok(transferables.every((value) => value instanceof ArrayBuffer));
}

function sourceField(): TacticalPositionQuerySubjectiveFieldSnapshot {
  return {
    width: 2,
    height: 2,
    metersPerCell: 2,
    passable: new Uint8Array([1, 1, 0, 1]),
    movementCost: new Float32Array([1, 2, 3, 4]),
    danger: new Uint8Array([4, 3, 2, 1]),
    suppression: new Uint8Array([1, 2, 3, 4]),
    concealment: new Uint8Array([5, 6, 7, 8]),
    safety: new Uint8Array([8, 7, 6, 5]),
    expectedProtectionAgainstThreat: new Uint8Array([9, 10, 11, 12]),
    uncertainty: new Uint8Array([12, 11, 10, 9]),
    reverseSlopeQuality: new Uint8Array([13, 14, 15, 16]),
    forwardSlopeRisk: new Uint8Array([16, 15, 14, 13]),
    staticProtectionStanding: new Uint8Array([17, 18, 19, 20]),
    staticProtectionCrouched: new Uint8Array([21, 22, 23, 24]),
    staticProtectionProne: new Uint8Array([25, 26, 27, 28]),
  };
}

function fieldArrayKeys(): ReadonlyArray<keyof Omit<TacticalPositionQuerySubjectiveFieldSnapshot, 'width' | 'height' | 'metersPerCell'>> {
  return [
    'passable', 'movementCost', 'danger', 'suppression', 'concealment', 'safety',
    'expectedProtectionAgainstThreat', 'uncertainty', 'reverseSlopeQuality', 'forwardSlopeRisk',
    'staticProtectionStanding', 'staticProtectionCrouched', 'staticProtectionProne',
  ];
}
