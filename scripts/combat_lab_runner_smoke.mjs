import { rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { build } from 'vite';

const repoRoot = process.cwd();
const outDir = path.join(repoRoot, '.tmp-combat-lab-runner-smoke');
const entry = path.join(outDir, 'combat-lab-runner-smoke.mjs');
const failureReport = path.join(repoRoot, 'combat-lab-runner-smoke-failure.txt');
await rm(outDir, { recursive: true, force: true });
await rm(failureReport, { force: true });
try {
  await build({
    root: repoRoot,
    logLevel: 'warn',
    clearScreen: false,
    build: {
      ssr: path.join(repoRoot, 'scripts/combat_lab_runner_smoke.ts'),
      outDir,
      emptyOutDir: true,
      minify: false,
      sourcemap: false,
      rollupOptions: { output: { entryFileNames: 'combat-lab-runner-smoke.mjs', format: 'es' } },
    },
  });
  const result = spawnSync(process.execPath, [entry], {
    cwd: repoRoot,
    encoding: 'utf8',
    shell: false,
    timeout: 180_000,
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const report = [
      `status=${String(result.status)}`,
      `signal=${String(result.signal ?? '')}`,
      '--- stdout ---',
      result.stdout ?? '',
      '--- stderr ---',
      result.stderr ?? '',
    ].join('\n');
    await writeFile(failureReport, report);
    throw new Error(`Combat Lab runner smoke child exited with ${String(result.status)}.`);
  }
} finally {
  await rm(outDir, { recursive: true, force: true });
}

// Vite may retain an esbuild service in the harness process after a successful
// build. Assertions ran in an isolated child, cleanup is complete, so exit now.
process.exit(0);
