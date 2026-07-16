import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildSoldierAwarenessReport } from '../src/core/knowledge/SoldierAwarenessGrid';
import { getSoldierDangerFieldDiagnostics } from '../src/core/knowledge/SoldierDangerField';
import { normalizeTacticalKnowledge } from '../src/core/knowledge/SoldierThreatMemory';
import type { TacticalMapData } from '../src/core/map/MapModel';
import { buildUnitTacticalRouteContext } from '../src/core/navigation/NavigationRuntime';
import {
  createRouteCostFieldCache,
  getRouteCostFields,
} from '../src/core/navigation/RouteCostField';
import { getBuiltInNavigationProfile } from '../src/core/navigation/NavigationProfiles';
import { findGridPath } from '../src/core/pathfinding/GridPathfinder';
import { createInitialState } from '../src/core/simulation/SimulationState';
import type { FireThreatClass, KnownThreatMemory, UnitModel } from '../src/core/units/UnitModel';

const mapData: TacticalMapData = {
  width: 18,
  height: 12,
  cellSize: 24,
  metersPerCell: 5,
  runtimeMetersPerCell: 5,
  defaultTerrain: 'field',
  defaultHeight: 0,
  objects: [{
    id: 'cache-wall',
    kind: 'structure',
    x: 8,
    y: 3,
    widthCells: 1,
    heightCells: 5,
    coverProtection: 90,
    coverReliability: 95,
    concealment: 68,
    penetrable: false,
    coverPosture: 'standing',
  }],
};

const state = createInitialState(mapData, [{
  id: 'blue-cache',
  label: 'Blue cache',
  labelRu: 'Синий cache',
  type: 'infantry_squad',
  side: 'blue',
  x: 4,
  y: 5,
}]);
const unit = requireUnit('blue-cache');
const routeCache = createRouteCostFieldCache();
const normal = getBuiltInNavigationProfile('normal');
const cautious = getBuiltInNavigationProfile('cautious');
const targetCell = { x: 11, y: 5 };

unit.tacticalKnowledge.threats = [threat('unit:cache-rifle', 15.5, 5.5, 78, 90, 'rifle_fire', 34)];
unit.tacticalKnowledge.revision = 1;

const firstReport = buildSoldierAwarenessReport(state, unit);
const firstFields = getRouteCostFields(
  state.map,
  normal,
  buildUnitTacticalRouteContext(unit),
  routeCache,
);
const afterFirst = getSoldierDangerFieldDiagnostics(state.map);
assert.equal(
  firstReport.dangerFieldKey,
  firstFields.dangerFieldKey,
  'awareness and route cost must expose the same canonical danger content key',
);
assert.ok(firstFields.availability.danger, 'route danger must be available with the graphical overlay fully absent');
assert.ok(firstFields.dangerCost.some((value) => value > 0), 'headless route fields must contain danger cost');

const repeatedReport = buildSoldierAwarenessReport(state, unit);
const repeatedFields = getRouteCostFields(
  state.map,
  normal,
  buildUnitTacticalRouteContext(unit),
  routeCache,
);
const afterRepeated = getSoldierDangerFieldDiagnostics(state.map);
assert.equal(repeatedReport.dangerFieldKey, firstReport.dangerFieldKey, 'unchanged awareness must reuse the danger key');
assert.equal(repeatedFields.dangerFieldKey, firstFields.dangerFieldKey, 'unchanged routing must reuse the danger key');
assert.equal(afterRepeated.geometryBuildCount, afterFirst.geometryBuildCount, 'unchanged request must not rebuild threat geometry');
assert.equal(afterRepeated.fieldBuildCount, afterFirst.fieldBuildCount, 'unchanged request must not rebuild the scored danger field');
assert.ok(afterRepeated.fieldCacheHitCount > afterFirst.fieldCacheHitCount, 'unchanged request must hit the danger field cache');

