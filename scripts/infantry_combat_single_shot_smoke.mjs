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
    await runSmoke('infantry_combat_projectile_smoke.ts', 'infantry-combat-projectile.mjs');
    await runSmoke('infantry_combat_simulation_smoke.ts', 'infantry-combat-simulation.mjs');
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
