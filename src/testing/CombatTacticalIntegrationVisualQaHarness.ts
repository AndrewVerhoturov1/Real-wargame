import { applyBallisticCombatEffects, clearCombatSuppression, getCombatSuppressionSnapshot } from '../core/combat/CombatSuppression';
import { clearCombatThreatEvidence, recordCombatThreatEvidence } from '../core/combat/CombatThreatEvidence';
import { clearCombatEvents, drainDueCombatEvents, queueCombatEvent } from '../core/combat/CombatEvents';
import { buildSoldierAwarenessReport } from '../core/knowledge/SoldierAwarenessGrid';
import { syncSoldierThreatMemory } from '../core/knowledge/SoldierThreatMemory';
import { fullMapRegion, getMapRevisionSnapshot, markMapCellsDirty, markMapObjectsDirty } from '../core/map/MapRuntimeState';
import { issueRoutedMoveOrderToSelectedUnits } from '../core/orders/RoutedMoveOrders';
import { advanceVisualContact, upsertPerceptionContact } from '../core/perception/PerceptionContact';
import { evaluateThreatsAtPosition } from '../core/pressure/ThreatEvaluation';
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

export type CombatTacticalVisualScenario =
  | 'visual-contact'
  | 'near-miss'
  | 'wall-cover'
  | 'reverse-slope'
  | 'slice1-contact-danger-zero-suppression'
  | 'slice1-near-miss-evidence-suppression'
  | 'slice1-wall-evidence-attenuation'
  | 'slice1-repeated-unknown-fire-merged'
  | 'slice1-detected-shooter-alias';

export interface CombatTacticalVisualSnapshot {
  readonly scenario: CombatTacticalVisualScenario;
  readonly suppression: number;
  readonly stress: number;
  readonly danger: number;
  readonly tacticalSuppression: number;
  readonly threatIds: readonly string[];
  readonly threatConfidence: number;
  readonly evidenceCount: number;
  readonly unknownThreatCount: number;
  readonly unitThreatCount: number;
  readonly maxThreatStrength: number;
  readonly maxThreatSuppression: number;
  readonly hiddenFactLeakCount: number;
  readonly bestSafePosition: { x: number; y: number } | null;
  readonly routeWaypointCount: number;
  readonly mapVisualRevision: number;
}

export interface CombatTacticalVisualQaApi {
  setScenario(scenario: CombatTacticalVisualScenario): CombatTacticalVisualSnapshot;
  getSnapshot(): CombatTacticalVisualSnapshot | null;
  stepDangerPerformanceDynamicUpdate(step: number): void;
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

      if (scenario === 'wall-cover' || scenario === 'slice1-wall-evidence-attenuation') {
        addWallFixture(state, observer, shooter);
      }
      if (scenario === 'reverse-slope') addReverseSlopeFixture(state, observer, shooter);

      let memorySynced = false;
      if (scenario === 'visual-contact' || scenario === 'slice1-contact-danger-zero-suppression') {
        installVisualContact(observer, shooter, state.simulationTimeSeconds);
      } else if (scenario === 'slice1-repeated-unknown-fire-merged') {
        installRepeatedUnknownFireEvidence(state, observer, shooter);
        memorySynced = true;
      } else if (scenario === 'slice1-detected-shooter-alias') {
        installDetectedShooterAliasEvidence(state, observer, shooter);
        memorySynced = true;
      } else {
        fireNearObserver(state, observer, shooter, scenario);
      }

