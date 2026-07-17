import { resetRuntimeGraphSnapshotCacheForTests } from '../core/ai/AiGameBridge';
import { getGameEditorDrafts } from '../core/editor/GameEditorDrafts';
import { placeConfiguredEditorEntity } from '../core/editor/GameEditorPlacement';
import { syncSoldierThreatMemory } from '../core/knowledge/SoldierThreatMemory';
import { issueRoutedMoveOrderToSelectedUnits } from '../core/orders/RoutedMoveOrders';
import { buildNavigationGrid, isNavigationCellPassable } from '../core/pathfinding/GridNavigation';
import { advanceVisualContact, upsertPerceptionContact } from '../core/perception/PerceptionContact';
import type { SimulationState } from '../core/simulation/SimulationState';
import { setAiTestPaused } from '../core/testing/AiTestLabRuntime';
import { normalizeUnits, type UnitModel } from '../core/units/UnitModel';
import { getSimulationLayerState, setSimulationLayerMode, type SimulationLayerMode } from '../core/ui/RuntimeUiState';

export interface LiveWindowsPerformanceSnapshot {
  readonly simulationTimeSeconds: number;
  readonly performanceNowMs: number;
  readonly unitCount: number;
  readonly graphUnitCount: number;
  readonly movingUnitCount: number;
  readonly selectedUnitId: string | null;
  readonly layerMode: SimulationLayerMode;
  readonly tacticalKnowledgeRevisions: Readonly<Record<string, number>>;
  readonly activeOrderIds: readonly string[];
}

export interface LiveWindowsPerformanceApi {
  start(): LiveWindowsPerformanceSnapshot;
  stop(): LiveWindowsPerformanceSnapshot;
  addUnits(targetCount: number): LiveWindowsPerformanceSnapshot;
  retargetAll(seed: number): LiveWindowsPerformanceSnapshot;
  refreshContacts(): LiveWindowsPerformanceSnapshot;
  setLayer(mode: SimulationLayerMode): LiveWindowsPerformanceSnapshot;
  selectUnit(index: number): LiveWindowsPerformanceSnapshot;
  getSnapshot(): LiveWindowsPerformanceSnapshot;
}

declare global {
  interface Window {
    __realWargameLiveWindowsPerformance?: LiveWindowsPerformanceApi;
    __realWargamePerformanceScenario?: string | null;
  }
}

const GRAPH_STORAGE_KEY = 'real-wargame.ai-node-editor.graph.v6';
const UNIT_COUNT = 6;

export function installLiveWindowsPerformanceHarness(state: SimulationState): void {
  const query = new URLSearchParams(window.location.search);
  if (query.get('visualQa') !== 'live-windows-performance') return;

  ensureFixtureUnits(state);
  installTacticalQueryGraph();
  configureUnits(state);
  setAiTestPaused(state, true);
  setSimulationLayerMode(state, 'danger');

  window.__realWargameLiveWindowsPerformance = {
    start(): LiveWindowsPerformanceSnapshot {
      window.__realWargamePerformanceScenario = state.units.length > UNIT_COUNT
        ? 'live-windows-performance-report-v6-mass-route'
        : 'live-windows-six-unit-ai';
      refreshContacts(state);
      routeAllUnits(state, 0);
      setAiTestPaused(state, false);
      return snapshot(state);
    },
    stop(): LiveWindowsPerformanceSnapshot {
      setAiTestPaused(state, true);
      const stopped = snapshot(state);
      window.__realWargamePerformanceScenario = null;
      return stopped;
    },
    addUnits(targetCount): LiveWindowsPerformanceSnapshot {
      addUnitsThroughEditor(state, Math.max(UNIT_COUNT, Math.floor(targetCount)));
      return snapshot(state);
    },
    retargetAll(seed): LiveWindowsPerformanceSnapshot {
      routeAllUnits(state, seed);
      return snapshot(state);
    },
    refreshContacts(): LiveWindowsPerformanceSnapshot {
      refreshContacts(state);
      return snapshot(state);
    },
    setLayer(mode): LiveWindowsPerformanceSnapshot {
      setSimulationLayerMode(state, mode);
      return snapshot(state);
    },
    selectUnit(index): LiveWindowsPerformanceSnapshot {
      const unit = state.units[Math.abs(Math.floor(index)) % state.units.length];
      state.selectedUnitId = unit?.id ?? null;
      state.selectedUnitIds = unit ? [unit.id] : [];
      return snapshot(state);
    },
    getSnapshot(): LiveWindowsPerformanceSnapshot {
      return snapshot(state);
    },
  };
}

function ensureFixtureUnits(state: SimulationState): void {
  const template = state.units[0];
  if (!template) throw new Error('Live Windows performance harness requires a unit template.');
  while (state.units.length < UNIT_COUNT) {
    const index = state.units.length;
    const [unit] = normalizeUnits([{
      id: `live_windows_perf_${index + 1}`,
      label: `Live performance unit ${index + 1}`,
      labelRu: `Боец live performance ${index + 1}`,
      type: template.type,
      side: index % 2 === 0 ? 'blue' : 'red',
      x: 20 + index * 8,
      y: 20 + index * 6,
      speedCellsPerSecond: 8,
      heldItem: template.heldItem,
      behaviorProfile: template.behaviorProfile,
      navigationProfileId: 'normal',
      aiControl: 'graph',
    }]);
    if (!unit) throw new Error('Failed to create Live Windows performance fixture unit.');
    state.units.push(unit);
  }
}

