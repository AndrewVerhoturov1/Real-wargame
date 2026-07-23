import { rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';

const repoRoot = process.cwd();
const outDir = path.join(repoRoot, '.tmp-infantry-combat-projectile-benchmark');

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
        ssr: path.join(repoRoot, 'scripts', 'infantry_combat_projectile_benchmark.ts'),
        outDir,
        emptyOutDir: true,
        minify: false,
        sourcemap: false,
        rollupOptions: { output: { entryFileNames: 'projectile-benchmark.mjs', format: 'es' } },
      },
    });
    await import(`${pathToFileURL(path.join(outDir, 'projectile-benchmark.mjs')).href}?run=stage4-benchmark`);
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
}
