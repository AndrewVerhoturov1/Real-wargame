import { readFile, writeFile } from 'node:fs/promises';

const workspacePath = 'src/ui/TacticalWorkspace.ts';
let workspace = await readFile(workspacePath, 'utf8');
const replacements = [
  ["['info', 'Инфо'], ['danger', 'Опасность'], ['stealth', 'Скрытность'], ['memory', 'Память'],", "['info', 'Инфо'], ['danger', 'Опасность'], ['stealth', 'Скрытность'], ['memory', 'Обзор и память'],"],
  ["memory:'Память бойца'", "memory:'Обзор и память'"],
  ["heading('Память бойца','Субъективная картина мира выбранного солдата, а не объективная карта.')", "heading('Обзор и память','Текущая видимость показывается тепловой картой, а старые знания остаются субъективными метками бойца.')"],
  ["viewRange: `${Math.round(unit.viewRangeCells * state.map.metersPerCell)} м`,", "viewRange: `${Math.round(unit.attentionSettings.vision.maximumVisualRangeMeters)} м`,"],
];
for (const [before, after] of replacements) {
  if (!workspace.includes(before)) throw new Error(`TacticalWorkspace replacement source not found: ${before}`);
  workspace = workspace.replace(before, after);
}
await writeFile(workspacePath, workspace, 'utf8');

const smokePath = 'scripts/ai_test_lab_smoke.mjs';
let smoke = await readFile(smokePath, 'utf8');
const smokeReplacements = [
  ["'scene-export-v7-perception-attention-ai-runtime-2m-grid'", "'scene-export-v8-view-memory-heatmap-ai-runtime-2m-grid'"],
  ["'Память бойца'", "'Обзор и память'"],
];
for (const [before, after] of smokeReplacements) {
  if (!smoke.includes(before)) throw new Error(`AI lab smoke replacement source not found: ${before}`);
  smoke = smoke.replace(before, after);
}
await writeFile(smokePath, smoke, 'utf8');
