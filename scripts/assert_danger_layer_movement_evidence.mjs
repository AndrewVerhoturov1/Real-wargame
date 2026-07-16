import fs from 'node:fs';
import process from 'node:process';

const evidencePath = process.argv[2];
if (!evidencePath) {
  console.error('Usage: node scripts/assert_danger_layer_movement_evidence.mjs <movement.json>');
  process.exit(2);
}

const evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
const failures = [];
const scenarios = new Map((evidence.scenarios ?? []).map((scenario) => [scenario.scenario, scenario]));
const expectedBranch = process.env.DANGER_PERF_EXPECTED_BRANCH ?? '';
const expectedSha = process.env.DANGER_PERF_EXPECTED_SHA ?? '';

if (evidence.version !== 'danger-layer-movement-evidence-v3') {
  failures.push(`unexpected movement evidence version: ${evidence.version ?? 'missing'}`);
}
if (evidence.build?.performanceContractVersion !== 'performance-report-v4') {
  failures.push(`unexpected performance contract: ${evidence.build?.performanceContractVersion ?? 'missing'}`);
}
if (!evidence.build?.commitSha) failures.push('movement evidence commit SHA is missing');
if (expectedBranch && evidence.build?.branch !== expectedBranch) {
  failures.push(`movement evidence branch mismatch: expected ${expectedBranch}, got ${evidence.build?.branch ?? 'missing'}`);
}
if (expectedSha && evidence.build?.commitSha !== expectedSha) {
  failures.push(`movement evidence SHA mismatch: expected ${expectedSha}, got ${evidence.build?.commitSha ?? 'missing'}`);
}
if (!evidence.build?.buildId) failures.push('movement evidence build id is missing');

for (const scenarioName of ['selected-only', 'hostile-only', 'both-six-units', 'hidden-hostile', 'wall-crossing']) {
  if (!scenarios.has(scenarioName)) failures.push(`${scenarioName} evidence is missing`);
}

assertSelectedOnly(scenarios.get('selected-only'));
assertVisibleHostile(scenarios.get('hostile-only'));
assertSixUnits(scenarios.get('both-six-units'));
assertHiddenHostile(scenarios.get('hidden-hostile'));
assertWallCrossing(scenarios.get('wall-crossing'));
assertGlobalContract();
assertLongTaskAttribution();

