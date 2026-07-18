import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { AiGraph } from '../src/core/ai/AiGraph';
import {
  resetRuntimeGraphSnapshotCacheForTests,
} from '../src/core/ai/AiGameBridge';
import {
  tickAiSimulationScheduler,
} from '../src/core/ai/AiSimulationScheduler';
import { installAiStatefulMoveGameBridge } from '../src/core/ai/AiStatefulMoveGameBridge';
import { createAiRuntimeSession } from '../src/core/ai/runtime/AiRuntimeSession';
import { createFollowMoveOrderPlan } from '../src/core/ai/state/AiPlan';
import { syncSoldierThreatMemory } from '../src/core/knowledge/SoldierThreatMemory';
import type { TacticalMapData } from '../src/core/map/MapModel';
import { createPlayerMoveCommand } from '../src/core/orders/PlayerCommand';
import {
  advanceVisualContact,
  upsertPerceptionContact,
} from '../src/core/perception/PerceptionContact';
import type { PressureZoneData } from '../src/core/pressure/PressureZone';
import { createInitialState, type SimulationState } from '../src/core/simulation/SimulationState';
import { tickSimulation } from '../src/core/simulation/SimulationTick';
import { setAiTestPaused } from '../src/core/testing/AiTestLabRuntime';
import type { UnitData, UnitModel } from '../src/core/units/UnitModel';

const GRAPH_STORAGE_KEY = 'real-wargame.ai-node-editor.graph.v6';
const storage = new Map<string, string>();
let storageReads = 0;
(globalThis as { window?: unknown }).window = {
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
  localStorage: {
    getItem: (key: string) => {
      storageReads += 1;
      return storage.get(key) ?? null;
    },
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  },
};

const mapData: TacticalMapData = {
  width: 32,
  height: 20,
  cellSize: 8,
  metersPerCell: 2,
  defaultTerrain: 'field',
  defaultHeight: 0,
  cellRuns: [],
  cellRects: [],
  cells: [],
  objects: [],
};

const movementGraph: AiGraph = {
  version: 1,
  id: 'per_unit_scheduler_move_graph',
  name: 'Per-unit scheduler move graph',
  rootNodeId: 'root',
  blackboardDefaults: {},
  nodes: [
    { id: 'root', type: 'Root', children: ['sequence'] },
    { id: 'sequence', type: 'SequenceWithMemory', children: ['move', 'posture', 'wait'] },
    {
      id: 'move',
      type: 'MoveToBlackboardPosition',
      children: [],
      parameters: {
        targetKey: 'best_cover_position',
        acceptanceRadiusCells: 0.08,
        timeoutSeconds: 20,
      },
    },
    { id: 'posture', type: 'SetPosture', children: [], parameters: { posture: 'prone' } },
    { id: 'wait', type: 'Wait', children: [], parameters: { durationSeconds: 1.2, timeoutSeconds: 0 } },
  ],
};

const firstDecisionGraph: AiGraph = {
  version: 1,
  id: 'per_unit_scheduler_first_decision_graph',
  name: 'First decision graph',
  rootNodeId: 'root',
  blackboardDefaults: {},
  nodes: [
    { id: 'root', type: 'Root', children: ['sequence'] },
    { id: 'sequence', type: 'SequenceWithMemory', children: ['posture', 'wait'] },
    { id: 'posture', type: 'SetPosture', children: [], parameters: { posture: 'crouch' } },
    { id: 'wait', type: 'Wait', children: [], parameters: { durationSeconds: 5, timeoutSeconds: 0 } },
  ],
};

const alternateGraph: AiGraph = {
  ...firstDecisionGraph,
  id: 'per_unit_scheduler_alternate_graph',
  name: 'Alternate graph revision',
};

const threatGraph: AiGraph = {
  version: 1,
  id: 'per_unit_scheduler_threat_graph',
  name: 'Unselected threat reaction graph',
  rootNodeId: 'root',
  blackboardDefaults: {},
  nodes: [
    { id: 'root', type: 'Root', children: ['sequence'] },
    { id: 'sequence', type: 'SequenceWithMemory', children: ['danger', 'posture', 'wait'] },
    {
      id: 'danger',
      type: 'BlackboardValueAbove',
      children: [],
      parameters: { sourceKey: 'danger', threshold: 10, comparison: 'above' },
    },
    { id: 'posture', type: 'SetPosture', children: [], parameters: { posture: 'prone' } },
    { id: 'wait', type: 'Wait', children: [], parameters: { durationSeconds: 1.2, timeoutSeconds: 0 } },
  ],
};

const reactiveGraph: AiGraph = {
  version: 1,
  id: 'per_unit_scheduler_reactive_graph',
  name: 'Partition invariant reactive graph',
  rootNodeId: 'root',
  blackboardDefaults: { route_ok: true },
  nodes: [
    { id: 'root', type: 'Root', children: ['selector'] },
    { id: 'selector', type: 'Selector', children: ['reactive', 'fallback'] },
    {
      id: 'reactive',
      type: 'ReactiveSequence',
      children: ['route-condition', 'hold'],
      parameters: {
        observePrecedingConditions: true,
        abortPolicy: 'abort_self',
        abortReason: 'Route condition changed.',
        abortReasonRu: 'Условие маршрута изменилось.',
      },
    },
    {
      id: 'route-condition',
      type: 'FlagCheck',
      children: [],
      parameters: { flagKey: 'route_ok', expected: true },
    },
    { id: 'hold', type: 'Wait', children: [], parameters: { durationSeconds: 5, timeoutSeconds: 0 } },
    { id: 'fallback', type: 'SequenceWithMemory', children: ['fallback-posture', 'fallback-wait'] },
    { id: 'fallback-posture', type: 'SetPosture', children: [], parameters: { posture: 'prone' } },
    { id: 'fallback-wait', type: 'Wait', children: [], parameters: { durationSeconds: 5, timeoutSeconds: 0 } },
  ],
};

