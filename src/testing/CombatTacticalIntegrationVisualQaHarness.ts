import { applyBallisticCombatEffects, clearCombatSuppression, getCombatSuppressionSnapshot } from '../core/combat/CombatSuppression';
import { clearCombatThreatEvidence } from '../core/combat/CombatThreatEvidence';
import { clearCombatEvents, drainDueCombatEvents, queueCombatEvent } from '../core/combat/CombatEvents';
import { buildSoldierAwarenessReport } from '../core/knowledge/SoldierAwarenessGrid';
import { syncSoldierThreatMemory } from '../core/knowledge/SoldierThreatMemory';
import { fullMapRegion, getMapRevisionSnapshot, markMapCellsDirty, markMapObjectsDirty } from '../core/map/MapRuntimeState';
import { issueRoutedMoveOrderToSelectedUnits } from '../core/orders/RoutedMoveOrders';
import { advanceVisualContact, upsertPerceptionContact } from '../core/perception/PerceptionContact';
import type { SimulationState } from '../core/simulation/SimulationState';
import { setAiTestPaused } from '../core/testing/AiTestLabRuntime';
import type { UnitModel } from '../core/units/UnitModel';
import {
  getRealReliefOverlayState,
  setAttentionCurrentContacts,
  setAttentionMemoryMarkers,
  setAttentionOverlayActive,
  setAttentionUncertainty,
  setCommandPlanRouteOverlayActive,
  setSimulationLayerMode,
  toggleRealReliefOverlay,
} from '../core/ui/RuntimeUiState';

export type CombatTacticalVisualScenario = 'visual-contact' | 'near-miss' | 'wall-cover' | 'reverse-slope';

export interface CombatTacticalVisualSnapshot {
  readonly scenario: CombatTacticalVisualScenario;
  readonly suppression: number;
  readonly stress: number;
  readonly threatIds: readonly string[];
  readonly threatConfidence: number;
  readonly bestSafePosition: { x: number; y: number } | null;
  readonly routeWaypointCount: number;
  readonly mapVisualRevision: number;
}

export interface CombatTacticalVisualQaApi {
  setScenario(scenario: CombatTacticalVisualScenario): CombatTacticalVisualSnapshot;
  getSnapshot(): CombatTacticalVisualSnapshot | null;
}

declare global {
  interface Window {
    __realWargameCombatTacticalVisualQa?: CombatTacticalVisualQaApi;
  }
}

const VISUAL_OBJECT_PREFIX = 'combat-tactical-visual-';

export function installCombatTacticalIntegrationVisualQaHarness(
  state: SimulationState,
  onChanged: () => void,
): void {
  const query = new URLSearchParams(window.location.search);
  if (query.get('visualQa') !== 'combat-tactical-integration') return;

  const baselineHeights = state.map.cells.map((cell) => cell.height);
  let activeScenario: CombatTacticalVisualScenario | null = null;
  setAiTestPaused(state, true);

  window.__realWargameCombatTacticalVisualQa = {
    setScenario(scenario): CombatTacticalVisualSnapshot {
      const [observer, shooter] = resolveFixtureUnits(state);
      resetFixture(state, observer, shooter, baselineHeights);
      positionFixture(state, observer, shooter);
      configureOverlays(state);

      if (scenario === 'wall-cover') addWallFixture(state, observer, shooter);
      if (scenario === 'reverse-slope') addReverseSlopeFixture(state, observer, shooter);

      if (scenario === 'visual-contact') installVisualContact(observer, shooter, state.simulationTimeSeconds);
      else fireNearObserver(state, observer, shooter, scenario);

      syncSoldierThreatMemory(state, observer, 0.1);
      state.selectedUnitId = observer.id;
      state.selectedUnitIds = [observer.id];
      observer.playerNavigationProfileId = 'retreat';
      issueRoutedMoveOrderToSelectedUnits(state, {
        x: clamp(observer.position.x + state.map.width * 0.42, 0.5, state.map.width - 0.5),
        y: observer.position.y,
      });

      const report = buildSoldierAwarenessReport(state, observer);
      activeScenario = scenario;
      onChanged();
      window.dispatchEvent(new CustomEvent('real-wargame:combat-tactical-visual-qa-updated'));
      return buildSnapshot(state, observer, scenario, report);
    },
    getSnapshot(): CombatTacticalVisualSnapshot | null {
      if (!activeScenario) return null;
      const observer = state.units.find((unit) => unit.id === state.selectedUnitId) ?? state.units[0];
      if (!observer) return null;
      return buildSnapshot(state, observer, activeScenario, buildSoldierAwarenessReport(state, observer));
    },
  };
}

