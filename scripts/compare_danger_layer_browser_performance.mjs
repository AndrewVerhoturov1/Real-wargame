import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';

const [beforePath, afterPath, outputPath] = process.argv.slice(2);
assert.ok(beforePath && afterPath && outputPath, 'usage: node compare_danger_layer_browser_performance.mjs <before.json> <after.json> <comparison.json>');

const before = JSON.parse(readFileSync(beforePath, 'utf8'));
const after = JSON.parse(readFileSync(afterPath, 'utf8'));
const coldBefore = before.awareness?.maxBuildMs ?? null;
const coldAfter = after.awareness?.maxBuildMs ?? null;
const coldReductionPercent = typeof coldBefore === 'number' && coldBefore > 0 && typeof coldAfter === 'number'
  ? Math.round((1 - coldAfter / coldBefore) * 10_000) / 100
  : null;
const sceneP95ReductionPercent = before.sceneUpdateMs.p95 > 0
  ? Math.round((1 - after.sceneUpdateMs.p95 / before.sceneUpdateMs.p95) * 10_000) / 100
  : null;
const sceneMaxReductionPercent = before.sceneUpdateMs.max > 0
  ? Math.round((1 - after.sceneUpdateMs.max / before.sceneUpdateMs.max) * 10_000) / 100
  : null;

const acceptance = {
  effectiveFpsAtLeast50: after.effectiveFps >= 50,
  frameP95AtMost22Ms: after.frameMs.p95 <= 22,
  sceneUpdateP95AtMost10Ms: after.sceneUpdateMs.p95 <= 10,
  noSteadySceneUpdateOver50Ms: after.sceneUpdateMs.max <= 50,
  noSteadyLongTaskOver100Ms: after.longTasksOver100Ms === 0,
  coldBuildAccepted: typeof coldAfter === 'number' && (
    coldAfter <= 100
    || (
      typeof coldBefore === 'number'
      && coldBefore > 0
      && coldAfter <= 150
      && coldAfter <= coldBefore * 0.30
    )
  ),
};
const comparison = {
  before,
  after,
  reductions: {
    coldBuildPercent: coldReductionPercent,
    sceneUpdateP95Percent: sceneP95ReductionPercent,
    sceneUpdateMaxPercent: sceneMaxReductionPercent,
  },
  acceptance,
  accepted: Object.values(acceptance).every(Boolean),
};
writeFileSync(outputPath, `${JSON.stringify(comparison, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(comparison, null, 2));

if (!comparison.accepted) {
  const failed = Object.entries(acceptance).filter(([, value]) => !value).map(([key]) => key);
  throw new Error(`Danger layer browser performance acceptance failed: ${failed.join(', ')}`);
}
