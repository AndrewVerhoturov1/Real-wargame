import { rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';

const repoRoot = process.cwd();
const outDir = path.join(repoRoot, '.tmp-combat-lab-live-state-regression');

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
        ssr: path.join(repoRoot, 'scripts', 'combat_lab_live_state_regression_smoke.ts'),
        outDir,
        emptyOutDir: true,
        minify: false,
        sourcemap: false,
        rollupOptions: { output: { entryFileNames: 'combat-lab-live-state-regression.mjs', format: 'es' } },
      },
    });
    await import(`${pathToFileURL(path.join(outDir, 'combat-lab-live-state-regression.mjs')).href}?run=regression`);
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
}
