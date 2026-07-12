import { readFile, writeFile } from 'node:fs/promises';

await patch('src/core/ai/runtime/AiRuntimeSnapshot.ts', (source) => {
  source = replaceOnce(
    source,
    "  const activeOrder = isAiOwnedOrder(order) ? serializeMoveOrder(order) : undefined;\n  const compatibleRouteStatus = activeOrder?.ownerToken",
    "  const activeOwnerToken = readActiveMoveOwnerToken(session);\n  const activeOrder = activeOwnerToken && isAiOwnedOrder(order) && order.ownerToken === activeOwnerToken\n    ? serializeMoveOrder(order)\n    : undefined;\n  const compatibleRouteStatus = activeOrder?.ownerToken",
    'serialize only the active owned move order',
  );
  source = replaceOnce(
    source,
    "  const hasCompatibleOrder = activeOrder\n    && activeOrder.source === 'ai'\n    && typeof activeOrder.ownerToken === 'string'\n    && (!activeOwnerToken || activeOrder.ownerToken === activeOwnerToken);\n  const restoredOrder = hasCompatibleOrder ? activeOrder : undefined;\n  const routeStatus = restoredOrder?.ownerToken",
    "  const hasCompatibleOrder = activeOrder\n    && activeOrder.source === 'ai'\n    && typeof activeOrder.ownerToken === 'string'\n    && (!activeOwnerToken || activeOrder.ownerToken === activeOwnerToken);\n  if (activeOwnerToken && !hasCompatibleOrder) {\n    return resetResult(\n      'Active movement runtime has no matching owned order.',\n      'Runtime сброшен: у активного движения нет подходящего собственного приказа ИИ.',\n    );\n  }\n  const restoredOrder = hasCompatibleOrder ? activeOrder : undefined;\n  const routeStatus = restoredOrder?.ownerToken",
    'reject active move snapshot without matching order',
  );
  return source;
});

await patch('src/core/behavior/BehaviorModel.ts', (source) => {
  source = replaceOnce(
    source,
    "import type { AiRuntimeSessionSnapshotV1 } from '../ai/runtime/AiRuntimeSession';",
    "import type { AiRouteStatusState } from '../ai/AiRouteStatus';\nimport type { AiRuntimeSessionSnapshotV1 } from '../ai/runtime/AiRuntimeSession';",
    'import route status state',
  );
  source = replaceOnce(
    source,
    "  aiRuntimeSession: AiRuntimeSessionSnapshotV1 | null;\n}",
    "  aiRuntimeSession: AiRuntimeSessionSnapshotV1 | null;\n  aiRouteStatusState: AiRouteStatusState | null;\n}",
    'add route status to behavior runtime',
  );
  source = replaceOnce(
    source,
    "    aiRuntimeSession: null,\n  };",
    "    aiRuntimeSession: null,\n    aiRouteStatusState: null,\n  };",
    'initialize route status runtime',
  );
  return source;
});

