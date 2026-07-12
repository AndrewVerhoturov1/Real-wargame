import assert from 'node:assert/strict';
import {
  advanceVisualContact,
  createStableDetectionVariance,
  normalizePerceptionKnowledge,
} from '../src/core/perception/PerceptionContact';

const firstVariance = createStableDetectionVariance('observer', 'target', 10);
const secondVariance = createStableDetectionVariance('observer', 'target', 10);
assert.equal(firstVariance, secondVariance, 'same observer/target episode must keep the same variance');
assert.ok(firstVariance >= 0.9 && firstVariance <= 1.1, 'variance must stay inside ±10%');
assert.notEqual(firstVariance, createStableDetectionVariance('observer', 'other-target', 10));

const singleStep = advanceVisualContact(null, {
  id: 'contact:single',
  stimulusId: 'target',
  labelRu: 'Цель',
  position: { x: 4, y: 4 },
  evidencePerSecond: 40,
  detectionVariance: firstVariance,
  deltaSeconds: 2,
  nowSeconds: 2,
});
let manySteps = null;
for (let index = 0; index < 20; index += 1) {
  manySteps = advanceVisualContact(manySteps, {
    id: 'contact:many',
    stimulusId: 'target',
    labelRu: 'Цель',
    position: { x: 4, y: 4 },
    evidencePerSecond: 40,
    detectionVariance: firstVariance,
    deltaSeconds: 0.1,
    nowSeconds: (index + 1) * 0.1,
  });
}
assert.ok(manySteps);
assert.ok(Math.abs(singleStep.evidence - manySteps.evidence) < 0.001, 'detection accumulation must be frame-rate independent');
assert.equal(singleStep.detectionVariance, firstVariance);
assert.equal(manySteps.detectionVariance, firstVariance);

const restored = normalizePerceptionKnowledge({ contacts: [singleStep] });
assert.equal(restored.contacts[0].detectionVariance, firstVariance, 'scene import must preserve variance');
const legacy = normalizePerceptionKnowledge({ contacts: [{ ...singleStep, detectionVariance: undefined }] });
assert.equal(legacy.contacts[0].detectionVariance, 1, 'legacy scenes must use neutral variance');

console.log('Perception variance smoke passed: deterministic, bounded, frame-rate independent and import-safe.');
