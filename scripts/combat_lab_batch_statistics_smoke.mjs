import assert from 'node:assert/strict';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';

const temp = path.resolve('.tmp-combat-lab-batch-statistics');
await rm(temp, { recursive: true, force: true });
await mkdir(temp, { recursive: true });
try {
  await transpile('src/core/testing/combat-lab/experiment/CombatLabBatchContracts.ts', 'CombatLabBatchContracts.mjs');
  await transpile('src/core/testing/combat-lab/experiment/CombatLabBatchStatistics.ts', 'CombatLabBatchStatistics.mjs');
  await transpile('src/core/testing/combat-lab/experiment/CombatLabRepresentativeRuns.ts', 'CombatLabRepresentativeRuns.mjs');
  const statistics = await import(pathToFileUrl(path.join(temp, 'CombatLabBatchStatistics.mjs')));
  const representatives = await import(pathToFileUrl(path.join(temp, 'CombatLabRepresentativeRuns.mjs')));

  assert.deepEqual(statistics.summarizeCombatLabDistribution([1, 2, 3]), {
    count: 3,
    sampleCount: 3,
    minimum: 1,
    maximum: 3,
    mean: 2,
    median: 2,
    standardDeviation: 0.816496581,
    p05: 1.1,
    p95: 2.9,
    histogram: [
      { minimum: 1, maximum: 2, count: 1 },
      { minimum: 2, maximum: 3, count: 2 },
    ],
  });
  assert.equal(statistics.summarizeCombatLabDistribution([1, 2, 3, 4]).median, 2.5);
  assert.equal(statistics.percentileLinear([0, 10], 0.05), 0.5);
  assert.equal(statistics.percentileLinear([0, 10], 0.95), 9.5);
  const mergedA = statistics.mergeCombatLabMetricValues([{ x: [3, 1] }, { x: [2, 4] }]);
  const mergedB = statistics.mergeCombatLabMetricValues([{ x: [4, 2] }, { x: [1, 3] }]);
  assert.deepEqual(mergedA, mergedB);

  const base = (runIndex, seconds, rounds, success = true, reason = 'ok') => ({
    runIndex, seed: runIndex + 1, success, stopReason: reason, simulatedSeconds: seconds,
    metrics: { roundsConsumed: rounds }, eventDigest: `e${runIndex}`, finalStateDigest: `s${runIndex}`,
  });
  let candidates = representatives.createCombatLabRepresentativeCandidates();
  for (const run of [base(4, 5, 2), base(2, 5, 2), base(7, 8, 9), base(1, 3, 1), base(9, 4, 3, false, 'timeout')]) {
    candidates = representatives.updateCombatLabRepresentativeCandidates(candidates, run);
  }
  const selected = representatives.selectCombatLabRepresentativeRuns(candidates, { timeout: 1 }, 20);
  assert.equal(selected[0].runIndex, 1, 'fastest success');
  assert.equal(selected[1].runIndex, 7, 'slowest success');
  assert.equal(new Set(selected.map((run) => run.runIndex)).size, selected.length);
  assert.ok(selected.some((run) => run.runIndex === 9));
  console.log('Combat Lab batch statistics smoke passed.');
} finally {
  await rm(temp, { recursive: true, force: true });
}

async function transpile(sourcePath, outputName) {
  const source = await readFile(sourcePath, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2021, module: ts.ModuleKind.ES2022 },
    reportDiagnostics: true,
  });
  assert.equal(output.diagnostics?.length ?? 0, 0, `${sourcePath} has TypeScript syntax diagnostics.`);
  const code = output.outputText.replaceAll("'./CombatLabBatchContracts'", "'./CombatLabBatchContracts.mjs'");
  await writeFile(path.join(temp, outputName), code);
}
function pathToFileUrl(file) { return new URL(`file://${file.replaceAll('\\\\', '/')}`).href; }
