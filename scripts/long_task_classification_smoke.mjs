import { rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';
const repoRoot = process.cwd();
const outDir = path.join(repoRoot, '.tmp-long-task-classification-smoke');
const entryFile = path.join(outDir, 'long-task-classification-smoke.mjs');
await rm(outDir, { recursive: true, force: true });
try {
  await build({ root: repoRoot, logLevel: 'warn', build: { ssr: path.join(repoRoot, 'scripts', 'long_task_classification_smoke.ts'), outDir, emptyOutDir: true, minify: false, sourcemap: false, rollupOptions: { output: { entryFileNames: 'long-task-classification-smoke.mjs', format: 'es' } } } });
  await import(`${pathToFileURL(entryFile).href}?run=${Date.now()}`);
} finally { await rm(outDir, { recursive: true, force: true }); }
