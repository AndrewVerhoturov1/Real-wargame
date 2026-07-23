import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import {
  PRODUCTION_PROJECTILE_CAPACITY,
  STAGE3_PROJECTILE_FIXED_STEP_SECONDS,
  createProjectileRuntimeState,
  getProjectileRuntimeDiagnostics,
  normalizeProjectileRuntimeState,
  serializeProjectileRuntimeState,
  tickProjectileRuntime,
  trySpawnProjectile,
  type ProjectileRuntimeDiagnosticsV2,
  type ProjectileRuntimeSnapshotV2,
  type ProjectileStateV1,
} from '../src/core/infantry-combat/runtime';
import { createDefaultCombatCatalogRegistry } from '../src/core/infantry-combat/catalogs';
import { createInitialState, type SimulationState } from '../src/core/simulation/SimulationState';
import {
  createStage3ReferenceHarnessRuntime,
  tickStage3ReferenceHarness,
  type Stage3ReferenceHarnessRuntime,
} from './infantry_combat_projectile_reference_harness';

const DIAGNOSTIC_MODE = process.env.PROJECTILE_BENCHMARK_DIAGNOSTIC === '1';
const WARMUP_RUNS = DIAGNOSTIC_MODE ? 0 : 3;
const MEASURED_RUNS = DIAGNOSTIC_MODE ? 1 : 10;
const SIMULATED_SECONDS_PER_MEASURED_RUN = 1;
const VALIDATION_SIMULATED_SECONDS = DIAGNOSTIC_MODE ? 1 : 10;
const TOTAL_MEASURED_SIMULATED_SECONDS = MEASURED_RUNS * SIMULATED_SECONDS_PER_MEASURED_RUN;
const OUTER_STEPS = Math.round(SIMULATED_SECONDS_PER_MEASURED_RUN / STAGE3_PROJECTILE_FIXED_STEP_SECONDS);
const CAPACITY_SWEEP_SECONDS = STAGE3_PROJECTILE_FIXED_STEP_SECONDS;
const CAPACITY_CANDIDATES = [512, 1024, 2048, 4096] as const;
const TARGET_ACTIVE_PROJECTILES = 2000;
const DIRECT_COMPARISON_PROJECTILES = 200;
const DIRECT_COMPARISON_CAPACITY = 256;
const MEMORY_COMPARISON_PROJECTILES = DIRECT_COMPARISON_PROJECTILES;
const MEMORY_COMPARISON_RUNTIME_COPIES = 16;
const ammo = createDefaultCombatCatalogRegistry().resolveAmmo({ definitionId: 'ammo_762x54r_ball', revision: 1 });

interface TimingSummary {
  readonly samplesMilliseconds: number[];
  readonly medianMilliseconds: number;
  readonly p95Milliseconds: number;
  readonly maxMilliseconds: number;
  readonly simulatedSecondsPerRealSecond: number;
  readonly projectileSubstepsPerSecond: number;
  readonly retainedHeapDeltaBytesMedian: number | null;
}

interface ProfileExecutionResult {
  readonly simulatedSeconds: number;
  readonly units: number;
  readonly objects: number;
  readonly capacity: number;
  readonly peakActive: number;
  readonly spawned: number;
  readonly released: number;
  readonly impacts: number;
  readonly terminations: number;
  readonly finalActive: number;
  readonly projectileSubsteps: number;
  readonly impactTypes: { readonly terrain: number; readonly object: number; readonly unit: number };
  readonly diagnostics: ProjectileRuntimeDiagnosticsV2;
  readonly passReasons: string[];
  readonly failReasons: string[];
}

interface ProfileReport extends ProfileExecutionResult {
  readonly fixture: string;
  readonly simulatedSecondsPerMeasuredRun: number;
  readonly timing: TimingSummary;
  readonly capSaturation: number;
  readonly fullScanFallbackCount: number;
  readonly pass: boolean;
}

interface CapacitySweepReport {
  readonly capacity: number;
  readonly simulatedSeconds: number;
  readonly simulatedSecondsPerMeasuredRun: number;
  readonly requestedActive: number;
  readonly peakActive: number;
  readonly capRejections: number;
  readonly saturation: number;
  readonly headroomPass: boolean;
  readonly timing: TimingSummary;
  readonly diagnostics: ProjectileRuntimeDiagnosticsV2;
}

interface DirectComparisonReport {
  readonly fixture: string;
  readonly projectiles: number;
  readonly stage4Capacity: number;
  readonly simulatedSeconds: number;
  readonly simulatedSecondsPerMeasuredRun: number;
  readonly stage3Reference: TimingSummary & {
    readonly hotPathStructuredClones: number;
    readonly survivorsArrays: number;
    readonly eventArrays: number;
  };
  readonly stage4Production: TimingSummary & {
    readonly scratchAllocations: number;
    readonly poolAllocations: number;
    readonly poolResizes: number;
  };
  readonly retainedHeapPerProjectileBytes: {
    readonly stage3Reference: number;
    readonly stage4Production: number;
  };
  readonly idleComparison: {
    readonly stage3Reference: TimingSummary;
    readonly stage4Production: TimingSummary;
    readonly overheadRatioStage4OverStage3: number;
    readonly zeroWorkFastPathProven: boolean;
    readonly timingNoiseAccepted: boolean;
    readonly timingGatePass: boolean;
  };
  readonly throughputRatioStage4OverStage3: number;
  readonly heapRatioStage4OverStage3: number;
  readonly pass: boolean;
  readonly failReasons: string[];
}

