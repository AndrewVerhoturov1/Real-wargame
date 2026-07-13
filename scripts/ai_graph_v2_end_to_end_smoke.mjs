import { rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';
const repoRoot = process.cwd();
const outDir = path.join(repoRoot, '.tmp-ai-graph-v2-end-to-end-smoke');
const entryFile = path.join(outDir, 'ai-graph-v2-end-to-end-smoke.mjs');
await rm(outDir, { recursive: true, force: true });
try {
  await build({ root: repoRoot, logLevel: 'warn', build: { ssr: path.join(repoRoot, 'scripts', 'ai_graph_v2_end_to_end_smoke.ts'), outDir, emptyOutDir: true, minify: false, sourcemap: false, rollupOptions: { output: { entryFileNames: 'ai-graph-v2-end-to-end-smoke.mjs', format: 'es' } } } });
  await import(`${pathToFileURL(entryFile).href}?run=${Date.now()}`);
} finally { await rm(outDir, { recursive: true, force: true }); }
