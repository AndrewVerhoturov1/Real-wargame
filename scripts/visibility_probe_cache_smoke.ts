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

const unit = state.units[0];
unit.position.x += 0.25;
const moved = getVisibilityProbeResult(state);
assert.notEqual(moved, first);
assert.equal(getVisibilityProbeDiagnostics(state).calculationCount, 2);

unit.behaviorRuntime.posture = 'crouched';
getVisibilityProbeResult(state);
assert.equal(getVisibilityProbeDiagnostics(state).calculationCount, 3);

setVisibilityProbe(state, true, { x: 15.5, y: 7.5 });
getVisibilityProbeResult(state);
assert.equal(getVisibilityProbeDiagnostics(state).calculationCount, 4);

const heightCell = getCell(state.map, 6, 6);
assert.ok(heightCell);
heightCell.height = 2;
markMapCellsDirty(state.map, 'height', { minX: 6, minY: 6, maxX: 6, maxY: 6 });
getVisibilityProbeResult(state);
assert.equal(getVisibilityProbeDiagnostics(state).calculationCount, 5);

state.map.objects[0].x += 1;
getVisibilityProbeResult(state);
diagnostics = getVisibilityProbeDiagnostics(state);
assert.equal(diagnostics.calculationCount, 6);
assert.ok(diagnostics.lastObjectCandidateCount <= state.map.objects.length);

setVisibilityProbe(state, false, null);
assert.equal(getVisibilityProbeResult(state), null);

console.log('Visibility probe cache smoke passed: shared results and precise invalidation by probe, unit and map revisions.');
