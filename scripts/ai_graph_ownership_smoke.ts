import assert from 'node:assert/strict';
import mapData from '../src/data/maps/test_map.json';
import unitsData from '../src/data/units/test_units.json';
import { tickAiGameBridge } from '../src/core/ai/AiGameBridge';
import type { AiGraph } from '../src/core/ai/AiGraph';
import { runAiGraphRuntime } from '../src/core/ai/AiGraphRuntime';
import { createAiRuntimeSession } from '../src/core/ai/runtime/AiRuntimeSession';
import { createAiStateRuntime } from '../src/core/ai/state/AiStateRuntime';
import type { TacticalMapData } from '../src/core/map/MapModel';
import { createInitialState } from '../src/core/simulation/SimulationState';
import type { UnitData } from '../src/core/units/UnitModel';

class MemoryStorage {
  private readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
  removeItem(key: string): void { this.values.delete(key); }
  clear(): void { this.values.clear(); }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null; }
  get length(): number { return this.values.size; }
}

const GRAPH_STORAGE_KEY = 'real-wargame.ai-node-editor.graph.v6';
const storage = new MemoryStorage();
(globalThis as typeof globalThis & { window: unknown }).window = {
  localStorage: storage,
  setInterval,
  clearInterval,
};

const emptyGraph: AiGraph = {
  version: 2,
  id: 'empty_graph_ownership_test',
  name: 'Empty graph ownership test',
  nameRu: 'Проверка пустого графа',
  rootNodeId: 'root',
  blackboardDefaults: {},
  blackboardSchema: [],
  subgraphRefs: [],
  nodes: [{ id: 'root', type: 'Root', children: [] }],
};

verifyEmptyGraphIsInert('Contact');
verifyEmptyGraphIsInert('Suppressed');
verifyGraphExplicitlySetsState();
verifyGraphExplicitlyRunsPlan();

console.log('AI graph ownership smoke passed: empty graph is inert; state changes and plans start only from explicit Graph v2 nodes.');

function verifyEmptyGraphIsInert(stateId: 'Contact' | 'Suppressed'): void {
  const { state, unit } = makeState(emptyGraph, stateId);
  const result = tickAiGameBridge(state, 1000, { force: true, applyEffects: true });
  assert.ok(result);
  assert.equal(result.effects.some((effect) => effect.type === 'begin_move'), false);
  assert.equal(unit.order, null);
  assert.equal(unit.behaviorRuntime.aiRuntimeSession?.activePlan, undefined);
  assert.equal(unit.behaviorRuntime.aiRuntimeSession?.executionState, undefined);
  assert.equal(unit.behaviorRuntime.aiRuntimeSession?.stateRuntime.activeStateId, stateId);
}

function verifyGraphExplicitlySetsState(): void {
  const graph: AiGraph = {
    ...emptyGraph,
    id: 'explicit_state_graph',
    nodes: [
      { id: 'root', type: 'Root', children: ['set_contact'] },
      {
        id: 'set_contact',
        type: 'SetAiState',
        children: [],
        parameters: { stateId: 'Contact', reason: 'Graph saw a threat.', reasonRu: 'Граф обнаружил угрозу.' },
      },
    ],
  };
  const { state, unit } = makeState(graph, 'Idle');
  const result = tickAiGameBridge(state, 1000, { force: true, applyEffects: true });
  assert.ok(result);
  assert.equal(unit.behaviorRuntime.aiRuntimeSession?.stateRuntime.activeStateId, 'Contact');
  assert.equal(unit.behaviorRuntime.aiRuntimeSession?.stateRuntime.lastTransition?.trigger, 'manual');
  assert.equal(unit.order, null);
}

function verifyGraphExplicitlyRunsPlan(): void {
  const graph: AiGraph = {
    ...emptyGraph,
    id: 'explicit_plan_graph',
    subgraphRefs: ['take_cover'],
    nodes: [
      { id: 'root', type: 'Root', children: ['sequence'] },
      { id: 'sequence', type: 'SequenceWithMemory', children: ['run_cover'] },
      {
        id: 'run_cover',
        type: 'RunPlan',
        displayName: 'Take cover plan',
        displayNameRu: 'План занятия укрытия',
        children: [],
        parameters: { planKind: 'TakeCover', targetKey: 'best_cover_position', cancelPolicy: 'cancel_child' },
      },
    ],
  };
  const target = { x: 6, y: 3 };
  const result = runAiGraphRuntime({
    graph,
    unitId: 'explicit_plan_unit',
    blackboard: {
      self_position: { x: 1, y: 3 },
      best_cover_position: target,
      active_move_source: null,
      active_move_owner_token: null,
      active_move_target: null,
    },
    cooldowns: {},
    nowMs: 1000,
  });
  assert.equal(result.status, 'running');
  assert.equal(result.activeNodeId, 'run_cover');
  assert.equal(result.activeSubgraphId, 'take_cover');
  assert.equal(result.effects.some((effect) => effect.type === 'begin_move'), true);
}

function makeState(graph: AiGraph, stateId: 'Idle' | 'Contact' | 'Suppressed') {
  storage.clear();
  storage.setItem(GRAPH_STORAGE_KEY, JSON.stringify(graph));
  const state = createInitialState(mapData as TacticalMapData, unitsData as UnitData[], []);
  const unit = state.units[0];
  if (!unit) throw new Error('Test unit is missing.');
  state.selectedUnitId = unit.id;
  state.editor.enabled = false;
  unit.behaviorRuntime.aiRuntimeSession = createAiRuntimeSession({
    graphId: graph.id,
    unitId: unit.id,
    stateRuntime: createAiStateRuntime({ activeStateId: stateId, enteredAtMs: 0 }),
  });
  return { state, unit };
}