interface BenchmarkReport {
  readonly schemaVersion: 1;
  readonly nodeVersion: string;
  readonly platform: string;
  readonly arch: string;
  readonly cpuCount: number;
  readonly warmupRuns: number;
  readonly measuredRuns: number;
  readonly simulatedSecondsPerMeasuredRun: number;
  readonly totalMeasuredSimulatedSecondsPerFixture: number;
  readonly fixedStepSeconds: number;
  readonly productionCapacity: number;
  readonly productionPoolNumericTypedArrayBytes: number;
  readonly profiles: ProfileReport[];
  readonly capacitySweep: CapacitySweepReport[];
  readonly directComparison: DirectComparisonReport;
  readonly stressSaveLoad: {
    readonly projectiles: number;
    readonly pass: boolean;
    readonly mismatch: string | null;
  };
  readonly selectedCapacityRationale: string[];
  readonly pass: boolean;
  readonly failReasons: string[];
}

interface PreparedProductionRun {
  readonly state: SimulationState;
  readonly targetActive: number;
  readonly replenish: boolean;
  readonly profile: FixtureProfile;
  nextSequence: number;
  totalImpacts: number;
  totalTerminations: number;
  projectileSubsteps: number;
  elapsedSteps: number;
}

let memorySink: unknown = null;

type FixtureProfile = 'idle' | 'single_volley' | 'sustained' | 'target_stress' | 'dense_geometry' | 'direct';

const memoryProbeMode = process.env.PROJECTILE_BENCHMARK_MEMORY_PROBE;
if (memoryProbeMode === 'stage3' || memoryProbeMode === 'stage4') {
  runMemoryProbe(memoryProbeMode);
} else {
  main();
}

function main(): void {
  assert.equal(PRODUCTION_PROJECTILE_CAPACITY, 4096, 'Stage 4 selected capacity must match the measured minimum with 25% headroom.');
  console.log('benchmark: stress save/load');
  const stressSaveLoad = verifyStressSaveLoad();
  const profiles: ProfileReport[] = [];
  for (const profile of ['idle', 'single_volley', 'sustained', 'target_stress', 'dense_geometry'] as const) {
    console.log(`benchmark: ${profile}`);
    profiles.push(measureProductionProfile(profile));
  }
  console.log('benchmark: capacity sweep');
  const capacitySweep = CAPACITY_CANDIDATES.map(measureCapacity);
  console.log('benchmark: direct comparison');
  const directComparison = measureDirectComparison();
  const failReasons: string[] = [];
  for (const profile of profiles) {
    for (const reason of profile.failReasons) failReasons.push(`${profile.fixture}: ${reason}`);
  }
  if (!stressSaveLoad.pass) failReasons.push(`stress save/load: ${stressSaveLoad.mismatch ?? 'mismatch'}`);
  for (const reason of directComparison.failReasons) failReasons.push(`direct comparison: ${reason}`);
  const productionSweep = capacitySweep.find((entry) => entry.capacity === PRODUCTION_PROJECTILE_CAPACITY);
  if (!productionSweep) failReasons.push('production capacity absent from capacity sweep');
  else {
    if (productionSweep.capRejections !== 0) failReasons.push('production capacity rejected target projectiles');
    if (!productionSweep.headroomPass) failReasons.push('production capacity has less than 25% headroom');
  }
  const minimumPassingCapacity = capacitySweep.find((entry) => entry.capRejections === 0 && entry.headroomPass)?.capacity ?? null;
  if (minimumPassingCapacity !== PRODUCTION_PROJECTILE_CAPACITY) {
    failReasons.push(`minimum passing capacity is ${String(minimumPassingCapacity)}, expected ${PRODUCTION_PROJECTILE_CAPACITY}`);
  }

  const report: BenchmarkReport = {
    schemaVersion: 1,
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    cpuCount: os.cpus().length,
    warmupRuns: WARMUP_RUNS,
    measuredRuns: MEASURED_RUNS,
    simulatedSecondsPerMeasuredRun: SIMULATED_SECONDS_PER_MEASURED_RUN,
    totalMeasuredSimulatedSecondsPerFixture: TOTAL_MEASURED_SIMULATED_SECONDS,
    fixedStepSeconds: STAGE3_PROJECTILE_FIXED_STEP_SECONDS,
    productionCapacity: PRODUCTION_PROJECTILE_CAPACITY,
    productionPoolNumericTypedArrayBytes: estimateNumericPoolBytes(PRODUCTION_PROJECTILE_CAPACITY),
    profiles,
    capacitySweep,
    directComparison,
    stressSaveLoad,
    selectedCapacityRationale: [
      '512 and 1024 cannot hold the required peak near 2000 projectiles.',
      '2048 holds 2000 but reaches more than 75% saturation and fails the required 25% headroom.',
      '4096 is the smallest tested power-of-two capacity with zero target rejections and at least 25% headroom.',
      'The pool is fixed-size, does not resize in the measured run, and keeps event buffers bounded by the same capacity.',
    ],
    pass: failReasons.length === 0,
    failReasons,
  };

  printHumanTable(report);
  console.log('BEGIN_PROJECTILE_BENCHMARK_JSON');
  console.log(JSON.stringify(report, null, 2));
  console.log('END_PROJECTILE_BENCHMARK_JSON');
  if (!report.pass) process.exitCode = 1;
}

