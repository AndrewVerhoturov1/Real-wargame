import { rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';

const repoRoot = process.cwd();
const outDir = path.join(repoRoot, '.tmp-infantry-combat-stage7-single-diagnostic');
const sourceName = 'infantry_combat_stage7_blood_smoke.ts';
const outputName = 'stage7-single-diagnostic.mjs';

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function run() {
  await rm(outDir, { recursive: true, force: true });
  try {
    await build({
      root: repoRoot,
      logLevel: 'warn',
      clearScreen: false,
      build: {
        ssr: path.join(repoRoot, 'scripts', sourceName),
        outDir,
        emptyOutDir: true,
        minify: false,
        sourcemap: false,
        rollupOptions: { output: { entryFileNames: outputName, format: 'es' } },
      },
    });
    await import(`${pathToFileURL(path.join(outDir, outputName)).href}?run=stage7-single`);
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
}
