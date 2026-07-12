import assert from 'node:assert/strict';
import { buildSoldierAwarenessReport } from '../src/core/knowledge/SoldierAwarenessGrid';
import { getAwarenessStaticFieldDiagnostics } from '../src/core/knowledge/AwarenessStaticField';
import { getCell, type TacticalMapData } from '../src/core/map/MapModel';
import { markMapCellsDirty } from '../src/core/map/MapRuntimeState';
import { createInitialState } from '../src/core/simulation/SimulationState';
import type { KnownThreatMemory, UnitData } from '../src/core/units/UnitModel';
import { buildAwarenessRenderKey } from '../src/rendering/PixiAwarenessHeatmapRenderer';

const mapData: TacticalMapData = {
  width: 20,
  height: 14,
  cellSize: 24,
  metersPerCell: 10,
  defaultTerrain: 'field',
  defaultHeight: 0,
  objects: [{
    id: 'cover',
    kind: 'cover',
    x: 8,
    y: 6,
    widthCells: 2,
    heightCells: 0.5,
    coverProtection: 75,
    coverReliability: 80,
    concealment: 25,
  }],
};

const unitData: UnitData[] = [{
  id: 'aware-unit',
  label: 'Aware unit',
  labelRu: 'Проверочный боец',
  type: 'scout_team',
  side: 'player',
  x: 4,
  y: 6,
  behaviorProfile: 'regular',
}];

const state = createInitialState(mapData, unitData);
const unit = state.units[0];
const first = buildSoldierAwarenessReport(state, unit);
const firstRenderKey = buildAwarenessRenderKey(state, unit, 'danger');
assert.equal(first.cells.length, state.map.width * state.map.height);
let diagnostics = getAwarenessStaticFieldDiagnostics(state.map, 'standing');
assert.equal(diagnostics.buildCount, 1);
assert.ok(diagnostics.lastCandidateChecks < state.map.cells.length * Math.max(1, state.map.objects.length));

unit.position.x += 0.2;
const moved = buildSoldierAwarenessReport(state, unit);
const movedRenderKey = buildAwarenessRenderKey(state, unit, 'danger');
assert.equal(moved.cacheKey, first.cacheKey, 'movement must reuse the full awareness field');
assert.equal(movedRenderKey, firstRenderKey, 'movement alone must not invalidate awareness raster pixels');
diagnostics = getAwarenessStaticFieldDiagnostics(state.map, 'standing');
assert.equal(diagnostics.buildCount, 1);
assert.ok(diagnostics.cacheHitCount >= 1);

const threat: KnownThreatMemory = {
  id: 'known-fire',
  labelRu: 'Известный огонь',
  mode: 'circle',
  x: 14,
  y: 7,
  radiusCells: 5,
  widthCells: 0,
  heightCells: 0,
  rotationDegrees: 0,
  strength: 70,
  suppression: 45,
  stressPerSecond: 10,
  directionDegrees: 0,
  arcDegrees: 360,
  rangeCells: 5,
  minRangeCells: 0,
  falloffPercent: 20,
  confidence: 80,
  uncertaintyCells: 1,
  source: 'seen',
  visibleNow: true,
  lastSeenSeconds: 0,
  lastUpdatedSeconds: 0,
};
unit.tacticalKnowledge.threats.push(threat);
unit.tacticalKnowledge.revision += 1;
const threatened = buildSoldierAwarenessReport(state, unit);
const threatenedRenderKey = buildAwarenessRenderKey(state, unit, 'danger');
assert.notEqual(threatened.cacheKey, first.cacheKey, 'knowledge changes must rebuild only the dynamic awareness field');
assert.notEqual(threatenedRenderKey, firstRenderKey, 'knowledge changes must invalidate awareness raster pixels');
assert.equal(getAwarenessStaticFieldDiagnostics(state.map, 'standing').buildCount, 1);

state.map.objects[0].x += 2;
buildSoldierAwarenessReport(state, unit);
assert.equal(getAwarenessStaticFieldDiagnostics(state.map, 'standing').buildCount, 2);

const heightCell = getCell(state.map, 10, 7);
assert.ok(heightCell);
heightCell.height = 2;
markMapCellsDirty(state.map, 'height', { minX: 10, minY: 7, maxX: 10, maxY: 7 });
buildSoldierAwarenessReport(state, unit);
assert.equal(getAwarenessStaticFieldDiagnostics(state.map, 'standing').buildCount, 3);

unit.behaviorRuntime.posture = 'crouched';
buildSoldierAwarenessReport(state, unit);
assert.equal(getAwarenessStaticFieldDiagnostics(state.map, 'crouched').buildCount, 1);

console.log('Awareness field cache smoke passed: movement preserves field and raster keys; knowledge/map/posture invalidation remains precise.');
