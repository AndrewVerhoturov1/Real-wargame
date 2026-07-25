import { rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';

const repoRoot = process.cwd();
const outDir = path.join(repoRoot, '.tmp-stage7-save-load-diagnostic');
await rm(outDir, { recursive: true, force: true });
try {
  await build({
    root: repoRoot,
    logLevel: 'warn',
    clearScreen: false,
    build: {
      ssr: path.join(repoRoot, 'scripts', 'infantry_combat_save_load_smoke.ts'),
      outDir,
      emptyOutDir: true,
      minify: false,
      sourcemap: false,
      rollupOptions: { output: { entryFileNames: 'save-load.mjs', format: 'es' } },
    },
  });
  await import(`${pathToFileURL(path.join(outDir, 'save-load.mjs')).href}?run=stage7-diagnostic`);
} finally {
  await rm(outDir, { recursive: true, force: true });
}
console.log('STAGE7_DIAGNOSTIC_SAVE_LOAD_PASSED');
