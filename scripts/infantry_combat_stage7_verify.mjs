import { rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';

const repoRoot = process.cwd();
const outDir = path.join(repoRoot, '.tmp-stage7-projectile-diagnostic');
await rm(outDir, { recursive: true, force: true });
try {
  await build({
    root: repoRoot,
    logLevel: 'warn',
    clearScreen: false,
    build: {
      ssr: path.join(repoRoot, 'scripts', 'infantry_combat_projectile_smoke.ts'),
      outDir,
      emptyOutDir: true,
      minify: false,
      sourcemap: false,
      rollupOptions: { output: { entryFileNames: 'projectile.mjs', format: 'es' } },
    },
  });
  await import(`${pathToFileURL(path.join(outDir, 'projectile.mjs')).href}?run=stage7-diagnostic`);
} finally {
  await rm(outDir, { recursive: true, force: true });
}
console.log('STAGE7_DIAGNOSTIC_PROJECTILE_PASSED');