verifyInitialDecisionAndUiExecutionContract();
verifyPausedExplicitSimulationStep();
verifyDiagnosticDeepImmutability();
verifyLinearTraversalAndSingleGraphResolution();
verifyDeterministicOrdinaryDecisionBudget();
verifyObserverPartitionInvariance();
verifyQuietObserverPollFastForward();
verifySelectionInvarianceAndConcurrentExecution();
verifyDeselectDuringOwnedMovement();
verifyThreatReactionWhileUnselected();
verifySimulationTimersAndNoDuplicateExecution();
verifyThreatKnowledgeRevisionIsolation();
verifyAiControlOwnershipPolicy();
verifyPersistentCiContract();

console.log('AI per-unit scheduler smoke passed: paused explicit steps, read-only diagnostics, O(n) traversal, one graph snapshot, fair bounded ordinary decisions, deterministic observer cadence, delta partition invariance, first-step decisions, selection independence, per-unit ownership, threat revision isolation, aiControl policy and blocking CI coverage.');

function verifyInitialDecisionAndUiExecutionContract(): void {
  setGraph(firstDecisionGraph);
  const state = createInitialState(mapData, [unitData('first', 2, 2)], []);
  const unit = findUnit(state, 'first');

  tickSimulation(state, 0);
  assert.equal(unit.behaviorRuntime.aiDecisionTickCount, 1, 'the first explicit simulation step must make the first graph decision even with zero elapsed time');
  assert.equal(unit.behaviorRuntime.aiGraphLastTickMs, 0);
  assert.equal(unit.behaviorRuntime.posture, 'crouched');

  tickSimulation(state, 0.59);
  assert.equal(unit.behaviorRuntime.aiDecisionTickCount, 1, 'ordinary decisions must wait for the 600 ms cadence');
  tickSimulation(state, 0.01);
  assert.equal(unit.behaviorRuntime.aiDecisionTickCount, 2, 'the 600 ms boundary must be included deterministically');
  assert.equal(unit.behaviorRuntime.aiGraphLastTickMs, 600);

  const executeState = createInitialState(mapData, [unitData('execute', 2, 2)], []);
  tickSimulation(executeState, 0.1);
  assert.equal(findUnit(executeState, 'execute').behaviorRuntime.aiDecisionTickCount, 1, 'one UI-facing execute step must not miss graph execution');

  const labSource = readFileSync('src/ui/AiTestLabControls.ts', 'utf8');
  const workspaceSource = readFileSync('src/ui/TacticalWorkspace.ts', 'utf8');
  assert.match(labSource, /Один шаг[\s\S]*tickSimulation\(state, 0\.1\)/);
  assert.match(labSource, /Рассчитать и выполнить[\s\S]*tickSimulation\(state, 0\.1\)/);
  assert.match(labSource, /Диагностика ИИ \(без изменений\)[\s\S]*evaluateNow\(\)/);
  assert.match(workspaceSource, /data-action="step"[\s\S]*tickSimulation\(state, 0\.1\)/);
  assert.match(workspaceSource, /data-action="execute"[\s\S]*tickSimulation\(state, 0\.1\)/);
  assert.match(workspaceSource, /data-action="evaluate"[\s\S]*evaluateNow\(\)/);
}

function verifyPausedExplicitSimulationStep(): void {
  setGraph(movementGraph);
  const state = createInitialState(mapData, [
    {
      ...unitData('paused_mover', 3, 4),
      side: 'blue',
      initialState: { ammo: 0, weaponReady: false },
      viewRangeCells: 20,
      viewAngleDegrees: 360,
    },
    {
      ...unitData('visible_hostile', 7, 4, 'manual'),
      side: 'red',
      initialState: { ammo: 0, weaponReady: false },
    },
  ], []);
  const mover = findUnit(state, 'paused_mover');
  seedSession(mover, movementGraph, { best_cover_position: { x: 12.5, y: 4.5 } });
  setAiTestPaused(state, true);
  const start = { ...mover.position };

  tickSimulation(state, 0.1);
  assert.equal(state.simulationTimeSeconds, 0.1);
  assert.equal(mover.behaviorRuntime.aiDecisionTickCount, 1, 'pause must not suppress an explicit simulation-owned AI step');
  assert.equal(mover.order?.source, 'ai');
  assert.ok(distance(start, mover.position) > 0, 'movement must advance during an explicit paused step');
  assert.ok(mover.behaviorRuntime.aiRouteStatusState, 'route lifecycle must advance during an explicit paused step');
  assert.ok(mover.perceptionKnowledge.revision > 0, 'perception must advance during an explicit paused step');

  const afterFirst = { ...mover.position };
  tickSimulation(state, 0.6);
  assert.equal(round(state.simulationTimeSeconds), 0.7);
  assert.ok(distance(afterFirst, mover.position) > 0, 'movement must continue on subsequent explicit paused steps');
  assert.equal(mover.behaviorRuntime.aiGraphLastTickMs, 600);
  assert.equal(mover.behaviorRuntime.aiRuntimeSession?.simulationTimeMs, 600, 'runtime timers must use simulation time while externally paused');
  assert.ok((mover.behaviorRuntime.aiRouteStatusState?.lastCheckedAtMs ?? -1) >= 700, 'route monitoring must not freeze on the outer pause flag');

  const pixiSource = readFileSync('src/rendering/PixiApp.ts', 'utf8');
  assert.match(
    pixiSource,
    /if \(!this\.getPaused\(\)\) \{[\s\S]*?tickSimulation\(this\.state, ticker\.elapsedMS \/ 1000\);[\s\S]*?\n\s*\}/,
    'the automatic Pixi ticker must still suppress outer-loop simulation calls while paused',
  );
}

