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

const computation = after.computation ?? {};
const threatRelativeCover = computation.threatRelativeCover ?? {};
const directionalTactical = computation.directionalTactical ?? {};
const awarenessStatic = computation.awarenessStatic ?? {};
const soldierDanger = after.soldierDangerField ?? {};
const initialDanger = soldierDanger.initial ?? {};
const afterRescoreDanger = soldierDanger.afterRescore ?? {};
const afterGeometryMoveDanger = soldierDanger.afterGeometryMove ?? {};
const finalReportDanger = computation.soldierDangerField ?? {};

const acceptance = {
  sceneUpdateP95AtMost10Ms: after.sceneUpdateMs.p95 <= 10,
  noRepeatedSceneUpdateOver50Ms: after.sceneUpdateMs.max <= 50,
  steadyDynamicMutationP95AtMost10Ms: after.steadyDynamicUpdateMs.p95 <= 10,
  noSteadyDynamicMutationOver50Ms: after.steadyDynamicUpdateMs.max <= 50,
  coldBuildAccepted: typeof coldAfter === 'number' && (
    coldAfter <= 100
    || (
      typeof coldBefore === 'number'
      && coldBefore > 0
      && coldAfter <= 150
      && coldAfter <= coldBefore * 0.30
    )
  ),
  oneThreatRelativeCoverScanPerPreparedThreat: threatRelativeCover.fullMapScanCount <= 4,
  oneDirectionalSectorBasisBuild: directionalTactical.basisBuildCount <= 1,
  oneStaticAwarenessBuild: awarenessStatic.buildCount <= 1,
  severalClassifiedThreatsExercised: (soldierDanger.classifiedThreatCount ?? 0) >= 3,
  initialThreatGeometriesPrepared: (initialDanger.geometryBuildCount ?? 0) >= 3,
  confidenceRescoreReusesGeometry: soldierDanger.rescoreGeometryBuildDelta === 0,
  confidenceRescoreAvoidsGeometryScans: soldierDanger.rescoreFullMapScanDelta === 0,
  confidenceRescoreBuildsScoredFields: (soldierDanger.rescoreFieldBuildDelta ?? 0) > 0,
  oneMovedThreatBuildsOneGeometry: soldierDanger.geometryMoveBuildDelta === 1,
  oneMovedThreatPerformsOneGeometryScan: soldierDanger.geometryMoveFullMapScanDelta === 1,
  movedThreatBuildsScoredField: (soldierDanger.geometryMoveFieldBuildDelta ?? 0) > 0,
  boundedThreatGeometryCache: (afterGeometryMoveDanger.cachedThreatGeometryCount ?? Infinity) <= 24,
  boundedScoredFieldCache: (afterGeometryMoveDanger.cachedFieldCount ?? Infinity) <= 12,
  retainedTypedArraysWithinDeclaredBound: (afterGeometryMoveDanger.retainedTypedArrayBytes ?? Infinity)
    <= (soldierDanger.maximumRetainedTypedArrayBytes ?? -1),
  performanceReportPublishesExactDangerCounters: sameDangerDiagnostics(afterGeometryMoveDanger, finalReportDanger),
};

const rendererTelemetry = {
  status: 'diagnostic-only-on-github-hosted-headless-chromium',
  reason: 'The GitHub runner has no representative hardware WebGL path. RAF/FPS/long-task values are retained for A/B evidence but do not gate the CPU danger-layer contract.',
  browserEffectiveFpsAtLeast50: after.browserEffectiveFps >= 50,
  browserRafP95AtMost22Ms: after.browserRafMs.p95 <= 22,
  noSteadyLongTaskOver100Ms: after.longTasksOver100Ms === 0,
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
  rendererTelemetry,
  accepted: Object.values(acceptance).every(Boolean),
};
writeFileSync(outputPath, `${JSON.stringify(comparison, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(comparison, null, 2));

if (!comparison.accepted) {
  const failed = Object.entries(acceptance).filter(([, value]) => !value).map(([key]) => key);
  throw new Error(`Danger layer browser CPU acceptance failed: ${failed.join(', ')}`);
}

function sameDangerDiagnostics(left, right) {
  return [
    'geometryBuildCount',
    'fieldBuildCount',
    'geometryCacheHitCount',
    'fieldCacheHitCount',
    'cachedThreatGeometryCount',
    'cachedFieldCount',
    'fullMapScanCount',
    'retainedTypedArrayBytes',
  ].every((key) => left?.[key] === right?.[key]);
}

function percentReduction(beforeValue, afterValue) {
  return Math.round((1 - afterValue / beforeValue) * 10_000) / 100;
}
