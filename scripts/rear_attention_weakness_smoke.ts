import assert from 'node:assert/strict';
import {
  DEFAULT_ATTENTION_PROFILES,
  REAR_ATTENTION_WEIGHT,
  sampleAttentionWeight,
} from '../src/core/perception/AttentionModel';
import {
  calculateAttentionVisualRangeFactor,
  evaluateCellVisibilityQuality,
} from '../src/core/visibility/VisibilityQuality';
import type { SelectedUnitVisibilityField } from '../src/core/visibility/SelectedUnitVisibilityField';
import { drawVisibilityRaster } from '../src/rendering/PixiVisibilityHeatmapRenderer';

const profile = DEFAULT_ATTENTION_PROFILES.observe;
const front = sampleAttentionWeight(profile, 0);
const side = sampleAttentionWeight(profile, 90);
const rearEdge = sampleAttentionWeight(profile, 135);
const rear = sampleAttentionWeight(profile, 180);

assert.equal(front.rear, false);
assert.equal(rear.rear, true);
assert.ok(front.weight > side.weight, 'front attention must be stronger than side attention');
assert.ok(side.weight > rear.weight, 'side attention must be stronger than rear attention');
assert.ok(rear.weight <= REAR_ATTENTION_WEIGHT + 1e-9, 'rear weight must be capped by the canonical weak rear value');
assert.ok((rear.evidenceFactor ?? 1) <= 0.2 + 1e-9, 'observe rear checks must represent brief glimpses, not continuous observation');
assert.equal(front.evidenceFactor, 1, 'front sampling must remain unchanged');
assert.ok(rearEdge.weight > rear.weight, 'front-to-side-to-rear transition must remain gradual');

const frontRangeFactor = calculateAttentionVisualRangeFactor(front.weight);
const sideRangeFactor = calculateAttentionVisualRangeFactor(side.weight);
const rearRangeFactor = calculateAttentionVisualRangeFactor(rear.weight);
assert.ok(frontRangeFactor >= 0.99, 'front must retain full visual range');
assert.ok(sideRangeFactor >= 0.5 && sideRangeFactor <= 0.75, 'side range must be materially shorter than front');
assert.ok(rearRangeFactor >= 0.15 && rearRangeFactor <= 0.3, 'rear range must be a short fraction of full visual range');

const vision = {
  maximumVisualRangeMeters: 600,
  distanceFalloffStartMeters: 80,
  distanceFalloffExponent: 1.6,
  detectionVariancePercent: 0,
};
const frontFar = evaluateCellVisibilityQuality({
  blocked: false,
  visualTransmission: 1,
  distanceMeters: 250,
  attentionWeight: front.weight,
  observerCondition: 1,
  vision,
});
const rearFar = evaluateCellVisibilityQuality({
  blocked: false,
  visualTransmission: 1,
  distanceMeters: 250,
  attentionWeight: rear.weight,
  observerCondition: 1,
  vision,
});
const rearClose = evaluateCellVisibilityQuality({
  blocked: false,
  visualTransmission: 1,
  distanceMeters: 60,
  attentionWeight: rear.weight,
  observerCondition: 1,
  vision,
});
const rearBlocked = evaluateCellVisibilityQuality({
  blocked: true,
  visualTransmission: 1,
  distanceMeters: 20,
  attentionWeight: rear.weight,
  observerCondition: 1,
  vision,
});

assert.ok(frontFar.quality01 > 0, 'front target inside full range must remain visually available');
assert.equal(rearFar.quality01, 0, 'far rear target must remain black and unavailable to gameplay perception');
assert.ok(rearClose.quality01 > 0, 'close rear target may create a weak visual signal');
assert.ok(rearClose.quality01 < 0.04, 'close rear signal must remain very weak');
assert.equal(rearBlocked.quality01, 0, 'hard blockers must still eliminate rear visibility');

const rasterField: SelectedUnitVisibilityField = {
  observerId: 'smoke-observer',
  originCellX: 0,
  originCellY: 0,
  minCellX: 0,
  minCellY: 0,
  width: 2,
  height: 1,
  quality: new Uint8Array([0, 1]),
  blocker: new Uint8Array(2),
  revision: 1,
  calculationKey: 'rear-attention-smoke',
  mapVisualRevision: 1,
  builtAtSeconds: 0,
};
let rasterData: Uint8ClampedArray | null = null;
const rasterContext = {
  createImageData(width: number, height: number) {
    return {
      width,
      height,
      data: new Uint8ClampedArray(width * height * 4),
      colorSpace: 'srgb',
    } as ImageData;
  },
  putImageData(image: ImageData) {
    rasterData = image.data;
  },
} as unknown as CanvasRenderingContext2D;

drawVisibilityRaster(rasterContext, rasterField, 2, 1);
assert.ok(rasterData, 'raster output must be published');
assert.deepEqual(
  Array.from(rasterData.slice(0, 4)),
  [0, 0, 0, 255],
  'exactly zero visibility must be fully opaque black',
);
assert.ok(
  rasterData[4] !== 0 || rasterData[5] !== 0 || rasterData[6] !== 0,
  'every positive machine visibility value must retain a visible heatmap colour',
);

console.log(JSON.stringify({
  status: 'passed',
  profile: 'observe',
  weights: { front: front.weight, side: side.weight, rear: rear.weight },
  evidenceFactors: { front: front.evidenceFactor, side: side.evidenceFactor, rear: rear.evidenceFactor },
  visualRangeFactors: { front: frontRangeFactor, side: sideRangeFactor, rear: rearRangeFactor },
  effectiveRangesMeters: {
    front: vision.maximumVisualRangeMeters * frontRangeFactor,
    side: vision.maximumVisualRangeMeters * sideRangeFactor,
    rear: vision.maximumVisualRangeMeters * rearRangeFactor,
  },
  quality: { frontFar: frontFar.quality01, rearFar: rearFar.quality01, rearClose: rearClose.quality01 },
  raster: {
    unseen: Array.from(rasterData.slice(0, 4)),
    weakestPositive: Array.from(rasterData.slice(4, 8)),
  },
}, null, 2));
