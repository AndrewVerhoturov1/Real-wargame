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
import { createInitialState, type SimulationState } from '../src/core/simulation/SimulationState';
import { getDirectionalTacticalFieldDiagnostics } from '../src/core/terrain/DirectionalTacticalField';
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

const directEvidence = assertDirectProfileIsLazy();
const multiThreatEvidence = assertMultiThreatGeometryReuse();
assertLegacyNormalization();
assertRendererIndependence();

console.log(JSON.stringify({
  smoke: 'danger-route-cost-cache',
  directProfile: directEvidence,
  multiThreat: multiThreatEvidence,
}, null, 2));
console.log('Danger route cache smoke passed: lazy direct routing and bounded per-threat geometry reuse are renderer-independent.');

function assertDirectProfileIsLazy() {
  const state = makeState('direct');
  const unit = requireUnit(state, 'blue-direct');
  const direct = getBuiltInNavigationProfile('direct');
  const cache = createRouteCostFieldCache();
  unit.tacticalKnowledge.threats = [
    threat('unit:direct-rifle', 15.5, 4.5, 82, 88, 'rifle_fire', 38),
    threat('unit:direct-mg', 15.5, 7.5, 94, 76, 'machine_gun_fire', 60),
  ];
  unit.tacticalKnowledge.revision = 1;

  const dangerBefore = getSoldierDangerFieldDiagnostics(state.map);
  const directionalBefore = getDirectionalTacticalFieldDiagnostics(state.map);
  const fields = getRouteCostFields(state.map, direct, buildUnitTacticalRouteContext(unit), cache);
  const dangerAfter = getSoldierDangerFieldDiagnostics(state.map);
  const directionalAfter = getDirectionalTacticalFieldDiagnostics(state.map);

  assert.equal(dangerAfter.geometryBuildCount, dangerBefore.geometryBuildCount, 'direct profile must not build danger geometry');
  assert.equal(dangerAfter.fieldBuildCount, dangerBefore.fieldBuildCount, 'direct profile must not build a scored danger field');
  assert.equal(directionalAfter.buildCount, directionalBefore.buildCount, 'direct profile must not build weighted directional tactical data');
  assert.ok(fields.dangerCost.every((value) => value === 0), 'direct profile dangerCost must remain zero');
  assert.equal(fields.dangerFieldKey, '', 'direct profile must not publish an unused danger key');
  assert.equal(fields.availability.danger, false, 'direct profile must report danger as unused');
  assert.equal(fields.availability.directionalTerrain, false, 'direct profile must report directional terrain as unused');

  const goal = { x: 14.5, y: 9.5 };
  const tacticalRoute = findGridPath(state.map, unit.position, goal, {
    navigationProfile: direct,
    tacticalContext: buildUnitTacticalRouteContext(unit),
    costFieldCache: cache,
  });
  const plainRoute = findGridPath(state.map, unit.position, goal, {
    navigationProfile: direct,
    costFieldCache: createRouteCostFieldCache(),
  });
  assert.equal(tacticalRoute.ok, true, 'direct tactical route must remain passable');
  assert.equal(plainRoute.ok, true, 'plain direct route must remain passable');
  if (!tacticalRoute.ok || !plainRoute.ok) throw new Error('direct route fixture unexpectedly failed');
  assert.deepEqual(tacticalRoute.cells, plainRoute.cells, 'unused tactical knowledge must not change the shortest passable direct route');

  const firstCacheKey = fields.cacheKey;
  unit.tacticalKnowledge.threats[0].confidence = 25;
  unit.tacticalKnowledge.threats.reverse();
  unit.tacticalKnowledge.revision += 1;
  const changedKnowledgeFields = getRouteCostFields(state.map, direct, buildUnitTacticalRouteContext(unit), cache);
  const dangerAfterKnowledge = getSoldierDangerFieldDiagnostics(state.map);
  const directionalAfterKnowledge = getDirectionalTacticalFieldDiagnostics(state.map);
  assert.equal(changedKnowledgeFields, fields, 'unused tactical knowledge must reuse the direct route fields');
  assert.equal(changedKnowledgeFields.cacheKey, firstCacheKey, 'unused tactical knowledge must not invalidate the direct route key');
  assert.equal(dangerAfterKnowledge.geometryBuildCount, dangerAfter.geometryBuildCount);
  assert.equal(dangerAfterKnowledge.fieldBuildCount, dangerAfter.fieldBuildCount);
  assert.equal(directionalAfterKnowledge.buildCount, directionalAfter.buildCount);

  return {
    routeCells: tacticalRoute.cells.length,
    dangerBuildDelta: dangerAfterKnowledge.geometryBuildCount - dangerBefore.geometryBuildCount,
    fieldBuildDelta: dangerAfterKnowledge.fieldBuildCount - dangerBefore.fieldBuildCount,
    directionalBuildDelta: directionalAfterKnowledge.buildCount - directionalBefore.buildCount,
    cacheKeyStable: changedKnowledgeFields.cacheKey === firstCacheKey,
  };
}