function measureProductionProfile(profile: Exclude<FixtureProfile, 'direct'>): ProfileReport {
  for (let index = 0; index < WARMUP_RUNS; index += 1) executeProductionProfile(profile);
  const validation = runPreparedProduction(
    prepareProductionRun(profile, PRODUCTION_PROJECTILE_CAPACITY),
    Math.round(VALIDATION_SIMULATED_SECONDS / STAGE3_PROJECTILE_FIXED_STEP_SECONDS),
  );
  const samples: number[] = [];
  const heapDeltas: number[] = [];
  let measuredRepresentative: ProfileExecutionResult | null = null;
  for (let index = 0; index < MEASURED_RUNS; index += 1) {
    const prepared = prepareProductionRun(profile, PRODUCTION_PROJECTILE_CAPACITY);
    forceGc();
    const heapBefore = process.memoryUsage().heapUsed;
    const started = process.hrtime.bigint();
    const result = runPreparedProduction(prepared, OUTER_STEPS);
    const ended = process.hrtime.bigint();
    forceGc();
    const heapAfter = process.memoryUsage().heapUsed;
    samples.push(nanosecondsToMilliseconds(ended - started));
    heapDeltas.push(heapAfter - heapBefore);
    measuredRepresentative = result;
  }
  assert.ok(measuredRepresentative);
  const timing = summarizeTiming(
    samples,
    heapDeltas,
    measuredRepresentative.simulatedSeconds,
    measuredRepresentative.projectileSubsteps,
  );
  return {
    fixture: profile,
    ...validation,
    simulatedSecondsPerMeasuredRun: measuredRepresentative.simulatedSeconds,
    timing,
    capSaturation: validation.peakActive / validation.capacity,
    fullScanFallbackCount: validation.diagnostics.fullScanFallbackCount,
    pass: validation.failReasons.length === 0,
  };
}

function executeProductionProfile(profile: Exclude<FixtureProfile, 'direct'>): ProfileExecutionResult {
  return runPreparedProduction(prepareProductionRun(profile, PRODUCTION_PROJECTILE_CAPACITY), OUTER_STEPS);
}

function prepareProductionRun(profile: FixtureProfile, capacity: number): PreparedProductionRun {
  const dense = profile === 'dense_geometry';
  const state = makeState(dense ? makeDenseObjects() : makeRepresentativeObjects(), makeUnits());
  const runtime = createProjectileRuntimeState(capacity);
  state.infantryCombatProjectiles = runtime;
  const targetActive = targetCountForProfile(profile);
  const prepared: PreparedProductionRun = {
    state,
    targetActive,
    replenish: profile === 'sustained' || profile === 'dense_geometry',
    profile,
    nextSequence: 0,
    totalImpacts: 0,
    totalTerminations: 0,
    projectileSubsteps: 0,
    elapsedSteps: 0,
  };
  replenishProduction(prepared);
  return prepared;
}

function runPreparedProduction(prepared: PreparedProductionRun, steps: number): ProfileExecutionResult {
  const runtime = prepared.state.infantryCombatProjectiles;
  for (let step = 0; step < steps; step += 1) {
    prepared.projectileSubsteps += runtime.pool.activeCount;
    const result = tickProjectileRuntime(prepared.state, {
      intervalStartSeconds: (prepared.elapsedSteps + step) * STAGE3_PROJECTILE_FIXED_STEP_SECONDS,
      deltaSeconds: STAGE3_PROJECTILE_FIXED_STEP_SECONDS,
    });
    prepared.totalImpacts += result.createdImpactIds.length;
    prepared.totalTerminations += result.createdTerminationIds.length;
    if (prepared.replenish) replenishProduction(prepared);
  }
  prepared.elapsedSteps += steps;
  const diagnostics = getProjectileRuntimeDiagnostics(runtime) as ProjectileRuntimeDiagnosticsV2;
  const snapshot = serializeProjectileRuntimeState(runtime);
  const activeIds = snapshot.activeProjectiles.map((projectile) => projectile.projectileId);
  const impactTypes = { terrain: 0, object: 0, unit: 0 };
  for (const impact of snapshot.impacts) impactTypes[impact.hitType] += 1;
  const failReasons: string[] = [];
  const passReasons: string[] = [];
  if (diagnostics.fullScanFallbackCount !== 0) failReasons.push('fullScanFallbackCount is not zero');
  else passReasons.push('no full-scan fallback');
  if (diagnostics.poolResizeCount !== 0) failReasons.push('pool resized');
  else passReasons.push('pool remained fixed-size');
  if (diagnostics.eventOverflowCount !== 0) failReasons.push('event buffer overflowed');
  else passReasons.push('bounded event buffers did not overflow');
  if (prepared.profile === 'target_stress' && diagnostics.capRejectionCount !== 0) failReasons.push('target fixture had cap rejection');
  if (new Set(activeIds).size !== activeIds.length) failReasons.push('duplicate active projectile ID');
  else passReasons.push('active projectile IDs remain unique');
  if (diagnostics.spawnCount - diagnostics.releaseCount !== runtime.pool.activeCount) {
    failReasons.push('spawn/release/active reconciliation failed');
  } else passReasons.push('spawn/release/active counts reconcile');
  if (diagnostics.releaseCount !== prepared.totalTerminations) failReasons.push('terminal event count does not equal released slots');
  else passReasons.push('terminal events release exactly one slot');
  if (prepared.profile === 'idle') {
    if (diagnostics.unitBroadPhaseQueryCount !== 0 || diagnostics.objectBroadPhaseQueryCount !== 0) {
      failReasons.push('idle runtime performed spatial work');
    } else passReasons.push('idle runtime performs zero spatial queries');
    if (diagnostics.scratchAllocationCount !== 0) failReasons.push('idle runtime allocated stepper scratch');
    else passReasons.push('idle runtime creates no scratch buffers');
  }
  if (prepared.profile === 'target_stress') {
    if (diagnostics.highWaterMark < 1900 || diagnostics.highWaterMark > 2100) failReasons.push('target peak is not near 2000');
    else passReasons.push('target peak is near 2000');
    if (diagnostics.highWaterMark > runtime.pool.capacity * 0.75) failReasons.push('target peak exceeds 75% production capacity');
    else passReasons.push('production capacity has at least 25% headroom');
    for (const type of ['terrain', 'object', 'unit'] as const) {
      if (impactTypes[type] <= 0) failReasons.push(`target fixture produced no ${type} impacts`);
      else passReasons.push(`target fixture includes ${type} impacts`);
    }
  }
  if (prepared.profile === 'dense_geometry' && diagnostics.objectBroadPhaseQueryCount > 0) {
    const averageCandidates = diagnostics.objectCandidateCount / diagnostics.objectBroadPhaseQueryCount;
    if (averageCandidates >= prepared.state.map.objects.length / 4) failReasons.push('dense geometry broad phase returns too many objects');
    else passReasons.push('dense geometry candidate count stays well below full object scan');
  }
  if (diagnostics.unitBroadPhaseQueryCount > 0) {
    const averageCandidates = diagnostics.unitCandidateCount / diagnostics.unitBroadPhaseQueryCount;
    if (averageCandidates >= prepared.state.units.length / 2) failReasons.push('unit broad phase candidate count is too close to full scan');
    else passReasons.push('unit candidates stay well below full unit scan');
  }
  return {
    simulatedSeconds: prepared.elapsedSteps * STAGE3_PROJECTILE_FIXED_STEP_SECONDS,
    units: prepared.state.units.length,
    objects: prepared.state.map.objects.length,
    capacity: runtime.pool.capacity,
    peakActive: diagnostics.highWaterMark,
    spawned: diagnostics.spawnCount,
    released: diagnostics.releaseCount,
    impacts: prepared.totalImpacts,
    terminations: prepared.totalTerminations,
    finalActive: runtime.pool.activeCount,
    projectileSubsteps: prepared.projectileSubsteps,
    impactTypes,
    diagnostics,
    passReasons,
    failReasons,
  };
}

