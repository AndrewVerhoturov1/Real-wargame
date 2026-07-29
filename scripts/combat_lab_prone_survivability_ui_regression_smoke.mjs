import { rmSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { build } from 'vite';

const repoRoot = process.cwd();
const outDir = path.join(repoRoot, '.tmp-combat-lab-prone-survivability-ui-smoke');
const entry = path.join(outDir, 'combat-lab-prone-survivability-ui-regression-smoke.mjs');

run().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function run() {
  rmSync(outDir, { recursive: true, force: true });
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
          footer: 'process.exit(0);',
        },
      },
    },
  });
  const result = spawnSync(process.execPath, [entry], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: 'inherit',
  });
  rmSync(outDir, { recursive: true, force: true });
  process.exit(result.status ?? 1);
}
