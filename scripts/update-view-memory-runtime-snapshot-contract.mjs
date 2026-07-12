import { readFile, writeFile } from 'node:fs/promises';

const path = 'scripts/ai_runtime_snapshot_smoke.ts';
let source = await readFile(path, 'utf8');
const oldVersion = "  assert.equal(exported.version, 'scene-export-v7-perception-attention-ai-runtime-2m-grid');";
const newVersion = "  assert.equal(exported.version, 'scene-export-v8-view-memory-heatmap-ai-runtime-2m-grid');";
if (!source.includes(oldVersion)) throw new Error('Old scene version assertion not found.');
source = source.replace(oldVersion, newVersion);
const oldType = `  const exportedUnit = exported.units.find((candidate) => candidate.id === unit.id) as {\n    runtime?: { aiRuntime?: { version?: number; session?: { graphId?: string } } };\n  } | undefined;`;
const newType = `  const exportedUnit = exported.units.find((candidate) => candidate.id === unit.id) as {\n    attention?: { vision?: { maximumVisualRangeMeters?: number; distanceFalloffStartMeters?: number } };\n    runtime?: { aiRuntime?: { version?: number; session?: { graphId?: string } } };\n  } | undefined;`;
if (!source.includes(oldType)) throw new Error('Exported unit contract block not found.');
source = source.replace(oldType, newType);
const anchor = `  assert.equal(exportedUnit?.runtime?.aiRuntime?.version, 1);\n  assert.equal(exportedUnit?.runtime?.aiRuntime?.session?.graphId, waitGraph.id);`;
const expanded = `  assert.equal(exportedUnit?.runtime?.aiRuntime?.version, 1);\n  assert.equal(exportedUnit?.runtime?.aiRuntime?.session?.graphId, waitGraph.id);\n  assert.equal(exportedUnit?.attention?.vision?.maximumVisualRangeMeters, unit.attentionSettings.vision.maximumVisualRangeMeters);\n  assert.equal(exportedUnit?.attention?.vision?.distanceFalloffStartMeters, unit.attentionSettings.vision.distanceFalloffStartMeters);`;
if (!source.includes(anchor)) throw new Error('Runtime snapshot assertion anchor not found.');
source = source.replace(anchor, expanded);
await writeFile(path, source, 'utf8');