function resolveFixtureUnits(state: SimulationState): [UnitModel, UnitModel] {
  const observer = state.units[0];
  const shooter = state.units.find((unit) => unit.id !== observer?.id) ?? state.units[1];
  if (!observer || !shooter) throw new Error('Combat tactical visual QA requires at least two soldiers.');
  observer.side = 'blue';
  shooter.side = 'red';
  return [observer, shooter];
}

function resetFixture(
  state: SimulationState,
  observer: UnitModel,
  shooter: UnitModel,
  baselineHeights: readonly number[],
): void {
  clearCombatEvents(state);
  clearCombatSuppression(observer);
  clearCombatThreatEvidence(observer);
  observer.perceptionKnowledge.contacts = [];
  observer.tacticalKnowledge.threats = [];
  observer.tacticalKnowledge.revision += 1;
  observer.order = null;
  observer.playerCommand = null;
  observer.behaviorRuntime.suppression = 0;
  observer.behaviorRuntime.stress = 0;
  shooter.order = null;
  state.map.objects.splice(
    0,
    state.map.objects.length,
    ...state.map.objects.filter((object) => !object.id.startsWith(VISUAL_OBJECT_PREFIX)),
  );
  for (let index = 0; index < state.map.cells.length; index += 1) {
    state.map.cells[index].height = baselineHeights[index] ?? state.map.defaultHeight;
  }
  markMapCellsDirty(state.map, 'height', fullMapRegion(state.map));
  markMapObjectsDirty(state.map);
  setAiTestPaused(state, true);
}

function positionFixture(state: SimulationState, observer: UnitModel, shooter: UnitModel): void {
  observer.position = {
    x: Math.max(2.5, Math.floor(state.map.width * 0.30) + 0.5),
    y: Math.max(3.5, Math.floor(state.map.height * 0.52) + 0.5),
  };
  shooter.position = {
    x: Math.min(state.map.width - 2.5, Math.floor(state.map.width * 0.73) + 0.5),
    y: observer.position.y,
  };
  observer.facingRadians = 0;
  shooter.facingRadians = Math.PI;
}

function configureOverlays(state: SimulationState): void {
  state.editor.enabled = false;
  state.editor.panelOpen = false;
  setSimulationLayerMode(state, 'danger');
  setCommandPlanRouteOverlayActive(state, true);
  setAttentionOverlayActive(state, true);
  setAttentionCurrentContacts(state, true);
  setAttentionMemoryMarkers(state, true);
  setAttentionUncertainty(state, true);
  if (!getRealReliefOverlayState(state).active) toggleRealReliefOverlay(state);
}

function installVisualContact(observer: UnitModel, shooter: UnitModel, nowSeconds: number): void {
  const contact = advanceVisualContact(null, {
    id: `perception:unit:${shooter.id}`,
    stimulusId: `unit:${shooter.id}`,
    sourceUnitId: shooter.id,
    labelRu: shooter.labels.ru,
    position: { ...shooter.position },
    evidencePerSecond: 180,
    deltaSeconds: 1,
    nowSeconds,
    source: 'visual',
  });
  upsertPerceptionContact(observer.perceptionKnowledge, contact);
}

