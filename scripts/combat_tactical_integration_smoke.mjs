import { rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';

const repoRoot = process.cwd();
const outDir = path.join(repoRoot, '.tmp-combat-tactical-integration-smoke');
const entryFile = path.join(outDir, 'combat-tactical-integration-smoke.mjs');

await rm(outDir, { recursive: true, force: true });

try {
  await build({
    root: repoRoot,
    logLevel: 'warn',
    build: {
      ssr: path.join(repoRoot, 'scripts', 'combat_tactical_integration_smoke.ts'),
      outDir,
      emptyOutDir: true,
      minify: false,
      sourcemap: false,
      rollupOptions: {
        output: {
          entryFileNames: 'combat-tactical-integration-smoke.mjs',
          format: 'es',
        },
      },
    },
  });

  await import(`${pathToFileURL(entryFile).href}?run=${Date.now()}`);
} finally {
  await rm(outDir, { recursive: true, force: true });
}
