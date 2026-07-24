import { rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';

const repoRoot = process.cwd();
const outDir = path.join(repoRoot, '.tmp-infantry-combat-stage6-smoke');

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function run() {
  await rm(outDir, { recursive: true, force: true });
  try {
    await runSmoke('infantry_combat_stage6_body_geometry_smoke.ts', 'stage6-body-geometry-smoke.mjs');
    await runSmoke('infantry_combat_stage6_penetration_smoke.ts', 'stage6-penetration-smoke.mjs');
    await runSmoke('infantry_combat_stage6_wounds_smoke.ts', 'stage6-wounds-smoke.mjs');
    await runSmoke('infantry_combat_stage6_save_load_smoke.ts', 'stage6-save-load-smoke.mjs');
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
}

async function runSmoke(sourceName, outputName) {
  await build({
    root: repoRoot,
    logLevel: 'warn',
    clearScreen: false,
    build: {
      ssr: path.join(repoRoot, 'scripts', sourceName),
      outDir,
      emptyOutDir: false,
      minify: false,
      sourcemap: false,
      rollupOptions: { output: { entryFileNames: outputName, format: 'es' } },
    },
  });
  await import(`${pathToFileURL(path.join(outDir, outputName)).href}?run=stage6`);
}
