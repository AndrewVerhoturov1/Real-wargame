import assert from 'node:assert/strict';
import { evaluateCoverBetween } from '../src/core/cover/CoverEvaluation';
import {
  getThreatRelativeCoverField,
  getThreatRelativeCoverFieldDiagnostics,
} from '../src/core/cover/ThreatRelativeCoverField';
import { buildSoldierAwarenessReport } from '../src/core/knowledge/SoldierAwarenessGrid';
import { getSoldierDangerFieldDiagnostics } from '../src/core/knowledge/SoldierDangerField';
import { getCell, type TacticalMapData } from '../src/core/map/MapModel';
import { markMapCellsDirty } from '../src/core/map/MapRuntimeState';
import { createInitialState } from '../src/core/simulation/SimulationState';
import { getDirectionalTacticalFieldDiagnostics } from '../src/core/terrain/DirectionalTacticalField';
import type { KnownThreatMemory, UnitModel } from '../src/core/units/UnitModel';

const WIDTH = 320;
const HEIGHT = 200;
const CELL_COUNT = WIDTH * HEIGHT;
const WALL_X = 160.5;
const THREAT_ID = 'unit:red-performance';

const mapData: TacticalMapData = {
  width: WIDTH,
  height: HEIGHT,
  cellSize: 4.8,
  metersPerCell: 2,
  runtimeMetersPerCell: 2,
  defaultTerrain: 'field',
  defaultHeight: 0,
  cellRects: [
    { x1: 40, x2: 110, y1: 25, y2: 75, forest: 1 },
    { x1: 205, x2: 285, y1: 120, y2: 180, forest: 2 },
  ],
  objects: [{
    id: 'performance-wall',
    kind: 'structure',
    x: 160,
    y: 85,
    widthCells: 1,
    heightCells: 30,
    coverProtection: 92,
    coverReliability: 96,
    concealment: 80,
    penetrable: false,
    coverPosture: 'standing',
  }],
};

const state = createInitialState(mapData, [
  {
    id: 'blue-performance',
    label: 'Blue performance',
    labelRu: 'Синий performance',
    type: 'infantry_squad',
    side: 'blue',
    x: 165,
    y: 100,
    facingDegrees: 180,
    viewRangeCells: 120,
  },
  {
    id: 'red-performance',
    label: 'Red performance',
    labelRu: 'Красный performance',
    type: 'infantry_squad',
    side: 'red',
    x: 190,
    y: 100,
    facingDegrees: 180,
    viewRangeCells: 120,
  },
]);
const blue = unit('blue-performance');
const red = unit('red-performance');
blue.position = { x: 165.5, y: 100.5 };
red.position = { x: 190.5, y: 100.5 };

buildSoldierAwarenessReport(state, blue);

const threat = directionalThreat(red.position.x, red.position.y);
blue.tacticalKnowledge.threats.push(threat);
blue.tacticalKnowledge.revision += 1;
const first = buildSoldierAwarenessReport(state, blue);

let diagnostics = getThreatRelativeCoverFieldDiagnostics(state.map);
let directionalDiagnostics = getDirectionalTacticalFieldDiagnostics(state.map);
assert.equal(diagnostics.geometryBuildCount, 1, 'first danger report must build one threat-relative geometry field');
assert.equal(diagnostics.fullMapScanCount, 1);
assert.equal(diagnostics.staticBuildCount, 1, 'map-derived cover inputs must build once for the current revisions');
assert.equal(directionalDiagnostics.buildCount, 2, 'baseline and first threat report must build directional fields');
assert.equal(
  diagnostics.forestMapReads,
  0,
  'dynamic cover geometry must not reread vegetation from TacticalMap cells',
);
assert.equal(
  diagnostics.forestDensitySamples,
  CELL_COUNT - 1,
  'cold forest geometry must sample the prepared density layer once per non-origin map cell',
);
assert.ok(
  diagnostics.objectChecks > 0 && diagnostics.objectChecks < CELL_COUNT * state.map.objects.length,
  'object shadow bounds must reduce exact candidate checks below cell-count times object-count',
);
const coldBuildMs = diagnostics.lastBuildMs;
const protectedProbePosition = { x: WALL_X - 1.5, y: 100.5 };
const directionalBuildsAfterFirstThreat = directionalDiagnostics.buildCount;
const soldierDangerGeometryBuildsAfterFirstThreat = getSoldierDangerFieldDiagnostics(state.map).geometryBuildCount;