await patch('src/core/units/UnitModel.ts', (source) => {
  source = replaceOnce(
    source,
    "import type { UnitPlanState } from '../ai/UnitPlan';",
    "import type { UnitPlanState } from '../ai/UnitPlan';\nimport {\n  normalizeAiRuntimeSceneSnapshot,\n  restoreMoveOrder,\n  type AiRuntimeSceneSnapshotV1,\n} from '../ai/runtime/AiRuntimeSnapshot';",
    'import runtime snapshot helpers',
  );
  source = replaceOnce(
    source,
    "export interface UnitData {",
    "export interface UnitRuntimeData extends Partial<Pick<UnitBehaviorRuntime, 'stress' | 'suppression' | 'ammo' | 'weaponReady' | 'posture'>> {\n  aiRuntime?: AiRuntimeSceneSnapshotV1;\n}\n\nexport interface UnitData {",
    'add serialized unit runtime type',
  );
  source = replaceOnce(
    source,
    "  runtime?: Partial<Pick<UnitBehaviorRuntime, 'stress' | 'suppression' | 'ammo' | 'weaponReady' | 'posture'>>;",
    "  runtime?: UnitRuntimeData;",
    'use unit runtime data type',
  );
  source = replaceOnce(
    source,
    "    applyInitialStateToRuntime(model);\n    return model;",
    "    applyInitialStateToRuntime(model);\n    restoreAiRuntimeSnapshot(model, unit.runtime?.aiRuntime);\n    return model;",
    'restore runtime snapshot after base runtime',
  );
  source = replaceOnce(
    source,
    "export function applyInitialStateToRuntime(unit: UnitModel): void {",
    "function restoreAiRuntimeSnapshot(unit: UnitModel, value: unknown): void {\n  if (value === undefined) return;\n  const normalized = normalizeAiRuntimeSceneSnapshot(value, { unitId: unit.id });\n  if (!normalized.snapshot) {\n    unit.behaviorRuntime.aiRuntimeSession = null;\n    unit.behaviorRuntime.aiRouteStatusState = null;\n    unit.order = null;\n    unit.behaviorRuntime.aiGraphReason = normalized.messageRu;\n    unit.behaviorRuntime.reason = normalized.messageRu;\n    unit.behaviorRuntime.lastEvent = 'ai_runtime_scene_reset';\n    return;\n  }\n\n  unit.behaviorRuntime.aiRuntimeSession = normalized.snapshot.session;\n  unit.behaviorRuntime.aiNodeCooldowns = { ...normalized.snapshot.session.cooldowns };\n  unit.behaviorRuntime.aiRouteStatusState = normalized.snapshot.routeStatus ?? null;\n  unit.order = normalized.snapshot.activeOrder\n    ? restoreMoveOrder(normalized.snapshot.activeOrder)\n    : null;\n  unit.behaviorRuntime.aiGraphReason = normalized.messageRu;\n  unit.behaviorRuntime.reason = normalized.messageRu;\n  unit.behaviorRuntime.lastEvent = 'ai_runtime_scene_restored';\n}\n\nexport function applyInitialStateToRuntime(unit: UnitModel): void {",
    'add unit runtime snapshot restore helper',
  );
  source = replaceOnce(
    source,
    "  unit.behaviorRuntime.aiNodeCooldowns = {};\n  unit.soldier.condition.fatigue",
    "  unit.behaviorRuntime.aiNodeCooldowns = {};\n  unit.behaviorRuntime.aiRuntimeSession = null;\n  unit.behaviorRuntime.aiRouteStatusState = null;\n  unit.soldier.condition.fatigue",
    'reset session and route state with initial state',
  );
  return source;
});

await patch('src/ui/SceneExport.ts', (source) => {
  source = replaceOnce(
    source,
    "import {\n  resolveObjectCoverProperties,",
    "import { buildAiRuntimeSceneSnapshot } from '../core/ai/runtime/AiRuntimeSnapshot';\nimport {\n  resolveObjectCoverProperties,",
    'import runtime snapshot builder',
  );
  source = replaceOnce(
    source,
    "function normalizeImportedScene(value: unknown): {",
    "export function normalizeImportedScene(value: unknown): {",
    'export scene normalizer for tests',
  );
  source = replaceOnce(
    source,
    "function buildExportedScene(state: SimulationState): ExportedSceneData {",
    "export function buildExportedScene(state: SimulationState): ExportedSceneData {",
    'export scene builder for tests',
  );
  source = replaceOnce(
    source,
    "    version: 'scene-export-v5-2m-grid',",
    "    version: 'scene-export-v6-ai-runtime-2m-grid',",
    'bump scene export version',
  );
  source = replaceOnce(
    source,
    "      posture: unit.behaviorRuntime.posture,\n    },",
    "      posture: unit.behaviorRuntime.posture,\n      aiRuntime: buildAiRuntimeSceneSnapshot(\n        unit.behaviorRuntime.aiRuntimeSession,\n        unit.order,\n        unit.behaviorRuntime.aiRouteStatusState,\n      ),\n    },",
    'export AI runtime snapshot',
  );
  source = replaceOnce(
    source,
    "  refreshAiTestLabSceneSnapshot(state);\n  state.editor.lastMessage = `JSON сцены загружен в сетку ${state.map.metersPerCell} м: карта ${state.map.width}×${state.map.height}, юнитов ${state.units.length}, зон ${state.pressureZones.length}.`;",
    "  refreshAiTestLabSceneSnapshot(state);\n  const restoredRuntimeCount = state.units.filter((unit) => unit.behaviorRuntime.lastEvent === 'ai_runtime_scene_restored').length;\n  const resetRuntimeCount = state.units.filter((unit) => unit.behaviorRuntime.lastEvent === 'ai_runtime_scene_reset').length;\n  const runtimeMessage = restoredRuntimeCount > 0\n    ? ` Runtime восстановлен у бойцов: ${restoredRuntimeCount}.`\n    : resetRuntimeCount > 0\n      ? ` Runtime сброшен у бойцов: ${resetRuntimeCount}.`\n      : ' Старый формат сцены загружен без активного действия ИИ.';\n  state.editor.lastMessage = `JSON сцены загружен в сетку ${state.map.metersPerCell} м: карта ${state.map.width}×${state.map.height}, юнитов ${state.units.length}, зон ${state.pressureZones.length}.${runtimeMessage}`;",
    'report runtime restore result in Russian',
  );
  return source;
});

