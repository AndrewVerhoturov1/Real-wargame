import assert from 'node:assert/strict';
import type { TacticalMapData } from '../src/core/map/MapModel';
import { getCell } from '../src/core/map/MapModel';
import { markMapCellsDirty } from '../src/core/map/MapRuntimeState';
import { setAttentionMode, setSearchSector, updateAttentionController } from '../src/core/perception/AttentionController';
import { createInitialState, selectUnit } from '../src/core/simulation/SimulationState';
import { setAttentionOverlayActive } from '../src/core/ui/RuntimeUiState';
import type { UnitData } from '../src/core/units/UnitModel';
import {
  calculateDistanceVisibilityFactor,
  evaluateCellVisibilityQuality,
} from '../src/core/visibility/VisibilityQuality';
import {
  getSelectedUnitVisibilityField,
  getVisibilityFieldDiagnostics,
  sampleSelectedUnitVisibilityField,
} from '../src/core/visibility/SelectedUnitVisibilityField';

const vision = {
  maximumVisualRangeMeters: 300,
  distanceFalloffStartMeters: 60,
  distanceFalloffExponent: 1.6,
};

assert.equal(calculateDistanceVisibilityFactor(20, vision), 1);
assert.ok(calculateDistanceVisibilityFactor(150, vision) > 0);
assert.ok(calculateDistanceVisibilityFactor(150, vision) < 1);
assert.equal(calculateDistanceVisibilityFactor(300, vision), 0);
assert.equal(evaluateCellVisibilityQuality({
  blocked: true,
  visualTransmission: 1,
  distanceMeters: 20,
  attentionWeight: 1,
  observerCondition: 1,
  vision,
}).quality01, 0);
assert.ok(evaluateCellVisibilityQuality({
  blocked: false,
  visualTransmission: 0.5,
  distanceMeters: 20,
  attentionWeight: 0.5,
  observerCondition: 1,
  vision,
}).quality01 > 0.2);

const mapData: TacticalMapData = {
  width: 48,
  height: 32,
  cellSize: 16,
  metersPerCell: 2,
  defaultTerrain: 'field',
  defaultHeight: 0,
  objects: [{
    id: 'house',
    kind: 'structure',
    x: 20,
    y: 14,
    widthCells: 3,
    heightCells: 4,
    losHeightMeters: 5,
  }],
};
const observerData: UnitData = {
  id: 'observer',
  label: 'Observer',
  labelRu: 'Наблюдатель',
  type: 'scout_team',
  side: 'player',
  x: 10,
  y: 15,
  facingDegrees: 0,
  viewRangeCells: 30,
  attention: { vision },
};
const state = createInitialState(mapData, [observerData]);
selectUnit(state, 'observer');
const observer = state.units[0];

setAttentionMode(observer, 'observe', 'player');
const observeDirection = observer.attentionRuntime.focusDirectionRadians;
updateAttentionController(observer, 4);
assert.equal(observer.attentionRuntime.focusDirectionRadians, observeDirection, 'observe must not physically sweep');
setSearchSector(observer, 0.2, Math.PI / 2, 'player');
const searchDirection = observer.attentionRuntime.focusDirectionRadians;
updateAttentionController(observer, 4);
assert.equal(observer.attentionRuntime.focusDirectionRadians, searchDirection, 'search sector must remain stable');
setAttentionMode(observer, 'march', 'player');
observer.facingRadians = 1.1;
updateAttentionController(observer, 4);
assert.equal(observer.attentionRuntime.focusDirectionRadians, observer.facingRadians, 'march must follow facing without sweep');

assert.equal(getSelectedUnitVisibilityField(state), null, 'hidden layer must not build a field');
assert.equal(getVisibilityFieldDiagnostics(state).rebuildCount, 0);
setAttentionOverlayActive(state, true);
state.simulationTimeSeconds = 1;
const first = getSelectedUnitVisibilityField(state);
assert.ok(first);
assert.ok(first.quality instanceof Uint8Array);
assert.ok(first.quality.length === first.width * first.height);
assert.equal(getVisibilityFieldDiagnostics(state).rebuildCount, 1);
const cached = getSelectedUnitVisibilityField(state);
assert.equal(cached, first, 'unchanged observer and map must reuse the same field');
assert.ok(getVisibilityFieldDiagnostics(state).cacheHitCount >= 1);
assert.equal(getVisibilityFieldDiagnostics(state).cachedFieldCount, 1, 'only the latest field may be retained');

const clearAhead = sampleSelectedUnitVisibilityField(first, 17, 15);
const behindHouse = sampleSelectedUnitVisibilityField(first, 25, 15);
assert.ok(clearAhead > behindHouse, 'building must create a lower-quality shadow behind itself');

observer.position.x += 0.05;
state.simulationTimeSeconds += 0.05;
assert.equal(getSelectedUnitVisibilityField(state), first, 'sub-cell movement must reuse quantized cache');
observer.position.x += 0.4;
state.simulationTimeSeconds += 0.3;
const moved = getSelectedUnitVisibilityField(state);
assert.ok(moved && moved !== first, 'meaningful movement after throttle window must rebuild');

for (let x = 14; x <= 18; x += 1) {
  const cell = getCell(state.map, x, 15);
  assert.ok(cell);
  cell.forest = 2;
}
markMapCellsDirty(state.map, 'forest', { minX: 14, minY: 15, maxX: 18, maxY: 15 });
state.simulationTimeSeconds += 0.3;
const forest = getSelectedUnitVisibilityField(state);
assert.ok(forest && forest.revision > moved.revision, 'map visual revision must invalidate the field');
assert.ok(sampleSelectedUnitVisibilityField(forest, 19, 15) < sampleSelectedUnitVisibilityField(moved, 19, 15), 'forest must reduce current visibility quality');

console.log('View and memory heatmap smoke passed: stable coverage, quality falloff, occlusion, cache and invalidation.');
