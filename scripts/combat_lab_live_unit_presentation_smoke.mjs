import { rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';

const root = process.cwd();
const outDir = path.join(root, '.tmp-combat-lab-live-unit-presentation-smoke');
const entry = path.join(outDir, 'combat-lab-live-unit-presentation-smoke.mjs');

try {
  await rm(outDir, { recursive: true, force: true });
  await build({
    root,
    logLevel: 'warn',
    build: {
      ssr: path.join(root, 'scripts', 'combat_lab_live_unit_presentation_smoke.ts'),
      outDir,
      emptyOutDir: true,
      minify: false,
      sourcemap: false,
      rollupOptions: { output: { entryFileNames: 'combat-lab-live-unit-presentation-smoke.mjs', format: 'es' } },
    },
  });
  await import(`${pathToFileURL(entry).href}?run=${Date.now()}`);
} finally {
  await rm(outDir, { recursive: true, force: true });
}
