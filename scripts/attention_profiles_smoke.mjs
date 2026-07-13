import { rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';

const root = process.cwd();
const outDir = path.join(root, '.tmp-attention-profiles-smoke');
const entry = path.join(outDir, 'attention-profiles-smoke.mjs');
await rm(outDir, { recursive: true, force: true });
try {
  await build({ root, logLevel: 'warn', build: { ssr: path.join(root, 'scripts', 'attention_profiles_smoke.ts'), outDir, emptyOutDir: true, minify: false, sourcemap: false, rollupOptions: { output: { entryFileNames: 'attention-profiles-smoke.mjs', format: 'es' } } } });
  await import(`${pathToFileURL(entry).href}?run=${Date.now()}`);
} finally {
  await rm(outDir, { recursive: true, force: true });
}