if (failures.length > 0) {
  console.error('Danger layer movement evidence assertion failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Danger layer movement canonical applied-worker and long-task attribution evidence assertion passed.');

function assertGlobalContract() {
  if ((evidence.sceneUpdateMs?.p95 ?? Infinity) > 10) {
    failures.push(`sceneUpdate p95 exceeded 10 ms: ${evidence.sceneUpdateMs?.p95}`);
  }
  if ((evidence.sceneUpdateMs?.max ?? Infinity) > 50) {
    failures.push(`sceneUpdate max exceeded 50 ms: ${evidence.sceneUpdateMs?.max}`);
  }
  const final = evidence.finalMovementDiagnostics;
  if (!final) {
    failures.push('final production movement diagnostics are missing');
    return;
  }
  if ((final.maxMainThreadApplyMs ?? Infinity) > 5) failures.push(`main-thread raster apply exceeded 5 ms: ${final.maxMainThreadApplyMs}`);
  if ((final.maxLocalUpdateMs ?? Infinity) > 10) failures.push(`local selected-unit update exceeded 10 ms: ${final.maxLocalUpdateMs}`);
  if ((final.maxPendingQueueDepth ?? Infinity) > 1) failures.push(`pending queue exceeded one: ${final.maxPendingQueueDepth}`);
  if (final.pendingQueueDepth !== 0) failures.push(`final pending queue is not empty: ${final.pendingQueueDepth}`);
  if (final.workerInFlight !== false) failures.push('worker remains in flight at final evidence');
  if (final.lastAppliedWorldKey !== final.lastRequestedWorldKey) failures.push('final requested/applied world keys differ');
  if (final.lastAppliedCanonicalThreatKey !== final.lastRequestedCanonicalThreatKey) failures.push('final requested/applied canonical threat keys differ');
  if (final.lastAppliedJobId !== final.lastCompletedJobId) failures.push('final applied job is not the last completed job');
  if (final.lastCompletedJobFinalExact !== true) failures.push('final completed job was not final-exact');
  if (!final.lastAppliedFieldIdentity || !final.lastAppliedRasterDigest) failures.push('final applied worker identity/digest is missing');
  if (final.lastWorkerError) failures.push(`worker error: ${final.lastWorkerError}`);
}

function assertLongTaskAttribution() {
  const attribution = evidence.longTaskAttribution;
  if (!attribution) {
    failures.push('long-task attribution evidence is missing');
    return;
  }
  if (!Array.isArray(attribution.globalLongTasks)) failures.push('global long-task list is missing');
  if (!Array.isArray(attribution.dangerAttributedLongTasks)) failures.push('danger-attributed long-task list is missing');
  if (!Array.isArray(attribution.applicationAttributedLongTasks)) failures.push('application-attributed long-task list is missing');
  if (!Array.isArray(attribution.diagnosticOnlyLongTasks)) failures.push('diagnostic-only long-task list is missing');
  if (!Array.isArray(attribution.unattributedLongTasks)) failures.push('unattributed long-task list is missing');
  if ((attribution.dangerAttributedLongTasks?.length ?? Infinity) !== 0) {
    failures.push(`${attribution.dangerAttributedLongTasks.length} danger-attributed long tasks remain`);
  }
  if ((attribution.applicationAttributedLongTasks?.length ?? Infinity) !== 0) {
    failures.push(`${attribution.applicationAttributedLongTasks.length} application-attributed long tasks remain`);
  }
  if ((attribution.unattributedLongTasks?.length ?? Infinity) !== 0) {
    failures.push(`${attribution.unattributedLongTasks.length} long tasks remain unattributed`);
  }
  if (attribution.blockingContractPassed !== true) {
    failures.push(`long-task blocking contract failed: ${(attribution.blockingFailures ?? []).join('; ') || 'unknown reason'}`);
  }
  const phases = attribution.productionPhaseMaxMs ?? {};
  if ((phases.simulationAndSceneUpdate ?? Infinity) > 50) failures.push(`simulation/scene phase exceeded 50 ms: ${phases.simulationAndSceneUpdate}`);
  if ((phases.workerResponseMainThreadHandling ?? Infinity) > 5) failures.push(`worker response handling exceeded 5 ms: ${phases.workerResponseMainThreadHandling}`);
  if ((phases.typedArrayApplyAndBaseTextureUpdate ?? Infinity) > 5) failures.push(`typed-array/texture apply exceeded 5 ms: ${phases.typedArrayApplyAndBaseTextureUpdate}`);
  if ((phases.rendererLocalSafePositionAndRouteEvaluation ?? Infinity) > 10) failures.push(`renderer-local update exceeded 10 ms: ${phases.rendererLocalSafePositionAndRouteEvaluation}`);
  for (const task of attribution.globalLongTasks ?? []) {
    if (!Number.isFinite(task.startMs) || !Number.isFinite(task.durationMs)) failures.push('long task is missing start/duration');
    if (!task.classification || !task.reason) failures.push('long task is missing classification/reason');
    if (!Array.isArray(task.overlappingProductionPhases)) failures.push('long task is missing overlapping production phase list');
    if (!Number.isFinite(task.productionOverlapDurationMs)) failures.push('long task is missing production overlap duration');
  }
}

function assertSelectedOnly(selected) {
  if (!selected) return;
  const counters = selected.counters ?? {};
  if (counters.worldSpaceMemoryStable !== true) failures.push('selected-only changed world-space threat memory during observer-only movement');
  for (const name of [
    'workerJobsStartedDelta',
    'workerThreatRelativeGeometryBuildDelta',
    'workerDirectionalFieldBuildDelta',
    'workerDirectionalBasisBuildDelta',
    'workerAwarenessGeometryBuildDelta',
    'workerAwarenessRescoreDelta',
    'worldRasterBuildDelta',
    'mainThreadRasterSwapDelta',
  ]) {
    if (counters[name] !== 0) failures.push(`selected-only ${name} must equal zero, got ${counters[name]}`);
  }
  if (!(counters.ownMovementLocalUpdateDelta > 0)) failures.push('selected-only local updates did not increase');
  if (!(counters.safePositionLocalScanDelta > 0)) failures.push('selected-only safe-position scans did not increase');
  if (counters.rasterDigestUnchanged !== true) failures.push('selected-only applied raster digest changed');
  if (selected.before?.lastRequestedCanonicalThreatKey !== selected.after?.lastRequestedCanonicalThreatKey) {
    failures.push('selected-only canonical threat key changed');
  }
  if (selected.before?.lastRequestedWorldKey !== selected.after?.lastRequestedWorldKey) {
    failures.push('selected-only world key changed');
  }
}

function assertVisibleHostile(hostile) {
  if (!hostile) return;
  const counters = hostile.counters ?? {};
  if (!(counters.workerJobsStartedDelta > 0)) failures.push('visible hostile movement did not start a worker job');
  if (!(counters.workerThreatRelativeGeometryBuildDelta > 0)) failures.push('visible hostile movement did not rebuild threat-relative geometry');
  if (!(counters.workerDirectionalFieldBuildDelta > 0)) failures.push('visible hostile movement did not rebuild directional field');
  if ((counters.workerAwarenessGeometryBuildDelta ?? -1) < 0) failures.push('visible hostile awareness geometry delta is invalid');
  if ((counters.workerAwarenessRescoreDelta ?? -1) < 0) failures.push('visible hostile awareness rescore delta is invalid');
  if (counters.workerDirectionalBasisBuildDelta !== 0) failures.push(`visible hostile movement rebuilt static directional basis: ${counters.workerDirectionalBasisBuildDelta}`);
  if (counters.finalWorldKeyApplied !== true || counters.finalCanonicalKeyApplied !== true || counters.finalJobApplied !== true) {
    failures.push('visible hostile final requested field was not the applied field');
  }
  if ((counters.maxPendingQueueDepth ?? Infinity) > 1) failures.push(`visible hostile pending queue exceeded one: ${counters.maxPendingQueueDepth}`);
  if (hostile.before?.lastRequestedCanonicalThreatKey === hostile.after?.lastRequestedCanonicalThreatKey) {
    failures.push('visible hostile movement did not change canonical threat key');
  }
}

function assertSixUnits(both) {
  if (!both) return;
  const counters = both.counters ?? {};
  if ((counters.movingUnitCount ?? 0) < 6) failures.push(`six-unit scenario routed only ${counters.movingUnitCount ?? 0} units`);
  if (!(counters.workerJobsStartedDelta > 0)) failures.push('six-unit scenario did not start worker jobs');
  if (!(counters.ownMovementLocalUpdateDelta > 0)) failures.push('six-unit scenario did not exercise selected-unit local updates');
  if ((counters.maxPendingQueueDepth ?? Infinity) > 1) failures.push(`six-unit pending queue exceeded one: ${counters.maxPendingQueueDepth}`);
  if (counters.finalWorldKeyApplied !== true || counters.finalCanonicalKeyApplied !== true) {
    failures.push('six-unit final requested field was not applied');
  }
}

function assertHiddenHostile(hidden) {
  if (!hidden) return;
  const counters = hidden.counters ?? {};
  if (!(counters.objectiveDistanceCells > 0)) failures.push('hidden hostile objective position did not move');
  if ((counters.subjectiveDistanceCells ?? Infinity) >= 0.2) failures.push(`hidden hostile subjective position leaked: ${counters.subjectiveDistanceCells}`);
  for (const name of [
    'workerJobsStartedDelta',
    'worldRasterBuildDelta',
    'workerThreatRelativeGeometryBuildDelta',
    'workerDirectionalFieldBuildDelta',
    'workerDirectionalBasisBuildDelta',
    'workerAwarenessGeometryBuildDelta',
  ]) {
    if (counters[name] !== 0) failures.push(`hidden-hostile ${name} must equal zero, got ${counters[name]}`);
  }
  if (counters.rasterDigestUnchanged !== true) failures.push('hidden objective movement changed applied raster digest');
  if (hidden.before?.lastRequestedCanonicalThreatKey !== hidden.after?.lastRequestedCanonicalThreatKey) {
    failures.push('hidden objective movement changed canonical threat key');
  }
}

function assertWallCrossing(wall) {
  if (!wall) return;
  const before = wall.before;
  const after = wall.after;
  const wallX = wall.counters?.wallX;
  const beforeThreat = before?.subjectiveThreatPosition;
  const afterThreat = after?.subjectiveThreatPosition;
  const beforeWinner = before?.bestSafePosition?.position;
  const afterWinner = after?.bestSafePosition?.position;
  if (![wallX, beforeThreat?.x, afterThreat?.x, beforeWinner?.x, afterWinner?.x].every(Number.isFinite)) {
    failures.push('wall-crossing geometry is incomplete');
    return;
  }
  if (!(beforeThreat.x > wallX + 2)) failures.push('initial threat is not east of the wall');
  if (!(beforeWinner.x < wallX)) failures.push('initial renderer-local winner is not west/protected');
  if (!(afterThreat.x < wallX - 2)) failures.push('final threat is not west of the wall');
  if (!(afterWinner.x > wallX)) failures.push('final renderer-local winner is not east/protected');
  if (before?.subjectiveThreatVisibleNow !== true || after?.subjectiveThreatVisibleNow !== true) {
    failures.push('wall-crossing hostile was not visually tracked on both sides');
  }
  if (!after?.protectedAgainstThreatId || after.protectedAgainstThreatId !== before?.protectedAgainstThreatId) {
    failures.push('wall-crossing protectedAgainstThreatId was not preserved');
  }
  if (wall.counters?.winnerChanged !== true) failures.push('wall-crossing renderer-local winner did not change');
  if (wall.counters?.finalWorldKeyApplied !== true || wall.counters?.finalCanonicalKeyApplied !== true || wall.counters?.finalJobApplied !== true) {
    failures.push('wall-crossing final applied field does not match requested identities/job');
  }
  if (!wall.counters?.finalFieldIdentity || !wall.counters?.finalRasterDigest) {
    failures.push('wall-crossing applied worker field identity/digest is missing');
  }
  if ((wall.counters?.maxPendingQueueDepth ?? Infinity) > 1) {
    failures.push(`wall-crossing pending queue exceeded one: ${wall.counters?.maxPendingQueueDepth}`);
  }
}
