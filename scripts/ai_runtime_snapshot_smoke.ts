import assert from 'node:assert/strict';
import mapData from '../src/data/maps/test_map.json';
import unitsData from '../src/data/units/test_units.json';
import type { AiGraph } from '../src/core/ai/AiGraph';
import { ensureRuntimeSession } from '../src/core/ai/AiGameBridge';
import { runAiGraphRuntime, type AiGraphRuntimeResult } from '../src/core/ai/AiGraphRuntime';
import { createAiRouteStatusState } from '../src/core/ai/AiRouteStatus';
import {
  buildAiRuntimeSceneSnapshot,
  normalizeAiRuntimeSceneSnapshot,
  restoreMoveOrder,
} from '../src/core/ai/runtime/AiRuntimeSnapshot';
import {
  applyRuntimeResultToSession,
  createAiRuntimeSession,
  type AiRuntimeSessionSnapshotV1,
} from '../src/core/ai/runtime/AiRuntimeSession';
import type { MoveOrder } from '../src/core/orders/MoveOrder';
import { createMoveOrder } from '../src/core/orders/MoveOrder';
import type { TacticalMapData } from '../src/core/map/MapModel';
import { createInitialState } from '../src/core/simulation/SimulationState';
import { buildExportedScene, normalizeImportedScene } from '../src/ui/SceneExport';
import { normalizeUnits, type UnitData } from '../src/core/units/UnitModel';

const waitGraph = graphWithAction('snapshot_wait_graph', {
  id: 'wait',
  type: 'Wait',
  children: [],
  parameters: { durationSeconds: 4, timeoutSeconds: 0 },
});
const reloadGraph = graphWithAction('snapshot_reload_graph', {
  id: 'reload',
  type: 'Reload',
  children: [],
  parameters: { durationSeconds: 4, targetAmmo: 30, failIfNoWeapon: true },
});
const moveGraph = graphWithAction('snapshot_move_graph', {
  id: 'move',
  type: 'MoveToBlackboardPosition',
  children: [],
  parameters: {
    targetKey: 'best_cover_position',
    acceptanceRadiusCells: 0.2,
    timeoutSeconds: 15,
    stuckTimeoutSeconds: 2.5,
    minimumProgressCells: 0.05,
    abortOnTargetLost: true,
  },
});

verifyWaitRoundTrip();
verifyReloadRoundTrip();
verifyMoveRoundTrip();
verifyLegacyAndInvalidSnapshots();
verifyUnitModelRestorePath();
verifySceneExportRoundTrip();
verifyGraphMismatchOrderSafety();

console.log('AI runtime snapshot smoke passed: Wait, Move, Reload, legacy scene and invalid graph/version safety.');

function verifyWaitRoundTrip(): void {
  const unitId = 'snapshot_wait_soldier';
  let session = createAiRuntimeSession({ graphId: waitGraph.id, unitId });
  const started = runAiGraphRuntime({
    graph: waitGraph,
    unitId,
    blackboard: {},
    cooldowns: {},
    nowMs: 0,
  });
  session = applyRuntimeResultToSession(session, started, 0);
  const updated = runAiGraphRuntime({
    graph: waitGraph,
    unitId,
    blackboard: session.blackboardMemory,
    cooldowns: session.cooldowns,
    nowMs: 1200,
    executionState: session.executionState,
  });
  session = applyRuntimeResultToSession(session, updated, 1200);

  const restored = roundTrip(session, unitId, waitGraph.id);
  assert.equal(restored.session.executionState?.activeNodeStartedAtMs, 0);
  const resumed = resume(restored.session, waitGraph, 1800, {});
  assert.equal(resumed.status, 'waiting');
  assert.equal(resumed.lifecycle[0]?.phase, 'update');
  assert.equal(resumed.activeNodeId, 'wait');
}

function verifyReloadRoundTrip(): void {
  const unitId = 'snapshot_reload_soldier';
  let session = createAiRuntimeSession({ graphId: reloadGraph.id, unitId });
  const blackboard = { ammo: 3, weaponReady: true };
  const started = runAiGraphRuntime({
    graph: reloadGraph,
    unitId,
    blackboard,
    cooldowns: {},
    nowMs: 0,
  });
  assert.deepEqual(started.effects.map((effect) => effect.type), ['begin_reload']);
  session = applyRuntimeResultToSession(session, started, 0);
  const updated = runAiGraphRuntime({
    graph: reloadGraph,
    unitId,
    blackboard,
    cooldowns: session.cooldowns,
    nowMs: 1200,
    executionState: session.executionState,
  });
  session = applyRuntimeResultToSession(session, updated, 1200);

  const restored = roundTrip(session, unitId, reloadGraph.id);
  assert.equal(restored.session.executionState?.activeData?.kind, 'reload');
  const resumed = resume(restored.session, reloadGraph, 1800, blackboard);
  assert.equal(resumed.status, 'running');
  assert.equal(resumed.lifecycle[0]?.phase, 'update');
  assert.deepEqual(resumed.effects, [], 'restored Reload must not emit begin_reload again');
}

