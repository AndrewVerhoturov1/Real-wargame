import { readFile, writeFile } from 'node:fs/promises';

const changedFiles = [];

await edit('src/ai-node-editor/NavigationProfileEditor.ts', (source) => {
  let updated = source;
  updated = replaceExact(updated,
    "const graphRoot = document.querySelector<HTMLElement>('#ai-node-editor-root');\nif (!graphRoot) throw new Error('AI node editor root is missing for navigation profile editor.');",
    "const graphRootElement = document.querySelector<HTMLElement>('#ai-node-editor-root');\nif (!graphRootElement) throw new Error('AI node editor root is missing for navigation profile editor.');\nconst graphRoot: HTMLElement = graphRootElement;");
  updated = replaceExact(updated,
    'const clone = structuredClone(draft) as Record<string, unknown>;',
    'const clone = structuredClone(draft) as unknown as Record<string, unknown>;');
  updated = replaceExact(updated,
    'target[parts.at(-1)!] = value;',
    'target[parts[parts.length - 1]] = value;');
  return updated;
});

await edit('src/core/navigation/NavigationProfiles.ts', (source) => replaceExact(
  source,
  "  const terrain = isRecord(value.terrainCosts) ? value.terrainCosts : {};\n  const territory = isRecord(value.territoryWeights) ? value.territoryWeights : {};\n  const replan = isRecord(value.replanRules) ? value.replanRules : {};",
  "  const terrain = (isRecord(value.terrainCosts) ? value.terrainCosts : {}) as unknown as Record<string, unknown>;\n  const territory = (isRecord(value.territoryWeights) ? value.territoryWeights : {}) as unknown as Record<string, unknown>;\n  const replan = (isRecord(value.replanRules) ? value.replanRules : {}) as unknown as Record<string, unknown>;",
));

await edit('src/core/navigation/RouteCostField.ts', (source) => {
  let updated = replaceExact(
    source,
    "  if (forest >= 1 || terrain === 'forest') return 'sparseForest';",
    "  if (forest >= 1) return 'sparseForest';",
  );
  updated = replaceExact(
    updated,
    "    case 'water':\n    case 'forest':",
    "    case 'water':",
  );
  return updated;
});

await edit('src/core/pathfinding/GridPathfinder.ts', (source) => replaceExact(
  source,
  "  const selectedSearch = detourLimited ? baseline : tacticalSearch;\n  if (!selectedSearch.ok) {\n    return failure(selectedSearch.code, requestedGoal, selectedSearch.visitedCells, selectedSearch.reason, selectedSearch.reasonRu);\n  }",
  "  const selectedSearch: SearchSuccess = detourLimited && baseline.ok ? baseline : tacticalSearch;",
));

async function edit(path, transform) {
  const original = await readFile(path, 'utf8');
  const updated = transform(original);
  if (updated === original) return;
  await writeFile(path, updated, 'utf8');
  changedFiles.push(path);
  console.log(`Updated ${path}`);
}

function replaceExact(source, before, after) {
  if (source.includes(before)) return source.replaceAll(before, after);
  if (source.includes(after)) return source;
  throw new Error(`Expected source pattern was not found: ${before.slice(0, 140)}`);
}

console.log(`Navigation compile fixes complete. Changed files: ${changedFiles.length}.`);
