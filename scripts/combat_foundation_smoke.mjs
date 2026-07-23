import { execFileSync } from 'node:child_process';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';

const repoRoot = process.cwd();
const outDir = path.join(repoRoot, '.tmp-combat-foundation-smoke');
const entryFile = path.join(outDir, 'combat-foundation-smoke.mjs');

execFileSync(process.execPath, [path.join(repoRoot, 'scripts', 'physical_action_coordinator_smoke.mjs')], {
  cwd: repoRoot,
  stdio: 'inherit',
});

await rm(outDir, { recursive: true, force: true });

try {
  await build({
    root: repoRoot,
    logLevel: 'warn',
    build: {
      ssr: path.join(repoRoot, 'scripts', 'combat_foundation_smoke.ts'),
      outDir,
      emptyOutDir: true,
      minify: false,
      sourcemap: false,
      rollupOptions: {
        output: {
          entryFileNames: 'combat-foundation-smoke.mjs',
          format: 'es',
        },
      },
    },
  });

  await import(`${pathToFileURL(entryFile).href}?run=${Date.now()}`);
} finally {
  await rm(outDir, { recursive: true, force: true });
}
