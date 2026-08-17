import { rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';

const repoRoot = process.cwd();
const outDir = path.join(repoRoot, '.tmp-unit-map-token-smoke');
const entryFile = path.join(outDir, 'unit-map-token-smoke.mjs');

await rm(outDir, { recursive: true, force: true });

try {
  await build({
    root: repoRoot,
    logLevel: 'warn',
    build: {
      ssr: path.join(repoRoot, 'scripts', 'unit_map_token_smoke.ts'),
      outDir,
      emptyOutDir: true,
      minify: false,
      sourcemap: false,
      rollupOptions: {
        output: {
          entryFileNames: 'unit-map-token-smoke.mjs',
          format: 'es',
        },
      },
    },
  });

  if (!('navigator' in globalThis)) {
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { userAgent: 'node-unit-map-token-smoke' },
    });
  }

  await import(`${pathToFileURL(entryFile).href}?run=${Date.now()}`);
} finally {
  await rm(outDir, { recursive: true, force: true });
}
