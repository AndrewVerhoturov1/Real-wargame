import assert from 'node:assert/strict';
import { buildSoldierAwarenessReport, type SoldierAwarenessReport } from '../src/core/knowledge/SoldierAwarenessGrid';
import { syncSoldierThreatMemory } from '../src/core/knowledge/SoldierThreatMemory';
import type { TacticalMapData } from '../src/core/map/MapModel';
import type { NavigationProfile } from '../src/core/navigation/NavigationProfiles';
import {
  createRouteCostFieldCache,
  getRouteCostFieldDiagnostics,
  getRouteCostFields,
  readRouteCostCell,
  type RouteCostFieldCache,
  type TacticalRouteContext,
} from '../src/core/navigation/RouteCostField';
import { findGridPath } from '../src/core/pathfinding/GridPathfinder';
import { advanceVisualContact, upsertPerceptionContact } from '../src/core/perception/PerceptionContact';
import { createInitialState, type SimulationState } from '../src/core/simulation/SimulationState';
import { getDirectionalTacticalField, getDirectionalTacticalFieldDiagnostics } from '../src/core/terrain/DirectionalTacticalField';
import {
  getDirectionalTerrainPositionQueryDiagnostics,
  queryDirectionalTerrainPositions,
} from '../src/core/terrain/DirectionalTerrainPositionQuery';
import type { KnownThreatMemory, UnitModel } from '../src/core/units/UnitModel';

export const WIDTH = 13;
export const HEIGHT = 11;
export const CREST_X = 6;
export const START = { x: 6.5, y: 5.5 } as const;
export const GOAL = { x: 6.5, y: 10.5 } as const;
export const EAST = { x: 12.5, y: 5.5 } as const;
export const WEST = { x: 0.5, y: 5.5 } as const;
export const REVERSE = { x: 5, y: 5 } as const;
export const CREST = { x: 6, y: 5 } as const;
export const FORWARD = { x: 7, y: 5 } as const;
export const QUERY_RADIUS = 4;
export const QUERY_ROUGH_LIMIT = 16;
export const QUERY_EXACT_LIMIT = 6;
const RIDGE = [-2, -2, -1, 0, 1, 3, 4, 3, 1, 0, -1, -2, -2] as const;

export function makeScenario(id: string, ridge: boolean): SimulationState {
  const cells: NonNullable<TacticalMapData['cells']> = [];
  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      cells.push({ x, y, terrain: 'field', forest: 0, height: ridge ? RIDGE[x] : 0 });
    }
  }
  return createInitialState({
    width: WIDTH,
    height: HEIGHT,
    cellSize: 16,
    metersPerCell: 2,
    runtimeMetersPerCell: 2,
    defaultTerrain: 'field',
    defaultHeight: 0,
    cells,
    objects: [],
  }, [
    { id: `blue-${id}`, label: 'Mover', labelRu: 'Маневрирующий боец', type: 'infantry_squad', side: 'blue', x: 6, y: 5, navigationProfileId: 'retreat' },
    { id: `red-${id}`, label: 'Threat', labelRu: 'Угроза', type: 'infantry_squad', side: 'red', x: 12, y: 5, facingDegrees: 180 },
  ]);
}

export function installSubjectiveContact(state: SimulationState, position: { x: number; y: number }) {
  const blue = observer(state);
  const red = target(state);
  red.position = { ...position };
  const id = `perception:unit:${red.id}`;
  const contact = advanceVisualContact(null, {
    id,
    stimulusId: `unit:${red.id}`,
    sourceUnitId: red.id,
    labelRu: red.labels.ru,
    position,
    evidencePerSecond: 90,
    deltaSeconds: 1,
    nowSeconds: state.simulationTimeSeconds,
    source: 'visual',
    explanationRu: ['реальный субъективный визуальный контакт'],
  });
  upsertPerceptionContact(blue.perceptionKnowledge, contact);
  syncSoldierThreatMemory(state, blue, 0.1);
  const threat = requireThreat(blue, `unit:${red.id}`);
  assert.deepEqual({ x: threat.x, y: threat.y }, contact.lastKnownPosition);
  assert.equal(threat.source, 'seen');
  assert.equal(threat.mode, 'directional_fire');
  assert.equal(threat.visibleNow, false);
  assert.ok(threat.uncertaintyCells > 1);
  assert.equal(hasObjectiveLeak(threat), false);
  return { blue, red, contactId: id, threat: { ...threat }, revision: blue.tacticalKnowledge.revision };
}