function verifyDiagnosticDeepImmutability(): void {
  setGraph(movementGraph);
  const state = createMovementState();
  state.selectedUnitId = 'alpha';
  state.selectedUnitIds = ['alpha'];
  tickSimulation(state, 0.1);
  const unit = findUnit(state, 'alpha');
  const session = unit.behaviorRuntime.aiRuntimeSession;
  assert.ok(session);
  unit.behaviorRuntime.aiRuntimeSession = {
    ...session,
    activePlan: createFollowMoveOrderPlan({
      id: 'legacy-plan-for-read-only-diagnostic',
      nowMs: 0,
      createdForState: 'FollowingOrder',
      context: { orderTarget: unit.order?.target },
    }),
  };
  unit.behaviorRuntime.aiNodeCooldowns = { diagnostic: 1234 };
  const bridge = installAiStatefulMoveGameBridge(state);

  for (const [label, operation] of [
    ['evaluateNow', () => bridge.evaluateNow()],
    ['tickNow', () => bridge.tickNow()],
    ['previewCancelNow', () => bridge.previewCancelNow('Preview cancellation.', 'Предпросмотр отмены.')],
  ] as const) {
    const before = JSON.stringify(state);
    const sessionReference = unit.behaviorRuntime.aiRuntimeSession;
    const orderReference = unit.order;
    const planReference = unit.plan;
    const result = operation();
    assert.ok(result, `${label} must still return a diagnostic result`);
    assert.equal(JSON.stringify(state), before, `${label} must not mutate UnitModel, runtime session, order, plan, route, cooldowns, events, observers or memory`);
    assert.strictEqual(unit.behaviorRuntime.aiRuntimeSession, sessionReference, `${label} must preserve the original session object`);
    assert.strictEqual(unit.order, orderReference, `${label} must preserve the original order object`);
    assert.strictEqual(unit.plan, planReference, `${label} must preserve the original plan object`);
  }
  bridge.destroy();
}

function verifyLinearTraversalAndSingleGraphResolution(): void {
  setGraph(firstDecisionGraph);
  const units: UnitData[] = [];
  for (let index = 0; index < 24; index += 1) {
    units.push(unitData(`linear_${index}`, 1 + index, index % 2 === 0 ? 2 : 10, index % 3 === 0 ? 'manual' : 'graph'));
  }
  const state = createInitialState(mapData, units, []);
  state.simulationStep = 1;
  state.simulationTimeSeconds = 0.1;
  storageReads = 0;
  const result = tickAiSimulationScheduler(state, { cycleStartMs: 0, cycleEndMs: 100 });
  const eligible = units.filter((unit) => unit.aiControl !== 'manual').length;
  assert.equal(result.unitVisits, units.length, 'one scheduler cycle must visit each unit exactly once');
  assert.equal(result.trustedBridgeCalls, eligible);
  assert.equal(result.membershipScans, 0, 'trusted scheduler path must perform no membership scans');
  assert.equal(result.graphResolutionCount, 1);
  assert.equal(result.graphSnapshotFrozen, true, 'all units in the cycle must receive an immutable graph snapshot');
  assert.equal(storageReads, 1, 'the shared graph source must be read once per scheduler cycle');
  assert.equal(new Set(result.processedUnitIds).size, eligible);
  assert.equal(result.eligibleUnitIds.length, eligible);
  assert.ok(state.units.filter((unit) => unit.aiControl === 'graph').every((unit) => unit.behaviorRuntime.aiRuntimeSession?.graphId === firstDecisionGraph.id));

  storage.set(GRAPH_STORAGE_KEY, JSON.stringify(alternateGraph));
  storageReads = 0;
  state.simulationStep += 1;
  state.simulationTimeSeconds = 0.2;
  const changed = tickAiSimulationScheduler(state, { cycleStartMs: 100, cycleEndMs: 200 });
  assert.equal(changed.graphResolutionCount, 1);
  assert.equal(storageReads, 1, 'graph changes must still be detected with one source read in the next cycle');
  assert.ok(state.units.filter((unit) => unit.aiControl === 'graph').every((unit) => unit.behaviorRuntime.aiRuntimeSession?.graphId === alternateGraph.id));

  const schedulerSource = readFileSync('src/core/ai/AiSimulationScheduler.ts', 'utf8');
  const gameBridgeSource = readFileSync('src/core/ai/AiGameBridge.ts', 'utf8');
  const moveBridgeSource = readFileSync('src/core/ai/AiStatefulMoveGameBridge.ts', 'utf8');
  assert.doesNotMatch(schedulerSource, /state\.units\.includes/);
  assert.doesNotMatch(extractFunction(gameBridgeSource, 'tickAiGameBridgeForTrustedUnit'), /state\.units\.includes/);
  const trustedMoveBridge = extractFunction(moveBridgeSource, 'tickStatefulMoveBridgeForTrustedUnit');
  assert.doesNotMatch(trustedMoveBridge, /state\.units\.includes/);
  assert.match(
    schedulerSource,
    /movementProfileRegistryEntries:\s*options\.movementProfileRegistryEntries/,
    'the scheduler must forward the stable registry snapshot instead of rebuilding profile lookup inputs per unit',
  );
  assert.match(
    trustedMoveBridge,
    /requiresPostReconcile/,
    'quiet scheduler passes must not unconditionally repeat movement authority reconciliation',
  );
  assert.match(
    trustedMoveBridge,
    /if \(result \|\| orderChanged \|\| options\.cancel\)/,
    'quiet scheduler passes must reuse the first route-status result instead of evaluating it twice',
  );
  assert.doesNotMatch(extractFunction(moveBridgeSource, 'updateRouteStatusForTrustedUnit'), /state\.units\.includes/);
}

