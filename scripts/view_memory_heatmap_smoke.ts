import assert from 'node:assert/strict';
import type { TacticalMapData } from '../src/core/map/MapModel';
import { getCell, setCellVegetationMaterialId } from '../src/core/map/MapModel';
import { markMapCellsDirty } from '../src/core/map/MapRuntimeState';
import { setAttentionMode, setSearchSector, updateAttentionController } from '../src/core/perception/AttentionController';
import { createInitialState, selectUnit } from '../src/core/simulation/SimulationState';
import {
  getAttentionOverlayState,
  setAttentionHeatmapTargetPosture,
  setAttentionOverlayActive,
} from '../src/core/ui/RuntimeUiState';
import type { UnitData } from '../src/core/units/UnitModel';
import {
  buildVisibilityCandidateMask,
  VISIBILITY_ZONE_CODE,
  visibilityMaskIndex,
} from '../src/core/visibility/VisibilityCandidateMask';
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
  objects: [
    {
      id: 'low-cover',
      kind: 'cover',
      x: 15,
      y: 15,
      widthCells: 1,
      heightCells: 1,
      losHeightMeters: 1.1,
    },
    {
      id: 'house',
      kind: 'structure',
      x: 20,
      y: 14,
      widthCells: 3,
      heightCells: 4,
      losHeightMeters: 5,
    },
  ],
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
const observer = state.units[0]!;

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
setAttentionMode(observer, 'observe', 'player');
observer.attentionRuntime.focusDirectionRadians = 0;

const profile = observer.attentionSettings.profiles.observe;
profile.focusAngleDegrees = 30;
profile.directAngleDegrees = 80;
profile.peripheralAngleDegrees = 80;
profile.focusWeight = 1;
profile.directWeight = 0.7;
profile.peripheralWeight = 0;
profile.rearWeight = 0;
const narrowMask = buildVisibilityCandidateMask(state, observer);
assert.ok(narrowMask.candidateCellCount > 0);
const rearOutside = visibilityMaskIndex(narrowMask, 2, 15);
assert.ok(rearOutside >= 0);
assert.equal(narrowMask.candidate[rearOutside], 0);
assert.equal(narrowMask.zone[rearOutside], VISIBILITY_ZONE_CODE.unseen);

const savedNearRange = observer.attentionSettings.nearAwarenessRangeMeters;
observer.attentionSettings.nearAwarenessRangeMeters = 0;
profile.focusWeight = 0;
profile.directWeight = 0;
const emptyMask = buildVisibilityCandidateMask(state, observer);
assert.equal(emptyMask.candidateCellCount, 0, 'zero-weight profile must produce an empty candidate mask');
observer.attentionSettings.nearAwarenessRangeMeters = savedNearRange;
profile.focusWeight = 1;
profile.directWeight = 0.7;

assert.equal(getSelectedUnitVisibilityField(state), null, 'hidden layer must not build a field');
assert.equal(getVisibilityFieldDiagnostics(state).rebuildCount, 0);
setAttentionOverlayActive(state, true);
state.simulationTimeSeconds = 1;
const narrowField = getSelectedUnitVisibilityField(state);
assert.ok(narrowField);
assert.ok(narrowField.quality instanceof Uint8Array);
assert.ok(narrowField.evaluated instanceof Uint8Array);
assert.equal(narrowField.quality.length, narrowField.width * narrowField.height);
assert.equal(getVisibilityFieldDiagnostics(state).rebuildCount, 1);
const rearFieldIndex = localFieldIndex(narrowField, 2, 15);
assert.ok(rearFieldIndex >= 0);
assert.equal(narrowField.evaluated[rearFieldIndex], 0, 'cell outside attention must receive no geometry target evaluation');
assert.equal(narrowField.quality[rearFieldIndex], 0);
assert.equal(narrowField.zone[rearFieldIndex], VISIBILITY_ZONE_CODE.unseen);
const cachedNarrow = getSelectedUnitVisibilityField(state);
assert.equal(cachedNarrow, narrowField, 'unchanged observer and map must reuse the same field');
assert.ok(getVisibilityFieldDiagnostics(state).cacheHitCount >= 1);
assert.equal(getVisibilityFieldDiagnostics(state).cachedFieldCount, 1);

