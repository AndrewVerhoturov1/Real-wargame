import assert from 'node:assert/strict';
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';

const repoRoot = process.cwd();
const outDir = path.join(repoRoot, '.tmp-performance-report-v6-smoke');
const entryFile = path.join(outDir, 'performance-report-v6-smoke.mjs');
const browserSpec = await readFile(path.join(repoRoot, 'tests', 'performance-report-v6-browser.spec.ts'), 'utf8');
assert.match(
  browserSpec,
  /waitForFunction\(\(\) => Boolean\(document\.querySelector\('\[data-performance-marker=/,
  'The v6 browser scenario must wait for the marker control across editor rerenders.',
);
await rm(outDir, { recursive: true, force: true });
try {
  await build({
    root: repoRoot,
    logLevel: 'warn',
    build: {
      ssr: path.join(repoRoot, 'scripts', 'performance_report_v6_smoke.ts'),
      outDir,
      emptyOutDir: true,
      minify: false,
      sourcemap: false,
      rollupOptions: { output: { entryFileNames: 'performance-report-v6-smoke.mjs', format: 'es' } },
    },
  });
  await import(`${pathToFileURL(entryFile).href}?run=${Date.now()}`);
} finally {
  await rm(outDir, { recursive: true, force: true });
}
