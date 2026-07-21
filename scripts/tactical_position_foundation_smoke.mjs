import { rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';

const repoRoot = process.cwd();
const scenarios = [
  ['static-tactical-position-settings', 'static_tactical_position_settings_smoke.ts'],
  ['static-tactical-candidate-index', 'static_tactical_candidate_index_smoke.ts'],
  ['static-tactical-position-basis', 'static_tactical_position_basis_smoke.ts'],
  ['tactical-position-target-units', 'tactical_position_target_units_smoke.ts'],
  ['tactical-position-queue-fairness', 'tactical_position_queue_fairness_smoke.ts'],
  ['tactical-position-graph-target', 'tactical_position_graph_target_smoke.ts'],
  ['tactical-workspace-tab-state', 'tactical_workspace_tab_state_smoke.ts'],
  ['tactical-position-command-metadata', 'tactical_position_command_metadata_smoke.ts'],
  ['tactical-position-result-refiner', 'tactical_position_result_refiner_smoke.ts'],
];

for (const [name, source] of scenarios) {
  const outDir = path.join(repoRoot, `.tmp-${name}-smoke`);
  const entryFile = path.join(outDir, `${name}-smoke.mjs`);
  await rm(outDir, { recursive: true, force: true });
  try {
    await build({
      root: repoRoot,
      logLevel: 'warn',
      build: {
        ssr: path.join(repoRoot, 'scripts', source),
        outDir,
        emptyOutDir: true,
        minify: false,
        sourcemap: false,
        rollupOptions: {
          output: {
            entryFileNames: `${name}-smoke.mjs`,
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

console.log('tactical position foundation smoke: all scenarios passed');