function verifyQuietObserverPollFastForward(): void {
  setGraph(reactiveGraph);
  const state = createInitialState(mapData, [unitData('quiet-observer', 3, 3)], []);
  const unit = findUnit(state, 'quiet-observer');
  seedSession(unit, reactiveGraph, { route_ok: true });
  tickSimulation(state, 0.01);
  const pollsBefore = unit.behaviorRuntime.aiObserverPollCount;
  const checksBefore = unit.behaviorRuntime.aiRuntimeSession?.observerRegistry.observerChecks ?? 0;
  const decisionsBefore = unit.behaviorRuntime.aiDecisionTickCount;

  tickSimulation(state, 0.29);
  const quietPollDelta = unit.behaviorRuntime.aiObserverPollCount - pollsBefore;
  const quietCheckDelta = (unit.behaviorRuntime.aiRuntimeSession?.observerRegistry.observerChecks ?? 0) - checksBefore;
  assert.equal(quietPollDelta, 5, 'five overdue quiet observer polls must advance logically');
  assert.equal(quietCheckDelta, 5, 'logical observer check counters must advance exactly for all five polls');
  assert.equal(unit.behaviorRuntime.aiDecisionTickCount, decisionsBefore, 'quiet polls must not create graph decisions');
  assert.equal(unit.behaviorRuntime.aiObserverNextPollMs, 360, 'simulation-time cadence must advance to the next exact poll boundary');

  const bridgeSource = readFileSync('src/core/ai/AiGameBridge.ts', 'utf8');
  const loopStart = bridgeSource.indexOf('    while (true) {');
  const loopEnd = bridgeSource.indexOf('    unit.behaviorRuntime.aiNextDecisionAtMs = nextOrdinaryAtMs;', loopStart);
  const observerLoop = bridgeSource.slice(loopStart, loopEnd);
  assert.equal((observerLoop.match(/pollAiBlackboardObserversAt/g) ?? []).length, 1, 'the quiet batch must execute one real evaluator call');
  assert.match(observerLoop, /fastForwardQuietObserverPolls/);
  assert.match(observerLoop, /session\.eventQueue\.events\.length === 0/, 'pending AI events must disable fast-forward');
  assert.match(observerLoop, /!options\.cancel/, 'cancellation must disable fast-forward');

  const session = unit.behaviorRuntime.aiRuntimeSession;
  assert.ok(session);
  unit.behaviorRuntime.aiRuntimeSession = {
    ...session,
    blackboardMemory: { ...session.blackboardMemory, route_ok: false },
    memoryScopes: {
      ...session.memoryScopes,
      runtimeSessionMemory: { ...session.memoryScopes.runtimeSessionMemory, route_ok: false },
    },
  };
  tickSimulation(state, 0.06);
  assert.equal(unit.behaviorRuntime.aiReactiveWakeCount, 1, 'a relevant Blackboard change at the next poll must stop quiet skipping and wake the graph');
  assert.equal(unit.behaviorRuntime.aiLastReactiveWakeAtMs, 360);
  assert.equal(unit.behaviorRuntime.posture, 'prone');

  const fairnessState = createInitialState(mapData, [
    unitData('quiet-first', 3, 3),
    unitData('reactive-second', 5, 3),
  ], []);
  const quietFirst = findUnit(fairnessState, 'quiet-first');
  const reactiveSecond = findUnit(fairnessState, 'reactive-second');
  seedSession(quietFirst, reactiveGraph, { route_ok: true });
  seedSession(reactiveSecond, reactiveGraph, { route_ok: true });
  tickSimulation(fairnessState, 0.01);
  tickSimulation(fairnessState, 0.29);
  const secondSession = reactiveSecond.behaviorRuntime.aiRuntimeSession;
  assert.ok(secondSession);
  reactiveSecond.behaviorRuntime.aiRuntimeSession = {
    ...secondSession,
    blackboardMemory: { ...secondSession.blackboardMemory, route_ok: false },
    memoryScopes: {
      ...secondSession.memoryScopes,
      runtimeSessionMemory: { ...secondSession.memoryScopes.runtimeSessionMemory, route_ok: false },
    },
  };
  tickSimulation(fairnessState, 0.06);
  assert.equal(quietFirst.behaviorRuntime.aiReactiveWakeCount, 0);
  assert.equal(reactiveSecond.behaviorRuntime.aiReactiveWakeCount, 1, 'a quiet earlier unit must not starve a later reactive unit');

  const evidenceDir = process.env.PERFORMANCE_EVIDENCE_DIR;
  if (evidenceDir) {
    mkdirSync(evidenceDir, { recursive: true });
    writeFileSync(`${evidenceDir}/observer-poll-fast-forward.json`, JSON.stringify({
      version: 1,
      overdueLogicalPolls: quietPollDelta,
      realEvaluatorCalls: 1,
      logicalObserverChecks: quietCheckDelta,
      decisionPassesDuringQuietBatch: unit.behaviorRuntime.aiDecisionTickCount - decisionsBefore - 1,
      nextPollAtMsAfterQuietBatch: 360,
      blackboardChangeWakeAtMs: unit.behaviorRuntime.aiLastReactiveWakeAtMs,
      pendingEventsDisableFastForward: true,
      cancellationDisablesFastForward: true,
      laterUnitFairnessPreserved: reactiveSecond.behaviorRuntime.aiReactiveWakeCount === 1,
    }, null, 2));
  }
}

