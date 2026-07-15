import { buildSoldierAwarenessReport } from '../core/knowledge/SoldierAwarenessGrid';
import { syncSoldierThreatMemory } from '../core/knowledge/SoldierThreatMemory';
import { markMapObjectsDirty } from '../core/map/MapRuntimeState';
import { issueRoutedMoveOrderToSelectedUnits } from '../core/orders/RoutedMoveOrders';
import { advanceVisualContact, upsertPerceptionContact } from '../core/perception/PerceptionContact';
import type { SimulationState } from '../core/simulation/SimulationState';
import { setAiTestPaused } from '../core/testing/AiTestLabRuntime';
import type { UnitModel } from '../core/units/UnitModel';
import { setSimulationLayerMode } from '../core/ui/RuntimeUiState';

export type DangerMovementScenario =
  | 'selected-only'
  | 'hostile-only'
  | 'both'
  | 'hidden-hostile'
  | 'wall-crossing';

export interface DangerMovementSnapshot {
  readonly scenario: DangerMovementScenario | null;
  readonly simulationTimeSeconds: number;
  readonly observerPosition: { x: number; y: number };
  readonly hostilePosition: { x: number; y: number };
  readonly subjectiveThreatPosition: { x: number; y: number } | null;
  readonly subjectiveThreatVisibleNow: boolean | null;
  readonly tacticalKnowledgeRevision: number;
  readonly observerMoving: boolean;
  readonly hostileMoving: boolean;
  readonly bestSafePosition: { x: number; y: number } | null;
  readonly protectedAgainstThreatId: string | null;
  readonly awarenessMovement: Record<string, unknown> | null;
}

export interface DangerMovementPerformanceApi {
  startScenario(scenario: DangerMovementScenario): DangerMovementSnapshot;
  stopScenario(): DangerMovementSnapshot;
  getSnapshot(includeExactAwareness?: boolean): DangerMovementSnapshot;
}

declare global {
  interface Window {
    __realWargameDangerMovementPerformance?: DangerMovementPerformanceApi;
    __realWargameAwarenessDebug?: {
      movement?: Record<string, unknown>;
    };
  }
}

const WALL_ID = 'danger-movement-performance-wall';

export function installDangerLayerMovementPerformanceHarness(state: SimulationState): void {
  const query = new URLSearchParams(window.location.search);
  if (query.get('visualQa') !== 'danger-layer-movement-performance') return;

  let activeScenario: DangerMovementScenario | null = null;
  const [observer, hostile] = resolveUnits(state);
  setAiTestPaused(state, true);

  window.__realWargameDangerMovementPerformance = {
    startScenario(scenario): DangerMovementSnapshot {
      activeScenario = scenario;
      prepareScenario(state, observer, hostile, scenario);
      setAiTestPaused(state, false);
      return snapshot(state, observer, hostile, activeScenario, false);
    },
    stopScenario(): DangerMovementSnapshot {
      setAiTestPaused(state, true);
      return snapshot(state, observer, hostile, activeScenario, true);
    },
    getSnapshot(includeExactAwareness = false): DangerMovementSnapshot {
      return snapshot(state, observer, hostile, activeScenario, includeExactAwareness);
    },
  };
}

function prepareScenario(
  state: SimulationState,
  observer: UnitModel,
  hostile: UnitModel,
  scenario: DangerMovementScenario,
): void {
  setAiTestPaused(state, true);
  state.editor.enabled = false;
  setSimulationLayerMode(state, 'danger');
  removeFixtureWall(state);
  observer.side = 'blue';
  hostile.side = 'red';
  observer.order = null;
  hostile.order = null;
  observer.playerCommand = null;
  hostile.playerCommand = null;
  observer.speedCellsPerSecond = 12;
  hostile.speedCellsPerSecond = 10;
  observer.viewRangeCells = Math.max(state.map.width, state.map.height);
  hostile.viewRangeCells = Math.max(state.map.width, state.map.height);
  observer.position = {
    x: Math.floor(state.map.width * 0.38) + 0.5,
    y: Math.floor(state.map.height * 0.52) + 0.5,
  };
  hostile.position = {
    x: Math.floor(state.map.width * 0.66) + 0.5,
    y: observer.position.y,
  };
  observer.facingRadians = 0;
  hostile.facingRadians = Math.PI;
  observer.perceptionKnowledge.contacts = [];
  observer.tacticalKnowledge.threats = [];
  observer.tacticalKnowledge.revision += 1;
  installVisualContact(observer, hostile, state.simulationTimeSeconds);
  syncSoldierThreatMemory(state, observer, 0.1);
  state.selectedUnitId = observer.id;
  state.selectedUnitIds = [observer.id];

  if (scenario === 'selected-only') {
    routeUnit(state, observer, {
      x: observer.position.x - 22,
      y: observer.position.y + 8,
    });
  } else if (scenario === 'hostile-only') {
    routeUnit(state, hostile, {
      x: hostile.position.x - 30,
      y: hostile.position.y + 10,
    });
  } else if (scenario === 'both') {
    routeUnit(state, observer, {
      x: observer.position.x - 20,
      y: observer.position.y + 12,
    });
    routeUnit(state, hostile, {
      x: hostile.position.x - 34,
      y: hostile.position.y - 12,
    });
  } else if (scenario === 'hidden-hostile') {
    const contact = observer.perceptionKnowledge.contacts.find((item) => item.sourceUnitId === hostile.id);
    if (contact) {
      contact.visibleNow = false;
      contact.observedNow = false;
    }
    observer.viewRangeCells = 1;
    syncSoldierThreatMemory(state, observer, 0.1);
    routeUnit(state, hostile, {
      x: hostile.position.x - 32,
      y: hostile.position.y + 16,
    });
  } else {
    addFixtureWall(state, observer);
    routeUnit(state, hostile, {
      x: observer.position.x - 32,
      y: observer.position.y,
    });
  }

  state.selectedUnitId = observer.id;
  state.selectedUnitIds = [observer.id];
}

