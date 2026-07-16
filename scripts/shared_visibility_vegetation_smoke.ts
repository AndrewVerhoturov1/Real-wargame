import assert from 'node:assert/strict';
import {
  normalizeMap,
  type TacticalMap,
  type TacticalMapData,
} from '../src/core/map/MapModel';
import {
  resolveCellVegetationDefinition,
  resolveVegetationDefinition,
} from '../src/core/map/VegetationDefinition';
import {
  getSoldierDangerField,
  getSoldierDangerFieldDiagnostics,
  type SoldierDangerFieldContext,
} from '../src/core/knowledge/SoldierDangerField';
import { getThreatRelativeCoverField } from '../src/core/cover/ThreatRelativeCoverField';
import {
  createRouteCostFieldCache,
  getRouteCostFields,
} from '../src/core/navigation/RouteCostField';
import { getBuiltInNavigationProfile } from '../src/core/navigation/NavigationProfiles';
import { buildNavigationGrid } from '../src/core/pathfinding/GridNavigation';
import { createInitialState } from '../src/core/simulation/SimulationState';
import type { UnitData } from '../src/core/units/UnitModel';
import {
  getSelectedUnitVisibilityField,
  getUnitVisibilityField,
} from '../src/core/visibility/SelectedUnitVisibilityField';
import {
  getVisibilityGeometryField,
  getVisibilityGeometryFieldDiagnostics,
} from '../src/core/visibility/VisibilityGeometryField';

const threat = {
  id: 'unit:known-rifleman',
  mode: 'directional_fire' as const,
  x: 2.5,
  y: 3.5,
  radiusCells: 0,
  widthCells: 0,
  heightCells: 0,
  rotationDegrees: 0,
  strength: 100,
  suppression: 60,
  confidence: 100,
  uncertaintyCells: 0,
  directionDegrees: 0,
  arcDegrees: 40,
  rangeCells: 20,
  minRangeCells: 0,
  falloffPercent: 0,
  fireThreatClass: 'rifle_fire' as const,
};

const hillMap = normalizeMap({
  width: 12,
  height: 7,
  cellSize: 16,
  metersPerCell: 5,
  defaultTerrain: 'field',
  defaultHeight: 0,
  cellRects: [{ x1: 5, x2: 5, y1: 0, y2: 6, height: 4 }],
});
const hillGeometry = getVisibilityGeometryField(hillMap, {
  origin: { x: threat.x, y: threat.y },
  originHeightAboveGroundMeters: 1.4,
  targetHeightAboveGroundMeters: 1.4,
  rangeCells: 20,
});
assert.equal(readByte(hillGeometry.hardBlocked, hillMap, 8, 3), 1, 'ridge must hard-block cells behind it');
assert.equal(readByte(hillGeometry.hardBlocked, hillMap, 4, 3), 0, 'cell before ridge must remain open');

const hillDanger = getSoldierDangerField(hillMap, dangerContext([threat]));
assert.ok(readByte(hillDanger.danger, hillMap, 4, 3) > 0, 'open cell before ridge must remain dangerous');
assert.equal(readByte(hillDanger.danger, hillMap, 8, 3), 0, 'direct-fire danger must be zero in the hill shadow');

const areaDanger = getSoldierDangerField(hillMap, dangerContext([{
  ...threat,
  id: 'unknown-pressure',
  mode: 'area' as const,
  radiusCells: 20,
  fireThreatClass: null,
}]));
assert.ok(readByte(areaDanger.danger, hillMap, 8, 3) > 0, 'area/unknown threats must not invent a precise hill shadow');

const open = buildForestCase(0);
const sparse = buildForestCase(1);
const dense = buildForestCase(2);
assert.ok(open.visual > sparse.visual && sparse.visual > dense.visual, 'visual transmission must order none > sparse > dense');
assert.ok(open.fire > sparse.fire && sparse.fire > dense.fire, 'fire transmission must order none > sparse > dense');
assert.ok(open.danger > sparse.danger && sparse.danger > dense.danger, 'danger must order open > sparse forest > dense forest');

const legacyMap = normalizeMap({
  width: 3,
  height: 2,
  cellSize: 16,
  metersPerCell: 5,
  defaultTerrain: 'forest',
  defaultHeight: 0,
});
const legacyVegetation = resolveCellVegetationDefinition(legacyMap.cells[0]);
const sparseDefinition = resolveVegetationDefinition('sparse_forest');
assert.equal(legacyVegetation.id, 'sparse_forest', 'legacy terrain=forest with forest=0 must normalize to sparse forest');
assert.equal(buildNavigationGrid(legacyMap).cells[0].movementCost, sparseDefinition.movement.baseResistance);

const normalProfile = getBuiltInNavigationProfile('normal');
const legacyRoute = getRouteCostFields(legacyMap, normalProfile, undefined, createRouteCostFieldCache());
assert.equal(legacyRoute.terrainKeys[0], 'sparseForest', 'legacy forest must use the sparse-forest route terrain key');
assert.ok(
  Math.abs(legacyRoute.coverAdjustment[0] + normalProfile.coverWeight * sparseDefinition.movement.tacticalConcealment) < 1e-6,
  'route cover preference must use shared vegetation tactical concealment',
);