function replenishProduction(prepared: PreparedProductionRun): void {
  while (prepared.state.infantryCombatProjectiles.pool.activeCount < prepared.targetActive) {
    const candidate = makeProjectile(prepared.profile, prepared.nextSequence);
    prepared.nextSequence += 1;
    const result = trySpawnProjectile(prepared.state.infantryCombatProjectiles, candidate);
    if (result.status !== 'spawned') break;
  }
}

function measureCapacity(capacity: number): CapacitySweepReport {
  for (let index = 0; index < WARMUP_RUNS; index += 1) executeCapacity(capacity);
  const samples: number[] = [];
  const heapDeltas: number[] = [];
  let representative: ProfileExecutionResult | null = null;
  for (let index = 0; index < MEASURED_RUNS; index += 1) {
    const prepared = prepareProductionRun('target_stress', capacity);
    forceGc();
    const heapBefore = process.memoryUsage().heapUsed;
    const started = process.hrtime.bigint();
    const result = runPreparedProduction(
      prepared,
      Math.round(CAPACITY_SWEEP_SECONDS / STAGE3_PROJECTILE_FIXED_STEP_SECONDS),
    );
    const ended = process.hrtime.bigint();
    forceGc();
    const heapAfter = process.memoryUsage().heapUsed;
    samples.push(nanosecondsToMilliseconds(ended - started));
    heapDeltas.push(heapAfter - heapBefore);
    representative = result;
  }
  assert.ok(representative);
  return {
    capacity,
    simulatedSeconds: representative.simulatedSeconds * MEASURED_RUNS,
    simulatedSecondsPerMeasuredRun: representative.simulatedSeconds,
    requestedActive: TARGET_ACTIVE_PROJECTILES,
    peakActive: representative.peakActive,
    capRejections: representative.diagnostics.capRejectionCount,
    saturation: representative.peakActive / capacity,
    headroomPass: representative.peakActive <= capacity * 0.75,
    timing: summarizeTiming(
      samples,
      heapDeltas,
      representative.simulatedSeconds,
      representative.projectileSubsteps,
    ),
    diagnostics: representative.diagnostics,
  };
}

function executeCapacity(capacity: number): ProfileExecutionResult {
  return runPreparedProduction(
    prepareProductionRun('target_stress', capacity),
    Math.round(CAPACITY_SWEEP_SECONDS / STAGE3_PROJECTILE_FIXED_STEP_SECONDS),
  );
}

