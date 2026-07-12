import { readFile, writeFile } from 'node:fs/promises';

const files = {
  runtime: 'src/core/ai/AiGraphRuntime.ts',
  composite: 'src/core/ai/runtime/AiCompositeGraphRuntime.ts',
  session: 'src/core/ai/runtime/AiRuntimeSession.ts',
  bridge: 'src/core/ai/AiGameBridge.ts',
};

await patchFile(files.runtime, (source) => {
  source = insertOnce(
    source,
    "import {\n  isMoveToBlackboardPositionActionState,\n  type MoveToBlackboardPositionActionState,\n} from './runtime/actions/MoveToBlackboardPositionAction';\n",
    "import {\n  isMoveToBlackboardPositionActionState,\n  type MoveToBlackboardPositionActionState,\n} from './runtime/actions/MoveToBlackboardPositionAction';\nimport {\n  isReloadActionState,\n  type ReloadActionState,\n} from './runtime/actions/ReloadAction';\n",
    'AiGraphRuntime Reload import',
  );
  source = replaceOnce(
    source,
    'export type AiGraphExecutionData = AiGraphMoveExecutionData;',
    'export type AiGraphExecutionData = AiGraphMoveExecutionData | ReloadActionState;',
    'AiGraphRuntime execution data union',
  );
  source = replaceOnce(
    source,
    "  if (node.type === 'MoveToBlackboardPosition' && isMoveToBlackboardPositionActionState(state.activeData)) {\n    return state.activeData;\n  }\n  return state.activeData;",
    "  if (node.type === 'MoveToBlackboardPosition' && isMoveToBlackboardPositionActionState(state.activeData)) {\n    return state.activeData;\n  }\n  if (node.type === 'Reload' && isReloadActionState(state.activeData)) return state.activeData;\n  return state.activeData;",
    'AiGraphRuntime resolve Reload state',
  );
  source = replaceOnce(
    source,
    "function toExecutionData(value: unknown): AiGraphExecutionData | undefined {\n  return isMoveToBlackboardPositionActionState(value) ? cloneMoveData(value) : undefined;\n}",
    "function toExecutionData(value: unknown): AiGraphExecutionData | undefined {\n  if (isMoveToBlackboardPositionActionState(value)) return cloneMoveData(value);\n  if (isReloadActionState(value)) return { ...value };\n  return undefined;\n}",
    'AiGraphRuntime serialize Reload state',
  );
  return source;
});

await patchFile(files.composite, (source) => {
  source = insertOnce(
    source,
    "import {\n  isMoveToBlackboardPositionActionState,\n  type MoveToBlackboardPositionActionState,\n} from './actions/MoveToBlackboardPositionAction';\n",
    "import {\n  isMoveToBlackboardPositionActionState,\n  type MoveToBlackboardPositionActionState,\n} from './actions/MoveToBlackboardPositionAction';\nimport { isReloadActionState } from './actions/ReloadAction';\n",
    'Composite Reload import',
  );
  source = replaceOnce(
    source,
    "  for (const node of graph.nodes) {\n    if (node.type === 'Selector' && hasStatefulDescendant(nodes, node.id, true)) return true;",
    "  for (const node of graph.nodes) {\n    if (node.type === 'Reload') return true;\n    if (node.type === 'Selector' && hasStatefulDescendant(nodes, node.id, true)) return true;",
    'Composite force Reload runtime',
  );
  source = replaceOnce(
    source,
    "function resolveActionState(node: AiNode, state: AiGraphExecutionState): unknown | undefined {\n  if (node.type === 'Wait') return createLegacyWaitActionState(node.parameters);\n  if (node.type === 'MoveToBlackboardPosition' && isMoveToBlackboardPositionActionState(state.activeData)) return state.activeData;\n  return state.activeData;\n}",
    "function resolveActionState(node: AiNode, state: AiGraphExecutionState): unknown | undefined {\n  if (node.type === 'Wait') return createLegacyWaitActionState(node.parameters);\n  if (node.type === 'MoveToBlackboardPosition' && isMoveToBlackboardPositionActionState(state.activeData)) return state.activeData;\n  if (node.type === 'Reload' && isReloadActionState(state.activeData)) return state.activeData;\n  return state.activeData;\n}",
    'Composite resolve Reload state',
  );
  source = replaceOnce(
    source,
    "function toExecutionData(value: unknown): AiGraphExecutionData | undefined {\n  if (!isMoveToBlackboardPositionActionState(value)) return undefined;\n  return { ...value, target: { ...value.target } };\n}",
    "function toExecutionData(value: unknown): AiGraphExecutionData | undefined {\n  if (isMoveToBlackboardPositionActionState(value)) return { ...value, target: { ...value.target } };\n  if (isReloadActionState(value)) return { ...value };\n  return undefined;\n}",
    'Composite serialize Reload state',
  );
  return source;
});