const repeated = buildSoldierAwarenessReport(state, blue);
assert.equal(repeated.cacheKey, first.cacheKey);
assert.equal(getThreatRelativeCoverFieldDiagnostics(state.map).geometryBuildCount, 1);
assert.equal(getDirectionalTacticalFieldDiagnostics(state.map).buildCount, directionalBuildsAfterFirstThreat);

threat.confidence = 70;
threat.strength = 75;
threat.suppression = 35;
blue.tacticalKnowledge.revision += 1;
const dynamicChanged = buildSoldierAwarenessReport(state, blue);
assert.notEqual(dynamicChanged.cacheKey, first.cacheKey, 'dynamic scoring values must invalidate awareness scoring');
diagnostics = getThreatRelativeCoverFieldDiagnostics(state.map);
directionalDiagnostics = getDirectionalTacticalFieldDiagnostics(state.map);
assert.equal(diagnostics.geometryBuildCount, 1, 'dynamic scoring must reuse cover geometry');
assert.equal(diagnostics.forestMapReads, 0, 'dynamic scoring must not read map vegetation');
assert.equal(diagnostics.forestDensitySamples, CELL_COUNT - 1, 'dynamic scoring must not repeat forest propagation');
assert.equal(
  directionalDiagnostics.buildCount,
  directionalBuildsAfterFirstThreat,
  'dynamic strength/confidence/suppression must not rebuild directional terrain geometry',
);

blue.tacticalKnowledge.revision += 1;
const evidenceRevisionOnly = buildSoldierAwarenessReport(state, blue);
assert.equal(
  evidenceRevisionOnly.cacheKey,
  dynamicChanged.cacheKey,
  'knowledge revision without content change must not invalidate awareness or geometry content keys',
);
assert.equal(getThreatRelativeCoverFieldDiagnostics(state.map).geometryBuildCount, 1);
assert.equal(getDirectionalTacticalFieldDiagnostics(state.map).buildCount, directionalBuildsAfterFirstThreat);

for (const confidence of [66, 61, 57, 52]) {
  threat.confidence = confidence;
  threat.strength -= 2;
  threat.suppression = Math.max(0, threat.suppression - 2);
  blue.tacticalKnowledge.revision += 1;
  buildSoldierAwarenessReport(state, blue);
}
assert.equal(
  getThreatRelativeCoverFieldDiagnostics(state.map).geometryBuildCount,
  1,
  'sequential decay rescoring must not rebuild threat-relative geometry',
);
assert.equal(
  getDirectionalTacticalFieldDiagnostics(state.map).buildCount,
  directionalBuildsAfterFirstThreat,
  'sequential decay must not rebuild directional terrain geometry',
);

red.position = { x: 30.5, y: 30.5 };
blue.tacticalKnowledge.revision += 1;
buildSoldierAwarenessReport(state, blue);
assert.equal(
  getThreatRelativeCoverFieldDiagnostics(state.map).geometryBuildCount,
  1,
  'hidden objective movement must not invalidate geometry while subjective estimated position is unchanged',
);
assert.equal(getDirectionalTacticalFieldDiagnostics(state.map).buildCount, directionalBuildsAfterFirstThreat);

const protectedBeforeReliefChange = evaluateCoverBetween(
  state.map,
  { x: threat.x, y: threat.y },
  protectedProbePosition,
  blue.behaviorRuntime.posture,
  { includeRelief: false },
).protection;
const heightCell = getCell(state.map, 158, 100);
assert.ok(heightCell);
heightCell.height = 3;
markMapCellsDirty(state.map, 'height', { minX: 158, minY: 100, maxX: 158, maxY: 100 });
const protectedAfterReliefChange = evaluateCoverBetween(
  state.map,
  { x: threat.x, y: threat.y },
  protectedProbePosition,
  blue.behaviorRuntime.posture,
  { includeRelief: false },
).protection;
assert.equal(protectedAfterReliefChange, protectedBeforeReliefChange);
assert.equal(
  getThreatRelativeCoverFieldDiagnostics(state.map).geometryBuildCount,
  1,
  'height/relief change must not enter the object/forest geometry cache key',
);