function assertMultiThreatGeometryReuse() {
  const state = makeState('multi');
  const unit = requireUnit(state, 'blue-multi');
  const routeCache = createRouteCostFieldCache();
  const normal = getBuiltInNavigationProfile('normal');
  const cautious = getBuiltInNavigationProfile('cautious');
  const rifle = threat('unit:cache-rifle', 15.5, 4.5, 72, 58, 'rifle_fire', 34);
  const machineGun = threat('unit:cache-mg', 15.5, 7.5, 88, 92, 'machine_gun_fire', 56);
  unit.tacticalKnowledge.threats = [rifle, machineGun];
  unit.tacticalKnowledge.revision = 1;

  const initial = buildBoth(state, unit, normal, routeCache);
  const afterInitial = getSoldierDangerFieldDiagnostics(state.map);
  assert.ok(afterInitial.geometryBuildCount >= 2, 'initial two-threat field must prepare both threat geometries');
  assert.equal(initial.report.dangerFieldKey, initial.fields.dangerFieldKey);

  rifle.confidence = 81;
  rifle.strength = 83;
  rifle.suppression = 49;
  unit.tacticalKnowledge.revision += 1;
  const rescored = buildBoth(state, unit, normal, routeCache);
  const afterRescore = getSoldierDangerFieldDiagnostics(state.map);
  assert.equal(afterRescore.geometryBuildCount, afterInitial.geometryBuildCount, 'confidence/strength/suppression changes must reuse every threat geometry');
  assert.equal(afterRescore.fullMapScanCount, afterInitial.fullMapScanCount, 'rescoring must not scan the map for geometry');
  assert.ok(afterRescore.fieldBuildCount > afterInitial.fieldBuildCount, 'changed scored content must build one new field');
  assert.notEqual(rescored.report.dangerFieldKey, initial.report.dangerFieldKey);

  unit.tacticalKnowledge.threats = [machineGun, rifle];
  unit.tacticalKnowledge.revision += 1;
  const reordered = buildBoth(state, unit, normal, routeCache);
  const afterReorder = getSoldierDangerFieldDiagnostics(state.map);
  assert.equal(reordered.report.dangerFieldKey, rescored.report.dangerFieldKey, 'array reorder must not change canonical danger content');
  assert.equal(afterReorder.geometryBuildCount, afterRescore.geometryBuildCount, 'array reorder must not rebuild geometry');
  assert.equal(afterReorder.fieldBuildCount, afterRescore.fieldBuildCount, 'array reorder without content change must reuse the scored field');

  machineGun.confidence = 42;
  rifle.confidence = 96;
  unit.tacticalKnowledge.threats.sort((left, right) => right.confidence - left.confidence);
  unit.tacticalKnowledge.revision += 1;
  const confidenceOrderChanged = buildBoth(state, unit, normal, routeCache);
  const afterConfidenceOrder = getSoldierDangerFieldDiagnostics(state.map);
  assert.equal(afterConfidenceOrder.geometryBuildCount, afterReorder.geometryBuildCount, 'confidence-driven memory reorder must reuse geometry');
  assert.ok(afterConfidenceOrder.fieldBuildCount > afterReorder.fieldBuildCount, 'changed confidence must rescore once');
  assert.equal(confidenceOrderChanged.report.dangerFieldKey, confidenceOrderChanged.fields.dangerFieldKey);

  rifle.fireThreatClass = 'machine_gun_fire';
  unit.tacticalKnowledge.revision += 1;
  const classChanged = buildBoth(state, unit, normal, routeCache);
  const afterClass = getSoldierDangerFieldDiagnostics(state.map);
  assert.equal(afterClass.geometryBuildCount, afterConfidenceOrder.geometryBuildCount, 'fire class change must not rebuild geometry');
  assert.ok(afterClass.fieldBuildCount > afterConfidenceOrder.fieldBuildCount, 'fire class change must rescore');
  assert.equal(classChanged.report.dangerFieldKey, classChanged.fields.dangerFieldKey);

  machineGun.x -= 1;
  unit.tacticalKnowledge.revision += 1;
  const moved = buildBoth(state, unit, normal, routeCache);
  const afterMove = getSoldierDangerFieldDiagnostics(state.map);
  assert.equal(afterMove.geometryBuildCount, afterClass.geometryBuildCount + 1, 'moving one threat must rebuild only that threat geometry');
  assert.equal(afterMove.fullMapScanCount, afterClass.fullMapScanCount + 1, 'moving one threat must perform one geometry map scan');
  assert.ok(afterMove.fieldBuildCount > afterClass.fieldBuildCount, 'geometry movement must produce a new scored field');
  assert.equal(moved.report.dangerFieldKey, moved.fields.dangerFieldKey);

  const cautiousFields = getRouteCostFields(state.map, cautious, buildUnitTacticalRouteContext(unit), routeCache);
  const afterProfile = getSoldierDangerFieldDiagnostics(state.map);
  assert.equal(cautiousFields.dangerFieldKey, moved.fields.dangerFieldKey, 'profile weights must layer over the same danger field');
  assert.equal(afterProfile.geometryBuildCount, afterMove.geometryBuildCount, 'profile change must not rebuild danger geometry');
  assert.equal(afterProfile.fieldBuildCount, afterMove.fieldBuildCount, 'profile change must not rescore danger');

  const route = findGridPath(state.map, unit.position, { x: 13.5, y: 9.5 }, {
    navigationProfile: cautious,
    tacticalContext: buildUnitTacticalRouteContext(unit),
    costFieldCache: routeCache,
  });
  assert.ok(route.ok, `headless A* must remain operational without overlay or renderer: ${route.reason}`);

  const stressThreats = Array.from({ length: 6 }, (_, index) => threat(
    `unit:stress-${index}`,
    11.5 + index * 0.7,
    2.5 + index * 1.2,
    55 + index * 5,
    60 + index * 4,
    index % 2 === 0 ? 'rifle_fire' : 'machine_gun_fire',
    20 + index * 3,
  ));
  unit.tacticalKnowledge.threats = stressThreats;
  for (let step = 0; step < 48; step += 1) {
    const moving = stressThreats[step % stressThreats.length];
    moving.x = 10.5 + ((step * 3 + step % 4) % 7) + (step % 3) * 0.13;
    moving.y = 1.5 + ((step * 5 + step % 2) % 9) + (step % 4) * 0.11;
    moving.confidence = 45 + (step * 7) % 55;
    unit.tacticalKnowledge.threats = step % 2 === 0 ? [...stressThreats] : [...stressThreats].reverse();
    unit.tacticalKnowledge.revision += 1;
    buildBoth(state, unit, normal, routeCache);
  }
  const afterStress = getSoldierDangerFieldDiagnostics(state.map);
  assert.ok(afterStress.cachedThreatGeometryCount <= 24, 'per-threat geometry cache must remain bounded');
  assert.ok(afterStress.cachedFieldCount <= 12, 'scored danger cache must remain bounded');
  const maximumTypedArrayBytes = state.map.cells.length * (24 * 9 + 12 * 7);
  assert.ok(
    afterStress.retainedTypedArrayBytes <= maximumTypedArrayBytes,
    `retained typed arrays exceed the explicit cache bound: ${afterStress.retainedTypedArrayBytes} > ${maximumTypedArrayBytes}`,
  );

  const suppressionState = makeState('suppression');
  const suppressionUnit = requireUnit(suppressionState, 'blue-suppression');
  const firstSuppressionThreat = threat('unit:suppression-a', 15.5, 5.5, 64, 90, 'rifle_fire', 42);
  const secondSuppressionThreat = threat('unit:suppression-b', 15.5, 5.5, 48, 90, 'rifle_fire', 36);
  suppressionUnit.tacticalKnowledge.threats = [firstSuppressionThreat];
  suppressionUnit.tacticalKnowledge.revision = 1;
  const singleSuppression = awarenessAt(suppressionState, suppressionUnit, 11, 5).suppression;
  suppressionUnit.tacticalKnowledge.threats = [firstSuppressionThreat, secondSuppressionThreat];
  suppressionUnit.tacticalKnowledge.revision += 1;
  const combinedSuppression = awarenessAt(suppressionState, suppressionUnit, 11, 5).suppression;
  assert.ok(combinedSuppression > singleSuppression, 'suppression must preserve independent stacking semantics');

  return {
    initialGeometryBuilds: afterInitial.geometryBuildCount,
    rescoreGeometryBuildDelta: afterRescore.geometryBuildCount - afterInitial.geometryBuildCount,
    reorderGeometryBuildDelta: afterReorder.geometryBuildCount - afterRescore.geometryBuildCount,
    reorderFieldBuildDelta: afterReorder.fieldBuildCount - afterRescore.fieldBuildCount,
    movedThreatGeometryBuildDelta: afterMove.geometryBuildCount - afterClass.geometryBuildCount,
    cachedThreatGeometryCount: afterStress.cachedThreatGeometryCount,
    cachedFieldCount: afterStress.cachedFieldCount,
    retainedTypedArrayBytes: afterStress.retainedTypedArrayBytes,
    routeVisitedCells: route.ok ? route.visitedCells : 0,
    suppression: { single: singleSuppression, combined: combinedSuppression },
  };
}