await patchFile(files.session, (source) => {
  source = insertOnce(
    source,
    "import {\n  cloneCompositeFrames,\n  normalizeCompositeFrames,\n} from './AiCompositeRuntime';\n",
    "import {\n  cloneCompositeFrames,\n  normalizeCompositeFrames,\n} from './AiCompositeRuntime';\nimport { isReloadActionState } from './actions/ReloadAction';\n",
    'Session Reload import',
  );
  source = replaceOnce(
    source,
    "    activeData: value.activeData?.kind === 'move_to_blackboard_position'\n      ? {\n          ...value.activeData,\n          target: { ...value.activeData.target },\n        }\n      : undefined,",
    "    activeData: value.activeData?.kind === 'move_to_blackboard_position'\n      ? {\n          ...value.activeData,\n          target: { ...value.activeData.target },\n        }\n      : isReloadActionState(value.activeData)\n        ? { ...value.activeData }\n        : undefined,",
    'Session clone Reload state',
  );
  return source;
});

await patchFile(files.bridge, (source) => {
  source = insertOnce(
    source,
    "import {\n  applyRuntimeResultToSession,\n  migrateLegacyAiRuntimeSession,\n  normalizeAiRuntimeSession,\n  type AiRuntimeSessionSnapshotV1,\n} from './runtime/AiRuntimeSession';\n",
    "import {\n  applyRuntimeResultToSession,\n  migrateLegacyAiRuntimeSession,\n  normalizeAiRuntimeSession,\n  type AiRuntimeSessionSnapshotV1,\n} from './runtime/AiRuntimeSession';\nimport { readAiGraphRuntimeReloadEffect } from './runtime/actions/ReloadAction';\n",
    'Bridge Reload import',
  );
  source = replaceOnce(
    source,
    "  for (const effect of effects) {\n    if (effect.type === 'write_memory') {",
    "  for (const effect of effects) {\n    const reloadEffect = readAiGraphRuntimeReloadEffect(effect);\n    if (reloadEffect) {\n      if (reloadEffect.type === 'begin_reload') {\n        unit.behaviorRuntime.weaponReady = false;\n        unit.behaviorRuntime.currentAction = 'reload';\n        unit.behaviorRuntime.reason = reloadEffect.reasonRu ?? reloadEffect.reason;\n        unit.behaviorRuntime.lastEvent = 'ai_graph_reload_started';\n      } else if (reloadEffect.type === 'complete_reload') {\n        unit.behaviorRuntime.ammo = reloadEffect.targetAmmo;\n        unit.behaviorRuntime.weaponReady = reloadEffect.targetAmmo > 0;\n        unit.behaviorRuntime.currentAction = 'reload_complete';\n        unit.behaviorRuntime.reason = reloadEffect.reasonRu ?? reloadEffect.reason;\n        unit.behaviorRuntime.lastEvent = 'ai_graph_reload_completed';\n      } else {\n        unit.behaviorRuntime.weaponReady = unit.behaviorRuntime.ammo > 0;\n        unit.behaviorRuntime.currentAction = 'observe';\n        unit.behaviorRuntime.reason = reloadEffect.reasonRu ?? reloadEffect.reason;\n        unit.behaviorRuntime.lastEvent = 'ai_graph_reload_cancelled';\n      }\n      continue;\n    }\n\n    if (effect.type === 'write_memory') {",
    'Bridge apply Reload effects',
  );
  return source;
});

console.log('Reload runtime patch applied.');

async function patchFile(path, transform) {
  const before = await readFile(path, 'utf8');
  const after = transform(before);
  if (after !== before) await writeFile(path, after);
}

function insertOnce(source, marker, replacement, label) {
  if (source.includes(replacement)) return source;
  return replaceOnce(source, marker, replacement, label);
}

function replaceOnce(source, search, replacement, label) {
  const first = source.indexOf(search);
  if (first < 0) throw new Error(`${label}: expected source fragment not found`);
  if (source.indexOf(search, first + search.length) >= 0) throw new Error(`${label}: source fragment is not unique`);
  return `${source.slice(0, first)}${replacement}${source.slice(first + search.length)}`;
}