function measureDirectComparison(): DirectComparisonReport {
  for (let index = 0; index < WARMUP_RUNS; index += 1) {
    executeReferenceDirect();
    executeProductionDirect();
  }
  const referenceSamples: number[] = [];
  const productionSamples: number[] = [];
  const referenceHeapDeltas: number[] = [];
  const productionHeapDeltas: number[] = [];
  let referenceRepresentative: Stage3ReferenceHarnessRuntime | null = null;
  let productionRepresentative: ProfileExecutionResult | null = null;
  for (let index = 0; index < MEASURED_RUNS; index += 1) {
    const referencePrepared = prepareReferenceDirect();
    forceGc();
    const referenceHeapBefore = process.memoryUsage().heapUsed;
    let started = process.hrtime.bigint();
    runReference(referencePrepared.state, referencePrepared.runtime, OUTER_STEPS);
    let ended = process.hrtime.bigint();
    forceGc();
    referenceSamples.push(nanosecondsToMilliseconds(ended - started));
    referenceHeapDeltas.push(process.memoryUsage().heapUsed - referenceHeapBefore);
    referenceRepresentative = referencePrepared.runtime;

    const productionPrepared = prepareProductionRun('direct', 512);
    forceGc();
    const productionHeapBefore = process.memoryUsage().heapUsed;
    started = process.hrtime.bigint();
    productionRepresentative = runPreparedProduction(productionPrepared, OUTER_STEPS);
    ended = process.hrtime.bigint();
    forceGc();
    productionSamples.push(nanosecondsToMilliseconds(ended - started));
    productionHeapDeltas.push(process.memoryUsage().heapUsed - productionHeapBefore);
  }
  assert.ok(referenceRepresentative && productionRepresentative);
  const referenceTiming = summarizeTiming(
    referenceSamples,
    referenceHeapDeltas,
    SIMULATED_SECONDS_PER_MEASURED_RUN,
    referenceRepresentative.diagnostics.projectileSubsteps,
  );
  const productionTiming = summarizeTiming(
    productionSamples,
    productionHeapDeltas,
    SIMULATED_SECONDS_PER_MEASURED_RUN,
    productionRepresentative.projectileSubsteps,
  );
  const retained = measureRuntimeRetainedHeapPerProjectile();
  const idleComparison = measureIdleComparison();
  const throughputRatio = productionTiming.projectileSubstepsPerSecond / Math.max(1, referenceTiming.projectileSubstepsPerSecond);
  const heapRatio = retained.stage4Production / Math.max(1, retained.stage3Reference);
  const failReasons: string[] = [];
  if (throughputRatio < 1) failReasons.push(`Stage 4 throughput ratio ${throughputRatio.toFixed(3)} is below 1.0`);
  if (heapRatio >= 1) failReasons.push(`Stage 4 retained heap ratio ${heapRatio.toFixed(3)} is not below 1.0`);
  if (!idleComparison.timingGatePass) {
    failReasons.push(`Stage 4 idle overhead ratio ${idleComparison.overheadRatioStage4OverStage3.toFixed(3)} exceeds 1.05 without a zero-work timing-noise justification`);
  }
  if (productionRepresentative.diagnostics.scratchAllocationCount > 1) failReasons.push('Stage 4 allocated stepper scratch more than once');
  if (productionRepresentative.diagnostics.poolResizeCount !== 0) failReasons.push('Stage 4 resized the pool');
  return {
    fixture: 'same 200-projectile clear-crossing fixture',
    projectiles: DIRECT_COMPARISON_PROJECTILES,
    stage4Capacity: DIRECT_COMPARISON_CAPACITY,
    simulatedSeconds: TOTAL_MEASURED_SIMULATED_SECONDS,
    simulatedSecondsPerMeasuredRun: SIMULATED_SECONDS_PER_MEASURED_RUN,
    stage3Reference: {
      ...referenceTiming,
      hotPathStructuredClones: referenceRepresentative.diagnostics.structuredCloneCount,
      survivorsArrays: referenceRepresentative.diagnostics.survivorsArrayCount,
      eventArrays: referenceRepresentative.diagnostics.eventArrayCount,
    },
    stage4Production: {
      ...productionTiming,
      scratchAllocations: productionRepresentative.diagnostics.scratchAllocationCount,
      poolAllocations: productionRepresentative.diagnostics.poolAllocationCount,
      poolResizes: productionRepresentative.diagnostics.poolResizeCount,
    },
    retainedHeapPerProjectileBytes: retained,
    idleComparison,
    throughputRatioStage4OverStage3: throughputRatio,
    heapRatioStage4OverStage3: heapRatio,
    pass: failReasons.length === 0,
    failReasons,
  };
}

function prepareReferenceDirect(): { state: SimulationState; runtime: Stage3ReferenceHarnessRuntime } {
  const state = makeState([], makeUnits());
  const projectiles = Array.from({ length: DIRECT_COMPARISON_PROJECTILES }, (_, index) => makeProjectile('direct', index));
  return { state, runtime: createStage3ReferenceHarnessRuntime(projectiles) };
}

function executeReferenceDirect(): Stage3ReferenceHarnessRuntime {
  const prepared = prepareReferenceDirect();
  runReference(prepared.state, prepared.runtime, OUTER_STEPS);
  return prepared.runtime;
}

function executeProductionDirect(): ProfileExecutionResult {
  return runPreparedProduction(prepareProductionRun('direct', DIRECT_COMPARISON_CAPACITY), OUTER_STEPS);
}

function runReference(state: SimulationState, runtime: Stage3ReferenceHarnessRuntime, steps: number): void {
  for (let step = 0; step < steps; step += 1) {
    tickStage3ReferenceHarness(
      state,
      runtime,
      step * STAGE3_PROJECTILE_FIXED_STEP_SECONDS,
      STAGE3_PROJECTILE_FIXED_STEP_SECONDS,
    );
  }
}

function measureIdleComparison(): DirectComparisonReport['idleComparison'] {
  for (let index = 0; index < WARMUP_RUNS; index += 1) {
    measureReferenceIdleSample();
    measureProductionIdleSample();
  }
  const referenceSamples: number[] = [];
  const productionSamples: number[] = [];
  let zeroWorkFastPathProven = true;
  for (let index = 0; index < MEASURED_RUNS; index += 1) {
    referenceSamples.push(measureReferenceIdleSample());
    const production = measureProductionIdleSample();
    productionSamples.push(production.milliseconds);
    zeroWorkFastPathProven = zeroWorkFastPathProven
      && production.diagnostics.fixedSubstepsExecuted === 0
      && production.diagnostics.unitBroadPhaseQueryCount === 0
      && production.diagnostics.objectBroadPhaseQueryCount === 0
      && production.diagnostics.scratchAllocationCount === 0;
  }
  const stage3Reference = summarizeTiming(referenceSamples, [], SIMULATED_SECONDS_PER_MEASURED_RUN, 0);
  const stage4Production = summarizeTiming(productionSamples, [], SIMULATED_SECONDS_PER_MEASURED_RUN, 0);
  const overheadRatioStage4OverStage3 = stage4Production.medianMilliseconds
    / Math.max(1e-9, stage3Reference.medianMilliseconds);
  const timingNoiseAccepted = overheadRatioStage4OverStage3 > 1.05
    && zeroWorkFastPathProven
    && Math.max(stage3Reference.medianMilliseconds, stage4Production.medianMilliseconds) < 1;
  return {
    stage3Reference,
    stage4Production,
    overheadRatioStage4OverStage3,
    zeroWorkFastPathProven,
    timingNoiseAccepted,
    timingGatePass: overheadRatioStage4OverStage3 <= 1.05 || timingNoiseAccepted,
  };
}

