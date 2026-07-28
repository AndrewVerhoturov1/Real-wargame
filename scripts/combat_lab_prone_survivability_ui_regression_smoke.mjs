import { rm } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { build } from 'vite';

const repoRoot = process.cwd();
const outDir = path.join(repoRoot, '.tmp-combat-lab-prone-survivability-ui-smoke');
const entry = path.join(outDir, 'combat-lab-prone-survivability-ui-regression-smoke.mjs');
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
      rollupOptions: { output: { entryFileNames: 'combat-lab-prone-survivability-ui-regression-smoke.mjs' } },
    },
  });
  const result = spawnSync(process.execPath, [entry], { cwd: repoRoot, encoding: 'utf8', stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
} finally {
  await rm(outDir, { recursive: true, force: true });
}