const legacyCover = getThreatRelativeCoverField(legacyMap, {
  threatId: 'legacy-forest-threat',
  threatPosition: { x: 0.5, y: 0.5 },
  posture: 'standing',
});
assert.ok(
  readByte(legacyCover.forestProtection, legacyMap, 2, 0) > 0,
  'threat-relative cover must use shared vegetation density for legacy forest cells',
);

const units: UnitData[] = [
  unitData('observer-a', 1.5, 1.5),
  unitData('observer-b', 7.5, 1.5),
];
const state = createInitialState({
  width: 10,
  height: 4,
  cellSize: 16,
  metersPerCell: 5,
  defaultTerrain: 'field',
  defaultHeight: 0,
}, units);
assert.equal(getSelectedUnitVisibilityField(state), null, 'hidden current-view overlay must remain zero-work UI facade');
const unselectedField = getUnitVisibilityField(state, state.units[1]);
assert.equal(unselectedField.observerId, 'observer-b', 'machine visibility must be request-relative, not selected-unit-relative');
assert.ok(unselectedField.quality.some((value) => value > 0));

const cacheMap = normalizeMap({
  width: 10,
  height: 5,
  cellSize: 16,
  metersPerCell: 5,
  defaultTerrain: 'field',
  defaultHeight: 0,
});
const options = {
  origin: { x: 2.5, y: 2.5 },
  originHeightAboveGroundMeters: 1.4,
  targetHeightAboveGroundMeters: 1.4,
  rangeCells: 12,
};
const firstGeometry = getVisibilityGeometryField(cacheMap, options);
const secondGeometry = getVisibilityGeometryField(cacheMap, options);
assert.equal(secondGeometry, firstGeometry, 'identical geometry requests must reuse one field');
let geometryDiagnostics = getVisibilityGeometryFieldDiagnostics(cacheMap);
assert.equal(geometryDiagnostics.geometryBuildCount, 1);
assert.equal(geometryDiagnostics.geometryCacheHitCount, 1);
assert.ok(geometryDiagnostics.retainedTypedArrayBytes > 0);

getSoldierDangerField(cacheMap, dangerContext([threat]));
const buildsAfterFirstDanger = getVisibilityGeometryFieldDiagnostics(cacheMap).geometryBuildCount;
getSoldierDangerField(cacheMap, dangerContext([{ ...threat, confidence: 45 }]));
geometryDiagnostics = getVisibilityGeometryFieldDiagnostics(cacheMap);
assert.equal(
  geometryDiagnostics.geometryBuildCount,
  buildsAfterFirstDanger,
  'confidence changes must rescore danger without rebuilding geometry',
);
assert.ok(getSoldierDangerFieldDiagnostics(cacheMap).geometryCacheHitCount >= 1);

getVisibilityGeometryField(cacheMap, { ...options, origin: { x: 3.5, y: 2.5 } });
assert.equal(
  getVisibilityGeometryFieldDiagnostics(cacheMap).geometryBuildCount,
  buildsAfterFirstDanger + 1,
  'moving an origin must build a new geometry field',
);

console.log(JSON.stringify({
  hillDangerOpen: readByte(hillDanger.danger, hillMap, 4, 3),
  hillDangerShadow: readByte(hillDanger.danger, hillMap, 8, 3),
  forestDanger: { open: open.danger, sparse: sparse.danger, dense: dense.danger },
  legacyRouteCoverAdjustment: legacyRoute.coverAdjustment[0],
  legacyForestProtection: readByte(legacyCover.forestProtection, legacyMap, 2, 0),
  cachedGeometryCount: geometryDiagnostics.cachedFieldCount,
  retainedTypedArrayBytes: geometryDiagnostics.retainedTypedArrayBytes,
}));
console.log('Shared visibility and vegetation smoke passed: reusable geometry, hill shadow, forest attenuation, overlay independence, route/cover parity and cache contract.');

function buildForestCase(forest: 0 | 1 | 2): { visual: number; fire: number; danger: number } {
  const map = normalizeMap({
    width: 12,
    height: 7,
    cellSize: 16,
    metersPerCell: 5,
    defaultTerrain: 'field',
    defaultHeight: 0,
    cellRects: forest > 0 ? [{ x1: 4, x2: 6, y1: 0, y2: 6, forest }] : [],
  });
  const field = getVisibilityGeometryField(map, {
    origin: { x: threat.x, y: threat.y },
    originHeightAboveGroundMeters: 1.4,
    targetHeightAboveGroundMeters: 1.4,
    rangeCells: 20,
  });
  const danger = getSoldierDangerField(map, dangerContext([threat]));
  return {
    visual: readByte(field.visualTransmission, map, 8, 3),
    fire: readByte(field.fireTransmission, map, 8, 3),
    danger: readByte(danger.danger, map, 8, 3),
  };
}

function dangerContext(threats: SoldierDangerFieldContext['threats']): SoldierDangerFieldContext {
  return {
    unitId: 'observer',
    posture: 'standing',
    knowledgeRevision: 1,
    threats,
  };
}

function readByte(field: Uint8Array, map: TacticalMap, x: number, y: number): number {
  return field[y * map.width + x] ?? 0;
}

function unitData(id: string, x: number, y: number): UnitData {
  return {
    id,
    label: id,
    labelRu: id,
    type: 'scout_team',
    side: 'player',
    aiControl: 'manual',
    x,
    y,
    facingDegrees: 0,
    viewAngleDegrees: 120,
    viewRangeCells: 20,
    behaviorProfile: 'regular',
  };
}
