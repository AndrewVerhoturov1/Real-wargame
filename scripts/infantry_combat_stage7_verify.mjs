import { rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';

const repoRoot = process.cwd();
const outDir = path.join(repoRoot, '.tmp-stage7-single-shot-diagnostic');
await rm(outDir, { recursive: true, force: true });
try {
  await runSmoke('infantry_combat_single_shot_smoke.ts', 'single-shot.mjs');
  await runSmoke('infantry_combat_fire_task_smoke.ts', 'fire-task.mjs');
  await runSmoke('infantry_combat_geometry_smoke.ts', 'geometry.mjs');
  await runSmoke('infantry_combat_commit_smoke.ts', 'commit.mjs');
} finally {
  await rm(outDir, { recursive: true, force: true });
}
console.log('STAGE7_DIAGNOSTIC_SINGLE_SHOT_FIRST_FOUR_PASSED');

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
  await import(`${pathToFileURL(path.join(outDir, outputName)).href}?run=stage7-diagnostic`);
}
