import assert from 'node:assert/strict';
import mapData from '../src/data/maps/test_map.json';
import unitsData from '../src/data/units/test_units.json';
import { ensureRuntimeSession } from '../src/core/ai/AiGameBridge';
import type { AiGraph } from '../src/core/ai/AiGraph';
import { runAiGraphRuntime } from '../src/core/ai/AiGraphRuntime';
import {
  applyRuntimeResultToSession,
  createAiRuntimeSession,
} from '../src/core/ai/runtime/AiRuntimeSession';
import { buildAiRuntimeSceneSnapshot } from '../src/core/ai/runtime/AiRuntimeSnapshot';
import type { TacticalMapData } from '../src/core/map/MapModel';
import { createMoveOrder, type MoveOrder } from '../src/core/orders/MoveOrder';
import { createInitialState } from '../src/core/simulation/SimulationState';
import { normalizeUnits, type UnitData } from '../src/core/units/UnitModel';
import { buildExportedScene, normalizeImportedScene } from '../src/ui/SceneExport';

const waitGraph: AiGraph = {
  version: 1,
  id: 'scene_snapshot_wait_graph',
  name: 'Scene snapshot wait graph',
  nameRu: 'Граф ожидания для snapshot сцены',
  rootNodeId: 'root',
  blackboardDefaults: {},
  nodes: [
    { id: 'root', type: 'Root', children: ['sequence'] },
    { id: 'sequence', type: 'SequenceWithMemory', children: ['wait'] },
    { id: 'wait', type: 'Wait', children: [], parameters: { durationSeconds: 4, timeoutSeconds: 0 } },
  ],
};

const moveGraph: AiGraph = {
  version: 1,
  id: 'scene_snapshot_move_graph',
  name: 'Scene snapshot move graph',
  nameRu: 'Граф движения для snapshot сцены',
  rootNodeId: 'root',
  blackboardDefaults: {},
  nodes: [
    { id: 'root', type: 'Root', children: ['sequence'] },
    { id: 'sequence', type: 'SequenceWithMemory', children: ['move'] },
    {
      id: 'move',
      type: 'MoveToBlackboardPosition',
      children: [],
      parameters: {
        targetKey: 'best_cover_position',
        acceptanceRadiusCells: 0.2,
        timeoutSeconds: 15,
      },
    },
  ],
};

verifySceneExportRoundTrip();
verifyGraphMismatchOrderSafety();
verifyOldSceneWithoutSnapshot();

console.log('AI runtime scene integration smoke passed: export/import resume, graph mismatch cleanup, player order safety and old scene compatibility.');

function verifySceneExportRoundTrip(): void {
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
  assert.equal(exported.version, 'scene-export-v9-minimal-target-visibility-ai-runtime-2m-grid');
  const exportedUnit = exported.units.find((candidate) => candidate.id === unit.id) as {
    attention?: { vision?: { maximumVisualRangeMeters?: number; distanceFalloffStartMeters?: number } };
    runtime?: { aiRuntime?: { version?: number; session?: { graphId?: string } } };
  } | undefined;
  assert.equal(exportedUnit?.runtime?.aiRuntime?.version, 1);
  assert.equal(exportedUnit?.runtime?.aiRuntime?.session?.graphId, waitGraph.id);
  assert.equal(exportedUnit?.attention?.vision?.maximumVisualRangeMeters, unit.attentionSettings.vision.maximumVisualRangeMeters);
  assert.equal(exportedUnit?.attention?.vision?.distanceFalloffStartMeters, unit.attentionSettings.vision.distanceFalloffStartMeters);

  const imported = normalizeImportedScene(JSON.parse(JSON.stringify(exported)));
  const restored = normalizeUnits(imported.units).find((candidate) => candidate.id === unit.id);
  assert.ok(restored);
  assert.equal(restored.behaviorRuntime.aiRuntimeSession?.executionState?.activeNodeId, 'wait');
  assert.equal(restored.behaviorRuntime.lastEvent, 'ai_runtime_scene_restored');
  assert.equal(restored.attentionSettings.vision.maximumVisualRangeMeters, unit.attentionSettings.vision.maximumVisualRangeMeters);
  assert.equal(restored.attentionSettings.vision.distanceFalloffStartMeters, unit.attentionSettings.vision.distanceFalloffStartMeters);

  const resumed = runAiGraphRuntime({
    graph: waitGraph,
    unitId: restored.id,
    blackboard: restored.behaviorRuntime.aiRuntimeSession?.blackboardMemory ?? {},
    cooldowns: restored.behaviorRuntime.aiRuntimeSession?.cooldowns ?? {},
    nowMs: 600,
    executionState: restored.behaviorRuntime.aiRuntimeSession?.executionState,
  });
  assert.equal(resumed.status, 'waiting');
  assert.equal(resumed.lifecycle[0]?.phase, 'update');
}

function verifyGraphMismatchOrderSafety(): void {
  const unitId = 'scene_graph_mismatch_move';
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
  if (activeData?.kind !== 'move_to_blackboard_position') throw new Error('Move state is missing.');

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
    labelRu: 'Боец со сменившимся графом',
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
  assert.equal(ownedUnit.order, null);
  assert.equal(ownedUnit.behaviorRuntime.aiRouteStatusState, null);
  assert.equal(ownedUnit.behaviorRuntime.lastEvent, 'ai_runtime_session_reset');

  const playerUnitId = `${unitId}_player`;
  const [playerUnit] = normalizeUnits([{ ...baseData, id: playerUnitId, runtime: undefined }]);
  assert.ok(playerUnit);
  playerUnit.behaviorRuntime.aiRuntimeSession = {
    ...session,
    unitId: playerUnitId,
    executionState: session.executionState
      ? { ...session.executionState, unitId: playerUnitId }
      : undefined,
  };
  const playerOrder = createMoveOrder({ x: 9, y: 9 }, { source: 'player' });
  playerUnit.order = playerOrder;
  ensureRuntimeSession(playerUnit, 'changed_graph');
  assert.equal(playerUnit.order, playerOrder);
}

function verifyOldSceneWithoutSnapshot(): void {
  const oldScene = {
    version: 'scene-export-v5-2m-grid',
    map: mapData,
    units: unitsData,
    pressureZones: [],
  };
  const imported = normalizeImportedScene(oldScene);
  const units = normalizeUnits(imported.units);
  assert.ok(units.length > 0);
  assert.equal(units[0]?.behaviorRuntime.aiRuntimeSession, null);
  assert.equal(units[0]?.order, null);
}