function addUnitsThroughEditor(state: SimulationState, targetCount: number): void {
  if (state.units.length >= targetCount) return;
  const previousEnabled = state.editor.enabled;
  const previousTool = state.editor.tool;
  const drafts = getGameEditorDrafts(state);
  const grid = buildNavigationGrid(state.map);
  const occupied = new Set(state.units.map((unit) => `${Math.floor(unit.position.x)}:${Math.floor(unit.position.y)}`));
  state.editor.enabled = true;
  state.editor.tool = 'spawn_unit';

  try {
    while (state.units.length < targetCount) {
      const index = state.units.length;
      drafts.unit.name = `Performance v6 unit ${index + 1}`;
      drafts.unit.side = index % 2 === 0 ? 'blue' : 'red';
      const column = index % 20;
      const row = Math.floor(index / 20);
      const preferred = {
        x: 24 + column * Math.max(3, Math.floor((state.map.width - 48) / 20)),
        y: 24 + row * Math.max(8, Math.floor((state.map.height - 48) / 5)),
      };
      const position = findPassablePosition(state, grid, preferred, occupied);
      if (!placeConfiguredEditorEntity(state, position)) {
        throw new Error(`Editor API failed to create performance unit ${index + 1}.`);
      }
      const created = state.units[state.units.length - 1];
      if (!created) throw new Error(`Editor API did not append performance unit ${index + 1}.`);
      created.position = position;
      configureUnitRuntime(state, created, index);
    }
  } finally {
    state.editor.tool = previousTool;
    state.editor.enabled = previousEnabled;
  }
}

function installTacticalQueryGraph(): void {
  const graph = {
    version: 2,
    id: 'live_windows_scheduler_runtime_graph',
    name: 'Live Windows Scheduler Runtime Graph',
    nameRu: 'Граф нагрузочного сценария Windows',
    rootNodeId: 'root',
    blackboardSchema: [],
    blackboardDefaults: {},
    nodes: [
      {
        id: 'root',
        type: 'Root',
        displayName: 'Root',
        displayNameRu: 'Старт',
        children: ['state'],
        parameters: {},
      },
      {
        id: 'state',
        type: 'SetAiState',
        displayName: 'Follow order state',
        displayNameRu: 'Состояние выполнения приказа',
        children: ['attention'],
        parameters: {
          stateId: 'FollowingOrder',
          reason: 'Live performance graph keeps following the routed order.',
          reasonRu: 'Нагрузочный граф продолжает выполнять маршрутный приказ.',
        },
      },
      {
        id: 'attention',
        type: 'SetAttentionMode',
        displayName: 'Observe while moving',
        displayNameRu: 'Наблюдать при движении',
        children: ['reason'],
        parameters: {
          mode: 'observe',
          reason: 'Observe while following the current order.',
          reasonRu: 'Наблюдать во время выполнения текущего приказа.',
        },
      },
      {
        id: 'reason',
        type: 'WriteReason',
        displayName: 'Explain decision',
        displayNameRu: 'Объяснить решение',
        children: [],
        parameters: {
          reason: 'Continue routed movement and observation.',
          reasonRu: 'Продолжать маршрутное движение и наблюдение.',
        },
      },
    ],
    subgraphRefs: [],
  };
  window.localStorage.setItem(GRAPH_STORAGE_KEY, JSON.stringify(graph));
  resetRuntimeGraphSnapshotCacheForTests();
}

function configureUnits(state: SimulationState): void {
  const slots = [
    { x: 0.22, y: 0.30 },
    { x: 0.78, y: 0.32 },
    { x: 0.24, y: 0.52 },
    { x: 0.76, y: 0.50 },
    { x: 0.26, y: 0.72 },
    { x: 0.74, y: 0.70 },
  ];
  const grid = buildNavigationGrid(state.map);
  const occupied = new Set<string>();
  for (let index = 0; index < state.units.length; index += 1) {
    const unit = state.units[index];
    const slot = slots[index % slots.length];
    configureUnitRuntime(state, unit, index);
    unit.position = findPassablePosition(
      state,
      grid,
      { x: state.map.width * slot.x, y: state.map.height * slot.y },
      occupied,
    );
  }
  state.selectedUnitId = state.units[0]?.id ?? null;
  state.selectedUnitIds = state.units[0] ? [state.units[0].id] : [];
}