function verifyDeterministicOrdinaryDecisionBudget(): void {
  setGraph(firstDecisionGraph);
  const state = createInitialState(mapData, [
    unitData('budget-0', 2, 2),
    unitData('budget-1', 3, 2),
    unitData('budget-2', 4, 2),
    unitData('budget-3', 5, 2),
    unitData('budget-4', 6, 2),
    unitData('budget-5', 7, 2),
  ], []);

  state.simulationStep = 1;
  const first = tickAiSimulationScheduler(state, { cycleStartMs: 0, cycleEndMs: 0 });
  assert.equal(first.ordinaryDecisionUnitIds.length, 2, 'one scheduler cycle must own a fixed ordinary-decision budget');
  assert.equal(first.ordinaryDeferredUnitIds.length, 4, 'overdue ordinary decisions beyond the budget must be deferred, not dropped');
  assert.equal(first.graphTickedUnitIds.length, 2);

  state.simulationStep = 2;
  const second = tickAiSimulationScheduler(state, { cycleStartMs: 0, cycleEndMs: 0 });
  assert.equal(second.ordinaryDecisionUnitIds.length, 2);
  assert.equal(second.ordinaryDeferredUnitIds.length, 2, 'round-robin selection must continue servicing deferred units fairly');

  state.simulationStep = 3;
  const third = tickAiSimulationScheduler(state, { cycleStartMs: 0, cycleEndMs: 0 });
  assert.equal(third.ordinaryDecisionUnitIds.length, 2);
  assert.equal(third.ordinaryDeferredUnitIds.length, 0, 'three bounded cycles must service all six overdue units');
  assert.deepEqual(
    state.units.map((unit) => unit.behaviorRuntime.aiDecisionTickCount),
    [1, 1, 1, 1, 1, 1],
    'all six units must receive one ordinary decision after three bounded cycles',
  );

  const catchup = createInitialState(mapData, [unitData('catchup', 2, 2)], []);
  catchup.simulationStep = 1;
  tickAiSimulationScheduler(catchup, { cycleStartMs: 0, cycleEndMs: 1800 });
  assert.equal(
    findUnit(catchup, 'catchup').behaviorRuntime.aiDecisionTickCount,
    1,
    'one unit may execute at most one ordinary cadence decision in a single large-delta step',
  );
  assert.equal(findUnit(catchup, 'catchup').behaviorRuntime.aiNextDecisionAtMs, 600);
}

function verifyObserverPartitionInvariance(): void {
  const fine = runReactivePartition(new Array(60).fill(0.01));
  const medium = runReactivePartition(new Array(6).fill(0.1));
  const coarse = runReactivePartition([0.6]);

  assert.deepEqual(fine, medium, '60 × 0.01 seconds and 6 × 0.1 seconds must produce the same gameplay/event/observer/runtime snapshot');
  assert.deepEqual(fine, coarse, '60 × 0.01 seconds and 1 × 0.6 seconds must produce the same gameplay/event/observer/runtime snapshot');
  assert.equal(fine.posture, 'prone');
  assert.equal(fine.decisionTickCount, 3, 'initial, reactive 60 ms wake and ordinary 600 ms decisions must be deterministic');
  assert.equal(fine.observerPollCount, 11, 'observer polling must follow 60 ms simulation cadence rather than renderer frame count');
  assert.equal(fine.reactiveWakeCount, 1);
  assert.equal(fine.lastReactiveWakeAtMs, 60, 'reactive wake-up must remain faster than the ordinary 600 ms decision cadence');
  assert.ok(fine.observerPollCount < 60, '60 render-sized simulation calls must not cause one observer poll per frame');
}

function runReactivePartition(deltas: number[]): ReturnType<typeof reactiveSnapshot> {
  setGraph(reactiveGraph);
  const state = createInitialState(mapData, [unitData('reactive', 3, 3)], []);
  const unit = findUnit(state, 'reactive');
  seedSession(unit, reactiveGraph, { route_ok: true });
  tickSimulation(state, 0.01);
  assert.equal(unit.behaviorRuntime.aiDecisionTickCount, 1);
  assert.equal(Object.keys(unit.behaviorRuntime.aiRuntimeSession?.observerRegistry.observers ?? {}).length, 1, 'initial decision must register the reactive observer');

  const session = unit.behaviorRuntime.aiRuntimeSession;
  assert.ok(session);
  unit.behaviorRuntime.aiRuntimeSession = {
    ...session,
    blackboardMemory: { ...session.blackboardMemory, route_ok: false },
    memoryScopes: {
      ...session.memoryScopes,
      runtimeSessionMemory: { ...session.memoryScopes.runtimeSessionMemory, route_ok: false },
    },
  };
  for (const delta of deltas) tickSimulation(state, delta);
  return reactiveSnapshot(state, unit);
}