buildSoldierAwarenessReport(state, blue);
const soldierDangerGeometryBuildsAfterHeightChange = getSoldierDangerFieldDiagnostics(state.map).geometryBuildCount;
threat.x += 0.1;
blue.tacticalKnowledge.revision += 1;
buildSoldierAwarenessReport(state, blue);
assert.equal(
  getSoldierDangerFieldDiagnostics(state.map).geometryBuildCount,
  soldierDangerGeometryBuildsAfterHeightChange,
  'sub-quarter-cell subjective movement must reuse full-map danger geometry after map revisions are warm',
);
const directionalBuildsAfterSubCellMovement = getDirectionalTacticalFieldDiagnostics(state.map).buildCount;
assert.equal(
  getThreatRelativeCoverFieldDiagnostics(state.map).geometryBuildCount,
  1,
  'sub-quarter-cell movement must not rebuild threat-relative cover geometry',
);

threat.x += 1.9;
blue.tacticalKnowledge.revision += 1;
buildSoldierAwarenessReport(state, blue);
assert.equal(
  getThreatRelativeCoverFieldDiagnostics(state.map).geometryBuildCount,
  2,
  'estimated subjective threat movement must rebuild its geometry field',
);
assert.equal(
  getDirectionalTacticalFieldDiagnostics(state.map).buildCount,
  directionalBuildsAfterSubCellMovement + 1,
  'material movement after the sub-cell probe must rebuild directional terrain once',
);

state.map.objects[0].x += 1;
buildSoldierAwarenessReport(state, blue);
assert.equal(
  getThreatRelativeCoverFieldDiagnostics(state.map).geometryBuildCount,
  3,
  'object geometry revision must invalidate the field',
);

const forestCell = getCell(state.map, 180, 100);
assert.ok(forestCell);
forestCell.forest = forestCell.forest === 2 ? 1 : 2;
markMapCellsDirty(state.map, 'forest', { minX: 180, minY: 100, maxX: 180, maxY: 100 });
buildSoldierAwarenessReport(state, blue);
assert.equal(
  getThreatRelativeCoverFieldDiagnostics(state.map).geometryBuildCount,
  4,
  'forest revision must invalidate the field',
);

for (let index = 0; index < 24; index += 1) {
  getThreatRelativeCoverField(state.map, {
    threatId: `bounded-${index}`,
    threatPosition: { x: 20.5 + index * 3, y: 30.5 + (index % 5) },
    posture: blue.behaviorRuntime.posture,
  });
}
diagnostics = getThreatRelativeCoverFieldDiagnostics(state.map);
directionalDiagnostics = getDirectionalTacticalFieldDiagnostics(state.map);
assert.ok(diagnostics.cachedFieldCount <= 16, `cache must remain bounded, got ${diagnostics.cachedFieldCount}`);
assert.ok(diagnostics.evictionCount > 0, 'bounded cache exercise must evict old geometry fields');
assert.ok(
  diagnostics.forestDensitySamples <= diagnostics.geometryBuildCount * CELL_COUNT,
  'prepared forest-density work must remain linear in map cells for every cold geometry build',
);

console.log(JSON.stringify({
  smoke: 'danger-layer-performance',
  mapCells: CELL_COUNT,
  coldBuildMs,
  geometryBuildCount: diagnostics.geometryBuildCount,
  cacheHitCount: diagnostics.cacheHitCount,
  forestMapReads: diagnostics.forestMapReads,
  forestDensitySamples: diagnostics.forestDensitySamples,
  objectChecks: diagnostics.objectChecks,
  cachedFieldCount: diagnostics.cachedFieldCount,
  evictionCount: diagnostics.evictionCount,
  directionalBuildCount: directionalDiagnostics.buildCount,
  directionalCacheHitCount: directionalDiagnostics.cacheHitCount,
}, null, 2));
console.log('Danger layer performance smoke passed: dynamic threat changes reuse bounded object/forest and directional terrain geometry while preserving cache semantics.');

function unit(id: string): UnitModel {
  const found = state.units.find((candidate) => candidate.id === id);
  assert.ok(found, `missing unit ${id}`);
  return found;
}

function directionalThreat(x: number, y: number): KnownThreatMemory {
  return {
    id: THREAT_ID,
    labelRu: 'Известный направленный огонь',
    mode: 'directional_fire',
    x,
    y,
    radiusCells: 0,
    widthCells: 0,
    heightCells: 0,
    rotationDegrees: 0,
    strength: 92,
    suppression: 64,
    stressPerSecond: 12,
    directionDegrees: 180,
    arcDegrees: 110,
    rangeCells: 100,
    minRangeCells: 0,
    falloffPercent: 25,
    confidence: 92,
    uncertaintyCells: 1,
    source: 'seen',
    visibleNow: true,
    lastSeenSeconds: 0,
    lastUpdatedSeconds: 0,
  };
}
