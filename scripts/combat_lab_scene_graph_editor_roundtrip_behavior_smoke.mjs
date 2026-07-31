import { rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';

const root = process.cwd();
const outDir = path.join(root, '.tmp-combat-lab-scene-graph-editor');
const entry = path.join(outDir, 'combat-lab-scene-graph-editor.mjs');
await rm(outDir, { recursive: true, force: true });
try {
  await build({
    root,
    logLevel: 'warn',
    build: {
      ssr: path.join(root, 'scripts', 'combat_lab_scene_graph_editor_roundtrip_behavior_smoke.ts'),
      outDir,
      emptyOutDir: true,
      minify: false,
      sourcemap: false,
      rollupOptions: { output: { entryFileNames: 'combat-lab-scene-graph-editor.mjs', format: 'es' } },
    },
  });
  await import(`${pathToFileURL(entry).href}?run=${Date.now()}`);
} finally {
  await rm(outDir, { recursive: true, force: true });
}
