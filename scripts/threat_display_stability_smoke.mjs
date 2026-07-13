import { rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';

const root = process.cwd();
const outDir = path.join(root, '.tmp-threat-display-smoke');
const entry = path.join(outDir, 'threat-display-stability-smoke.mjs');
await rm(outDir, { recursive: true, force: true });
try {
  await build({ root, logLevel: 'warn', build: { ssr: path.join(root, 'scripts', 'threat_display_stability_smoke.ts'), outDir, emptyOutDir: true, minify: false, sourcemap: false, rollupOptions: { output: { entryFileNames: 'threat-display-stability-smoke.mjs', format: 'es' } } } });
  await import(`${pathToFileURL(entry).href}?run=${Date.now()}`);
} finally {
  await rm(outDir, { recursive: true, force: true });
}
