import { rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';

const repoRoot = process.cwd();
const outDir = path.join(repoRoot, '.tmp-infantry-combat-stage8-smoke');

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function run() {
  await rm(outDir, { recursive: true, force: true });
  try {
    await runSmoke('infantry_combat_stage8_automatic_fire_smoke.ts', 'stage8-automatic-fire-smoke.mjs');
    await runSmoke('infantry_combat_stage8_support_points_smoke.ts', 'stage8-support-points-smoke.mjs');
    await runSmoke('infantry_combat_stage8_suppression_smoke.ts', 'stage8-suppression-smoke.mjs');
    await runSmoke('infantry_combat_stage8_physical_suppression_smoke.ts', 'stage8-physical-suppression-smoke.mjs');
    await runSmoke('infantry_combat_stage8_save_load_smoke.ts', 'stage8-save-load-smoke.mjs');
    await runSmoke('infantry_combat_stage8_stress_smoke.ts', 'stage8-stress-smoke.mjs');
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
  await import(`${pathToFileURL(path.join(outDir, outputName)).href}?run=stage8`);
}
