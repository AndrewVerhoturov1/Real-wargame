import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';

const [beforePath, afterPath, outputPath] = process.argv.slice(2);
assert.ok(beforePath && afterPath && outputPath, 'usage: node compare_danger_layer_browser_performance.mjs <before.json> <after.json> <comparison.json>');

const before = JSON.parse(readFileSync(beforePath, 'utf8'));
const after = JSON.parse(readFileSync(afterPath, 'utf8'));
const coldBefore = before.awareness?.maxBuildMs ?? null;
const coldAfter = after.awareness?.maxBuildMs ?? null;
const coldReductionPercent = typeof coldBefore === 'number' && coldBefore > 0 && typeof coldAfter === 'number'
  ? percentReduction(coldBefore, coldAfter)
  : null;
const steadyP95ReductionPercent = before.steadyDynamicUpdateMs.p95 > 0
  ? percentReduction(before.steadyDynamicUpdateMs.p95, after.steadyDynamicUpdateMs.p95)
  : null;
const steadyMaxReductionPercent = before.steadyDynamicUpdateMs.max > 0
  ? percentReduction(before.steadyDynamicUpdateMs.max, after.steadyDynamicUpdateMs.max)
  : null;
const sceneP95ReductionPercent = before.sceneUpdateMs.p95 > 0
  ? percentReduction(before.sceneUpdateMs.p95, after.sceneUpdateMs.p95)
  : null;

const acceptance = {
  browserEffectiveFpsAtLeast50: after.browserEffectiveFps >= 50,
  browserRafP95AtMost22Ms: after.browserRafMs.p95 <= 22,
  sceneUpdateP95AtMost10Ms: after.sceneUpdateMs.p95 <= 10,
  noRepeatedSceneUpdateOver50Ms: after.sceneUpdateMs.max <= 50,
  steadyDynamicUpdateP95AtMost10Ms: after.steadyDynamicUpdateMs.p95 <= 10,
  noSteadyDynamicUpdateOver50Ms: after.steadyDynamicUpdateMs.max <= 50,
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
    steadyDynamicUpdateP95Percent: steadyP95ReductionPercent,
    steadyDynamicUpdateMaxPercent: steadyMaxReductionPercent,
    sceneUpdateP95Percent: sceneP95ReductionPercent,
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

function percentReduction(beforeValue, afterValue) {
  return Math.round((1 - afterValue / beforeValue) * 10_000) / 100;
}