const cautiousFields = getRouteCostFields(
  state.map,
  cautious,
  buildUnitTacticalRouteContext(unit),
  routeCache,
);
const afterProfileChange = getSoldierDangerFieldDiagnostics(state.map);
assert.equal(cautiousFields.dangerFieldKey, firstFields.dangerFieldKey, 'navigation profile must not change danger semantics');
assert.equal(afterProfileChange.geometryBuildCount, afterRepeated.geometryBuildCount, 'profile change must not rebuild threat geometry');
assert.equal(afterProfileChange.fieldBuildCount, afterRepeated.fieldBuildCount, 'profile change must not rebuild the danger field');
assert.ok(
  routeDangerAt(cautiousFields, targetCell.x, targetCell.y) > routeDangerAt(firstFields, targetCell.x, targetCell.y),
  'profile dangerWeight must remain a route preference layered over the same danger field',
);

unit.tacticalKnowledge.threats[0].fireThreatClass = 'machine_gun_fire';
unit.tacticalKnowledge.revision += 1;
const classReport = buildSoldierAwarenessReport(state, unit);
const classFields = getRouteCostFields(
  state.map,
  normal,
  buildUnitTacticalRouteContext(unit),
  routeCache,
);
const afterClassChange = getSoldierDangerFieldDiagnostics(state.map);
assert.notEqual(classReport.dangerFieldKey, firstReport.dangerFieldKey, 'fire class change must invalidate scored danger content');
assert.equal(classReport.dangerFieldKey, classFields.dangerFieldKey, 'class invalidation must remain identical for awareness and routing');
assert.equal(afterClassChange.geometryBuildCount, afterProfileChange.geometryBuildCount, 'fire class change must not rebuild threat geometry');
assert.ok(afterClassChange.fieldBuildCount > afterProfileChange.fieldBuildCount, 'fire class change must build a new scored danger field');

unit.tacticalKnowledge.threats[0].confidence = 62;
unit.tacticalKnowledge.revision += 1;
const confidenceReport = buildSoldierAwarenessReport(state, unit);
const confidenceFields = getRouteCostFields(
  state.map,
  normal,
  buildUnitTacticalRouteContext(unit),
  routeCache,
);
const afterConfidenceChange = getSoldierDangerFieldDiagnostics(state.map);
assert.notEqual(confidenceReport.dangerFieldKey, classReport.dangerFieldKey, 'confidence change must invalidate scored danger content');
assert.equal(confidenceReport.dangerFieldKey, confidenceFields.dangerFieldKey, 'confidence invalidation must remain identical for awareness and routing');
assert.equal(afterConfidenceChange.geometryBuildCount, afterClassChange.geometryBuildCount, 'single-source confidence change must reuse threat geometry');
assert.ok(afterConfidenceChange.fieldBuildCount > afterClassChange.fieldBuildCount, 'confidence change must rescore the danger field');

const route = findGridPath(
  state.map,
  unit.position,
  { x: 13.5, y: 9.5 },
  {
    navigationProfile: cautious,
    tacticalContext: buildUnitTacticalRouteContext(unit),
    costFieldCache: routeCache,
  },
);
assert.ok(route.ok, `headless A* must remain operational without any overlay or renderer: ${route.reason}`);
assert.ok(route.visitedCells > 0, 'headless A* must perform a bounded search');

const rifleWithSuppression = threat('unit:suppression-a', 15.5, 5.5, 64, 90, 'rifle_fire', 42);
const secondRifleWithSuppression = threat('unit:suppression-b', 15.5, 5.5, 48, 90, 'rifle_fire', 36);
unit.tacticalKnowledge.threats = [rifleWithSuppression];
unit.tacticalKnowledge.revision += 1;
const singleSuppression = awarenessAt(targetCell.x, targetCell.y).suppression;
unit.tacticalKnowledge.threats = [rifleWithSuppression, secondRifleWithSuppression];
unit.tacticalKnowledge.revision += 1;
const combinedSuppression = awarenessAt(targetCell.x, targetCell.y).suppression;
assert.ok(combinedSuppression > singleSuppression, 'suppression must preserve independent stacking semantics');

