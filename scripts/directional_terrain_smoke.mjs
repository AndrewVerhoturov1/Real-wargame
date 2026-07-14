import { rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';

const repoRoot = process.cwd();
const outDir = path.join(repoRoot, '.tmp-directional-terrain-smoke');
const entryFile = path.join(outDir, 'directional-terrain-smoke.mjs');
const comparativeRunner = path.join(repoRoot, 'scripts', 'reverse_slope_comparative_smoke.mjs');

await rm(outDir, { recursive: true, force: true });

try {
  await build({
    root: repoRoot,
    logLevel: 'warn',
    build: {
      ssr: path.join(repoRoot, 'scripts', 'directional_terrain_smoke.ts'),
      outDir,
      emptyOutDir: true,
      minify: false,
      sourcemap: false,
      rollupOptions: {
        output: {
          entryFileNames: 'directional-terrain-smoke.mjs',
          format: 'es',
        },
      },
    },
  });

  await import(`${pathToFileURL(entryFile).href}?run=${Date.now()}`);
  await import(`${pathToFileURL(comparativeRunner).href}?run=${Date.now()}`);
} finally {
  await rm(outDir, { recursive: true, force: true });
}
