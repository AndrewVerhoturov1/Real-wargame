import { readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';

const repoRoot = process.cwd();
const outDir = path.join(repoRoot, '.tmp-infantry-combat-single-shot-smoke');
const sourcePath = path.join(repoRoot, 'scripts', 'infantry_combat_save_load_smoke.ts');
const probePath = path.join(repoRoot, 'scripts', '.tmp_infantry_combat_save_load_probe.ts');

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function run() {
  await rm(outDir, { recursive: true, force: true });
  await rm(probePath, { force: true });
  try {
    let source = await readFile(sourcePath, 'utf8');
    source = source.replace(
      `  const checkpoints = [
    ['accepted', 0],
    ['mid-ready', 0.3],
    ['mid-aim', 0.9],
    ['before-commit', 1.699],
    ['after-commit', 1.7],
    ['mid-flight', 1.72],
    ['before-impact', 1.732],
    ['after-impact', 1.734],
    ['mid-recovery', 1.8],
  ] as const;`,
      `  const checkpoints = [
    ['before-impact', 1.732],
  ] as const;`,
    );
    source = source.replace(
      '    assert.deepEqual(stage3Snapshot(loaded), stage3Snapshot(original.state), `${name}: checkpoint must restore exactly`);',
      '    const loadedRuntime = serializeInfantryCombatUnitRuntime(loaded.units[0]!.infantryCombatRuntime);\n    const originalRuntime = serializeInfantryCombatUnitRuntime(original.state.units[0]!.infantryCombatRuntime);\n    const difference = firstDifference(loadedRuntime, originalRuntime);\n    if (difference) throw new Error(`${name}: ${difference}`);\n    continue;',
    );
    source += `
function firstDifference(left: unknown, right: unknown, path = 'runtime'): string | null {
  if (Object.is(left, right)) return null;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right)) return path + ': type mismatch loaded=' + JSON.stringify(left) + ' original=' + JSON.stringify(right);
    if (left.length !== right.length) return path + '.length: loaded=' + left.length + ' original=' + right.length;
    for (let index = 0; index < left.length; index += 1) {
      const difference = firstDifference(left[index], right[index], path + '[' + index + ']');
      if (difference) return difference;
    }
    return null;
  }
  if (left && right && typeof left === 'object' && typeof right === 'object') {
    const leftRecord = left as Record<string, unknown>;
    const rightRecord = right as Record<string, unknown>;
    const keys = [...new Set([...Object.keys(leftRecord), ...Object.keys(rightRecord)])].sort();
    for (const key of keys) {
      if (!(key in leftRecord)) return path + '.' + key + ': missing in loaded';
      if (!(key in rightRecord)) return path + '.' + key + ': missing in original';
      const difference = firstDifference(leftRecord[key], rightRecord[key], path + '.' + key);
      if (difference) return difference;
    }
    return null;
  }
  return path + ': loaded=' + JSON.stringify(left) + ' original=' + JSON.stringify(right);
}
`;
    await writeFile(probePath, source, 'utf8');
    await runSmoke('.tmp_infantry_combat_save_load_probe.ts', 'infantry-combat-save-load.mjs');
  } finally {
    await rm(probePath, { force: true });
    await rm(outDir, { recursive: true, force: true });
  }
}

async function runSmoke(sourceName, outputName) {
  await build({
    root: repoRoot,
    logLevel: 'warn',
    build: {
      ssr: path.join(repoRoot, 'scripts', sourceName),
      outDir,
      emptyOutDir: false,
      minify: false,
      sourcemap: false,
      rollupOptions: { output: { entryFileNames: outputName, format: 'es' } },
    },
  });
  await import(`${pathToFileURL(path.join(outDir, outputName)).href}?run=stage5-save-load-first-difference`);
}