profile.directAngleDegrees = 360;
profile.peripheralAngleDegrees = 360;
profile.peripheralWeight = 0.25;
profile.rearWeight = 0.1;
state.simulationTimeSeconds += 0.3;
const fullField = getSelectedUnitVisibilityField(state);
assert.ok(fullField && fullField !== narrowField);
assert.ok(fullField.candidateCellCount > narrowField.candidateCellCount, '360-degree profile must have more candidate cells than narrow attention');
assert.ok(fullField.geometryRayCount > 0);
assert.ok(fullField.geometryTraversedCellCount >= fullField.geometryRayCount);

const clearAhead = sampleSelectedUnitVisibilityField(fullField, 13, 15);
const behindHouse = sampleSelectedUnitVisibilityField(fullField, 25, 15);
assert.ok(clearAhead > behindHouse, 'building must create a lower-quality shadow behind itself');

assert.equal(getAttentionOverlayState(state).heatmapTargetPosture, 'standing');
const originalObserverPosture = observer.behaviorRuntime.posture;
const originalKnowledgeRevision = observer.perceptionKnowledge.revision;
const standingBehindCover = sampleSelectedUnitVisibilityField(fullField, 18, 15);
setAttentionHeatmapTargetPosture(state, 'prone');
state.simulationTimeSeconds += 0.3;
const proneField = getSelectedUnitVisibilityField(state);
assert.ok(proneField);
assert.notEqual(proneField.calculationKey, fullField.calculationKey);
const proneBehindCover = sampleSelectedUnitVisibilityField(proneField, 18, 15);
assert.ok(standingBehindCover > proneBehindCover, `standing preview ${standingBehindCover} must exceed prone preview ${proneBehindCover} behind low cover`);
assert.equal(observer.behaviorRuntime.posture, originalObserverPosture, 'heatmap target selector must not change observer posture');
assert.equal(observer.perceptionKnowledge.revision, originalKnowledgeRevision, 'heatmap target selector must not mutate subjective contacts');

observer.position.x += 0.05;
state.simulationTimeSeconds += 0.05;
assert.equal(getSelectedUnitVisibilityField(state), proneField, 'movement inside throttle window must reuse the last field');
observer.position.x += 0.4;
state.simulationTimeSeconds += 0.3;
const moved = getSelectedUnitVisibilityField(state);
assert.ok(moved && moved !== proneField, 'exact observer movement after throttle window must rebuild');

for (let x = 14; x <= 18; x += 1) {
  const cell = getCell(state.map, x, 15);
  assert.ok(cell);
  setCellVegetationMaterialId(cell, 'dense_forest');
}
markMapCellsDirty(state.map, 'forest', { minX: 14, minY: 15, maxX: 18, maxY: 15 });
state.simulationTimeSeconds += 0.3;
const forest = getSelectedUnitVisibilityField(state);
assert.ok(forest && forest.revision > moved.revision, 'map visual revision must invalidate the field');
assert.ok(sampleSelectedUnitVisibilityField(forest, 19, 15) < sampleSelectedUnitVisibilityField(moved, 19, 15), 'forest must reduce current visibility quality');

console.log('View and memory heatmap smoke passed: attention mask, canonical geometry, posture preview, cache and invalidation.');

function localFieldIndex(
  field: { minCellX: number; minCellY: number; width: number; height: number },
  cellX: number,
  cellY: number,
): number {
  const x = cellX - field.minCellX;
  const y = cellY - field.minCellY;
  if (x < 0 || y < 0 || x >= field.width || y >= field.height) return -1;
  return y * field.width + x;
}
