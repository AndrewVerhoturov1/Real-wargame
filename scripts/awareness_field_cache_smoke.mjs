import { rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';

const repoRoot = process.cwd();

await runSmoke('awareness-field-cache-smoke', 'awareness_field_cache_smoke.ts');
await runSmoke('combat-safe-position-winner-smoke', 'combat_safe_position_winner_smoke.ts');

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
