import { rm } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { build } from 'vite';

const repoRoot = process.cwd();
const outDir = path.join(repoRoot, '.tmp-combat-lab-scenarios-smoke');
const entry = path.join(outDir, 'combat-lab-scenarios-smoke.mjs');
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
  const result = spawnSync(process.execPath, [entry], {
    cwd: repoRoot,
    stdio: 'inherit',
    shell: false,
    timeout: 120_000,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Combat Lab scenario smoke child exited with ${String(result.status)}.`);
} finally {
  await rm(outDir, { recursive: true, force: true });
}

// Vite may retain an esbuild service in the harness process after a successful
// build. Assertions ran in an isolated child, cleanup is complete, so exit now.
process.exit(0);
