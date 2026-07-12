import { rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';

const repoRoot = process.cwd();
const outDir = path.join(repoRoot, '.tmp-ui-compact-route-controls-smoke');
const entryFile = path.join(outDir, 'ui-compact-route-controls-smoke.mjs');

await rm(outDir, { recursive: true, force: true });
try {
  await build({
    root: repoRoot,
    logLevel: 'warn',
    build: {
      ssr: path.join(repoRoot, 'scripts', 'ui_compact_route_controls_smoke.ts'),
      outDir,
      emptyOutDir: true,
      minify: false,
      sourcemap: false,
      rollupOptions: {
        output: {
          entryFileNames: 'ui-compact-route-controls-smoke.mjs',
          format: 'es',
        },
      },
    },
  });
  await import(`${pathToFileURL(entryFile).href}?run=${Date.now()}`);
} finally {
  await rm(outDir, { recursive: true, force: true });
}