      if (!memorySynced) syncSoldierThreatMemory(state, observer, 0.1);
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
      return buildSnapshot(state, observer, shooter, scenario, report);
    },
    getSnapshot(): CombatTacticalVisualSnapshot | null {
      if (!activeScenario) return null;
      const observer = state.units.find((unit) => unit.id === state.selectedUnitId) ?? state.units[0];
      const shooter = state.units.find((unit) => unit.id !== observer?.id) ?? state.units[1];
      if (!observer || !shooter) return null;
      return buildSnapshot(state, observer, shooter, activeScenario, buildSoldierAwarenessReport(state, observer));
    },
    stepDangerPerformanceDynamicUpdate(step): void {
      if (!activeScenario) throw new Error('Set a combat tactical visual scenario before performance updates.');
      const observer = state.units.find((unit) => unit.id === state.selectedUnitId) ?? state.units[0];
      if (!observer) throw new Error('Danger performance update requires a selected observer.');
      const phase = ((Math.floor(step) % 8) + 8) % 8;
      for (let index = 0; index < observer.tacticalKnowledge.threats.length; index += 1) {
        const threat = observer.tacticalKnowledge.threats[index];
        threat.strength = clamp(58 + ((phase + index * 2) % 7) * 5, 0, 100);
        threat.suppression = clamp(42 + ((phase * 3 + index) % 8) * 6, 0, 100);
        threat.confidence = clamp(52 + ((phase * 2 + index * 3) % 6) * 7, 0, 100);
        threat.visibleNow = phase % 4 !== 3;
      }
      observer.tacticalKnowledge.revision += 1;
      // The real simulation changes tactical knowledge inside the live ticker. Let that same
      // ticker perform the next render instead of calling the UI-only forceRender path, which
      // synthetically invalidates the static map and contaminates danger-layer measurements.
      window.dispatchEvent(new CustomEvent('real-wargame:combat-tactical-visual-qa-updated'));
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
  baselineHeights: readonly SimulationState['map']['cells'][number]['height'][],
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

function installVisualContact(observer: UnitModel, shooter: UnitModel, nowSeconds: number) {
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
  return contact;
}

function installRepeatedUnknownFireEvidence(
  state: SimulationState,
  observer: UnitModel,
  shooter: UnitModel,
): void {
  const directionDegrees = incomingDirectionDegrees(observer, shooter);
  for (let index = 0; index < 3; index += 1) {
    recordCombatThreatEvidence(observer, {
      id: `visual-repeat-${index}-${Math.round(state.simulationTimeSeconds * 1000)}`,
      kind: 'near_miss',
      sourceUnitId: null,
      estimatedSourcePosition: {
        x: shooter.position.x + (index - 1) * 0.35,
        y: shooter.position.y + (index % 2 === 0 ? 0.25 : -0.2),
      },
      directionDegrees: directionDegrees + index - 1,
      confidence: 50,
      uncertaintyCells: 5,
      strength: 58,
      suppression: 66,
      stressPerSecond: 8,
      rangeCells: 70,
      arcDegrees: 58,
      createdSeconds: state.simulationTimeSeconds,
      lastUpdatedSeconds: state.simulationTimeSeconds,
      evidenceCount: 1,
    });
    syncSoldierThreatMemory(state, observer, index === 0 ? 0.1 : 1);
    state.simulationTimeSeconds += 1;
  }
}

function installDetectedShooterAliasEvidence(
  state: SimulationState,
  observer: UnitModel,
  shooter: UnitModel,
): void {
  recordCombatThreatEvidence(observer, {
    id: `visual-alias-${Math.round(state.simulationTimeSeconds * 1000)}`,
    kind: 'near_miss',
    sourceUnitId: shooter.id,
    estimatedSourcePosition: { x: shooter.position.x - 0.45, y: shooter.position.y + 0.3 },
    directionDegrees: incomingDirectionDegrees(observer, shooter),
    confidence: 54,
    uncertaintyCells: 5,
    strength: 60,
    suppression: 76,
    stressPerSecond: 8,
    rangeCells: 70,
    arcDegrees: 58,
    createdSeconds: state.simulationTimeSeconds,
    lastUpdatedSeconds: state.simulationTimeSeconds,
    evidenceCount: 1,
  });
  syncSoldierThreatMemory(state, observer, 0.1);

  state.simulationTimeSeconds += 1;
  const contact = installVisualContact(observer, shooter, state.simulationTimeSeconds);
  syncSoldierThreatMemory(state, observer, 1);
  contact.visibleNow = false;
  contact.observedNow = false;
  shooter.position = {
    x: clamp(shooter.position.x + 4, 0.5, state.map.width - 0.5),
    y: clamp(shooter.position.y + 2, 0.5, state.map.height - 0.5),
  };
  state.simulationTimeSeconds += 1;
  syncSoldierThreatMemory(state, observer, 1);
}

function incomingDirectionDegrees(observer: UnitModel, shooter: UnitModel): number {
  const result = Math.atan2(
    observer.position.y - shooter.position.y,
    observer.position.x - shooter.position.x,
  ) * 180 / Math.PI;
  return result < 0 ? result + 360 : result;
}

function fireNearObserver(
  state: SimulationState,
  observer: UnitModel,
  shooter: UnitModel,
  scenario: Exclude<CombatTacticalVisualScenario,
    | 'visual-contact'
    | 'slice1-contact-danger-zero-suppression'
    | 'slice1-repeated-unknown-fire-merged'
    | 'slice1-detected-shooter-alias'>,
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
  const centerX = Math.min(shooter.position.x - 1.5, observer.position.x + 2.5);
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
      state.map.cells[y * state.map.width + x].height = Math.round(progress * 3) as SimulationState['map']['cells'][number]['height'];
    }
  }
  markMapCellsDirty(state.map, 'height', { minX: startX, minY, maxX: endX, maxY });
}

function buildSnapshot(
  state: SimulationState,
  observer: UnitModel,
  shooter: UnitModel,
  scenario: CombatTacticalVisualScenario,
  report: ReturnType<typeof buildSoldierAwarenessReport>,
): CombatTacticalVisualSnapshot {
  const factual = evaluateThreatsAtPosition(state.map, observer, state.pressureZones);
  const threats = observer.tacticalKnowledge.threats;
  const unitThreat = threats.find((threat) => threat.id === `unit:${shooter.id}`);
  const hiddenPositionLeak = scenario === 'slice1-detected-shooter-alias'
    && unitThreat
    && Math.abs(unitThreat.x - shooter.position.x) < 0.0001
    && Math.abs(unitThreat.y - shooter.position.y) < 0.0001
    ? 1
    : 0;
  const hiddenFieldLeak = unitThreat
    ? ['weapon', 'weaponState', 'currentShooterPosition'].filter((key) => key in unitThreat).length
    : 0;
  return {
    scenario,
    suppression: getCombatSuppressionSnapshot(observer, state.simulationTimeSeconds).suppression,
    stress: observer.behaviorRuntime.stress,
    danger: factual.danger,
    tacticalSuppression: factual.suppression,
    threatIds: threats.map((threat) => threat.id),
    threatConfidence: report.threatConfidence,
    evidenceCount: threats.reduce((maximum, threat) => Math.max(maximum, threat.evidenceCount ?? 0), 0),
    unknownThreatCount: threats.filter((threat) => threat.id.startsWith('unknown-fire:')).length,
    unitThreatCount: threats.filter((threat) => threat.id.startsWith('unit:')).length,
    maxThreatStrength: threats.reduce((maximum, threat) => Math.max(maximum, threat.strength), 0),
    maxThreatSuppression: threats.reduce((maximum, threat) => Math.max(maximum, threat.suppression), 0),
    hiddenFactLeakCount: hiddenPositionLeak + hiddenFieldLeak,
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