function measureReferenceIdleSample(): number {
  const state = makeState([], makeUnits());
  const runtime = createStage3ReferenceHarnessRuntime();
  const started = process.hrtime.bigint();
  runReference(state, runtime, OUTER_STEPS);
  return nanosecondsToMilliseconds(process.hrtime.bigint() - started);
}

function measureProductionIdleSample(): {
  readonly milliseconds: number;
  readonly diagnostics: ProjectileRuntimeDiagnosticsV2;
} {
  const prepared = prepareProductionRun('idle', PRODUCTION_PROJECTILE_CAPACITY);
  const started = process.hrtime.bigint();
  runPreparedProduction(prepared, OUTER_STEPS);
  const milliseconds = nanosecondsToMilliseconds(process.hrtime.bigint() - started);
  return {
    milliseconds,
    diagnostics: getProjectileRuntimeDiagnostics(prepared.state.infantryCombatProjectiles) as ProjectileRuntimeDiagnosticsV2,
  };
}

function measureRuntimeRetainedHeapPerProjectile(): { stage3Reference: number; stage4Production: number } {
  const bundlePath = process.env.PROJECTILE_BENCHMARK_BUNDLE_PATH;
  assert.ok(bundlePath, 'benchmark wrapper must expose the built bundle path');
  const referenceSamples: number[] = [];
  const productionSamples: number[] = [];
  for (let sample = 0; sample < 5; sample += 1) {
    referenceSamples.push(runIsolatedMemoryProbe(bundlePath, 'stage3'));
    productionSamples.push(runIsolatedMemoryProbe(bundlePath, 'stage4'));
  }
  return {
    stage3Reference: median(referenceSamples),
    stage4Production: median(productionSamples),
  };
}

function runIsolatedMemoryProbe(bundlePath: string, mode: 'stage3' | 'stage4'): number {
  const output = execFileSync(process.execPath, ['--expose-gc', bundlePath], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PROJECTILE_BENCHMARK_MEMORY_PROBE: mode,
      PROJECTILE_BENCHMARK_DIAGNOSTIC: '1',
    },
    maxBuffer: 1024 * 1024,
  });
  const parsed = JSON.parse(output.trim()) as { readonly bytesPerProjectile: number };
  assert.ok(Number.isFinite(parsed.bytesPerProjectile) && parsed.bytesPerProjectile > 0);
  return parsed.bytesPerProjectile;
}

function runMemoryProbe(mode: 'stage3' | 'stage4'): void {
  memorySink = null;
  forceGc();
  forceGc();
  const before = retainedMemoryBytes();
  memorySink = mode === 'stage3'
    ? createMemoryReferenceRuntimes()
    : createMemoryProductionRuntimes();
  forceGc();
  assert.equal((memorySink as readonly unknown[]).length, MEMORY_COMPARISON_RUNTIME_COPIES);
  const retainedBytes = retainedMemoryBytes() - before;
  const bytesPerProjectile = retainedBytes
    / (MEMORY_COMPARISON_PROJECTILES * MEMORY_COMPARISON_RUNTIME_COPIES);
  assert.ok(Number.isFinite(bytesPerProjectile) && bytesPerProjectile > 0);
  console.log(JSON.stringify({ mode, retainedBytes, bytesPerProjectile }));
}

function createMemoryReferenceRuntimes(): Stage3ReferenceHarnessRuntime[] {
  return Array.from(
    { length: MEMORY_COMPARISON_RUNTIME_COPIES },
    (_, runtimeIndex) => createStage3ReferenceHarnessRuntime(
      Array.from(
        { length: MEMORY_COMPARISON_PROJECTILES },
        (_, projectileIndex) => makeProjectile(
          'direct',
          runtimeIndex * MEMORY_COMPARISON_PROJECTILES + projectileIndex,
        ),
      ),
    ),
  );
}

function createMemoryProductionRuntimes(): ReturnType<typeof createProjectileRuntimeState>[] {
  return Array.from({ length: MEMORY_COMPARISON_RUNTIME_COPIES }, (_, runtimeIndex) => {
    const runtime = createProjectileRuntimeState(DIRECT_COMPARISON_CAPACITY);
    for (let projectileIndex = 0; projectileIndex < MEMORY_COMPARISON_PROJECTILES; projectileIndex += 1) {
      const candidate = makeProjectile(
        'direct',
        runtimeIndex * MEMORY_COMPARISON_PROJECTILES + projectileIndex,
      );
      assert.equal(trySpawnProjectile(runtime, candidate).status, 'spawned');
    }
    return runtime;
  });
}

function retainedMemoryBytes(): number {
  const memoryUsage = process.memoryUsage();
  return memoryUsage.heapUsed + memoryUsage.arrayBuffers;
}