await patch('src/core/ai/AiGameBridge.ts', (source) => {
  source = replaceOnce(
    source,
    "  if (runtime.aiRuntimeSession) {\n    const normalized = normalizeAiRuntimeSession(runtime.aiRuntimeSession, { graphId, unitId: unit.id });\n    runtime.aiRuntimeSession = normalized.session;\n    if (normalized.resetReasonRu) {\n      runtime.aiGraphReason = normalized.resetReasonRu;\n      runtime.reason = normalized.resetReasonRu;\n      runtime.lastEvent = 'ai_runtime_session_reset';\n    }\n    return normalized.session;\n  }",
    "  if (runtime.aiRuntimeSession) {\n    const previousSession = runtime.aiRuntimeSession;\n    const activeData = previousSession.executionState?.activeData;\n    const ownedMoveToken = activeData?.kind === 'move_to_blackboard_position'\n      ? activeData.actionToken\n      : undefined;\n    const normalized = normalizeAiRuntimeSession(previousSession, { graphId, unitId: unit.id });\n    runtime.aiRuntimeSession = normalized.session;\n    if (normalized.resetReasonRu) {\n      if (ownedMoveToken && unit.order?.source === 'ai' && unit.order.ownerToken === ownedMoveToken) {\n        unit.order = null;\n      }\n      unit.behaviorRuntime.aiRouteStatusState = null;\n      runtime.aiGraphReason = normalized.resetReasonRu;\n      runtime.reason = normalized.resetReasonRu;\n      runtime.lastEvent = 'ai_runtime_session_reset';\n    }\n    return normalized.session;\n  }",
    'clean only matching owned order on session reset',
  );
  return source;
});

await patch('src/core/ai/AiStatefulMoveGameBridge.ts', (source) => {
  source = replaceOnce(
    source,
    "  aiGraphExecutionState?: AiGraphExecutionState;\n  aiRouteStatusState?: AiRouteStatusState;\n  aiRouteSettingsCache?: RouteSettingsCache;",
    "  aiGraphExecutionState?: AiGraphExecutionState;\n  aiRouteSettingsCache?: RouteSettingsCache;",
    'use typed behavior route status state',
  );
  source = replaceOnce(
    source,
    "    previousState: runtime.aiRouteStatusState,",
    "    previousState: runtime.aiRouteStatusState ?? undefined,",
    'normalize nullable route status for updater',
  );
  source = replaceOnce(
    source,
    "    if (effect.type === 'begin_move') {\n      const planned",
    "    if (effect.type === 'begin_move') {\n      runtime.aiRouteStatusState = null;\n      const planned",
    'reset route status when a new move starts',
  );
  source = replaceOnce(
    source,
    "      unit.order = null;\n      if (!hasLaterNonMoveEffect(result, index)) {",
    "      unit.order = null;\n      runtime.aiRouteStatusState = null;\n      if (!hasLaterNonMoveEffect(result, index)) {",
    'clear route state with matching owned order',
  );
  return source;
});