function reactiveSnapshot(state: SimulationState, unit: UnitModel) {
  const session = unit.behaviorRuntime.aiRuntimeSession;
  assert.ok(session);
  return {
    simulationTimeSeconds: round(state.simulationTimeSeconds),
    posture: unit.behaviorRuntime.posture,
    action: unit.behaviorRuntime.currentAction,
    order: clone(unit.order),
    decisionTickCount: unit.behaviorRuntime.aiDecisionTickCount,
    observerPollCount: unit.behaviorRuntime.aiObserverPollCount,
    reactiveWakeCount: unit.behaviorRuntime.aiReactiveWakeCount,
    lastReactiveWakeAtMs: unit.behaviorRuntime.aiLastReactiveWakeAtMs,
    aiGraphLastTickMs: unit.behaviorRuntime.aiGraphLastTickMs,
    aiNextDecisionAtMs: unit.behaviorRuntime.aiNextDecisionAtMs,
    aiObserverNextPollMs: unit.behaviorRuntime.aiObserverNextPollMs,
    session: {
      graphId: session.graphId,
      simulationTimeMs: session.simulationTimeMs,
      status: session.status,
      executionState: clone(session.executionState),
      cooldowns: clone(session.cooldowns),
      eventQueue: clone(session.eventQueue),
      observerRegistry: clone(session.observerRegistry),
      blackboardMemory: clone(session.blackboardMemory),
      stateRuntime: clone(session.stateRuntime),
      activePlan: clone(session.activePlan),
      planHistory: clone(session.planHistory),
      lastTerminal: clone(session.lastTerminal),
    },
  };
}

function verifySelectionInvarianceAndConcurrentExecution(): void {
  const selectedA = runMovementScenario(['alpha'], 'alpha');
  const selectedB = runMovementScenario(['bravo'], 'bravo');
  const deselected = runMovementScenario([], null);
  const groupAB = runMovementScenario(['alpha', 'bravo'], 'alpha');
  const groupBA = runMovementScenario(['bravo', 'alpha'], 'bravo');

  assert.deepEqual(selectedA.snapshot, selectedB.snapshot, 'selectedUnitId must not change gameplay AI state');
  assert.deepEqual(selectedA.snapshot, deselected.snapshot, 'selectedUnitId=null must not stop gameplay AI');
  assert.deepEqual(groupAB.snapshot, groupBA.snapshot, 'selectedUnitIds order must not change scheduler decisions');
  assert.deepEqual(groupAB.snapshot, deselected.snapshot, 'group selection must remain gameplay-neutral');

  for (const unit of selectedA.state.units) {
    assert.ok(unit.behaviorRuntime.aiRuntimeSession, `${unit.id} must own an independent runtime session`);
    assert.equal(unit.behaviorRuntime.aiRuntimeSession?.unitId, unit.id);
    assert.ok(unit.behaviorRuntime.aiDecisionTickCount > 1, `${unit.id} must receive repeated graph decisions`);
  }
  assert.notStrictEqual(
    selectedA.state.units[0]?.behaviorRuntime.aiRuntimeSession,
    selectedA.state.units[1]?.behaviorRuntime.aiRuntimeSession,
    'units must not share mutable runtime sessions',
  );
}

function verifyDeselectDuringOwnedMovement(): void {
  setGraph(movementGraph);
  const state = createMovementState();
  state.selectedUnitId = 'alpha';
  state.selectedUnitIds = ['alpha'];

  tickSimulation(state, 0.1);
  const alpha = findUnit(state, 'alpha');
  assert.equal(alpha.order?.source, 'ai', 'first explicit step must start an AI-owned MoveTo order');
  const ownerToken = alpha.order?.ownerToken;
  assert.ok(ownerToken);

  state.selectedUnitId = 'bravo';
  state.selectedUnitIds = ['bravo'];
  runTicks(state, 40, 0.1);

  assert.equal(alpha.order, null, 'original unselected soldier must finish its own movement');
  assert.equal(alpha.behaviorRuntime.posture, 'prone', 'the node following MoveTo must run without reselecting the soldier');
  assert.equal(alpha.behaviorRuntime.aiRuntimeSession?.unitId, alpha.id);
  assert.notEqual(findUnit(state, 'bravo').order?.ownerToken, ownerToken, 'action ownership must remain per-unit');
}

function verifyThreatReactionWhileUnselected(): void {
  setGraph(threatGraph);
  const pressureZones: PressureZoneData[] = [{
    id: 'incoming_fire',
    shape: 'circle',
    x: 3.5,
    y: 3.5,
    radiusCells: 3,
    strength: 75,
    stressPerSecond: 20,
  }];
  const state = createInitialState(mapData, [unitData('threatened', 3, 3), unitData('inspected', 16, 10)], pressureZones);
  state.selectedUnitId = 'inspected';
  state.selectedUnitIds = ['inspected'];
  const threatened = findUnit(state, 'threatened');
  seedSession(threatened, threatGraph, {});
  seedSession(findUnit(state, 'inspected'), threatGraph, {});

  tickSimulation(state, 0.1);
  assert.ok(threatened.behaviorRuntime.danger > 10, 'normal simulation must produce tactical danger for the unselected soldier');
  assert.equal(threatened.behaviorRuntime.posture, 'prone', 'unselected graph must read current danger and react defensively on its first step');
}

function verifySimulationTimersAndNoDuplicateExecution(): void {
  setGraph(firstDecisionGraph);
  const state = createInitialState(mapData, [unitData('timer', 2, 2)], []);
  tickSimulation(state, 0.1);
  const unit = findUnit(state, 'timer');
  const before = unit.behaviorRuntime.aiRuntimeSession?.simulationTimeMs;
  const duplicate = tickAiSimulationScheduler(state, { cycleStartMs: 0, cycleEndMs: 100 });
  assert.deepEqual(duplicate.duplicateSkippedUnitIds, ['timer']);
  assert.equal(unit.behaviorRuntime.aiRuntimeSession?.simulationTimeMs, before, 'second scheduler call in one simulation step must not advance runtime');

  const wallClockBefore = Date.now();
  tickSimulation(state, 0.5);
  const wallElapsed = Date.now() - wallClockBefore;
  assert.equal(unit.behaviorRuntime.aiGraphLastTickMs, 600, 'decision cadence must advance on simulation milliseconds');
  assert.equal(unit.behaviorRuntime.aiRuntimeSession?.simulationTimeMs, 600, 'Wait/runtime time must use simulation time');
  assert.ok(wallElapsed < 1000, 'test advances simulation without waiting for browser wall clock');
}