function buildBoth(
  state: SimulationState,
  unit: UnitModel,
  profile: ReturnType<typeof getBuiltInNavigationProfile>,
  routeCache: ReturnType<typeof createRouteCostFieldCache>,
) {
  const report = buildSoldierAwarenessReport(state, unit);
  const fields = getRouteCostFields(state.map, profile, buildUnitTacticalRouteContext(unit), routeCache);
  assert.equal(report.dangerFieldKey, fields.dangerFieldKey, 'awareness and route cost must publish the same danger field key');
  return { report, fields };
}

function assertLegacyNormalization() {
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
}

function assertRendererIndependence() {
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
}

function makeState(suffix: string): SimulationState {
  return createInitialState(mapData, [{
    id: `blue-${suffix}`,
    label: `Blue ${suffix}`,
    labelRu: `Синий ${suffix}`,
    type: 'infantry_squad',
    side: 'blue',
    x: 4,
    y: 5,
  }]);
}

function awarenessAt(state: SimulationState, unit: UnitModel, x: number, y: number) {
  const report = buildSoldierAwarenessReport(state, unit);
  const cell = report.cells[y * state.map.width + x];
  assert.ok(cell, `awareness cell ${x}:${y} must exist`);
  return cell;
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

function requireUnit(state: SimulationState, id: string): UnitModel {
  const found = state.units.find((candidate) => candidate.id === id);
  assert.ok(found, `unit ${id} must exist`);
  return found;
}
