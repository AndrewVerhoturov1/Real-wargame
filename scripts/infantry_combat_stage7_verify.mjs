import { rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';

const repoRoot = process.cwd();
const outDir = path.join(repoRoot, '.tmp-stage7-simulation-diagnostic');
await rm(outDir, { recursive: true, force: true });
try {
  await build({
    root: repoRoot,
    logLevel: 'warn',
    clearScreen: false,
    build: {
      ssr: path.join(repoRoot, 'scripts', 'infantry_combat_simulation_smoke.ts'),
      outDir,
      emptyOutDir: true,
      minify: false,
      sourcemap: false,
      rollupOptions: { output: { entryFileNames: 'simulation.mjs', format: 'es' } },
    },
  });
  await import(`${pathToFileURL(path.join(outDir, 'simulation.mjs')).href}?run=stage7-diagnostic`);
} finally {
  await rm(outDir, { recursive: true, force: true });
}
console.log('STAGE7_DIAGNOSTIC_SIMULATION_FIRST_TWO_PASSED');