function routeUnit(state: SimulationState, unit: UnitModel, target: { x: number; y: number }): void {
  const selectedUnitId = state.selectedUnitId;
  const selectedUnitIds = [...state.selectedUnitIds];
  state.selectedUnitId = unit.id;
  state.selectedUnitIds = [unit.id];
  issueRoutedMoveOrderToSelectedUnits(state, {
    x: clamp(target.x, 0.5, state.map.width - 0.5),
    y: clamp(target.y, 0.5, state.map.height - 0.5),
  });
  state.selectedUnitId = selectedUnitId;
  state.selectedUnitIds = selectedUnitIds;
}

function snapshot(
  state: SimulationState,
  observer: UnitModel,
  hostile: UnitModel,
  scenario: DangerMovementScenario | null,
  includeExactAwareness: boolean,
): DangerMovementSnapshot {
  const subjective = observer.tacticalKnowledge.threats.find((threat) => threat.id === `unit:${hostile.id}`)
    ?? observer.tacticalKnowledge.threats[0]
    ?? null;
  const awareness = includeExactAwareness ? buildSoldierAwarenessReport(state, observer) : null;
  const winner = awareness?.bestSafePositions[0] ?? null;
  return {
    scenario,
    simulationTimeSeconds: state.simulationTimeSeconds,
    observerPosition: { ...observer.position },
    hostilePosition: { ...hostile.position },
    subjectiveThreatPosition: subjective ? { x: subjective.x, y: subjective.y } : null,
    subjectiveThreatVisibleNow: subjective?.visibleNow ?? null,
    tacticalKnowledgeRevision: observer.tacticalKnowledge.revision,
    observerMoving: observer.order !== null,
    hostileMoving: hostile.order !== null,
    bestSafePosition: winner ? { ...winner.position } : null,
    protectedAgainstThreatId: winner?.protectedAgainstThreatId ?? null,
    awarenessMovement: window.__realWargameAwarenessDebug?.movement ?? null,
  };
}

function resolveUnits(state: SimulationState): [UnitModel, UnitModel] {
  const observer = state.units.find((unit) => unit.side === 'blue') ?? state.units[0];
  const hostile = state.units.find((unit) => unit.side === 'red' && unit.id !== observer?.id)
    ?? state.units.find((unit) => unit.id !== observer?.id)
    ?? state.units[1];
  if (!observer || !hostile) throw new Error('Movement performance harness requires two units.');
  return [observer, hostile];
}

function installVisualContact(observer: UnitModel, hostile: UnitModel, nowSeconds: number): void {
  const contact = advanceVisualContact(null, {
    id: `perception:unit:${hostile.id}`,
    stimulusId: `unit:${hostile.id}`,
    sourceUnitId: hostile.id,
    labelRu: hostile.labels.ru,
    position: { ...hostile.position },
    evidencePerSecond: 220,
    deltaSeconds: 1,
    nowSeconds,
    source: 'visual',
  });
  upsertPerceptionContact(observer.perceptionKnowledge, contact);
}

function addFixtureWall(state: SimulationState, observer: UnitModel): void {
  state.map.objects.push({
    id: WALL_ID,
    kind: 'structure',
    x: observer.position.x - 1,
    y: observer.position.y - 10,
    widthCells: 1,
    heightCells: 20,
    rotationRadians: 0,
    losHeightMeters: 2.6,
    coverProtection: 95,
    coverReliability: 100,
    concealment: 15,
    penetrable: false,
    coverPosture: 'standing',
    labels: { en: 'Movement performance wall', ru: 'Стена проверки движения' },
  });
  markMapObjectsDirty(state.map);
}

function removeFixtureWall(state: SimulationState): void {
  const next = state.map.objects.filter((object) => object.id !== WALL_ID);
  if (next.length === state.map.objects.length) return;
  state.map.objects.splice(0, state.map.objects.length, ...next);
  markMapObjectsDirty(state.map);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