function verifyMoveRoundTrip(): void {
  const unitId = 'snapshot_move_soldier';
  const target = { x: 7, y: 4 };
  const startBlackboard = {
    best_cover_position: target,
    self_position: { x: 1, y: 1 },
    active_move_source: null,
    active_move_owner_token: null,
    active_move_target: null,
  };
  let session = createAiRuntimeSession({ graphId: moveGraph.id, unitId });
  const started = runAiGraphRuntime({
    graph: moveGraph,
    unitId,
    blackboard: startBlackboard,
    cooldowns: {},
    nowMs: 0,
  });
  session = applyRuntimeResultToSession(session, started, 0);
  const activeData = session.executionState?.activeData;
  assert.equal(activeData?.kind, 'move_to_blackboard_position');
  if (activeData?.kind !== 'move_to_blackboard_position') throw new Error('Move state missing.');

  const order: MoveOrder = {
    type: 'move',
    target: { ...target },
    requestedTarget: { ...target },
    issuedAtMs: 500,
    source: 'ai',
    ownerToken: activeData.actionToken,
    waypoints: [{ x: 2, y: 1 }, { x: 4, y: 2 }, { ...target }],
    waypointIndex: 1,
    routeCells: [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 3, y: 2 }, { x: 7, y: 4 }],
    routeCellIndex: 2,
    routeStatus: 'following',
    routeRevision: 4,
    pathCost: 8.5,
    pathVisitedCells: 31,
    pathReason: 'Saved route.',
    pathReasonRu: 'Сохранённый маршрут.',
  };
  const routeStatus = createAiRouteStatusState({
    nowMs: 1000,
    position: { x: 2, y: 1.5 },
    target,
    ownerToken: activeData.actionToken,
  });
  const updatedBlackboard = {
    ...startBlackboard,
    self_position: { x: 2, y: 1.5 },
    active_move_source: 'ai',
    active_move_owner_token: activeData.actionToken,
    active_move_target: target,
  };
  const updated = runAiGraphRuntime({
    graph: moveGraph,
    unitId,
    blackboard: updatedBlackboard,
    cooldowns: session.cooldowns,
    nowMs: 1200,
    executionState: session.executionState,
  });
  session = applyRuntimeResultToSession(session, updated, 1200);

  const snapshot = buildAiRuntimeSceneSnapshot(session, order, routeStatus);
  assert.ok(snapshot);
  const normalized = normalizeAiRuntimeSceneSnapshot(JSON.parse(JSON.stringify(snapshot)), {
    unitId,
    expectedGraphId: moveGraph.id,
  });
  assert.equal(normalized.restored, true);
  assert.ok(normalized.snapshot?.activeOrder);
  assert.equal(normalized.snapshot.activeOrder.ownerToken, activeData.actionToken);
  assert.equal(normalized.snapshot.activeOrder.waypointIndex, 1);
  assert.equal(normalized.snapshot.activeOrder.routeCellIndex, 2);
  assert.equal(normalized.snapshot.activeOrder.routeRevision, 4);
  assert.equal(normalized.snapshot.routeStatus?.lastProgressAtMs, 1000);
  const restoredOrder = restoreMoveOrder(normalized.snapshot.activeOrder);
  assert.deepEqual(restoredOrder.routeCells, order.routeCells);
  assert.deepEqual(restoredOrder.waypoints, order.waypoints);

  const resumed = resume(normalized.snapshot.session, moveGraph, 1800, {
    ...updatedBlackboard,
    self_position: { x: 2.5, y: 1.8 },
  });
  assert.equal(resumed.status, 'running');
  assert.equal(resumed.lifecycle[0]?.phase, 'update');
  assert.deepEqual(resumed.effects, [], 'restored Move must not emit begin_move again');
}

