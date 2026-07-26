import { rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';

const repoRoot = process.cwd();
const outDir = path.join(repoRoot, '.tmp-combat-lab-scenarios-smoke');
await rm(outDir, { recursive: true, force: true });
try {
  await build({
    root: repoRoot,
    logLevel: 'warn',
    clearScreen: false,
    build: {
      ssr: path.join(repoRoot, 'scripts/combat_lab_scenarios_smoke.ts'),
      outDir,
      emptyOutDir: true,
      minify: false,
      sourcemap: false,
      rollupOptions: { output: { entryFileNames: 'combat-lab-scenarios-smoke.mjs', format: 'es' } },
    },
  });
  await import(`${pathToFileURL(path.join(outDir, 'combat-lab-scenarios-smoke.mjs')).href}?run=stage9v`);
} finally {
  await rm(outDir, { recursive: true, force: true });
}
