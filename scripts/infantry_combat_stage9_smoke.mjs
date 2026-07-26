import { rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';

const repoRoot = process.cwd();
const outDir = path.join(repoRoot, '.tmp-infantry-combat-stage9-smoke');
const smokeFiles = [
  'infantry_combat_stage9_deployment_smoke.ts',
  'infantry_combat_stage9_sector_smoke.ts',
  'infantry_combat_stage9_reload_smoke.ts',
  'infantry_combat_stage9_assistant_smoke.ts',
  'infantry_combat_stage9_ammo_transfer_smoke.ts',
  'infantry_combat_stage9_save_load_smoke.ts',
  'infantry_combat_stage9_stress_smoke.ts',
];

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function run() {
  await rm(outDir, { recursive: true, force: true });
  try {
    for (const sourceName of smokeFiles) {
      const outputName = sourceName.replace(/\.ts$/, '.mjs');
      await runSmoke(sourceName, outputName);
    }
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
}

async function runSmoke(sourceName, outputName) {
  try {
    console.log(`Stage 9 smoke START ${sourceName}`);
    await build({
      root: repoRoot,
      logLevel: 'warn',
      clearScreen: false,
      build: {
        ssr: path.join(repoRoot, 'scripts', sourceName),
        outDir,
        emptyOutDir: false,
        minify: false,
        sourcemap: false,
        rollupOptions: { output: { entryFileNames: outputName, format: 'es' } },
      },
    });
    await import(`${pathToFileURL(path.join(outDir, outputName)).href}?run=stage9`);
    console.log(`Stage 9 smoke PASS ${sourceName}`);
  } catch (error) {
    const message = error instanceof Error
      ? `${error.name}: ${error.message}\n${error.stack ?? ''}`
      : String(error);
    console.error(`::error file=scripts/${sourceName},line=1,title=Stage 9 smoke failed::${escapeAnnotation(message)}`);
    throw error;
  }
}

function escapeAnnotation(value) {
  return String(value)
    .replaceAll('%', '%25')
    .replaceAll('\r', '%0D')
    .replaceAll('\n', '%0A');
}
