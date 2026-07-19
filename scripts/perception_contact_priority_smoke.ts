import assert from 'node:assert/strict';
import {
  advanceReportedContact,
  advanceVisualContact,
  type ReportedContactInput,
} from '../src/core/perception/PerceptionContact';

const visual = advanceVisualContact(null, {
  id: 'perception:unit:rear-sound-target',
  stimulusId: 'unit:rear-sound-target',
  sourceUnitId: 'rear-sound-target',
  labelRu: 'Цель в тылу',
  position: { x: 30.5, y: 10.5 },
  evidencePerSecond: 200,
  detectionVariance: 1,
  deltaSeconds: 1,
  nowSeconds: 1,
  source: 'visual',
  explanationRu: ['Успешная зрительная проверка.'],
});

const soundInput: ReportedContactInput = {
  id: visual.id,
  stimulusId: visual.stimulusId,
  sourceUnitId: visual.sourceUnitId,
  labelRu: visual.labelRu,
  position: { x: 31.5, y: 11.5 },
  confidence: 72,
  uncertaintyCells: 10,
  nowSeconds: 1.1,
  source: 'sound',
  explanationRu: ['Одновременный звук от той же цели.'],
};

const currentVisualAfterSound = advanceReportedContact(visual, soundInput);
assert.equal(
  currentVisualAfterSound.source,
  'visual',
  'a sound cue must not downgrade a still-current visual contact',
);
assert.equal(currentVisualAfterSound.visibleNow, true);
assert.equal(currentVisualAfterSound.observedNow, true);
assert.deepEqual(currentVisualAfterSound.lastKnownPosition, visual.lastKnownPosition);
assert.equal(currentVisualAfterSound.uncertaintyCells, visual.uncertaintyCells);

const rememberedVisual = {
  ...visual,
  visibleNow: false,
  observedNow: false,
};
const rememberedVisualAfterSound = advanceReportedContact(rememberedVisual, soundInput);
assert.equal(
  rememberedVisualAfterSound.source,
  'sound',
  'sound may refresh a visual contact after current observation has actually expired',
);
assert.equal(rememberedVisualAfterSound.visibleNow, false);
assert.equal(rememberedVisualAfterSound.observedNow, false);
assert.deepEqual(rememberedVisualAfterSound.lastKnownPosition, soundInput.position);
assert.equal(rememberedVisualAfterSound.uncertaintyCells, soundInput.uncertaintyCells);

console.log('Perception contact priority smoke passed.');
