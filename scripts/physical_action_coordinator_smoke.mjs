import { rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';

const repoRoot = process.cwd();
const outDir = path.join(repoRoot, '.tmp-physical-action-coordinator-smoke');

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function run() {
  await rm(outDir, { recursive: true, force: true });

  try {
    await runSmoke(
      path.join(repoRoot, 'scripts', 'physical_action_coordinator_smoke.ts'),
      'physical-action-coordinator-contract.mjs',
    );
    await runSmoke(
      path.join(repoRoot, 'scripts', 'physical_action_coordinator_reconciliation_smoke.ts'),
      'physical-action-coordinator-reconciliation.mjs',
    );
    await runSmoke(
      path.join(repoRoot, 'scripts', 'physical_action_coordinator_integration_smoke.ts'),
      'physical-action-coordinator-integration.mjs',
    );
    await runSmoke(
      path.join(repoRoot, 'scripts', 'physical_action_coordinator_terminal_migration_smoke.ts'),
      'physical-action-coordinator-terminal-migration.mjs',
    );
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
}

async function runSmoke(sourceFile, outputFile) {
  await build({
    root: repoRoot,
    logLevel: 'warn',
    build: {
      ssr: sourceFile,
      outDir,
      emptyOutDir: false,
      minify: false,
      sourcemap: false,
      rollupOptions: {
        output: {
          entryFileNames: outputFile,
          format: 'es',
        },
      },
    },
  });

  await import(`${pathToFileURL(path.join(outDir, outputFile)).href}?run=${Date.now()}`);
}
