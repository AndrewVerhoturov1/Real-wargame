import { rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';

const root = process.cwd();
const outDir = path.join(root, '.tmp-combat-lab-game-editors-smoke');
const entry = path.join(outDir, 'combat-lab-game-editors-smoke.mjs');
await rm(outDir, { recursive: true, force: true });
try {
  await build({
    root,
    logLevel: 'warn',
    build: {
      target: 'esnext',
      ssr: path.join(root, 'scripts', 'combat_lab_game_editors_behavior_smoke.ts'),
      outDir,
      emptyOutDir: true,
      minify: false,
      sourcemap: false,
      rollupOptions: { output: { entryFileNames: 'combat-lab-game-editors-smoke.mjs', format: 'es' } },
    },
  });
  await import(`${pathToFileURL(entry).href}?run=${Date.now()}`);
} finally {
  await rm(outDir, { recursive: true, force: true });
}
