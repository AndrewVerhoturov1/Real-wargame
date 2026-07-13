import { readFile, writeFile } from 'node:fs/promises';

async function replaceText(path, search, replacement) {
  const source = await readFile(path, 'utf8');
  const next = source.replace(search, replacement);
  if (next === source) throw new Error(`Patch target not found in ${path}: ${String(search).slice(0, 120)}`);
  await writeFile(path, next);
}

await replaceText(
  'src/core/ai/AiGameBridge.ts',
  "      planSequence: nextPlanSequence,\n    };\n    result = cancellationResult ? mergeRuntimeResults(cancellationResult, planResult) : planResult;",
  "      planSequence: nextPlanSequence,\n    };\n    if (nextActivePlan && session.status !== 'active') session = { ...session, status: 'active', lastTerminal: undefined };\n    result = cancellationResult ? mergeRuntimeResults(cancellationResult, planResult) : planResult;",
);

await replaceText(
  'src/ui/TacticalWorkspace.ts',
  "import { applyInitialStateToRuntime, type UnitModel } from '../core/units/UnitModel';\n",
  "import { applyInitialStateToRuntime, type UnitModel } from '../core/units/UnitModel';\nimport { bindTacticalStatePlanPanel, renderTacticalStatePlanPanelMarkup } from './AiStatePlanPanel';\n",
);
await replaceText(
  'src/ui/TacticalWorkspace.ts',
  "      </div>\n      <div class=\"unit-bar-stats\">",
  "      </div>\n      ${renderTacticalStatePlanPanelMarkup()}\n      <div class=\"unit-bar-stats\">",
);
await replaceText(
  'src/ui/TacticalWorkspace.ts',
  "  const turnUnitButton = q<HTMLButtonElement>('[data-action=\"turn-unit\"]');\n",
  "  const turnUnitButton = q<HTMLButtonElement>('[data-action=\"turn-unit\"]');\n  const statePlanPanel = bindTacticalStatePlanPanel(shell);\n",
);
await replaceText(
  'src/ui/TacticalWorkspace.ts',
  "  function updateBottom(): void {\n    const unit = getSelectedUnit(state);\n",
  "  function updateBottom(): void {\n    const unit = getSelectedUnit(state);\n    statePlanPanel.update(unit);\n",
);

await replaceText(
  'src/ai-node-editor/runtime-debug-overlay.ts',
  "const DEBUG_STORAGE_KEY = 'real-wargame.ai-node-editor.debug.v1';\n",
  "import './state-machine-ui';\n\nconst DEBUG_STORAGE_KEY = 'real-wargame.ai-node-editor.debug.v1';\n",
);

await replaceText(
  'src/ai-node-editor/main.ts',
  "void refreshEngineStatus();\n",
  "void refreshEngineStatus();\nwindow.addEventListener('real-wargame:open-ai-subgraph', (event) => {\n  const subgraphId = (event as CustomEvent<{ subgraphId?: string }>).detail?.subgraphId;\n  if (subgraphId) openSubgraphById(subgraphId);\n});\n",
);
await replaceText(
  'src/ai-node-editor/main.ts',
  /function openSelectedSubgraph\(nodeId: string\): void \{[\s\S]*?\n\}/,
  `function openSelectedSubgraph(nodeId: string): void {
  const node = editorGraph.nodes.find((candidate) => candidate.id === nodeId);
  if (!node || node.type !== 'Subgraph') return;
  const subgraphId = typeof node.parameters.subgraphId === 'string' ? node.parameters.subgraphId : 'take_cover';
  openSubgraphById(subgraphId);
}

function openSubgraphById(subgraphId: string): void {
  const graph = getSubgraphGraph(subgraphId);
  const choice = getSubgraphChoice(subgraphId);
  if (!graph || !choice) return;
  graphNavigation.push({ graph: normalizeGraph(JSON.parse(JSON.stringify(editorGraph))), positions: JSON.parse(JSON.stringify(nodePositions)) as Record<string, NodePosition>, selectedNodeId, labelRu: choice.labelRu });
  editorGraph = normalizeGraph(graph);
  nodePositions = {};
  selectedNodeId = editorGraph.rootNodeId;
  ensurePositionsForGraph();
  validationText = \`Открыт активный подграф «\${choice.labelRu}». Изменения не перезаписывают родительский граф.\`;
  render();
}`,
);

console.log('AI state/plan UI patch applied.');
