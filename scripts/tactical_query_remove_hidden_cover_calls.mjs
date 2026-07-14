import { readFile, writeFile } from 'node:fs/promises';

const file = 'src/core/ai/AiGameBridge.ts';
let content = await readFile(file, 'utf8');

function replaceRequired(search, replacement) {
  if (!content.includes(search)) {
    throw new Error(`Missing hidden-cover patch marker: ${search.slice(0, 120)}`);
  }
  content = content.replace(search, replacement);
}

replaceRequired("const COVER_SEARCH_RADIUS_CELLS = 5;\n", '');
replaceRequired(
  `  const bestCover = findBestCoverForThreat(\n    state.map,\n    unit.position,\n    threatPosition,\n    unit.behaviorRuntime.posture,\n    COVER_SEARCH_RADIUS_CELLS,\n  );\n  const distanceToCover = bestCover.distanceCells * state.map.metersPerCell;\n`,
  `  const selectedCover = readPosition(runtimeMemory.best_cover_position);\n  const distanceToCover = selectedCover\n    ? distance(unit.position, selectedCover) * state.map.metersPerCell\n    : 9999;\n`,
);
replaceRequired(
  '    bestCoverQuality: Math.max(0, Math.round(bestCover.score)),\n',
  '    bestCoverQuality: Math.max(0, Math.round(readNumber(runtimeMemory.bestCoverQuality, 0))),\n',
);
replaceRequired(
  '    best_cover_position: bestSafe?.position ?? bestCover.position,\n',
  '',
);
replaceRequired(
  `  if (checkKind === 'cover_exists') {\n    const threats = evaluateThreatsAtPosition(state.map, unit, state.pressureZones);\n    return Boolean(findBestCoverForThreat(state.map, unit.position, threats.targetPosition, unit.behaviorRuntime.posture).position);\n  }\n`,
  `  if (checkKind === 'cover_exists') {\n    return Boolean(readPosition(blackboard.best_cover_position));\n  }\n`,
);
replaceRequired(
  "  if (key === 'cover') return findBestCoverForThreat(state.map, unit.position, threats.targetPosition, unit.behaviorRuntime.posture).position;\n",
  "  if (key === 'cover') return readPosition(blackboard.best_cover_position);\n",
);

await writeFile(file, content, 'utf8');
console.log('Removed all implicit cover winner searches from AiGameBridge.');
