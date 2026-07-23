import { rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';

const repoRoot = process.cwd();
const outDir = path.join(repoRoot, '.tmp-infantry-combat-projectile-runtime-smoke');

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
        ssr: path.join(repoRoot, 'scripts', 'infantry_combat_projectile_runtime_smoke.ts'),
        outDir,
        emptyOutDir: true,
        minify: false,
        sourcemap: false,
        rollupOptions: { output: { entryFileNames: 'projectile-runtime-smoke.mjs', format: 'es' } },
      },
    });
    await import(`${pathToFileURL(path.join(outDir, 'projectile-runtime-smoke.mjs')).href}?run=stage4`);
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
}
