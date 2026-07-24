import { rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';

const repoRoot = process.cwd();
const outDir = path.join(repoRoot, '.tmp-stage7-single-shot-diagnostic');
await rm(outDir, { recursive: true, force: true });
try {
  await runSmoke('infantry_combat_projectile_smoke.ts', 'projectile.mjs');
  await runSmoke('infantry_combat_simulation_smoke.ts', 'simulation.mjs');
} finally {
  await rm(outDir, { recursive: true, force: true });
}
console.log('STAGE7_DIAGNOSTIC_PROJECTILE_AND_SIMULATION_PASSED');

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