function verifyStressSaveLoad(): BenchmarkReport['stressSaveLoad'] {
  const control = prepareProductionRun('target_stress', PRODUCTION_PROJECTILE_CAPACITY);
  const restored = prepareProductionRun('target_stress', PRODUCTION_PROJECTILE_CAPACITY);
  const splitStep = Math.round(VALIDATION_SIMULATED_SECONDS * 0.5 / STAGE3_PROJECTILE_FIXED_STEP_SECONDS);
  runPreparedProduction(control, splitStep);
  runPreparedProduction(restored, splitStep);
  restored.state.infantryCombatProjectiles = normalizeProjectileRuntimeState(
    serializeProjectileRuntimeState(restored.state.infantryCombatProjectiles),
  );
  runPreparedProduction(control, splitStep);
  runPreparedProduction(restored, splitStep);
  const controlSnapshot = gameplaySnapshot(control.state.infantryCombatProjectiles);
  const restoredSnapshot = gameplaySnapshot(restored.state.infantryCombatProjectiles);
  try {
    assert.deepEqual(restoredSnapshot, controlSnapshot);
    return { projectiles: TARGET_ACTIVE_PROJECTILES, pass: true, mismatch: null };
  } catch (error) {
    return { projectiles: TARGET_ACTIVE_PROJECTILES, pass: false, mismatch: error instanceof Error ? error.message : String(error) };
  }
}

function gameplaySnapshot(runtime: SimulationState['infantryCombatProjectiles']): Omit<ProjectileRuntimeSnapshotV2, 'diagnostics'> {
  const { diagnostics: _diagnostics, ...snapshot } = serializeProjectileRuntimeState(runtime);
  return snapshot;
}

function targetCountForProfile(profile: FixtureProfile): number {
  if (profile === 'idle') return 0;
  if (profile === 'single_volley' || profile === 'direct') return 200;
  if (profile === 'sustained') return 1000;
  if (profile === 'dense_geometry') return 200;
  return TARGET_ACTIVE_PROJECTILES;
}

function makeProjectile(profile: FixtureProfile, sequence: number): ProjectileStateV1 {
  const lane = sequence % 4;
  const row = sequence % 100;
  const shotId = `${profile}-${String(sequence).padStart(7, '0')}`;
  let position = { xMetres: 30 + (sequence % 20) * 0.05, yMetres: 20 + (row % 20) * 8, zMetres: 25 };
  let velocity = { x: 20 + (sequence % 5), y: (sequence % 3 - 1) * 0.2, z: 0 };
  let maximumLifetimeSeconds = 20;
  if (profile === 'sustained') {
    position = { ...position, zMetres: 30 };
    velocity = { x: 12 + (sequence % 3), y: 0, z: 0 };
    maximumLifetimeSeconds = 10;
  } else if (profile === 'target_stress') {
    if (lane === 1) {
      position = { xMetres: 30, yMetres: 24 + (row % 20) * 8, zMetres: 2.5 };
      velocity = { x: 24, y: 0, z: -2 };
    } else if (lane === 2) {
      position = { xMetres: 30, yMetres: 28 + (row % 20) * 8, zMetres: 1.2 };
      velocity = { x: 35, y: 0, z: 3 };
    } else if (lane === 3) {
      const targetRow = row % 10;
      position = { xMetres: 35, yMetres: (12 + targetRow * 7 + 0.5) * 2, zMetres: 1.2 };
      velocity = { x: 35, y: 0, z: 2.2 };
    }
    maximumLifetimeSeconds = 4;
  } else if (profile === 'dense_geometry') {
    position = { xMetres: 20 + (sequence % 30), yMetres: 10 + (row % 40) * 4, zMetres: 20 };
    velocity = { x: 18 + (sequence % 5), y: 0.5, z: 0 };
    maximumLifetimeSeconds = 4;
  } else if (profile === 'single_volley' || profile === 'direct') {
    const reverse = sequence % 2 === 1;
    position = reverse
      ? { xMetres: 290, yMetres: 20 + (row % 20) * 8, zMetres: 25 }
      : { xMetres: 30, yMetres: 20 + (row % 20) * 8, zMetres: 25 };
    velocity = { x: reverse ? -20 : 20, y: (sequence % 5 - 2) * 0.1, z: 0 };
    maximumLifetimeSeconds = 20;
  }
  return {
    schemaVersion: 1,
    projectileId: `${shotId}:projectile`,
    shotId,
    shooterId: sequence % 2 === 0 ? 'blue-benchmark-shooter' : 'red-benchmark-shooter',
    ammoSnapshot: ammo,
    position,
    velocityMetresPerSecond: velocity,
    ageSeconds: 0,
    maximumLifetimeSeconds,
    bodyPenetrationBudget: ammo.bodyPenetrationBudget,
    impactSequence: 0,
  };
}

function makeState(objects: Array<Record<string, unknown>>, units: Array<Record<string, unknown>>): SimulationState {
  return createInitialState({
    width: 160,
    height: 100,
    cellSize: 20,
    metersPerCell: 2,
    defaultTerrain: 'field',
    defaultHeight: 0,
    objects: objects as never,
  }, units.map((value) => ({ type: 'infantry_squad', ...value })) as never);
}

function makeUnits(): Array<Record<string, unknown>> {
  const units: Array<Record<string, unknown>> = [];
  for (let sideIndex = 0; sideIndex < 2; sideIndex += 1) {
    const side = sideIndex === 0 ? 'blue' : 'red';
    for (let index = 0; index < 100; index += 1) {
      const row = Math.floor(index / 10);
      const column = index % 10;
      units.push({
        id: `${side}-${String(index).padStart(3, '0')}`,
        side,
        x: side === 'blue' ? 8 + column * 1.2 : 32 - column * 0.6,
        y: 12 + row * 7,
      });
    }
  }
  return units;
}

function makeRepresentativeObjects(): Array<Record<string, unknown>> {
  const objects: Array<Record<string, unknown>> = [];
  for (let index = 0; index < 40; index += 1) {
    objects.push({
      id: `wall-${String(index).padStart(3, '0')}`,
      kind: 'structure',
      x: 25 + (index % 2) * 0.5,
      y: 14 + Math.floor(index / 2) * 4,
      widthCells: 0.35,
      heightCells: 1.5,
      losHeightMeters: 3,
    });
  }
  return objects;
}

