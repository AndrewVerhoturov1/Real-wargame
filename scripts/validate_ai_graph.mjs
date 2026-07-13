import { rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';
const repoRoot = process.cwd();
const outDir = path.join(repoRoot, '.tmp-validate-ai-graph');
const entryFile = path.join(outDir, 'validate-ai-graph.mjs');
await rm(outDir, { recursive: true, force: true });
try {
  await build({ root: repoRoot, logLevel: 'warn', build: { ssr: path.join(repoRoot, 'scripts', 'validate_ai_graph.ts'), outDir, emptyOutDir: true, minify: false, sourcemap: false, rollupOptions: { output: { entryFileNames: 'validate-ai-graph.mjs', format: 'es' } } } });
  await import(`${pathToFileURL(entryFile).href}?run=${Date.now()}`);
} finally { await rm(outDir, { recursive: true, force: true }); }
