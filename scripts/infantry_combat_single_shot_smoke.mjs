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
    await build({
      root: repoRoot,
      logLevel: 'warn',
      build: {
        ssr: path.join(repoRoot, 'scripts', 'infantry_combat_single_shot_smoke.ts'),
        outDir,
        emptyOutDir: true,
        minify: false,
        sourcemap: false,
        rollupOptions: {
          output: {
            entryFileNames: 'infantry-combat-single-shot.mjs',
            format: 'es',
          },
        },
      },
    });
    await import(`${pathToFileURL(path.join(outDir, 'infantry-combat-single-shot.mjs')).href}?run=stage3`);
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
}
