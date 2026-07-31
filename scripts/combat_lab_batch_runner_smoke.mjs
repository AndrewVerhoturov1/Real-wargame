import assert from 'node:assert/strict';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';

const temp = path.resolve('.tmp-combat-lab-batch-runner');
await rm(temp, { recursive: true, force: true });
await mkdir(path.join(temp, 'experiment'), { recursive: true });
try {
  await writeFile(path.join(temp, 'CombatLabContracts.mjs'), "export const COMBAT_LAB_METRIC_IDS=['roundsConsumed','hits','misses'];\n");
  await writeFile(path.join(temp, 'experiment/CombatLabExperimentRunner.mjs'), "export function runCombatLabExperiment(){throw new Error('stub');}\n");
  await writeFile(path.join(temp, 'experiment/CombatLabExperimentDigest.mjs'), "export const digestCombatLabExperiment=()=> 'digest-fixture';\n");
  await writeFile(path.join(temp, 'experiment/CombatLabExperimentContracts.mjs'), `export const COMBAT_LAB_EXPERIMENT_LIMITS_V1={minimumRunCount:1,maximumRunCount:10000,minimumWorkerCount:1,maximumWorkerCount:4,minimumRepresentativeRuns:1,maximumRepresentativeRuns:20,minimumSimulationSeconds:0.1,maximumSimulationSeconds:600};\n`);
  for (const file of ['CombatLabBatchContracts', 'CombatLabBatchStatistics', 'CombatLabRepresentativeRuns', 'CombatLabBatchRunner']) await transpile(file);
  const batch = await import(pathToFileUrl(path.join(temp, 'experiment/CombatLabBatchRunner.mjs')));
  const contracts = await import(pathToFileUrl(path.join(temp, 'experiment/CombatLabBatchContracts.mjs')));
  const experiment = { experimentId: 'fixture', revision: 1, batchDefaults: {}, tracks: [], roles: [], markers: [], defaults: {}, stopCondition: {} };
  const request = (runCount, workerCount = 1) => ({
    schemaVersion: 1, batchRunId: 'batch-1', experiment,
    config: { runCount, seedStrategy: { kind: 'sequential', firstSeed: 100 }, maximumSimulationSeconds: 1, workerCount, representativeRunCount: 20, metricIds: ['roundsConsumed', 'hits', 'misses'] },
  });
  const runner = ({ seed }) => ({
    schemaVersion: 1, experimentId: 'fixture', experimentRevision: 1, sourceDigest: 'digest-fixture', seed,
    completed: true, success: seed % 3 !== 0, stopReason: seed % 3 === 0 ? 'failure-a' : 'complete',
    simulatedSeconds: seed % 7, metrics: { roundsConsumed: seed % 5, hits: seed % 2, misses: (seed + 1) % 2 },
    eventDigest: `event-${seed}`, finalStateDigest: `state-${seed}`, stepFailureCode: null,
  });

  for (const count of [1, 10, 100]) {
    const first = batch.runCombatLabBatchWithRunner(request(count), runner, { chunkSize: 25 });
    const second = batch.runCombatLabBatchWithRunner(request(count), runner, { chunkSize: 25 });
    assert.deepEqual(first, second);
    assert.equal(first.runCount, count);
    assert.equal(first.diagnostics.completedRuns, count);
    assert.equal(first.diagnostics.uniqueSeedCount, count);
    assert.equal(first.diagnostics.uniqueFinalStateDigestCount, count);
  }
  const fourWorkerRequest = request(100, 4);
  const partitions = [0, 1, 2, 3].map((workerId) => Array.from({ length: 100 }, (_, index) => index).filter((index) => index % 4 === workerId));
  const partials = partitions.map((indices) => batch.runCombatLabBatchPartitionWithRunner(fourWorkerRequest, indices, runner, { chunkSize: 25 }));
  const mergedForward = batch.mergeCombatLabBatchPartials(fourWorkerRequest, partials);
  const mergedReverse = batch.mergeCombatLabBatchPartials(fourWorkerRequest, [...partials].reverse());
  const single = batch.runCombatLabBatchWithRunner(fourWorkerRequest, runner, { chunkSize: 25 });
  assert.deepEqual(mergedForward, mergedReverse, 'merge order');
  assert.deepEqual(mergedForward, single, 'worker count independence');
  assert.equal(batch.combatLabSeedForRunIndex({ ...request(3), config: { ...request(3).config, seedStrategy: { kind: 'explicit', seeds: [9, 7, 5] } } }, 1), 7);
  assert.equal(batch.combatLabSeedForRunIndex({ ...request(2), config: { ...request(2).config, seedStrategy: { kind: 'sequential', firstSeed: 0xffffffff } } }, 1), 1);
  const sequentialSeeds = (firstSeed, runCount, workerCount = 1) => {
    const sequentialRequest = { ...request(runCount, workerCount), config: { ...request(runCount, workerCount).config, seedStrategy: { kind: 'sequential', firstSeed } } };
    return Array.from({ length: runCount }, (_, runIndex) => batch.combatLabSeedForRunIndex(sequentialRequest, runIndex));
  };
  assert.deepEqual(sequentialSeeds(0xfffffffe, 5), [0xfffffffe, 0xffffffff, 1, 2, 3]);
  assert.deepEqual(sequentialSeeds(0xffffffff, 4), [0xffffffff, 1, 2, 3]);
  const maximumSequence = sequentialSeeds(0xfffff000, 10_000);
  assert.ok(maximumSequence.every((seed) => Number.isInteger(seed) && seed >= 1 && seed <= 0xffffffff));
  assert.equal(new Set(maximumSequence).size, maximumSequence.length, 'sequential seeds must remain unique within 10,000 runs');
  const workerOneSeeds = sequentialSeeds(0xfffffffe, 100, 1);
  const workerFourRequest = { ...request(100, 4), config: { ...request(100, 4).config, seedStrategy: { kind: 'sequential', firstSeed: 0xfffffffe } } };
  const workerFourSeeds = Array.from({ length: 100 }, (_, runIndex) => batch.combatLabSeedForRunIndex(workerFourRequest, runIndex));
  assert.deepEqual(workerFourSeeds, workerOneSeeds, 'workerCount must not affect the seed for a runIndex');
  let checks = 0;
  assert.throws(() => batch.runCombatLabBatchWithRunner(request(10), runner, { shouldAbort: () => ++checks > 3 }), contracts.CombatLabBatchCancelledError);
  assert.throws(() => batch.runCombatLabBatchWithRunner(request(0), runner), /runCount/);
  assert.ok(single.failureReasons['failure-a'] > 0);
  assert.ok(single.representatives.length <= 20);
  await import('./combat_lab_batch_seed_diagnostics_behavior_smoke.mjs');
  console.log('Combat Lab batch runner smoke passed.');
} finally {
  await rm(temp, { recursive: true, force: true });
}

async function transpile(name) {
  const sourcePath = `src/core/testing/combat-lab/experiment/${name}.ts`;
  const source = await readFile(sourcePath, 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2021, module: ts.ModuleKind.ES2022 }, reportDiagnostics: true });
  assert.equal(output.diagnostics?.length ?? 0, 0, `${sourcePath} has TypeScript syntax diagnostics.`);
  let code = output.outputText;
  for (const dependency of ['CombatLabContracts','CombatLabBatchContracts','CombatLabBatchStatistics','CombatLabExperimentRunner','CombatLabRepresentativeRuns']) {
    code = code.replaceAll(`'./${dependency}'`, `'./${dependency}.mjs'`);
  }
  code = code.replaceAll("'../CombatLabContracts'", "'../CombatLabContracts.mjs'");
  code = code.replaceAll("'./CombatLabExperimentDigest'", "'./CombatLabExperimentDigest.mjs'");
  code = code.replaceAll("'./CombatLabExperimentContracts'", "'./CombatLabExperimentContracts.mjs'");
  await writeFile(path.join(temp, 'experiment', `${name}.mjs`), code);
}
function pathToFileUrl(file) { return new URL(`file://${file.replaceAll('\\\\', '/')}`).href; }
