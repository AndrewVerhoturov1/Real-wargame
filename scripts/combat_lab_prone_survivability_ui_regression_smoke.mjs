import { rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import process from 'node:process';
import { build } from 'vite';

const repoRoot = process.cwd();
const outDir = path.join(repoRoot, '.tmp-combat-lab-prone-survivability-ui-smoke');

run().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);

async function run() {
  await rm(outDir, { recursive: true, force: true });
  try {
    await build({
      root: repoRoot,
      logLevel: 'warn',
      clearScreen: false,
      build: {
        ssr: path.join(repoRoot, 'scripts/combat_lab_prone_survivability_ui_regression_smoke.ts'),
        outDir,
        emptyOutDir: true,
        minify: false,
        sourcemap: false,
        rollupOptions: {
          output: {
            entryFileNames: 'combat-lab-prone-survivability-ui-regression-smoke.mjs',
            format: 'es',
          },
        },
      },
    });
    const entry = path.join(outDir, 'combat-lab-prone-survivability-ui-regression-smoke.mjs');
    await import(`${pathToFileURL(entry).href}?run=regression`);
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
}
