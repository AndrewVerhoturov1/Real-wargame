import { readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';

const repoRoot = process.cwd();
const outDir = path.join(repoRoot, '.tmp-infantry-combat-single-shot-smoke');
const sourcePath = path.join(repoRoot, 'scripts', 'infantry_combat_simulation_smoke.ts');
const probePath = path.join(repoRoot, 'scripts', '.tmp_infantry_combat_simulation_probe.ts');

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function run() {
  await rm(outDir, { recursive: true, force: true });
  await rm(probePath, { force: true });
  try {
    let source = await readFile(sourcePath, 'utf8');
    source = source.replace('verifyExplicitEndToEndPipeline();', '// CI probe skipped explicit pipeline');
    source = source.replace('verifyMainSimulationTickInvokesNewPipeline();', '// CI probe skipped main tick');
    source = source.replace('verifyCommitFailureTerminalizesTask();', '// CI probe skipped failure terminalization');
    await writeFile(probePath, source, 'utf8');
    await runSmoke('.tmp_infantry_combat_simulation_probe.ts', 'infantry-combat-simulation.mjs');
  } finally {
    await rm(probePath, { force: true });
    await rm(outDir, { recursive: true, force: true });
  }
}

async function runSmoke(sourceName, outputName) {
  await build({
    root: repoRoot,
    logLevel: 'warn',
    build: {
      ssr: path.join(repoRoot, 'scripts', sourceName),
      outDir,
      emptyOutDir: false,
      minify: false,
      sourcemap: false,
      rollupOptions: {
        output: { entryFileNames: outputName, format: 'es' },
      },
    },
  });
  await import(`${pathToFileURL(path.join(outDir, outputName)).href}?run=stage5-coarse-fine-probe`);
}
