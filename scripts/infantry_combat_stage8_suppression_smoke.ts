import assert from 'node:assert/strict';
import {
  SUPPRESSION_UPDATE_INTERVAL_SECONDS,
  addSuppressionEvent,
  advanceSuppressionRuntimeTo,
  createUnitSuppressionRuntime,
  normalizeUnitSuppressionRuntime,
  serializeUnitSuppressionRuntime,
  type SuppressionEventV1,
} from '../src/core/infantry-combat/runtime';

verifyHalfOpenWindows();
verifyDuplicateAndSourceAggregation();
verifyDeterministicDecayAndSaveLoad();

console.log('Infantry combat Stage 8 suppression smoke passed: half-open 0.2 s windows, idempotent physical events, source aggregation, deterministic decay and save/load.');

function verifyHalfOpenWindows(): void {
  assert.equal(SUPPRESSION_UPDATE_INTERVAL_SECONDS, 0.2);
  const runtime = createUnitSuppressionRuntime(0);
  addSuppressionEvent(runtime, event('old-window', 'source-a', 0.1, 'near_miss', 1, 0.1));
  assert.equal(runtime.suppressionLevel, 0);
  advanceSuppressionRuntimeTo(runtime, 0.199999999);
  assert.equal(runtime.suppressionLevel, 0);
  advanceSuppressionRuntimeTo(runtime, 0.2);
  assert.ok(runtime.suppressionLevel > 0);
  const afterFirst = runtime.suppressionLevel;

  addSuppressionEvent(runtime, event('new-window', 'source-a', 0.2, 'near_impact', 1, 0.18));
  advanceSuppressionRuntimeTo(runtime, 0.399999999);
  assert.ok(runtime.suppressionLevel <= afterFirst, 'event exactly at boundary belongs to the new window');
  advanceSuppressionRuntimeTo(runtime, 0.4);
  assert.ok(runtime.suppressionLevel > afterFirst - 0.05, 'new-window event must commit at the following boundary');
}

function verifyDuplicateAndSourceAggregation(): void {
  const runtime = createUnitSuppressionRuntime(0);
  const first = event('duplicate', 'source-a', 0.05, 'near_miss', 0.5, 0.1);
  assert.equal(addSuppressionEvent(runtime, first), true);
  assert.equal(addSuppressionEvent(runtime, first), false);
  assert.equal(runtime.pendingSources.length, 1);
  assert.equal(runtime.pendingSources[0]?.nearMissCount, 1);

  addSuppressionEvent(runtime, event('source-b-event', 'source-b', 0.1, 'direct_hit', 0, 0.3));
  advanceSuppressionRuntimeTo(runtime, 0.2);
  assert.equal(runtime.sourceCountEstimate, 2);
  assert.equal(runtime.lastEventKind, 'direct_hit');
  assert.ok(runtime.shock > 0);
  assert.ok(runtime.suppressionLevel > 0);
}

function verifyDeterministicDecayAndSaveLoad(): void {
  const original = createUnitSuppressionRuntime(0);
  addSuppressionEvent(original, event('save-event', 'source-a', 0.15, 'near_impact', 1, 0.18, 0.8));
  const snapshot = serializeUnitSuppressionRuntime(original);
  const restored = normalizeUnitSuppressionRuntime(JSON.parse(JSON.stringify(snapshot)), 0.15);
  assert.deepEqual(serializeUnitSuppressionRuntime(restored), snapshot);
  advanceSuppressionRuntimeTo(original, 0.8);
  advanceSuppressionRuntimeTo(restored, 0.8);
  assert.deepEqual(serializeUnitSuppressionRuntime(restored), serializeUnitSuppressionRuntime(original));
  const level = restored.suppressionLevel;
  const shock = restored.shock;
  advanceSuppressionRuntimeTo(restored, 2.8);
  assert.ok(restored.suppressionLevel < level);
  assert.ok(restored.shock < shock);
  assert.ok(restored.suppressionLevel >= 0 && restored.suppressionLevel <= 1);
  assert.ok(restored.shock >= 0 && restored.shock <= 1);
}

function event(
  eventId: string,
  sourceUnitId: string,
  eventSeconds: number,
  kind: SuppressionEventV1['kind'],
  distanceMetres: number,
  baseImpulse: number,
  continuousFireScore = 0,
): SuppressionEventV1 {
  return Object.freeze({
    schemaVersion: 1,
    eventId,
    sourceUnitId,
    affectedUnitId: 'affected',
    shotId: `${eventId}:shot`,
    projectileId: `${eventId}:projectile`,
    kind,
    eventSeconds,
    distanceMetres,
    incomingDirection: { x: -1, y: 0, z: 0 },
    continuousFireScore,
    baseImpulse,
  });
}
