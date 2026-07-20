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
    defaultMode: 'observe',
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
const unit = state.units[0]!;
const profile = unit.attentionSettings.profiles.observe;

for (let index = 0; index < 60; index += 1) {
  state.simulationTimeSeconds += 1 / 60;
  assert.equal(getSelectedUnitVisibilityField(state), null);
}
const hiddenDiagnostics = getVisibilityFieldDiagnostics(state);
assert.equal(hiddenDiagnostics.rebuildCount, 0, 'hidden layer must perform zero field builds');
assert.equal(hiddenDiagnostics.candidateCellCount, 0);
assert.equal(hiddenDiagnostics.evaluatedTargetCellCount, 0);
assert.equal(hiddenDiagnostics.geometryRayCount, 0);
assert.equal(hiddenDiagnostics.geometryTraversedCellCount, 0);
assert.equal(getPerceptionDiagnostics(state).losCalculationCount, 0, 'heatmap requests must not run perception target probes');

setAttentionOverlayActive(state, true);
profile.focusAngleDegrees = 30;
profile.directAngleDegrees = 70;
profile.peripheralAngleDegrees = 70;
profile.focusWeight = 1;
profile.directWeight = 0.65;
profile.peripheralWeight = 0;
profile.rearWeight = 0;
const narrow = getSelectedUnitVisibilityField(state);
assert.ok(narrow);
assert.equal(narrow.quality.byteLength, narrow.width * narrow.height, 'quality field must use one byte per local cell');
assert.equal(narrow.evaluated.byteLength, narrow.width * narrow.height, 'evaluated field must use one byte per local cell');
const narrowDiagnostics = getVisibilityFieldDiagnostics(state);
assert.equal(narrowDiagnostics.rebuildCount, 1);
assert.ok(narrowDiagnostics.candidateCellCount > 0);
assert.ok(narrowDiagnostics.evaluatedTargetCellCount > 0);
assert.ok(narrowDiagnostics.geometryRayCount > 0);
assert.ok(narrowDiagnostics.geometryTraversedCellCount >= narrowDiagnostics.geometryRayCount);
assert.ok(
  narrowDiagnostics.lastBuildDurationMs <= 120,
  `180×120 narrow heatmap build must stay within 120 ms on CI, got ${narrowDiagnostics.lastBuildDurationMs.toFixed(2)} ms`,
);

profile.directAngleDegrees = 360;
profile.peripheralAngleDegrees = 360;
profile.peripheralWeight = 0.25;
profile.rearWeight = 0.1;
state.simulationTimeSeconds += 0.3;
const full = getSelectedUnitVisibilityField(state);
assert.ok(full && full !== narrow);
const fullDiagnostics = getVisibilityFieldDiagnostics(state);
assert.ok(narrowDiagnostics.candidateCellCount < fullDiagnostics.candidateCellCount);
assert.ok(narrowDiagnostics.geometryRayCount < fullDiagnostics.geometryRayCount);
assert.ok(narrowDiagnostics.geometryTraversedCellCount < fullDiagnostics.geometryTraversedCellCount);

const savedNearRange = unit.attentionSettings.nearAwarenessRangeMeters;
unit.attentionSettings.nearAwarenessRangeMeters = 0;
profile.focusWeight = 0;
profile.directWeight = 0;
profile.peripheralWeight = 0;
profile.rearWeight = 0;
state.simulationTimeSeconds += 0.3;
const empty = getSelectedUnitVisibilityField(state);
assert.ok(empty);
assert.equal(empty.candidateCellCount, 0);
assert.equal(empty.evaluatedTargetCellCount, 0);
assert.equal(empty.geometryRayCount, 0);
assert.equal(empty.geometryTraversedCellCount, 0);

unit.attentionSettings.nearAwarenessRangeMeters = savedNearRange;
profile.focusWeight = 1;
profile.directWeight = 0.65;
profile.peripheralWeight = 0.25;
profile.rearWeight = 0.1;
state.simulationTimeSeconds += 0.3;
const idleBase = getSelectedUnitVisibilityField(state);
assert.ok(idleBase);
const rebuildsBeforeIdle = getVisibilityFieldDiagnostics(state).rebuildCount;
for (let index = 0; index < 300; index += 1) {
  state.simulationTimeSeconds += 1 / 60;
  assert.equal(getSelectedUnitVisibilityField(state), idleBase);
}
const idleDiagnostics = getVisibilityFieldDiagnostics(state);
assert.equal(idleDiagnostics.rebuildCount, rebuildsBeforeIdle, 'idle selected soldier must keep the cached field');
assert.ok(idleDiagnostics.cacheHitCount >= 300);

const rebuildsBeforeMovement = idleDiagnostics.rebuildCount;
for (let index = 0; index < 60; index += 1) {
  state.simulationTimeSeconds += 1 / 60;
  unit.position.x += 0.02;
  getSelectedUnitVisibilityField(state);
}
const movingDiagnostics = getVisibilityFieldDiagnostics(state);
assert.ok(
  movingDiagnostics.rebuildCount - rebuildsBeforeMovement <= 6,
  `moving field must be throttled to about five builds per second, got ${movingDiagnostics.rebuildCount - rebuildsBeforeMovement}`,
);
assert.equal(getPerceptionDiagnostics(state).losCalculationCount, 0, 'field builder must remain independent from perception target probes');

console.log(JSON.stringify({
  narrowBuildMs: narrowDiagnostics.lastBuildDurationMs,
  narrowCandidates: narrowDiagnostics.candidateCellCount,
  fullCandidates: fullDiagnostics.candidateCellCount,
  narrowRays: narrowDiagnostics.geometryRayCount,
  fullRays: fullDiagnostics.geometryRayCount,
  narrowTraversedCells: narrowDiagnostics.geometryTraversedCellCount,
  fullTraversedCells: fullDiagnostics.geometryTraversedCellCount,
  idleCacheHits: idleDiagnostics.cacheHitCount,
  movingRebuilds: movingDiagnostics.rebuildCount - rebuildsBeforeMovement,
}));
console.log('View and memory heatmap performance smoke passed: masked work, empty zero-work, cache and movement throttle.');
