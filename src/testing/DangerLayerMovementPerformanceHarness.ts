import { buildSoldierAwarenessReport } from '../core/knowledge/SoldierAwarenessGrid';
import { syncSoldierThreatMemory } from '../core/knowledge/SoldierThreatMemory';
import { markMapCellsDirty, markMapObjectsDirty } from '../core/map/MapRuntimeState';
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
  readonly movingUnitCount: number;
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
  installTerrainFixtures(state);
  resetUnits(state, observer, hostile);

  installVisualContact(observer, hostile, state.simulationTimeSeconds);
  syncSoldierThreatMemory(state, observer, 0.1);
  state.selectedUnitId = observer.id;
  state.selectedUnitIds = [observer.id];

  if (scenario === 'selected-only') {
    // Move toward the stationary visible hostile so observer facing does not
    // turn the contact invisible. This isolates own-position movement from
    // legitimate visibility/knowledge invalidation.
    routeUnit(state, observer, {
      x: observer.position.x + 22,
      y: observer.position.y,
    });
  } else if (scenario === 'hostile-only') {
    routeUnit(state, hostile, {
      x: hostile.position.x - 30,
      y: hostile.position.y + 10,
    });
  } else if (scenario === 'both') {
    routeAllUnits(state, observer, hostile);
  } else if (scenario === 'hidden-hostile') {
    const contact = observer.perceptionKnowledge.contacts.find(
      (item) => item.sourceUnitId === hostile.id,
    );
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

function resetUnits(
  state: SimulationState,
  observer: UnitModel,
  hostile: UnitModel,
): void {
  const centerY = Math.floor(state.map.height * 0.52) + 0.5;
  const slots = [
    { x: state.map.width * 0.38, y: centerY },
    // Keep the sole hostile west of the ridge for selected-only contact stability.
    { x: state.map.width * 0.47, y: centerY },
    { x: state.map.width * 0.30, y: centerY - 18 },
    { x: state.map.width * 0.32, y: centerY + 18 },
    { x: state.map.width * 0.72, y: centerY - 18 },
    { x: state.map.width * 0.70, y: centerY + 18 },
  ];

  for (let index = 0; index < state.units.length; index += 1) {
    const unit = state.units[index];
    const slot = slots[index % slots.length];
    // Scenario 1 must contain one static subjective hostile only. Scenario 3
    // still routes all six units, but auxiliary movers remain allies.
    unit.side = 'blue';
    unit.order = null;
    unit.playerCommand = null;
    unit.speedCellsPerSecond = index === 0 ? 12 : 10;
    unit.position = {
      x: clamp(Math.floor(slot.x) + 0.5, 0.5, state.map.width - 0.5),
      y: clamp(slot.y, 0.5, state.map.height - 0.5),
    };
  }

  observer.side = 'blue';
  hostile.side = 'red';
  observer.position = { ...slots[0], x: Math.floor(slots[0].x) + 0.5 };
  hostile.position = { ...slots[1], x: Math.floor(slots[1].x) + 0.5 };
  observer.facingRadians = 0;
  hostile.facingRadians = Math.PI;
  observer.viewRangeCells = Math.max(state.map.width, state.map.height);
  hostile.viewRangeCells = Math.max(state.map.width, state.map.height);
  observer.perceptionKnowledge.contacts = [];
  observer.tacticalKnowledge.threats = [];
  observer.tacticalKnowledge.revision += 1;
}

function routeAllUnits(
  state: SimulationState,
  observer: UnitModel,
  hostile: UnitModel,
): void {
  for (let index = 0; index < state.units.length; index += 1) {
    const unit = state.units[index];
    const direction = index % 2 === 0 ? -1 : 1;
    routeUnit(state, unit, {
      x: unit.position.x + direction * (18 + index * 2),
      y: unit.position.y + (index % 3 - 1) * 10,
    });
  }

  if (!observer.order) {
    routeUnit(state, observer, {
      x: observer.position.x - 20,
      y: observer.position.y + 12,
    });
  }
  if (!hostile.order) {
    routeUnit(state, hostile, {
      x: hostile.position.x - 34,
      y: hostile.position.y - 12,
    });
  }
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
  const subjective = observer.tacticalKnowledge.threats.find(
    (threat) => threat.id === `unit:${hostile.id}`,
  ) ?? observer.tacticalKnowledge.threats[0] ?? null;
  const awareness = includeExactAwareness
    ? buildSoldierAwarenessReport(state, observer)
    : null;
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
    movingUnitCount: state.units.filter((unit) => unit.order !== null).length,
    bestSafePosition: winner ? { ...winner.position } : null,
    protectedAgainstThreatId: winner?.protectedAgainstThreatId ?? null,
    awarenessMovement: window.__realWargameAwarenessDebug?.movement ?? null,
  };
}

function resolveUnits(state: SimulationState): [UnitModel, UnitModel] {
  const observer = state.units.find((unit) => unit.side === 'blue') ?? state.units[0];
  const hostile = state.units.find(
    (unit) => unit.side === 'red' && unit.id !== observer?.id,
  ) ?? state.units.find((unit) => unit.id !== observer?.id) ?? state.units[1];
  if (!observer || !hostile) {
    throw new Error('Movement performance harness requires two units.');
  }
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

function installTerrainFixtures(state: SimulationState): void {
  const width = state.map.width;
  const height = state.map.height;
  const lightBounds = {
    minX: Math.max(2, Math.floor(width * 0.18)),
    maxX: Math.min(width - 3, Math.floor(width * 0.29)),
    minY: Math.max(2, Math.floor(height * 0.34)),
    maxY: Math.min(height - 3, Math.floor(height * 0.56)),
  };
  const denseBounds = {
    minX: Math.max(2, Math.floor(width * 0.72)),
    maxX: Math.min(width - 3, Math.floor(width * 0.84)),
    minY: Math.max(2, Math.floor(height * 0.46)),
    maxY: Math.min(height - 3, Math.floor(height * 0.70)),
  };

  for (let y = lightBounds.minY; y <= lightBounds.maxY; y += 1) {
    for (let x = lightBounds.minX; x <= lightBounds.maxX; x += 1) {
      state.map.cells[y * width + x].forest = 1;
    }
  }
  for (let y = denseBounds.minY; y <= denseBounds.maxY; y += 1) {
    for (let x = denseBounds.minX; x <= denseBounds.maxX; x += 1) {
      state.map.cells[y * width + x].forest = 2;
    }
  }
  markMapCellsDirty(state.map, 'forest', lightBounds);
  markMapCellsDirty(state.map, 'forest', denseBounds);

  const ridgeCenterX = Math.floor(width * 0.52);
  const ridgeMinY = Math.max(2, Math.floor(height * 0.38));
  const ridgeMaxY = Math.min(height - 3, Math.floor(height * 0.66));
  for (let y = ridgeMinY; y <= ridgeMaxY; y += 1) {
    for (let offset = -3; offset <= 3; offset += 1) {
      const x = ridgeCenterX + offset;
      const heightLevel = Math.max(0, 3 - Math.abs(offset)) as 0 | 1 | 2 | 3;
      state.map.cells[y * width + x].height = heightLevel;
    }
  }
  markMapCellsDirty(state.map, 'height', {
    minX: ridgeCenterX - 3,
    maxX: ridgeCenterX + 3,
    minY: ridgeMinY,
    maxY: ridgeMaxY,
  });
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
