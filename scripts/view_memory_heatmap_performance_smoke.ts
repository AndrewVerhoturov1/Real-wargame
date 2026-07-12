import assert from 'node:assert/strict';
import type { TacticalMapData } from '../src/core/map/MapModel';
import { getPerceptionDiagnostics } from '../src/core/perception/PerceptionSystem';
import { createInitialState, selectUnit } from '../src/core/simulation/SimulationState';
import { setAttentionOverlayActive } from '../src/core/ui/RuntimeUiState';
import type { UnitData } from '../src/core/units/UnitModel';
import {
  getSelectedUnitVisibilityField,
  getVisibilityFieldDiagnostics,
} from '../src/core/visibility/SelectedUnitVisibilityField';

const map: TacticalMapData = {
  width: 180,
  height: 120,
  cellSize: 8,
  metersPerCell: 2,
  defaultTerrain: 'field',
  defaultHeight: 0,
};
const observer: UnitData = {
  id: 'observer',
  label: 'Observer',
  labelRu: 'Наблюдатель',
  type: 'scout_team',
  side: 'player',
  x: 80,
  y: 55,
  facingDegrees: 0,
  attention: {
    vision: {
      maximumVisualRangeMeters: 220,
      distanceFalloffStartMeters: 60,
      distanceFalloffExponent: 1.6,
      detectionVariancePercent: 10,
    },
  },
};
const state = createInitialState(map, [observer]);
selectUnit(state, 'observer');

for (let index = 0; index < 60; index += 1) {
  state.simulationTimeSeconds += 1 / 60;
  assert.equal(getSelectedUnitVisibilityField(state), null);
}
assert.equal(getVisibilityFieldDiagnostics(state).rebuildCount, 0, 'hidden layer must perform zero field builds');
assert.equal(getPerceptionDiagnostics(state).losCalculationCount, 0, 'heatmap requests must not run exact target LOS');

setAttentionOverlayActive(state, true);
const first = getSelectedUnitVisibilityField(state);
assert.ok(first);
assert.equal(first.quality.byteLength, first.width * first.height, 'quality field must use one byte per cell');
const initialDiagnostics = getVisibilityFieldDiagnostics(state);
assert.equal(initialDiagnostics.rebuildCount, 1);
assert.ok(initialDiagnostics.processedCellCount > 0);
assert.ok(
  initialDiagnostics.lastBuildDurationMs <= 120,
  `180×120 heatmap build must stay within 120 ms on CI, got ${initialDiagnostics.lastBuildDurationMs.toFixed(2)} ms`,
);

for (let index = 0; index < 300; index += 1) {
  state.simulationTimeSeconds += 1 / 60;
  assert.equal(getSelectedUnitVisibilityField(state), first);
}
const idleDiagnostics = getVisibilityFieldDiagnostics(state);
assert.equal(idleDiagnostics.rebuildCount, 1, 'idle selected soldier must keep one cached field');
assert.ok(idleDiagnostics.cacheHitCount >= 300);

const unit = state.units[0];
for (let index = 0; index < 60; index += 1) {
  state.simulationTimeSeconds += 1 / 60;
  unit.position.x += 0.02;
  getSelectedUnitVisibilityField(state);
}
const movingDiagnostics = getVisibilityFieldDiagnostics(state);
assert.ok(movingDiagnostics.rebuildCount <= 7, `moving field must be throttled, got ${movingDiagnostics.rebuildCount}`);
assert.equal(getPerceptionDiagnostics(state).losCalculationCount, 0, 'field builder must remain independent from exact perception LOS');

console.log(JSON.stringify({
  initialBuildMs: initialDiagnostics.lastBuildDurationMs,
  processedCellSteps: initialDiagnostics.processedCellCount,
  rayCount: initialDiagnostics.rayCount,
  idleCacheHits: idleDiagnostics.cacheHitCount,
  movingRebuildCount: movingDiagnostics.rebuildCount,
}));
console.log('View and memory heatmap performance smoke passed: hidden zero-work, compact storage, timed build, idle cache and moving throttle.');