const normalizedLegacy = normalizeTacticalKnowledge({
  threats: [{
    ...threat('unit:legacy-rifle', 9.5, 5.5, 70, 80, null, 0),
    fireThreatClass: undefined,
  }],
});
assert.equal(normalizedLegacy.threats[0]?.fireThreatClass, 'rifle_fire', 'legacy known unit memory must safely fall back to rifle_fire');
const normalizedUnknown = normalizeTacticalKnowledge({
  threats: [threat('unknown-fire:legacy', 9.5, 5.5, 70, 80, null, 0)],
});
assert.equal(normalizedUnknown.threats[0]?.fireThreatClass, null, 'unknown legacy memory must remain unclassified and independent');

for (const relativePath of [
  'src/core/knowledge/SoldierDangerField.ts',
  'src/core/knowledge/SoldierAwarenessGrid.ts',
  'src/core/navigation/RouteCostField.ts',
  'src/core/pathfinding/GridPathfinder.ts',
]) {
  const source = readFileSync(relativePath, 'utf8');
  assert.ok(!source.includes("from 'pixi.js'"), `${relativePath} must not import PixiJS`);
  assert.ok(!source.includes('../rendering/'), `${relativePath} must not import rendering`);
  assert.ok(!source.includes('../ui/'), `${relativePath} must not import UI state`);
}

assert.ok(afterConfidenceChange.cachedGeometryCount <= 16, 'danger geometry cache must remain bounded');
assert.ok(afterConfidenceChange.cachedFieldCount <= 24, 'scored danger cache must remain bounded');

console.log(JSON.stringify({
  smoke: 'danger-route-cost-cache',
  dangerFieldKey: confidenceReport.dangerFieldKey,
  geometryBuilds: afterConfidenceChange.geometryBuildCount,
  fieldBuilds: afterConfidenceChange.fieldBuildCount,
  cacheHits: afterConfidenceChange.fieldCacheHitCount,
  routeVisitedCells: route.visitedCells,
  suppression: { single: singleSuppression, combined: combinedSuppression },
}, null, 2));
console.log('Danger route cache smoke passed: awareness, headless A*, and route cost share one renderer-independent bounded danger field.');

function awarenessAt(x: number, y: number) {
  const report = buildSoldierAwarenessReport(state, unit);
  const cell = report.cells[y * state.map.width + x];
  assert.ok(cell, `awareness cell ${x}:${y} must exist`);
  return cell;
}

function routeDangerAt(fields: ReturnType<typeof getRouteCostFields>, x: number, y: number): number {
  return fields.dangerCost[y * fields.width + x] ?? 0;
}

function threat(
  id: string,
  x: number,
  y: number,
  strength: number,
  confidence: number,
  fireThreatClass: FireThreatClass | null,
  suppression: number,
): KnownThreatMemory {
  return {
    id,
    labelRu: id,
    mode: 'directional_fire',
    x,
    y,
    radiusCells: 0,
    widthCells: 0,
    heightCells: 0,
    rotationDegrees: 0,
    strength,
    suppression,
    stressPerSecond: 4,
    directionDegrees: 180,
    arcDegrees: 150,
    rangeCells: 30,
    minRangeCells: 0,
    falloffPercent: 25,
    confidence,
    uncertaintyCells: 0,
    source: id.startsWith('unknown-fire:') ? 'fire_pressure' : 'seen',
    visibleNow: id.startsWith('unit:'),
    lastSeenSeconds: id.startsWith('unit:') ? 0 : -1,
    lastUpdatedSeconds: 0,
    fireThreatClass,
  };
}

function requireUnit(id: string): UnitModel {
  const found = state.units.find((candidate) => candidate.id === id);
  assert.ok(found, `unit ${id} must exist`);
  return found;
}
