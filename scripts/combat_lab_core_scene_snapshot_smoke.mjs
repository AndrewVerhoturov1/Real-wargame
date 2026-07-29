import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const snapshotPath = 'src/core/simulation/SceneSnapshot.ts';
const experimentDir = 'src/core/testing/combat-lab/experiment';
const [snapshot, uiSceneExport, contracts, builtIns, experimentEntries] = await Promise.all([
  readFile(snapshotPath, 'utf8'),
  readFile('src/ui/SceneExport.ts', 'utf8'),
  readFile(path.join(experimentDir, 'CombatLabExperimentContracts.ts'), 'utf8'),
  readFile(path.join(experimentDir, 'CombatLabBuiltInExperiments.ts'), 'utf8'),
  readdir(experimentDir, { withFileTypes: true }),
]);

assert.match(snapshot, /export interface ExportedSceneData/);
assert.match(snapshot, /export function buildSceneSnapshot\(/);
assert.match(snapshot, /export function restoreSimulationStateFromSceneSnapshot\(/);
assert.match(snapshot, /export function normalizeSceneSnapshot\(/);
assert.doesNotMatch(snapshot, /\b(File|Blob|document|localStorage)\b|URL\.createObjectURL/);

assert.match(uiSceneExport, /from '\.\.\/core\/simulation\/SceneSnapshot'/);
for (const browserToken of ['File', 'Blob', 'URL.createObjectURL', 'document.createElement']) {
  assert.match(uiSceneExport, new RegExp(browserToken.replace('.', '\\.')));
}
assert.doesNotMatch(uiSceneExport, /AiRuntimeSnapshot|CombatDamage|WeaponModel|MovementRuntime|serializeInfantryCombatUnitRuntime/);

assert.match(contracts, /from '\.\.\/\.\.\/\.\.\/simulation\/SceneSnapshot'/);
assert.match(contracts, /readonly sceneSnapshot: ExportedSceneData;/);
assert.match(builtIns, /buildSceneSnapshot\(/);
assert.match(builtIns, /from '\.\.\/\.\.\/\.\.\/simulation\/SceneSnapshot'/);
assert.doesNotMatch(builtIns, /buildExportedScene|\/ui\/|\/ai-node-editor\//);

const experimentSources = await Promise.all(
  experimentEntries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
    .map(async (entry) => ({
      name: entry.name,
      source: await readFile(path.join(experimentDir, entry.name), 'utf8'),
    })),
);
const forbiddenImport = /from\s+['"][^'"]*(?:\/ui\/|\/ai-node-editor\/)[^'"]*['"]/;
for (const file of experimentSources) {
  assert.doesNotMatch(file.source, forbiddenImport, `${file.name} imports a browser-owned module.`);
}

console.log('Combat Lab core scene snapshot boundary smoke passed.');
