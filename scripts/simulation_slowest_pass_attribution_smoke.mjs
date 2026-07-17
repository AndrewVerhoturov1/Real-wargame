import { rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';
const repoRoot = process.cwd();
const outDir = path.join(repoRoot, '.tmp-simulation-slowest-pass-smoke');
const entryFile = path.join(outDir, 'simulation-slowest-pass-smoke.mjs');
await rm(outDir, { recursive: true, force: true });
try {
  await build({ root: repoRoot, logLevel: 'warn', build: { ssr: path.join(repoRoot, 'scripts', 'simulation_slowest_pass_attribution_smoke.ts'), outDir, emptyOutDir: true, minify: false, sourcemap: false, rollupOptions: { output: { entryFileNames: 'simulation-slowest-pass-smoke.mjs', format: 'es' } } } });
  await import(`${pathToFileURL(entryFile).href}?run=${Date.now()}`);
} finally { await rm(outDir, { recursive: true, force: true }); }
