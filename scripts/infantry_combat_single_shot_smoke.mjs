import { rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';

const repoRoot = process.cwd();
const outDir = path.join(repoRoot, '.tmp-infantry-combat-single-shot-smoke');

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function run() {
  await rm(outDir, { recursive: true, force: true });
  try {
    await runSmoke('infantry_combat_single_shot_smoke.ts', 'infantry-combat-single-shot.mjs');
    await runSmoke('infantry_combat_fire_task_smoke.ts', 'infantry-combat-fire-task.mjs');
    await runSmoke('infantry_combat_geometry_smoke.ts', 'infantry-combat-geometry.mjs');
    await runSmoke('infantry_combat_commit_smoke.ts', 'infantry-combat-commit.mjs');
  } finally {
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
  await import(`${pathToFileURL(path.join(outDir, outputName)).href}?run=stage5-probe`);
}
