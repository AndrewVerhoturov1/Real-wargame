import { rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';

const root = process.cwd();
const outDir = path.join(root, '.tmp-linza-right-panel-smoke');
const entry = path.join(outDir, 'linza-right-panel-smoke.mjs');

await rm(outDir, { recursive: true, force: true });
try {
  await build({
    root,
    logLevel: 'warn',
    build: {
      ssr: path.join(root, 'scripts', 'linza_right_panel_product_smoke.ts'),
      outDir,
      emptyOutDir: true,
      minify: false,
      sourcemap: false,
      rollupOptions: {
        output: {
          entryFileNames: 'linza-right-panel-smoke.mjs',
          format: 'es',
        },
      },
    },
  });
  await import(`${pathToFileURL(entry).href}?run=${Date.now()}`);
} finally {
  await rm(outDir, { recursive: true, force: true });
}
