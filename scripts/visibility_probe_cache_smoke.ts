import assert from 'node:assert/strict';
import { getCell, type TacticalMapData } from '../src/core/map/MapModel';
import { markMapCellsDirty } from '../src/core/map/MapRuntimeState';
import { createInitialState, selectUnit } from '../src/core/simulation/SimulationState';
import { setVisibilityProbe } from '../src/core/ui/RuntimeUiState';
import {
  getVisibilityProbeDiagnostics,
  getVisibilityProbeResult,
} from '../src/core/visibility/VisibilityProbeService';
import type { UnitData } from '../src/core/units/UnitModel';

const mapData: TacticalMapData = {
  width: 20,
  height: 12,
  cellSize: 24,
  metersPerCell: 10,
  defaultTerrain: 'field',
  defaultHeight: 0,
  objects: [{
    id: 'wall',
    kind: 'structure',
    x: 8,
    y: 5,
    widthCells: 1,
    heightCells: 3,
    losHeightMeters: 5,
  }],
};

const unitData: UnitData[] = [{
  id: 'probe-unit',
  label: 'Probe unit',
  labelRu: 'Проверочный боец',
  type: 'scout_team',
  side: 'player',
  x: 3.5,
  y: 6.5,
  speedCellsPerSecond: 0.5,
  heldItem: 'short_item',
  facingDegrees: 0,
  viewAngleDegrees: 100,
  viewRangeCells: 12,
  behaviorProfile: 'regular',
}];

const state = createInitialState(mapData, unitData);
selectUnit(state, 'probe-unit');
setVisibilityProbe(state, true, { x: 14.5, y: 6.5 });

const first = getVisibilityProbeResult(state);
assert.ok(first);
assert.equal(first.blocked, true);
assert.equal(getVisibilityProbeDiagnostics(state).calculationCount, 1);

const second = getVisibilityProbeResult(state);
assert.equal(second, first, 'identical probe reads must share one result object');
let diagnostics = getVisibilityProbeDiagnostics(state);
assert.equal(diagnostics.calculationCount, 1);
assert.equal(diagnostics.cacheHitCount, 1);
const firstKey = diagnostics.lastKey;

const unit = state.units[0]!;
unit.position.x += 0.01;
const movedInsideCell = getVisibilityProbeResult(state);
assert.notEqual(movedInsideCell, first, '0.01-cell observer movement must not reuse a coarse position bucket');
diagnostics = getVisibilityProbeDiagnostics(state);
assert.equal(diagnostics.calculationCount, 2);
assert.notEqual(diagnostics.lastKey, firstKey);

unit.behaviorRuntime.posture = 'crouched';
getVisibilityProbeResult(state);
assert.equal(getVisibilityProbeDiagnostics(state).calculationCount, 3);

setVisibilityProbe(state, true, { x: 15.501, y: 7.501 });
getVisibilityProbeResult(state);
const targetKeyA = getVisibilityProbeDiagnostics(state).lastKey;
assert.equal(getVisibilityProbeDiagnostics(state).calculationCount, 4);
setVisibilityProbe(state, true, { x: 15.511, y: 7.501 });
getVisibilityProbeResult(state);
diagnostics = getVisibilityProbeDiagnostics(state);
assert.equal(diagnostics.calculationCount, 5, '0.01-cell target movement must invalidate exact probe identity');
assert.notEqual(diagnostics.lastKey, targetKeyA);

const heightCell = getCell(state.map, 6, 6);
assert.ok(heightCell);
heightCell.height = 2;
markMapCellsDirty(state.map, 'height', { minX: 6, minY: 6, maxX: 6, maxY: 6 });
getVisibilityProbeResult(state);
assert.equal(getVisibilityProbeDiagnostics(state).calculationCount, 6);

state.map.objects[0]!.x += 1;
getVisibilityProbeResult(state);
diagnostics = getVisibilityProbeDiagnostics(state);
assert.equal(diagnostics.calculationCount, 7);
assert.equal(diagnostics.lastObjectCandidateCount, 0, 'canonical raster visibility no longer performs a separate spatial-index query');

setVisibilityProbe(state, false, null);
assert.equal(getVisibilityProbeResult(state), null);

console.log('Visibility probe cache smoke passed: canonical LOS wrapper and exact observer/target/map invalidation.');
