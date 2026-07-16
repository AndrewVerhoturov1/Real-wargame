import assert from 'node:assert/strict';
import { buildSoldierAwarenessReport } from '../src/core/knowledge/SoldierAwarenessGrid';
import { getAwarenessStaticFieldDiagnostics } from '../src/core/knowledge/AwarenessStaticField';
import { getSoldierDangerFieldDiagnostics } from '../src/core/knowledge/SoldierDangerField';
import { getCell, type TacticalMapData } from '../src/core/map/MapModel';
import { markMapCellsDirty } from '../src/core/map/MapRuntimeState';
import { createInitialState } from '../src/core/simulation/SimulationState';
import type { KnownThreatMemory, UnitData } from '../src/core/units/UnitModel';

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
assert.equal(first.cells.length, state.map.width * state.map.height);
let diagnostics = getAwarenessStaticFieldDiagnostics(state.map, 'standing');
assert.equal(diagnostics.buildCount, 1);
assert.ok(diagnostics.lastCandidateChecks < state.map.cells.length * Math.max(1, state.map.objects.length));
let dangerDiagnostics = getSoldierDangerFieldDiagnostics(state.map);
assert.equal(dangerDiagnostics.geometryBuildCount, 1);
assert.equal(dangerDiagnostics.fieldBuildCount, 1);

unit.position.x += 0.2;
const moved = buildSoldierAwarenessReport(state, unit);
assert.equal(moved.cacheKey, first.cacheKey, 'movement must reuse the full awareness field');
assert.equal(moved.dangerFieldKey, first.dangerFieldKey, 'movement alone must not invalidate canonical danger pixels');
diagnostics = getAwarenessStaticFieldDiagnostics(state.map, 'standing');
assert.equal(diagnostics.buildCount, 1);
assert.ok(diagnostics.cacheHitCount >= 1);
dangerDiagnostics = getSoldierDangerFieldDiagnostics(state.map);
assert.equal(dangerDiagnostics.geometryBuildCount, 1);
assert.equal(dangerDiagnostics.fieldBuildCount, 1);
assert.ok(dangerDiagnostics.fieldCacheHitCount >= 1);

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
  fireThreatClass: null,
};
unit.tacticalKnowledge.threats.push(threat);
unit.tacticalKnowledge.revision += 1;
const threatened = buildSoldierAwarenessReport(state, unit);
assert.notEqual(threatened.cacheKey, first.cacheKey, 'knowledge changes must rebuild only dynamic awareness content');
assert.notEqual(threatened.dangerFieldKey, first.dangerFieldKey, 'knowledge changes must invalidate canonical danger pixels');
assert.equal(getAwarenessStaticFieldDiagnostics(state.map, 'standing').buildCount, 1);
dangerDiagnostics = getSoldierDangerFieldDiagnostics(state.map);
assert.equal(dangerDiagnostics.geometryBuildCount, 2);
assert.equal(dangerDiagnostics.fieldBuildCount, 2);

state.map.objects[0].x += 2;
const movedCover = buildSoldierAwarenessReport(state, unit);
assert.notEqual(movedCover.dangerFieldKey, threatened.dangerFieldKey, 'cover changes must invalidate protected danger content');
assert.equal(getAwarenessStaticFieldDiagnostics(state.map, 'standing').buildCount, 2);

const heightCell = getCell(state.map, 10, 7);
assert.ok(heightCell);
heightCell.height = 2;
markMapCellsDirty(state.map, 'height', { minX: 10, minY: 7, maxX: 10, maxY: 7 });
const changedHeight = buildSoldierAwarenessReport(state, unit);
assert.notEqual(changedHeight.dangerFieldKey, movedCover.dangerFieldKey, 'height changes must invalidate terrain-protected danger content');
assert.equal(getAwarenessStaticFieldDiagnostics(state.map, 'standing').buildCount, 3);

unit.behaviorRuntime.posture = 'crouched';
const crouched = buildSoldierAwarenessReport(state, unit);
assert.notEqual(crouched.dangerFieldKey, changedHeight.dangerFieldKey, 'posture changes must invalidate posture-relative protection');
assert.equal(getAwarenessStaticFieldDiagnostics(state.map, 'crouched').buildCount, 1);

console.log('Awareness field cache smoke passed: movement preserves canonical danger content; knowledge/map/posture invalidation remains precise without renderer or PixiJS imports.');
