import { resetRuntimeGraphSnapshotCacheForTests } from '../core/ai/AiGameBridge';
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
  retargetAll(seed: number): LiveWindowsPerformanceSnapshot;
  refreshContacts(): LiveWindowsPerformanceSnapshot;
  setLayer(mode: SimulationLayerMode): LiveWindowsPerformanceSnapshot;
  selectUnit(index: number): LiveWindowsPerformanceSnapshot;
  getSnapshot(): LiveWindowsPerformanceSnapshot;
}

declare global {
  interface Window {
    __realWargameLiveWindowsPerformance?: LiveWindowsPerformanceApi;
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
      refreshContacts(state);
      routeAllUnits(state, 0);
      setAiTestPaused(state, false);
      return snapshot(state);
    },
    stop(): LiveWindowsPerformanceSnapshot {
      setAiTestPaused(state, true);
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

function installTacticalQueryGraph(): void {
  const graph = {
    version: 2,
    id: 'live_windows_scheduler_tactical_query_graph',
    name: 'Live Windows Scheduler Tactical Query Graph',
    nameRu: 'Граф нагрузочного сценария Windows',
    rootNodeId: 'root',
    blackboardSchema: [],
    blackboardDefaults: {},
    nodes: [
      { id: 'root', type: 'Root', displayName: 'Root', displayNameRu: 'Старт', children: ['create-cover'], parameters: {} },
      {
        id: 'create-cover',
        type: 'CreateCoverCandidates',
        displayName: 'Create cover candidates',
        displayNameRu: 'Создать кандидаты укрытий',
        children: ['filter-cover'],
        parameters: {
          queryKey: 'live_cover_query',
          maxCandidates: 24,
          searchRadiusMeters: 80,
          maxCalculationMs: 12,
        },
      },
      {
        id: 'filter-cover',
        type: 'FilterTacticalPositions',
        displayName: 'Filter cover candidates',
        displayNameRu: 'Фильтровать укрытия',
        children: ['score-cover'],
        parameters: {
          queryKey: 'live_cover_query',
          requireOnMap: true,
          requireRoute: true,
          requireDirectionalCover: false,
          minimumDistanceMeters: 0,
          maximumDistanceMeters: 80,
          maxRouteDanger: 100,
        },
      },
      {
        id: 'score-cover',
        type: 'ScoreTacticalPositions',
        displayName: 'Score cover candidates',
        displayNameRu: 'Оценить укрытия',
        children: ['select-cover'],
        parameters: {
          queryKey: 'live_cover_query',
          protectionWeight: 1,
          concealmentWeight: 0.35,
          distanceWeight: 0.4,
          routeDangerWeight: 0.8,
          slopeWeight: 0.45,
          orderAlignmentWeight: 0.35,
        },
      },
      {
        id: 'select-cover',
        type: 'SelectBestTacticalPosition',
        displayName: 'Select cover',
        displayNameRu: 'Выбрать укрытие',
        children: [],
        parameters: { queryKey: 'live_cover_query', writeTo: 'best_cover_position' },
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
  for (let index = 0; index < state.units.length; index += 1) {
    const unit = state.units[index];
    const direction = ((seed + index) % 2 === 0) ? 1 : -1;
    const vertical = ((seed + index) % 3) - 1;
    state.selectedUnitId = unit.id;
    state.selectedUnitIds = [unit.id];
    issueRoutedMoveOrderToSelectedUnits(state, {
      x: clamp(unit.position.x + direction * (18 + index * 2), 0.5, state.map.width - 0.5),
      y: clamp(unit.position.y + vertical * (8 + index), 0.5, state.map.height - 0.5),
    });
  }
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
