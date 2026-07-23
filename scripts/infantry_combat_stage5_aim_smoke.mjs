import { rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';

const repoRoot = process.cwd();
const outDir = path.join(repoRoot, '.tmp-infantry-combat-stage5-aim-smoke');

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
        ssr: path.join(repoRoot, 'scripts', 'infantry_combat_stage5_aim_smoke.ts'),
        outDir,
        emptyOutDir: true,
        minify: false,
        sourcemap: false,
        rollupOptions: { output: { entryFileNames: 'stage5-aim-smoke.mjs', format: 'es' } },
      },
    });
    await import(`${pathToFileURL(path.join(outDir, 'stage5-aim-smoke.mjs')).href}?run=stage5`);
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
}
