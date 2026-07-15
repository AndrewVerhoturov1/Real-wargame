import assert from 'node:assert/strict';
import { getThreatRelativeCoverFieldDiagnostics } from '../src/core/cover/ThreatRelativeCoverField';
import { buildSoldierAwarenessReport } from '../src/core/knowledge/SoldierAwarenessGrid';
import type { TacticalMapData } from '../src/core/map/MapModel';
import { createInitialState } from '../src/core/simulation/SimulationState';
import { getDirectionalTacticalFieldDiagnostics } from '../src/core/terrain/DirectionalTacticalField';
import { getDirectionalTerrainSectorBasisDiagnostics } from '../src/core/terrain/DirectionalTerrainSectorBasis';
import type { KnownThreatMemory, UnitModel } from '../src/core/units/UnitModel';

const WIDTH = 320;
const HEIGHT = 200;
const mapData: TacticalMapData = {
  width: WIDTH,
  height: HEIGHT,
  cellSize: 4.8,
  metersPerCell: 2,
  runtimeMetersPerCell: 2,
  defaultTerrain: 'field',
  defaultHeight: 0,
  cellRects: [
    { x1: 35, x2: 110, y1: 30, y2: 80, forest: 1 },
    { x1: 205, x2: 290, y1: 115, y2: 185, forest: 2 },
    { x1: 130, x2: 190, y1: 70, y2: 75, height: 3 },
  ],
  objects: [{
    id: 'movement-wall',
    kind: 'structure',
    x: 160,
    y: 80,
    widthCells: 1,
    heightCells: 45,
    coverProtection: 92,
    coverReliability: 96,
    concealment: 80,
    penetrable: false,
    coverPosture: 'standing',
  }],
};

const state = createInitialState(mapData, [
  {
    id: 'blue-moving',
    type: 'infantry_squad',
    side: 'blue',
    x: 170,
    y: 100,
    speedCellsPerSecond: 4,
  },
  {
    id: 'red-moving',
    type: 'infantry_squad',
    side: 'red',
    x: 210,
    y: 100,
    speedCellsPerSecond: 4,
  },
]);
const blue = unit('blue-moving');
const red = unit('red-moving');
blue.tacticalKnowledge.threats = [directionalThreat(red.position.x, red.position.y)];
blue.tacticalKnowledge.revision += 1;

const warm = buildSoldierAwarenessReport(state, blue);
const warmCacheKey = warm.cacheKey;
const warmCover = getThreatRelativeCoverFieldDiagnostics(state.map);
const warmDirectional = getDirectionalTacticalFieldDiagnostics(state.map);
const warmBasis = getDirectionalTerrainSectorBasisDiagnostics(state.map);
assert.equal(warmCover.geometryBuildCount, 1);
assert.equal(warmBasis.buildCount, 1);

for (const position of [
  { x: 168.5, y: 100.5 },
  { x: 166.5, y: 99.5 },
  { x: 164.5, y: 98.5 },
  { x: 162.5, y: 97.5 },
]) {
  blue.position = position;
  const moved = buildSoldierAwarenessReport(state, blue);
  assert.equal(moved.cacheKey, warmCacheKey, 'own movement must reuse the position-independent world field');
  assert.equal(Math.floor(moved.currentPosition.x), Math.floor(position.x));
  assert.equal(Math.floor(moved.currentPosition.y), Math.floor(position.y));
}

const afterOwnMovementCover = getThreatRelativeCoverFieldDiagnostics(state.map);
const afterOwnMovementDirectional = getDirectionalTacticalFieldDiagnostics(state.map);
const afterOwnMovementBasis = getDirectionalTerrainSectorBasisDiagnostics(state.map);
assert.equal(
  afterOwnMovementCover.geometryBuildCount,
  warmCover.geometryBuildCount,
  'selected-unit movement must not rebuild threat-relative geometry',
);
assert.equal(
  afterOwnMovementDirectional.buildCount,
  warmDirectional.buildCount,
  'selected-unit movement must not rebuild the world directional field',
);
assert.equal(
  afterOwnMovementBasis.buildCount,
  warmBasis.buildCount,
  'selected-unit movement must not rebuild directional terrain sector basis',
);

red.position = { x: 30.5, y: 30.5 };
buildSoldierAwarenessReport(state, blue);
assert.equal(
  getThreatRelativeCoverFieldDiagnostics(state.map).geometryBuildCount,
  warmCover.geometryBuildCount,
  'hidden objective movement must not affect subjective danger geometry',
);
assert.equal(
  getDirectionalTacticalFieldDiagnostics(state.map).buildCount,
  warmDirectional.buildCount,
  'hidden objective movement must not affect directional world content',
);

const subjectiveThreat = blue.tacticalKnowledge.threats[0];
subjectiveThreat.x -= 4;
subjectiveThreat.y += 1;
blue.tacticalKnowledge.revision += 1;
buildSoldierAwarenessReport(state, blue);
const afterVisibleMovementCover = getThreatRelativeCoverFieldDiagnostics(state.map);
const afterVisibleMovementDirectional = getDirectionalTacticalFieldDiagnostics(state.map);
const afterVisibleMovementBasis = getDirectionalTerrainSectorBasisDiagnostics(state.map);
assert.equal(
  afterVisibleMovementCover.geometryBuildCount,
  warmCover.geometryBuildCount + 1,
  'subjective hostile movement must invalidate threat-relative geometry exactly once',
);
assert.equal(
  afterVisibleMovementDirectional.buildCount,
  warmDirectional.buildCount + 1,
  'subjective hostile movement must invalidate the derived world directional field exactly once',
);
assert.equal(
  afterVisibleMovementBasis.buildCount,
  warmBasis.buildCount,
  'hostile movement must continue reusing the static directional terrain basis',
);

console.log(JSON.stringify({
  map: `${WIDTH}x${HEIGHT}`,
  selectedUnitMovement: {
    threatRelativeGeometryBuilds: afterOwnMovementCover.geometryBuildCount - warmCover.geometryBuildCount,
    directionalFieldBuilds: afterOwnMovementDirectional.buildCount - warmDirectional.buildCount,
    directionalBasisBuilds: afterOwnMovementBasis.buildCount - warmBasis.buildCount,
  },
  subjectiveHostileMovement: {
    threatRelativeGeometryBuilds: afterVisibleMovementCover.geometryBuildCount - afterOwnMovementCover.geometryBuildCount,
    directionalFieldBuilds: afterVisibleMovementDirectional.buildCount - afterOwnMovementDirectional.buildCount,
    directionalBasisBuilds: afterVisibleMovementBasis.buildCount - afterOwnMovementBasis.buildCount,
  },
}, null, 2));

function unit(id: string): UnitModel {
  const found = state.units.find((item) => item.id === id);
  assert.ok(found, `unit ${id} must exist`);
  return found;
}

function directionalThreat(x: number, y: number): KnownThreatMemory {
  return {
    id: 'unit:red-moving',
    labelRu: 'видимая угроза',
    mode: 'directional_fire',
    x,
    y,
    radiusCells: 0,
    widthCells: 0,
    heightCells: 0,
    rotationDegrees: 0,
    strength: 90,
    suppression: 25,
    stressPerSecond: 10,
    directionDegrees: 180,
    arcDegrees: 160,
    rangeCells: 180,
    minRangeCells: 0,
    falloffPercent: 30,
    confidence: 95,
    uncertaintyCells: 0.5,
    source: 'seen',
    visibleNow: true,
    lastSeenSeconds: 0,
    lastUpdatedSeconds: 0,
  };
}