function makeDenseObjects(): Array<Record<string, unknown>> {
  const objects: Array<Record<string, unknown>> = [];
  for (let row = 0; row < 20; row += 1) {
    for (let column = 0; column < 20; column += 1) {
      objects.push({
        id: `dense-${String(row).padStart(2, '0')}-${String(column).padStart(2, '0')}`,
        kind: 'structure',
        x: 8 + column * 7,
        y: 5 + row * 4.5,
        widthCells: 0.4,
        heightCells: 0.8,
        losHeightMeters: 1.4,
      });
    }
  }
  return objects;
}

function summarizeTiming(
  samplesMilliseconds: number[],
  heapDeltas: number[],
  simulatedSeconds: number,
  projectileSubsteps: number,
): TimingSummary {
  const sorted = [...samplesMilliseconds].sort((left, right) => left - right);
  const medianMilliseconds = percentile(sorted, 0.5);
  const p95Milliseconds = percentile(sorted, 0.95);
  const maxMilliseconds = sorted[sorted.length - 1] ?? 0;
  const realSeconds = Math.max(1e-9, medianMilliseconds / 1000);
  return {
    samplesMilliseconds,
    medianMilliseconds,
    p95Milliseconds,
    maxMilliseconds,
    simulatedSecondsPerRealSecond: simulatedSeconds / realSeconds,
    projectileSubstepsPerSecond: projectileSubsteps / realSeconds,
    retainedHeapDeltaBytesMedian: heapDeltas.length > 0 ? median(heapDeltas) : null,
  };
}

function percentile(sorted: readonly number[], percentileValue: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * percentileValue) - 1);
  return sorted[Math.max(0, index)]!;
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1]! + sorted[middle]!) / 2 : sorted[middle]!;
}

function nanosecondsToMilliseconds(value: bigint): number {
  return Number(value) / 1_000_000;
}

function forceGc(): void {
  const gc = (globalThis as { gc?: () => void }).gc;
  if (gc) gc();
}

function printHumanTable(report: BenchmarkReport): void {
  console.log(`Projectile Runtime Benchmark — Node ${report.nodeVersion} ${report.platform}/${report.arch}`);
  console.log(`warmup=${report.warmupRuns}, measured=${report.measuredRuns}, seconds/run=${report.simulatedSecondsPerMeasuredRun}, total seconds/fixture=${report.totalMeasuredSimulatedSecondsPerFixture}, fixedStep=${report.fixedStepSeconds}`);
  console.log('');
  console.log('Fixture             Units Objects Capacity Peak  Median ms  p95 ms   Sim/s     Projectile steps/s  Heap delta');
  for (const profile of report.profiles) {
    console.log([
      profile.fixture.padEnd(19),
      String(profile.units).padStart(5),
      String(profile.objects).padStart(7),
      String(profile.capacity).padStart(8),
      String(profile.peakActive).padStart(5),
      profile.timing.medianMilliseconds.toFixed(2).padStart(10),
      profile.timing.p95Milliseconds.toFixed(2).padStart(8),
      profile.timing.simulatedSecondsPerRealSecond.toFixed(1).padStart(8),
      profile.timing.projectileSubstepsPerSecond.toFixed(0).padStart(21),
      formatBytes(profile.timing.retainedHeapDeltaBytesMedian).padStart(11),
    ].join(' '));
  }
  console.log('');
  console.log('Capacity sweep:');
  for (const entry of report.capacitySweep) {
    console.log(`  ${entry.capacity}: peak=${entry.peakActive}, rejected=${entry.capRejections}, saturation=${(entry.saturation * 100).toFixed(1)}%, headroom=${entry.headroomPass ? 'PASS' : 'FAIL'}`);
  }
  console.log('');
  console.log(`Direct comparison throughput ratio Stage4/Stage3: ${report.directComparison.throughputRatioStage4OverStage3.toFixed(3)}`);
  console.log(`Direct comparison retained heap ratio Stage4/Stage3: ${report.directComparison.heapRatioStage4OverStage3.toFixed(3)}`);
  console.log(`Idle overhead ratio Stage4/Stage3: ${report.directComparison.idleComparison.overheadRatioStage4OverStage3.toFixed(3)} (${report.directComparison.idleComparison.timingNoiseAccepted ? 'noise accepted by zero-work proof' : report.directComparison.idleComparison.timingGatePass ? 'PASS' : 'FAIL'})`);
  console.log(`Stress save/load: ${report.stressSaveLoad.pass ? 'PASS' : 'FAIL'}`);
  console.log(`Overall: ${report.pass ? 'PASS' : 'FAIL'}`);
  if (report.failReasons.length > 0) for (const reason of report.failReasons) console.log(`  FAIL: ${reason}`);
}

function estimateNumericPoolBytes(capacity: number): number {
  const float64FieldCount = 9;
  const uint32FieldCount = 2;
  const uint8FieldCount = 1;
  const int32FieldCount = 1;
  return capacity * (float64FieldCount * 8 + uint32FieldCount * 4 + uint8FieldCount + int32FieldCount * 4);
}

function formatBytes(value: number | null): string {
  if (value === null) return 'n/a';
  const sign = value < 0 ? '-' : '';
  const absolute = Math.abs(value);
  if (absolute >= 1024 * 1024) return `${sign}${(absolute / (1024 * 1024)).toFixed(2)}MiB`;
  if (absolute >= 1024) return `${sign}${(absolute / 1024).toFixed(1)}KiB`;
  return `${Math.round(value)}B`;
}
