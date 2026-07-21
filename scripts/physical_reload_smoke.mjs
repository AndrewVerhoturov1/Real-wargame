import { rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';

async function main() {
  const repoRoot = process.cwd();
  const outDir = path.join(repoRoot, '.tmp-physical-reload-smoke');
  const entryFile = path.join(outDir, 'physical-reload-smoke.mjs');

  await rm(outDir, { recursive: true, force: true });
  try {
    await build({
      root: repoRoot,
      logLevel: 'warn',
      build: {
        ssr: path.join(repoRoot, 'scripts', 'physical_reload_suite.ts'),
        outDir,
        emptyOutDir: true,
        minify: false,
        sourcemap: false,
        rollupOptions: { output: { entryFileNames: 'physical-reload-smoke.mjs', format: 'es' } },
      },
    });
    await import(`${pathToFileURL(entryFile).href}?run=${Date.now()}`);
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
