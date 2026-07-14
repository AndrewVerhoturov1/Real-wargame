import { rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';

const repoRoot = process.cwd();

await runSmoke('combat-tactical-integration-smoke', 'combat_tactical_integration_smoke.ts');
await runSmoke(
  'combat-threat-evidence-source-direction-regression-smoke',
  'combat_threat_evidence_source_direction_regression_smoke.ts',
);

async function runSmoke(entryName, sourceFile) {
  const outDir = path.join(repoRoot, `.tmp-${entryName}`);
  const entryFile = path.join(outDir, `${entryName}.mjs`);

  await rm(outDir, { recursive: true, force: true });

  try {
    await build({
      root: repoRoot,
      logLevel: 'warn',
      build: {
        ssr: path.join(repoRoot, 'scripts', sourceFile),
        outDir,
        emptyOutDir: true,
        minify: false,
        sourcemap: false,
        rollupOptions: {
          output: {
            entryFileNames: `${entryName}.mjs`,
            format: 'es',
          },
        },
      },
    });

    await import(`${pathToFileURL(entryFile).href}?run=${Date.now()}`);
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
}
