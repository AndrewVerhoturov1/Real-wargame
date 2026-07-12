import { readFile, writeFile } from 'node:fs/promises';

const path = 'scripts/ai_runtime_snapshot_smoke.ts';
let source = await readFile(path, 'utf8');
source = insertOnce(
  source,
  "import assert from 'node:assert/strict';\n",
  "import assert from 'node:assert/strict';\nimport mapData from '../src/data/maps/test_map.json';\nimport unitsData from '../src/data/units/test_units.json';\n",
  'add scene fixture imports',
);
source = insertOnce(
  source,
  "import type { AiGraph } from '../src/core/ai/AiGraph';\n",
  "import type { AiGraph } from '../src/core/ai/AiGraph';\nimport { ensureRuntimeSession } from '../src/core/ai/AiGameBridge';\n",
  'import runtime session bridge',
);
source = insertOnce(
  source,
  "import type { MoveOrder } from '../src/core/orders/MoveOrder';\n",
  "import type { MoveOrder } from '../src/core/orders/MoveOrder';\nimport { createMoveOrder } from '../src/core/orders/MoveOrder';\nimport type { TacticalMapData } from '../src/core/map/MapModel';\nimport { createInitialState } from '../src/core/simulation/SimulationState';\nimport { buildExportedScene, normalizeImportedScene } from '../src/ui/SceneExport';\n",
  'import scene integration helpers',
);
source = replaceOnce(
  source,
  "verifyUnitModelRestorePath();\n\nconsole.log",
  "verifyUnitModelRestorePath();\nverifySceneExportRoundTrip();\nverifyGraphMismatchOrderSafety();\n\nconsole.log",
  'run scene and mismatch contracts',
);
source = replaceOnce(
  source,
  "function verifyLegacyAndInvalidSnapshots(): void {",
  `function verifySceneExportRoundTrip(): void {
  const state = createInitialState(
    mapData as TacticalMapData,
    unitsData as UnitData[],
    [],
  );
  const unit = state.units[0];
  assert.ok(unit);
  const started = runAiGraphRuntime({
    graph: waitGraph,
    unitId: unit.id,
    blackboard: {},
    cooldowns: {},
    nowMs: 0,
  });
  unit.behaviorRuntime.aiRuntimeSession = applyRuntimeResultToSession(
    createAiRuntimeSession({ graphId: waitGraph.id, unitId: unit.id }),
    started,
    0,
  );

  const exported = buildExportedScene(state);
  assert.equal(exported.version, 'scene-export-v6-ai-runtime-2m-grid');
  const exportedUnit = exported.units.find((candidate) => candidate.id === unit.id) as {
    runtime?: { aiRuntime?: { version?: number; session?: { graphId?: string } } };
  } | undefined;
  assert.equal(exportedUnit?.runtime?.aiRuntime?.version, 1);
  assert.equal(exportedUnit?.runtime?.aiRuntime?.session?.graphId, waitGraph.id);

  const imported = normalizeImportedScene(JSON.parse(JSON.stringify(exported)));
  const restoredUnits = normalizeUnits(imported.units);
  const restored = restoredUnits.find((candidate) => candidate.id === unit.id);
  assert.ok(restored);
  assert.equal(restored.behaviorRuntime.aiRuntimeSession?.executionState?.activeNodeId, 'wait');
  const resumed = runAiGraphRuntime({
    graph: waitGraph,
    unitId: restored.id,
    blackboard: restored.behaviorRuntime.aiRuntimeSession?.blackboardMemory ?? {},
    cooldowns: restored.behaviorRuntime.aiRuntimeSession?.cooldowns ?? {},
    nowMs: 600,
    executionState: restored.behaviorRuntime.aiRuntimeSession?.executionState,
  });
  assert.equal(resumed.lifecycle[0]?.phase, 'update');
}

function verifyGraphMismatchOrderSafety(): void {
  const unitId = 'snapshot_graph_mismatch_move';
  const target = { x: 5, y: 3 };
  const started = runAiGraphRuntime({
    graph: moveGraph,
    unitId,
    blackboard: {
      best_cover_position: target,
      self_position: { x: 1, y: 1 },
      active_move_source: null,
      active_move_owner_token: null,
      active_move_target: null,
    },
    cooldowns: {},
    nowMs: 0,
  });
  const session = applyRuntimeResultToSession(
    createAiRuntimeSession({ graphId: moveGraph.id, unitId }),
    started,
    0,
  );
  const activeData = session.executionState?.activeData;
  if (activeData?.kind !== 'move_to_blackboard_position') throw new Error('Mismatch move state missing.');
  const ownedOrder: MoveOrder = {
    type: 'move',
    target,
    requestedTarget: target,
    issuedAtMs: 1,
    source: 'ai',
    ownerToken: activeData.actionToken,
  };
  const snapshot = buildAiRuntimeSceneSnapshot(session, ownedOrder, null);
  assert.ok(snapshot);
  const baseData: UnitData = {
    id: unitId,
    label: 'Mismatch soldier',
    type: 'infantry_squad',
    side: 'player',
    x: 1,
    y: 1,
    runtime: { aiRuntime: snapshot },
  };

  const [ownedUnit] = normalizeUnits([baseData]);
  assert.ok(ownedUnit?.order);
  const reset = ensureRuntimeSession(ownedUnit, 'changed_graph');
  assert.equal(reset.graphId, 'changed_graph');
  assert.equal(reset.status, 'idle');
  assert.equal(ownedUnit.order, null, 'graph mismatch must clear only the restored owned AI order');
  assert.equal(ownedUnit.behaviorRuntime.aiRouteStatusState, null);
  assert.equal(ownedUnit.behaviorRuntime.lastEvent, 'ai_runtime_session_reset');

  const [playerUnit] = normalizeUnits([{ ...baseData, id: \`\${unitId}_player\`, runtime: undefined }]);
  assert.ok(playerUnit);
  playerUnit.behaviorRuntime.aiRuntimeSession = {
    ...session,
    unitId: playerUnit.id,
    executionState: session.executionState ? { ...session.executionState, unitId: playerUnit.id } : undefined,
  };
  const playerOrder = createMoveOrder({ x: 9, y: 9 }, { source: 'player' });
  playerUnit.order = playerOrder;
  ensureRuntimeSession(playerUnit, 'changed_graph');
  assert.equal(playerUnit.order, playerOrder, 'graph mismatch cleanup must preserve a player order');
}

function verifyLegacyAndInvalidSnapshots(): void {`,
  'add scene export and graph mismatch tests',
);
await writeFile(path, source);
console.log('Runtime snapshot scene contracts applied.');

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