function configureUnitRuntime(state: SimulationState, unit: UnitModel, index: number): void {
  unit.side = index % 2 === 0 ? 'blue' : 'red';
  unit.aiControl = 'graph';
  unit.order = null;
  unit.playerCommand = null;
  unit.plan = null;
  unit.speedCellsPerSecond = 8;
  unit.behaviorRuntime.ammo = 0;
  unit.behaviorRuntime.weaponReady = false;
  unit.behaviorRuntime.aiLastSimulationStep = -1;
  unit.behaviorRuntime.aiNextDecisionAtMs = 0;
  unit.behaviorRuntime.aiObserverNextPollMs = 0;
  unit.behaviorRuntime.aiDecisionTickCount = 0;
  unit.behaviorRuntime.aiObserverPollCount = 0;
  unit.behaviorRuntime.aiReactiveWakeCount = 0;
  unit.behaviorRuntime.aiRuntimeSession = null;
  unit.tacticalKnowledge.threats = [];
  unit.tacticalKnowledge.revision += 1;
  unit.perceptionKnowledge.contacts = [];
  unit.viewRangeCells = Math.max(state.map.width, state.map.height);
  unit.attentionSettings.vision.maximumVisualRangeMeters = 2_000;
}

function refreshContacts(state: SimulationState): void {
  for (let index = 0; index < state.units.length; index += 1) {
    const observer = state.units[index];
    const hostile = findNearestHostile(state.units, observer);
    if (!hostile) continue;
    const existing = observer.perceptionKnowledge.contacts.find((contact) => contact.sourceUnitId === hostile.id) ?? null;
    const contact = advanceVisualContact(existing, {
      id: `perception:unit:${hostile.id}`,
      stimulusId: `unit:${hostile.id}`,
      sourceUnitId: hostile.id,
      labelRu: hostile.labels.ru,
      position: { ...hostile.position },
      evidencePerSecond: 220,
      deltaSeconds: 1,
      nowSeconds: state.simulationTimeSeconds,
      source: 'visual',
    });
    if (index % 3 !== 0) {
      contact.visibleNow = false;
      contact.observedNow = false;
    }
    upsertPerceptionContact(observer.perceptionKnowledge, contact);
    syncSoldierThreatMemory(state, observer, 0.1);
  }
}

function findNearestHostile(units: readonly UnitModel[], observer: UnitModel): UnitModel | null {
  let best: UnitModel | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of units) {
    if (candidate.side === observer.side || candidate.id === observer.id) continue;
    const distance = Math.hypot(candidate.position.x - observer.position.x, candidate.position.y - observer.position.y);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

function routeAllUnits(state: SimulationState, seed: number): void {
  const previousSelectedId = state.selectedUnitId;
  const previousSelectedIds = [...state.selectedUnitIds];
  state.selectedUnitId = state.units[0]?.id ?? null;
  state.selectedUnitIds = state.units.map((unit) => unit.id);
  const horizontal = seed % 2 === 0 ? 0.72 : 0.28;
  const vertical = seed % 3 === 0 ? 0.62 : 0.38;
  issueRoutedMoveOrderToSelectedUnits(state, {
    x: clamp(state.map.width * horizontal, 0.5, state.map.width - 0.5),
    y: clamp(state.map.height * vertical, 0.5, state.map.height - 0.5),
  });
  state.selectedUnitId = previousSelectedId;
  state.selectedUnitIds = previousSelectedIds;
}

function findPassablePosition(
  state: SimulationState,
  grid: ReturnType<typeof buildNavigationGrid>,
  preferred: { x: number; y: number },
  occupied: Set<string>,
): { x: number; y: number } {
  const centerX = clamp(Math.floor(preferred.x), 0, state.map.width - 1);
  const centerY = clamp(Math.floor(preferred.y), 0, state.map.height - 1);
  for (let radius = 0; radius < Math.max(state.map.width, state.map.height); radius += 1) {
    for (let y = centerY - radius; y <= centerY + radius; y += 1) {
      for (let x = centerX - radius; x <= centerX + radius; x += 1) {
        if (Math.max(Math.abs(x - centerX), Math.abs(y - centerY)) !== radius) continue;
        if (x < 0 || y < 0 || x >= state.map.width || y >= state.map.height) continue;
        const key = `${x}:${y}`;
        if (occupied.has(key) || !isNavigationCellPassable(grid, x, y)) continue;
        occupied.add(key);
        return { x: x + 0.5, y: y + 0.5 };
      }
    }
  }
  throw new Error('Live Windows performance harness could not find a passable fixture position.');
}

function snapshot(state: SimulationState): LiveWindowsPerformanceSnapshot {
  return {
    simulationTimeSeconds: state.simulationTimeSeconds,
    performanceNowMs: performance.now(),
    unitCount: state.units.length,
    graphUnitCount: state.units.filter((unit) => unit.aiControl === 'graph').length,
    movingUnitCount: state.units.filter((unit) => unit.order !== null).length,
    selectedUnitId: state.selectedUnitId,
    layerMode: getSimulationLayerState(state).mode,
    tacticalKnowledgeRevisions: Object.fromEntries(
      state.units.map((unit) => [unit.id, unit.tacticalKnowledge.revision]),
    ),
    activeOrderIds: state.units.filter((unit) => unit.order !== null).map((unit) => unit.id),
  };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