await patch('scripts/ai_runtime_snapshot_smoke.ts', (source) => {
  source = replaceOnce(
    source,
    "import type { MoveOrder } from '../src/core/orders/MoveOrder';",
    "import type { MoveOrder } from '../src/core/orders/MoveOrder';\nimport { normalizeUnits, type UnitData } from '../src/core/units/UnitModel';",
    'import UnitModel restore path',
  );
  source = replaceOnce(
    source,
    "verifyLegacyAndInvalidSnapshots();\n\nconsole.log",
    "verifyLegacyAndInvalidSnapshots();\nverifyUnitModelRestorePath();\n\nconsole.log",
    'run UnitModel restore test',
  );
  source = replaceOnce(
    source,
    "function verifyLegacyAndInvalidSnapshots(): void {",
    "function verifyUnitModelRestorePath(): void {\n  const unitId = 'unit_model_restore';\n  const target = { x: 6, y: 3 };\n  const started = runAiGraphRuntime({\n    graph: moveGraph,\n    unitId,\n    blackboard: {\n      best_cover_position: target,\n      self_position: { x: 1, y: 1 },\n      active_move_source: null,\n      active_move_owner_token: null,\n      active_move_target: null,\n    },\n    cooldowns: {},\n    nowMs: 0,\n  });\n  const session = applyRuntimeResultToSession(\n    createAiRuntimeSession({ graphId: moveGraph.id, unitId }),\n    started,\n    0,\n  );\n  const activeData = session.executionState?.activeData;\n  if (activeData?.kind !== 'move_to_blackboard_position') throw new Error('Unit restore move state missing.');\n  const order: MoveOrder = {\n    type: 'move',\n    target,\n    requestedTarget: target,\n    issuedAtMs: 123,\n    source: 'ai',\n    ownerToken: activeData.actionToken,\n    waypoints: [{ x: 2, y: 1 }, target],\n    waypointIndex: 1,\n    routeCells: [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 6, y: 3 }],\n    routeCellIndex: 1,\n    routeStatus: 'following',\n    routeRevision: 2,\n  };\n  const snapshot = buildAiRuntimeSceneSnapshot(\n    session,\n    order,\n    createAiRouteStatusState({ nowMs: 100, position: { x: 2, y: 1 }, target, ownerToken: activeData.actionToken }),\n  );\n  assert.ok(snapshot);\n  const unitData: UnitData = {\n    id: unitId,\n    label: 'Restored soldier',\n    labelRu: 'Восстановленный боец',\n    type: 'infantry_squad',\n    side: 'player',\n    x: 1,\n    y: 1,\n    runtime: { aiRuntime: JSON.parse(JSON.stringify(snapshot)) },\n  };\n  const [unit] = normalizeUnits([unitData]);\n  assert.ok(unit);\n  assert.equal(unit.behaviorRuntime.aiRuntimeSession?.executionState?.activeNodeId, 'move');\n  assert.equal(unit.behaviorRuntime.aiRouteStatusState?.ownerToken, activeData.actionToken);\n  assert.equal(unit.order?.ownerToken, activeData.actionToken);\n  assert.equal(unit.order?.routeCellIndex, 1);\n  assert.equal(unit.behaviorRuntime.lastEvent, 'ai_runtime_scene_restored');\n}\n\nfunction verifyLegacyAndInvalidSnapshots(): void {",
    'add UnitModel snapshot restore test',
  );
  return source;
});

console.log('Runtime snapshot scene integration patch applied.');

async function patch(path, transform) {
  const before = await readFile(path, 'utf8');
  const after = transform(before);
  if (after === before) throw new Error(`${path}: patch made no changes`);
  await writeFile(path, after);
}

function replaceOnce(source, search, replacement, label) {
  if (source.includes(replacement)) return source;
  const first = source.indexOf(search);
  if (first < 0) throw new Error(`${label}: expected source fragment not found`);
  if (source.indexOf(search, first + search.length) >= 0) throw new Error(`${label}: source fragment is not unique`);
  return `${source.slice(0, first)}${replacement}${source.slice(first + search.length)}`;
}
