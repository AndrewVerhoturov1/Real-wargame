import { readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';

const repoRoot = process.cwd();
const outDir = path.join(repoRoot, '.tmp-infantry-combat-single-shot-smoke');
const sourcePath = path.join(repoRoot, 'scripts', 'infantry_combat_save_load_smoke.ts');
const probePath = path.join(repoRoot, 'scripts', '.tmp_infantry_combat_save_load_probe.ts');

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function run() {
  await rm(outDir, { recursive: true, force: true });
  await rm(probePath, { force: true });
  try {
    let source = await readFile(sourcePath, 'utf8');
    source = source.replace('verifyMissingCommittedProjectileFailsWithoutRecreation();', '// probe skipped missing projectile');
    source = source.replace('verifyRepeatedReconciliationIsIdempotent();', '// probe skipped repeated reconciliation');
    source = source.replace('verifyOrphanProjectileIsRemovedDeterministically();', '// probe skipped orphan projectile');
    await writeFile(probePath, source, 'utf8');
    await runSmoke('.tmp_infantry_combat_save_load_probe.ts', 'infantry-combat-save-load.mjs');
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
  await import(`${pathToFileURL(path.join(outDir, outputName)).href}?run=stage5-save-load-critical-checkpoints`);
}