function verifyThreatKnowledgeRevisionIsolation(): void {
  const state = createInitialState(mapData, [
    { ...unitData('observer', 2, 2, 'manual'), side: 'blue' },
    { ...unitData('hostile', 8, 2, 'manual'), side: 'red' },
  ], []);
  const observer = findUnit(state, 'observer');
  const hostile = findUnit(state, 'hostile');
  const contact = advanceVisualContact(null, {
    id: `contact:unit:${hostile.id}`,
    stimulusId: `unit:${hostile.id}`,
    sourceUnitId: hostile.id,
    labelRu: hostile.labels.ru,
    position: hostile.position,
    evidencePerSecond: 200,
    deltaSeconds: 1,
    nowSeconds: 0,
    detectionVariance: 1,
  });
  upsertPerceptionContact(observer.perceptionKnowledge, contact);
  syncSoldierThreatMemory(state, observer, 0);
  const revision = observer.tacticalKnowledge.revision;
  const directionBefore = observer.tacticalKnowledge.threats[0]?.directionDegrees;
  observer.position = { x: observer.position.x + 2, y: observer.position.y + 3 };
  syncSoldierThreatMemory(state, observer, 0);
  const directionAfter = observer.tacticalKnowledge.threats[0]?.directionDegrees;
  assert.notEqual(directionAfter, directionBefore, 'observer-relative display geometry may still be derived from the current observer position');
  assert.equal(observer.tacticalKnowledge.revision, revision, 'observer movement alone must not increment semantic danger-knowledge revision');

  const memorySource = readFileSync('src/core/knowledge/SoldierThreatMemory.ts', 'utf8');
  const tickSource = readFileSync('src/core/simulation/SimulationTick.ts', 'utf8');
  const awarenessSmoke = readFileSync('scripts/awareness_field_cache_smoke.mjs', 'utf8');
  assert.doesNotMatch(memorySource, /refreshSoldierObserverRelativeThreatGeometry/);
  assert.doesNotMatch(tickSource, /refreshSoldierObserverRelativeThreatGeometry/);
  assert.doesNotMatch(awarenessSmoke, /navigator\.userAgent|globalThis\.navigator/, 'scheduler PR must not retain unrelated awareness/browser compatibility edits');
}

function verifyAiControlOwnershipPolicy(): void {
  setGraph(movementGraph);
  const state = createInitialState(mapData, [
    unitData('graph_owned', 2, 2, 'graph'),
    unitData('manual_owned', 2, 10, 'manual'),
  ], []);
  const graphUnit = findUnit(state, 'graph_owned');
  const manualUnit = findUnit(state, 'manual_owned');
  seedSession(graphUnit, movementGraph, { best_cover_position: { x: 8.5, y: 2.5 } });
  seedSession(manualUnit, movementGraph, { best_cover_position: { x: 8.5, y: 10.5 } });
  graphUnit.playerCommand = createPlayerMoveCommand(graphUnit.id, { x: 20.5, y: 2.5 }, null, 0);
  const commandBefore = structuredClone(graphUnit.playerCommand);
  const manualBefore = structuredClone(manualUnit);
  state.selectedUnitId = null;
  state.selectedUnitIds = [];
  state.simulationStep = 1;
  state.simulationTimeSeconds = 0.1;

  const result = tickAiSimulationScheduler(state, { cycleStartMs: 0, cycleEndMs: 100 });
  assert.deepEqual(result.eligibleUnitIds, ['graph_owned']);
  assert.equal(graphUnit.order?.source, 'ai', 'graph unit must autonomously execute low-level behavior');
  assert.deepEqual(graphUnit.playerCommand, commandBefore, 'scheduler must not arbitrarily destroy a high-level player command');
  assert.deepEqual(manualUnit, manualBefore, 'manual unit must remain completely untouched by the scheduler');
  assert.equal(state.selectedUnitId, null, 'absence of selection must not alter ownership');

  const fixture = JSON.parse(readFileSync('src/data/units/test_units.json', 'utf8')) as Array<{ id?: string; aiControl?: string }>;
  assert.ok(fixture.length > 0);
  assert.ok(fixture.every((unit) => unit.aiControl === 'graph' || unit.aiControl === 'manual'), 'canonical scene units must declare aiControl explicitly');
  assert.match(readFileSync('src/core/simulation/SimulationState.ts', 'utf8'), /side: draft\.side,\s*aiControl: 'graph',/, 'legacy editor unit creation must declare graph ownership');
  assert.match(readFileSync('src/core/editor/GameEditorPlacement.ts', 'utf8'), /side: draft\.side,\s*aiControl: 'graph',/, 'workbench unit creation must declare graph ownership');
  const harnessSource = readFileSync('src/testing/DangerLayerMovementPerformanceHarness.ts', 'utf8');
  assert.match(harnessSource, /aiControl: 'manual'/, 'externally scripted performance fixtures must declare manual ownership');
}