function fireNearObserver(
  state: SimulationState,
  observer: UnitModel,
  shooter: UnitModel,
  scenario: Exclude<CombatTacticalVisualScenario, 'visual-contact'>,
): void {
  const metresPerCell = state.map.metersPerCell;
  const shotId = `visual-${scenario}-${Math.round(state.simulationTimeSeconds * 1000)}`;
  const origin = {
    xMetres: shooter.position.x * metresPerCell,
    yMetres: (shooter.position.y + 0.85) * metresPerCell,
    zMetres: 1.45,
  };
  const wall = state.map.objects.find((object) => object.id === `${VISUAL_OBJECT_PREFIX}wall`);
  const impactGridX = wall
    ? wall.x + wall.widthCells / 2
    : Math.max(0.5, observer.position.x - state.map.width * 0.12);
  const impactPoint = {
    xMetres: impactGridX * metresPerCell,
    yMetres: origin.yMetres,
    zMetres: 1.35,
  };
  const travelledMetres = Math.abs(origin.xMetres - impactPoint.xMetres);
  const hitType = wall ? 'object' as const : 'terrain' as const;

  applyBallisticCombatEffects(state, {
    shotId,
    shooterId: shooter.id,
    origin,
    direction: { x: -1, y: 0, z: 0 },
    travelledMetres,
    impactPoint,
    hitType,
    hitObjectId: wall?.id,
    muzzleVelocityMetresPerSecond: 865,
  });
  queueCombatEvent(state, {
    id: `${shotId}:fired`,
    kind: 'shot_fired',
    dueSeconds: state.simulationTimeSeconds,
    shotId,
    shooterId: shooter.id,
    weaponId: 'rifle_mosin_v1',
    origin,
  });
  queueCombatEvent(state, {
    id: `${shotId}:impact`,
    kind: 'projectile_impact',
    dueSeconds: state.simulationTimeSeconds,
    shotId,
    shooterId: shooter.id,
    hitType,
    impactPoint,
    hitObjectId: wall?.id,
    energyJoules: 3000,
  });
  drainDueCombatEvents(state, state.simulationTimeSeconds);
}

function addWallFixture(state: SimulationState, observer: UnitModel, shooter: UnitModel): void {
  const centerX = (observer.position.x + shooter.position.x) / 2;
  state.map.objects.push({
    id: `${VISUAL_OBJECT_PREFIX}wall`,
    kind: 'structure',
    x: centerX - 0.5,
    y: observer.position.y - 2.5,
    widthCells: 1,
    heightCells: 5,
    rotationRadians: 0,
    losHeightMeters: 2.6,
    coverProtection: 95,
    coverReliability: 100,
    concealment: 10,
    penetrable: false,
    coverPosture: 'standing',
    labels: { en: 'Visual QA wall', ru: 'Стена проверки' },
  });
  markMapObjectsDirty(state.map);
}

function addReverseSlopeFixture(state: SimulationState, observer: UnitModel, shooter: UnitModel): void {
  const startX = Math.max(1, Math.floor(observer.position.x + 1));
  const endX = Math.min(state.map.width - 2, Math.floor((observer.position.x + shooter.position.x) / 2));
  const minY = Math.max(0, Math.floor(observer.position.y - 3));
  const maxY = Math.min(state.map.height - 1, Math.ceil(observer.position.y + 3));
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = startX; x <= endX; x += 1) {
      const progress = (x - startX + 1) / Math.max(1, endX - startX + 1);
      state.map.cells[y * state.map.width + x].height = Math.round(progress * 3);
    }
  }
  markMapCellsDirty(state.map, 'height', { minX: startX, minY, maxX: endX, maxY });
}

function buildSnapshot(
  state: SimulationState,
  observer: UnitModel,
  scenario: CombatTacticalVisualScenario,
  report: ReturnType<typeof buildSoldierAwarenessReport>,
): CombatTacticalVisualSnapshot {
  return {
    scenario,
    suppression: getCombatSuppressionSnapshot(observer, state.simulationTimeSeconds).suppression,
    stress: observer.behaviorRuntime.stress,
    threatIds: observer.tacticalKnowledge.threats.map((threat) => threat.id),
    threatConfidence: report.threatConfidence,
    bestSafePosition: report.bestSafePositions[0]
      ? { ...report.bestSafePositions[0].position }
      : null,
    routeWaypointCount: observer.order?.waypoints?.length ?? 0,
    mapVisualRevision: getMapRevisionSnapshot(state.map).visual,
  };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
