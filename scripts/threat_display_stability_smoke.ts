import assert from 'node:assert/strict';
import {
  buildThreatDisplayEntries,
  buildThreatGeometryKey,
  buildThreatMarkerKey,
} from '../src/core/knowledge/ThreatDisplayModel';
import type { PerceptionContactMemory } from '../src/core/perception/PerceptionContact';
import type { KnownThreatMemory, UnitModel } from '../src/core/units/UnitModel';

const memory: KnownThreatMemory = {
  id: 'mg-1', labelRu: 'Пулемёт', mode: 'directional_fire', x: 10, y: 8,
  radiusCells: 0, widthCells: 0, heightCells: 0, rotationDegrees: 0,
  strength: 90, suppression: 85, stressPerSecond: 5,
  directionDegrees: 45, arcDegrees: 30, rangeCells: 25, minRangeCells: 2,
  falloffPercent: 40, confidence: 74, uncertaintyCells: 2,
  source: 'seen', visibleNow: false, lastSeenSeconds: 10, lastUpdatedSeconds: 11,
};
const visible = { ...memory, visibleNow: true, confidence: 75 };
assert.equal(buildThreatGeometryKey([memory], 24), buildThreatGeometryKey([visible], 24), 'visibility confirmation must not rebuild threat geometry');
assert.notEqual(buildThreatMarkerKey([memory], 24), buildThreatMarkerKey([visible], 24), 'current confirmation marker must update separately');

const contact: PerceptionContactMemory = {
  id: 'perception:threat:mg-1', stimulusId: 'threat:mg-1', labelRu: 'Пулемёт',
  stage: 'identified', source: 'visual', evidence: 125, confidence: 83,
  uncertaintyCells: 1, lastKnownPosition: { x: 10, y: 8 }, visibleNow: true,
  observedNow: true, lastObservedSeconds: 11, lastUpdatedSeconds: 11,
  evidencePerSecond: 20, detectionVariance: 1, explanationRu: [],
};
const fakeUnit = {
  perceptionKnowledge: { contacts: [contact], revision: 1, lastUpdatedSeconds: 11 },
  tacticalKnowledge: { threats: [memory], revision: 1, lastUpdatedSeconds: 11 },
} as UnitModel;
let entries = buildThreatDisplayEntries(fakeUnit);
assert.equal(entries.length, 1, 'visual contact and memory for the same threat must deduplicate');
assert.equal(entries[0].labelRu, 'Пулемёт');
assert.equal(entries[0].current, true);

fakeUnit.perceptionKnowledge.contacts = [];
entries = buildThreatDisplayEntries(fakeUnit);
assert.equal(entries.length, 1, 'memory fallback must keep the threat label visible');
assert.equal(entries[0].labelRu, 'Пулемёт');
assert.equal(entries[0].current, false);

console.log('Threat display stability smoke passed.');
