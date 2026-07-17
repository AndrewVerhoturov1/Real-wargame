import { rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';
const repoRoot = process.cwd();
const outDir = path.join(repoRoot, '.tmp-vegetation-chunk-raster-smoke');
const entryFile = path.join(outDir, 'vegetation-chunk-raster-smoke.mjs');
await rm(outDir, { recursive: true, force: true });
try {
  await build({
    root: repoRoot,
    logLevel: 'warn',
    build: {
      ssr: path.join(repoRoot, 'scripts', 'vegetation_chunk_raster_smoke.ts'),
      outDir,
      emptyOutDir: true,
      minify: false,
      sourcemap: false,
      rollupOptions: { output: { entryFileNames: 'vegetation-chunk-raster-smoke.mjs', format: 'es' } },
    },
  });
  if (!('navigator' in globalThis)) Object.defineProperty(globalThis, 'navigator', { value: { userAgent: '' }, configurable: true });
  await import(`${pathToFileURL(entryFile).href}?run=${Date.now()}`);
} finally {
  await rm(outDir, { recursive: true, force: true });
}
