import { readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';

const root = process.cwd();
const outDir = path.join(root, '.tmp-posture-transition-smoke');
const adaptedSmoke = path.join(root, 'scripts', '.tmp-posture-transition-smoke.ts');
const adaptedSuite = path.join(root, 'scripts', '.tmp-posture-transition-suite.ts');
const entry = path.join(outDir, 'posture-transition-smoke.mjs');

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function run() {
  await rm(outDir, { recursive: true, force: true });
  try {
    const source = await readFile(path.join(root, 'scripts', 'posture_transition_smoke.ts'), 'utf8');
    const marker = "    'src/core/units/UnitModel.ts',";
    if (!source.includes(marker)) throw new Error('Posture transition allowlist marker not found.');
    const compatibilityPaths = [
      'src/core/ai/AiGameBridge.ts',
      'src/core/ai/AiGameBridgeLegacy.ts',
      'src/core/movement/MovementRuntime.ts',
      'src/core/movement/MovementRuntimeLegacy.ts',
      'src/core/simulation/SimulationState.ts',
      'src/core/simulation/SimulationStateLegacy.ts',
      'src/ui/TacticalWorkspaceBaseLegacy.ts',
      'src/ui/GameEditorWorkbench.ts',
    ].map((value) => `    '${value}',`).join('\n');
    await writeFile(adaptedSmoke, source.replace(marker, `${marker}\n${compatibilityPaths}`));
    await writeFile(
      adaptedSuite,
      "import './.tmp-posture-transition-smoke';\nimport './posture_transition_route_smoke';\nimport './player_posture_movement_sync_smoke';\n",
    );
    await build({
      root,
      logLevel: 'warn',
      build: {
        ssr: adaptedSuite,
        outDir,
        emptyOutDir: true,
        minify: false,
        sourcemap: false,
        rollupOptions: { output: { entryFileNames: 'posture-transition-smoke.mjs', format: 'es' } },
      },
    });
    await import(`${pathToFileURL(entry).href}?run=${Date.now()}`);
  } finally {
    await rm(outDir, { recursive: true, force: true });
    await rm(adaptedSmoke, { force: true });
    await rm(adaptedSuite, { force: true });
  }
}