export function updateSubjectiveContact(state: SimulationState, installed: ReturnType<typeof installSubjectiveContact>, position: { x: number; y: number }) {
  state.simulationTimeSeconds += 1;
  const previous = installed.blue.perceptionKnowledge.contacts.find((item) => item.id === installed.contactId);
  assert.ok(previous);
  installed.red.position = { ...position };
  const contact = advanceVisualContact(previous, {
    id: previous.id,
    stimulusId: previous.stimulusId,
    sourceUnitId: installed.red.id,
    labelRu: installed.red.labels.ru,
    position,
    evidencePerSecond: 90,
    deltaSeconds: 0,
    nowSeconds: state.simulationTimeSeconds,
    source: 'visual',
  });
  upsertPerceptionContact(installed.blue.perceptionKnowledge, contact);
  syncSoldierThreatMemory(state, installed.blue, 0);
  const threat = requireThreat(installed.blue, installed.threat.id);
  assert.ok(installed.blue.tacticalKnowledge.revision > installed.revision);
  assert.deepEqual({ x: threat.x, y: threat.y }, position);
  assert.equal(threat.confidence, installed.threat.confidence);
  assert.equal(threat.uncertaintyCells, installed.threat.uncertaintyCells);
  assert.equal(threat.strength, installed.threat.strength);
  assert.equal(hasObjectiveLeak(threat), false);
  return { ...installed, threat: { ...threat }, revision: installed.blue.tacticalKnowledge.revision };
}

export function evaluateScenario(state: SimulationState, profile: NavigationProfile, routeCache: RouteCostFieldCache = createRouteCostFieldCache()) {
  const blue = observer(state);
  const threat = blue.tacticalKnowledge.threats[0];
  assert.ok(threat);
  const awareness = buildSoldierAwarenessReport(state, blue);
  const winner = awareness.bestSafePositions[0];
  assert.ok(winner);
  const query = queryDirectionalTerrainPositions(state.map, {
    unitId: blue.id,
    origin: blue.position,
    posture: 'crouched',
    threats: blue.tacticalKnowledge.threats,
    knowledgeRevision: blue.tacticalKnowledge.revision,
    profile,
    radiusCells: QUERY_RADIUS,
    roughCandidateLimit: QUERY_ROUGH_LIMIT,
    exactCandidateLimit: QUERY_EXACT_LIMIT,
  });
  const context = routeContext(blue);
  const fields = getRouteCostFields(state.map, profile, context, routeCache);
  const route = findGridPath(state.map, blue.position, GOAL, {
    navigationProfile: profile,
    tacticalContext: context,
    costFieldCache: routeCache,
    maxVisitedCells: WIDTH * HEIGHT,
  });
  assert.equal(route.ok, true);
  if (!route.ok) throw new Error(route.reason);
  const directional = getDirectionalTacticalField(state.map, {
    unitId: blue.id,
    originX: blue.position.x,
    originY: blue.position.y,
    knowledgeRevision: blue.tacticalKnowledge.revision,
    threats: blue.tacticalKnowledge.threats,
  });
  return {
    state,
    blue,
    threat,
    awareness,
    winner,
    query,
    fields,
    route,
    routeCache,
    directional,
    knowledgeRevision: blue.tacticalKnowledge.revision,
    routeDiagnostics: getRouteCostFieldDiagnostics(routeCache),
    directionalDiagnostics: getDirectionalTacticalFieldDiagnostics(state.map),
    queryDiagnostics: getDirectionalTerrainPositionQueryDiagnostics(state.map),
  };
}

export type ScenarioEvaluation = ReturnType<typeof evaluateScenario>;

export function routeContext(unit: UnitModel): TacticalRouteContext {
  return {
    unitId: unit.id,
    originX: unit.position.x,
    originY: unit.position.y,
    knowledgeRevision: unit.tacticalKnowledge.revision,
    knownThreats: unit.tacticalKnowledge.threats,
  };
}

export function observer(state: SimulationState) {
  const unit = state.units.find((item) => item.side === 'blue');
  assert.ok(unit);
  return unit;
}

export function target(state: SimulationState) {
  const unit = state.units.find((item) => item.side === 'red');
  assert.ok(unit);
  return unit;
}

export function awarenessCell(report: SoldierAwarenessReport, position: { x: number; y: number }) {
  const value = report.cells[position.y * WIDTH + position.x];
  assert.ok(value);
  return value;
}

export function routeCell(result: ScenarioEvaluation, position: { x: number; y: number }) {
  const value = readRouteCostCell(result.fields, position.x, position.y);
  assert.ok(value);
  return value;
}

export function routeSideCount(result: ScenarioEvaluation, side: 'west' | 'east') {
  return result.route.cells.slice(1, -1).filter((cell) => side === 'west' ? cell.x < CREST_X : cell.x > CREST_X).length;
}

export function threatSnapshot(threat: KnownThreatMemory) {
  return {
    mode: threat.mode, x: threat.x, y: threat.y, strength: threat.strength,
    suppression: threat.suppression, directionDegrees: threat.directionDegrees,
    arcDegrees: threat.arcDegrees, rangeCells: threat.rangeCells,
    falloffPercent: threat.falloffPercent, confidence: threat.confidence,
    uncertaintyCells: threat.uncertaintyCells, source: threat.source,
    visibleNow: threat.visibleNow,
  };
}

export function hasObjectiveLeak(threat: KnownThreatMemory) {
  const value = threat as unknown as Record<string, unknown>;
  return 'currentShooterPosition' in value || 'objectivePosition' in value || 'weaponState' in value || 'weapon' in value;
}

function requireThreat(unit: UnitModel, id: string) {
  const threat = unit.tacticalKnowledge.threats.find((item) => item.id === id);
  assert.ok(threat);
  return threat;
}
