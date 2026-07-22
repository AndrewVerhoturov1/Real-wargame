import { rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';

await import('./map_object_geometry_source_contract_smoke.mjs');

const repoRoot = process.cwd();
const outDir = path.join(repoRoot, '.tmp-map-object-geometry-parity-smoke');
const entryFile = path.join(outDir, 'map-object-geometry-parity-smoke.mjs');

await rm(outDir, { recursive: true, force: true });
try {
  await build({
    root: repoRoot,
    logLevel: 'warn',
    build: {
      ssr: path.join(repoRoot, 'scripts', 'map_object_geometry_parity_smoke.ts'),
      outDir,
      emptyOutDir: true,
      minify: false,
      sourcemap: false,
      rollupOptions: { output: { entryFileNames: 'map-object-geometry-parity-smoke.mjs', format: 'es' } },
    },
  });
  await import(`${pathToFileURL(entryFile).href}?run=${Date.now()}`);
} finally {
  await rm(outDir, { recursive: true, force: true });
}