function verifyPersistentCiContract(): void {
  const workflow = readFileSync('.github/workflows/combat-foundation-core.yml', 'utf8');
  assert.match(workflow, /name: Per-unit AI scheduler smoke[\s\S]*npm run ai-scheduler:smoke/);
  for (const requiredPath of [
    'src/core/ai/AiSimulationScheduler.ts',
    'src/core/ai/AiGameBridge.ts',
    'src/core/ai/AiStatefulMoveGameBridge.ts',
    'src/core/simulation/SimulationTick.ts',
    'src/core/simulation/SimulationState.ts',
    'src/core/behavior/BehaviorModel.ts',
    'src/core/units/UnitModel.ts',
    'scripts/ai_per_unit_scheduler_smoke.mjs',
    'scripts/ai_per_unit_scheduler_smoke.ts',
    'package.json',
  ]) {
    assert.ok(workflow.includes(`'${requiredPath}'`), `CI path filter missing ${requiredPath}`);
  }
  assert.match(workflow, /ai-scheduler-smoke\.log/);
}

function runMovementScenario(selectedUnitIds: string[], selectedUnitId: string | null): { state: SimulationState; snapshot: unknown } {
  setGraph(movementGraph);
  const state = createMovementState();
  state.selectedUnitIds = [...selectedUnitIds];
  state.selectedUnitId = selectedUnitId;
  runTicks(state, 42, 0.1);
  return { state, snapshot: gameplaySnapshot(state) };
}

function createMovementState(): SimulationState {
  const state = createInitialState(mapData, [unitData('alpha', 2, 2), unitData('bravo', 2, 9)], []);
  seedSession(findUnit(state, 'alpha'), movementGraph, { best_cover_position: { x: 6.5, y: 2.5 } });
  seedSession(findUnit(state, 'bravo'), movementGraph, { best_cover_position: { x: 6.5, y: 9.5 } });
  return state;
}

function seedSession(unit: UnitModel, graph: AiGraph, blackboardMemory: Record<string, unknown>): void {
  unit.behaviorRuntime.aiRuntimeSession = createAiRuntimeSession({
    graphId: graph.id,
    unitId: unit.id,
    blackboardMemory: blackboardMemory as never,
  });
}

function setGraph(graph: AiGraph): void {
  storage.set(GRAPH_STORAGE_KEY, JSON.stringify(graph));
  resetRuntimeGraphSnapshotCacheForTests();
  storageReads = 0;
}

function runTicks(state: SimulationState, count: number, deltaSeconds: number): void {
  for (let index = 0; index < count; index += 1) tickSimulation(state, deltaSeconds);
}

function gameplaySnapshot(state: SimulationState): unknown {
  return {
    simulationTimeSeconds: round(state.simulationTimeSeconds),
    units: state.units.map((unit) => ({
      id: unit.id,
      position: { x: round(unit.position.x), y: round(unit.position.y) },
      order: unit.order ? {
        source: unit.order.source ?? null,
        ownerToken: unit.order.ownerToken ?? null,
        target: unit.order.target,
        waypointIndex: unit.order.waypointIndex ?? 0,
        routeStatus: unit.order.routeStatus ?? null,
      } : null,
      posture: unit.behaviorRuntime.posture,
      action: unit.behaviorRuntime.currentAction,
      state: unit.behaviorRuntime.state,
      aiGraphLastTickMs: unit.behaviorRuntime.aiGraphLastTickMs,
      aiNextDecisionAtMs: unit.behaviorRuntime.aiNextDecisionAtMs,
      decisionTickCount: unit.behaviorRuntime.aiDecisionTickCount,
      observerPollCount: unit.behaviorRuntime.aiObserverPollCount,
      session: unit.behaviorRuntime.aiRuntimeSession ? {
        unitId: unit.behaviorRuntime.aiRuntimeSession.unitId,
        graphId: unit.behaviorRuntime.aiRuntimeSession.graphId,
        simulationTimeMs: unit.behaviorRuntime.aiRuntimeSession.simulationTimeMs,
        status: unit.behaviorRuntime.aiRuntimeSession.status,
        activeNodeId: unit.behaviorRuntime.aiRuntimeSession.executionState?.activeNodeId ?? null,
        cooldowns: unit.behaviorRuntime.aiRuntimeSession.cooldowns,
        blackboardMemory: unit.behaviorRuntime.aiRuntimeSession.blackboardMemory,
        eventQueue: unit.behaviorRuntime.aiRuntimeSession.eventQueue,
        observerRegistry: unit.behaviorRuntime.aiRuntimeSession.observerRegistry,
      } : null,
    })),
  };
}

function unitData(id: string, x: number, y: number, aiControl: 'graph' | 'manual' = 'graph'): UnitData {
  return {
    id,
    label: id,
    labelRu: id,
    type: 'infantry_squad',
    side: 'blue',
    aiControl,
    x,
    y,
    speedCellsPerSecond: 4,
    facingDegrees: 0,
  };
}

function findUnit(state: SimulationState, id: string): UnitModel {
  const unit = state.units.find((candidate) => candidate.id === id);
  assert.ok(unit, `missing unit ${id}`);
  return unit;
}

function extractFunction(source: string, name: string): string {
  const start = source.indexOf(`function ${name}`) >= 0
    ? source.indexOf(`function ${name}`)
    : source.indexOf(`export function ${name}`);
  assert.ok(start >= 0, `function ${name} not found`);
  const nextExport = source.indexOf('\nexport function ', start + 20);
  return source.slice(start, nextExport >= 0 ? nextExport : source.length);
}

function clone<T>(value: T): T {
  return value === undefined ? value : structuredClone(value);
}

function distance(left: { x: number; y: number }, right: { x: number; y: number }): number {
  return Math.hypot(right.x - left.x, right.y - left.y);
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