function verifyUnitModelRestorePath(): void {
  const unitId = 'unit_model_restore';
  const target = { x: 6, y: 3 };
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
  if (activeData?.kind !== 'move_to_blackboard_position') throw new Error('Unit restore move state missing.');
  const order: MoveOrder = {
    type: 'move',
    target,
    requestedTarget: target,
    issuedAtMs: 123,
    source: 'ai',
    ownerToken: activeData.actionToken,
    waypoints: [{ x: 2, y: 1 }, target],
    waypointIndex: 1,
    routeCells: [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 6, y: 3 }],
    routeCellIndex: 1,
    routeStatus: 'following',
    routeRevision: 2,
  };
  const snapshot = buildAiRuntimeSceneSnapshot(
    session,
    order,
    createAiRouteStatusState({ nowMs: 100, position: { x: 2, y: 1 }, target, ownerToken: activeData.actionToken }),
  );
  assert.ok(snapshot);
  const unitData: UnitData = {
    id: unitId,
    label: 'Restored soldier',
    labelRu: 'Восстановленный боец',
    type: 'infantry_squad',
    side: 'player',
    x: 1,
    y: 1,
    runtime: { aiRuntime: JSON.parse(JSON.stringify(snapshot)) },
  };
  const [unit] = normalizeUnits([unitData]);
  assert.ok(unit);
  assert.equal(unit.behaviorRuntime.aiRuntimeSession?.executionState?.activeNodeId, 'move');
  assert.equal(unit.behaviorRuntime.aiRouteStatusState?.ownerToken, activeData.actionToken);
  assert.equal(unit.order?.ownerToken, activeData.actionToken);
  assert.equal(unit.order?.routeCellIndex, 1);
  assert.equal(unit.behaviorRuntime.lastEvent, 'ai_runtime_scene_restored');
}

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
  assert.equal(exported.version, 'scene-export-v8-view-memory-heatmap-ai-runtime-2m-grid');
  const exportedUnit = exported.units.find((candidate) => candidate.id === unit.id) as {
    attention?: { vision?: { maximumVisualRangeMeters?: number; distanceFalloffStartMeters?: number } };
    runtime?: { aiRuntime?: { version?: number; session?: { graphId?: string } } };
  } | undefined;
  assert.equal(exportedUnit?.runtime?.aiRuntime?.version, 1);
  assert.equal(exportedUnit?.runtime?.aiRuntime?.session?.graphId, waitGraph.id);
  assert.equal(exportedUnit?.attention?.vision?.maximumVisualRangeMeters, unit.attentionSettings.vision.maximumVisualRangeMeters);
  assert.equal(exportedUnit?.attention?.vision?.distanceFalloffStartMeters, unit.attentionSettings.vision.distanceFalloffStartMeters);

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

  const [playerUnit] = normalizeUnits([{ ...baseData, id: `${unitId}_player`, runtime: undefined }]);
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

function verifyLegacyAndInvalidSnapshots(): void {
  const legacy = normalizeAiRuntimeSceneSnapshot(undefined, { unitId: 'legacy' });
  assert.equal(legacy.legacy, true);
  assert.equal(legacy.snapshot, undefined);
  assert.match(legacy.messageRu, /Старый формат/i);

  const invalidVersion = normalizeAiRuntimeSceneSnapshot({ version: 99 }, { unitId: 'invalid' });
  assert.equal(invalidVersion.restored, false);
  assert.equal(invalidVersion.snapshot, undefined);
  assert.match(invalidVersion.messageRu, /сброшен/i);

  const session = createAiRuntimeSession({ graphId: waitGraph.id, unitId: 'graph_mismatch' });
  const mismatch = normalizeAiRuntimeSceneSnapshot({ version: 1, session }, {
    unitId: 'graph_mismatch',
    expectedGraphId: 'changed_graph',
  });
  assert.equal(mismatch.snapshot, undefined);
  assert.match(mismatch.messageRu, /граф изменился/i);
}

function roundTrip(
  session: AiRuntimeSessionSnapshotV1,
  unitId: string,
  graphId: string,
): NonNullable<ReturnType<typeof normalizeAiRuntimeSceneSnapshot>['snapshot']> {
  const snapshot = buildAiRuntimeSceneSnapshot(session, null, null);
  assert.ok(snapshot);
  const normalized = normalizeAiRuntimeSceneSnapshot(JSON.parse(JSON.stringify(snapshot)), {
    unitId,
    expectedGraphId: graphId,
  });
  assert.equal(normalized.restored, true);
  assert.ok(normalized.snapshot);
  return normalized.snapshot;
}

function resume(
  session: AiRuntimeSessionSnapshotV1,
  graph: AiGraph,
  nowMs: number,
  blackboard: Record<string, unknown>,
): AiGraphRuntimeResult {
  return runAiGraphRuntime({
    graph,
    unitId: session.unitId,
    blackboard: { ...session.blackboardMemory, ...blackboard },
    cooldowns: session.cooldowns,
    nowMs,
    executionState: session.executionState,
  });
}

function graphWithAction(graphId: string, action: AiGraph['nodes'][number]): AiGraph {
  return {
    version: 1,
    id: graphId,
    name: graphId,
    nameRu: graphId,
    rootNodeId: 'root',
    blackboardDefaults: {},
    nodes: [
      { id: 'root', type: 'Root', children: ['sequence'] },
      { id: 'sequence', type: 'SequenceWithMemory', children: [action.id] },
      action,
    ],
  };
}
