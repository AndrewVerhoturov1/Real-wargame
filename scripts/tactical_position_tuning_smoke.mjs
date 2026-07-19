import { rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';

const repoRoot = process.cwd();
const outDir = path.join(repoRoot, '.tmp-tactical-position-tuning-smoke');
const entryFile = path.join(outDir, 'tactical-position-tuning-smoke.mjs');

await rm(outDir, { recursive: true, force: true });
try {
  await build({
    root: repoRoot,
    logLevel: 'warn',
    build: {
      ssr: path.join(repoRoot, 'scripts', 'tactical_position_tuning_smoke.ts'),
      outDir,
      emptyOutDir: true,
      minify: false,
      sourcemap: false,
      rollupOptions: {
        output: {
          entryFileNames: 'tactical-position-tuning-smoke.mjs',
          format: 'es',
        },
      },
    },
  });
  await import(`${pathToFileURL(entryFile).href}?run=${Date.now()}`);
} finally {
  await rm(outDir, { recursive: true, force: true });
}
