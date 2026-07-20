import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { normalizeMap, type TacticalMapData } from '../src/core/map/MapModel';
import { markMapCellsDirty } from '../src/core/map/MapRuntimeState';
import { createInitialState } from '../src/core/simulation/SimulationState';
import { computeLineOfSight } from '../src/core/visibility/LineOfSight';
import {
  clearPerceptionPointVisibilityCache,
  evaluatePointVisibility,
  getPerceptionGeometryPreparationDiagnostics,
} from '../src/core/visibility/PointVisibility';
import { getVisibilityGeometryField, readVisibilityGeometryCell } from '../src/core/visibility/VisibilityGeometryField';
import { traceVisibilityRay } from '../src/core/visibility/VisibilityRayKernel';
import { probeTargetVisibility } from '../src/core/visibility/VisibilityTargetProbe';
import { soldierPostureHeightMeters } from '../src/core/visibility/VisibilityPosture';
import type { UnitPosture } from '../src/core/behavior/BehaviorModel';
import type { AttentionSample } from '../src/core/perception/AttentionModel';

const TRANSMISSION_TOLERANCE = 1 / 255 + 1e-6;
const attention: AttentionSample = {
  zone: 'focus',
  weight: 1,
  normalizedAngle01: 0,
  checkIntervalSeconds: 0.2,
  sampleDurationSeconds: 0.2,
  maximumRangeMeters: 2_000,
  minimumVisibilityQuality: 0,
};

const exactOpen = traceVisibilityRay(normalizeMap(baseMap()), {
  origin: { x: 2.13, y: 2.31 },
  target: { x: 10.87, y: 4.74 },
  originHeightAboveGroundMeters: 1.7,
  targetHeightAboveGroundMeters: 1.7,
  channel: 'visual',
});
assert.equal(exactOpen.hardBlocked, false);
assert.deepEqual(exactOpen.origin, { x: 2.13, y: 2.31 });
assert.deepEqual(exactOpen.target, { x: 10.87, y: 4.74 });
assert.ok(exactOpen.traversedCellCount > 0);

const shortForest = traceVisibilityRay(normalizeMap(forestLengthMap()), {
  origin: { x: 2.1, y: 3.2 },
  target: { x: 8.1, y: 3.2 },
  originHeightAboveGroundMeters: 1.7,
  targetHeightAboveGroundMeters: 1.7,
  channel: 'visual',
});
const diagonalForest = traceVisibilityRay(normalizeMap(forestLengthMap()), {
  origin: { x: 2.1, y: 1.1 },
  target: { x: 8.1, y: 6.4 },
  originHeightAboveGroundMeters: 1.7,
  targetHeightAboveGroundMeters: 1.7,
  channel: 'visual',
});
assert.ok(diagonalForest.accumulatedVegetationMeters > shortForest.accumulatedVegetationMeters);
assert.ok(diagonalForest.visualTransmission < shortForest.visualTransmission);

const partialMap = normalizeMap(partialSilhouetteMap());
const partialState = createInitialState(partialMap, [unitData('partial-observer', 2, 3)]);
const partialObserver = partialState.units[0]!;
partialObserver.position = { x: 2.5, y: 3.5 };
partialObserver.behaviorRuntime.posture = 'standing';
const partialTarget = { x: 10.5, y: 3.5 };
const partial = probeTargetVisibility(partialMap, partialObserver, partialTarget, 1.7);
assert.equal(partial.samples.length, 3);
assert.ok(partial.visibleSampleCount > 0 && partial.visibleSampleCount < 3, `expected partial silhouette, got ${partial.visibleSampleCount}/3`);
assert.ok(partial.visualTransmission > 0 && partial.visualTransmission < 1);
assert.equal(partial.blocked, false);
const hidden = probeTargetVisibility(partialMap, partialObserver, partialTarget, 0.35);
assert.equal(hidden.visibleSampleCount, 0);
assert.equal(hidden.blocked, true);

const parityCases: Array<{
  name: string;
  map: TacticalMapData;
  origin: { x: number; y: number };
  target: { x: number; y: number };
  posture: UnitPosture;
  targetHeightMeters: number;
}> = [
  { name: 'open-standing', map: baseMap(), origin: { x: 2.5, y: 3.5 }, target: { x: 10.5, y: 3.5 }, posture: 'standing', targetHeightMeters: 1.7 },
  {
    name: 'structure-shadow',
    map: { ...baseMap(), objects: [{ id: 'wall', kind: 'structure', x: 5, y: 2, widthCells: 1, heightCells: 3, rotationRadians: 0, losHeightMeters: 5 }] },
    origin: { x: 2.5, y: 3.5 }, target: { x: 10.5, y: 3.5 }, posture: 'standing', targetHeightMeters: 1.7,
  },
  {
    name: 'terrain-ridge',
    map: { ...baseMap(), cellRects: [{ x1: 5, x2: 7, y1: 0, y2: 6, height: 4 }] },
    origin: { x: 2.5, y: 3.5 }, target: { x: 10.5, y: 3.5 }, posture: 'standing', targetHeightMeters: 1.7,
  },
  {
    name: 'sparse-vegetation',
    map: { ...baseMap(), metersPerCell: 2, cellRects: [{ x1: 4, x2: 7, y1: 2, y2: 4, forest: 1 }] },
    origin: { x: 2.5, y: 3.5 }, target: { x: 10.5, y: 3.5 }, posture: 'standing', targetHeightMeters: 1.7,
  },
  { name: 'prone-open', map: baseMap(), origin: { x: 3.5, y: 5.5 }, target: { x: 9.5, y: 5.5 }, posture: 'prone', targetHeightMeters: 0.35 },
];

const results = parityCases.map(compareCenterParity);
for (const result of results) {
  assert.equal(result.pointBlocked, result.referenceBlocked, `${result.name}: blocked/unblocked parity`);
  assert.ok(result.transmissionDelta <= TRANSMISSION_TOLERANCE, `${result.name}: transmission delta ${result.transmissionDelta} exceeds ${TRANSMISSION_TOLERANCE}`);
}

const nearReliefMap = normalizeMap(postureSensitiveNearReliefMap());
const proneState = createInitialState(nearReliefMap, [unitData('near-relief-observer', 2, 3)]);
const nearObserver = proneState.units[0]!;
nearObserver.position = { x: 2.8, y: 3.5 };
nearObserver.attentionSettings.vision.maximumVisualRangeMeters = 2_000;
nearObserver.behaviorRuntime.posture = 'prone';
const nearTarget = { x: 10.8, y: 3.5 };
const proneResult = computeLineOfSight(nearReliefMap, nearObserver, nearTarget, 1.7);
assert.equal(proneResult.blocked, true, 'near relief must hide the target from a prone observer');
nearObserver.behaviorRuntime.posture = 'standing';
const standingResult = computeLineOfSight(nearReliefMap, nearObserver, nearTarget, 1.7);
assert.equal(standingResult.blocked, false, 'the same exact target must clear relief after the observer stands');

const exactCacheMap = normalizeMap(partialSilhouetteMap());
const exactCacheState = createInitialState(exactCacheMap, [unitData('exact-cache-observer', 2, 3)]);
const exactCacheObserver = exactCacheState.units[0]!;
exactCacheObserver.position = { x: 2.49, y: 3.49 };
exactCacheObserver.attentionSettings.vision.maximumVisualRangeMeters = 2_000;
exactCacheState.simulationStep = 1;
const exactA = evaluatePointVisibility(exactCacheState, exactCacheObserver, { x: 10.501, y: 3.49 }, 1.7, attention);
const afterA = getPerceptionGeometryPreparationDiagnostics(exactCacheState);
const exactB = evaluatePointVisibility(exactCacheState, exactCacheObserver, { x: 10.511, y: 3.49 }, 1.7, attention);
const afterB = getPerceptionGeometryPreparationDiagnostics(exactCacheState);
assert.ok(exactA);
assert.ok(exactB);
assert.equal(afterA.preparationCount, 1);
assert.equal(afterB.preparationCount, 2, 'movement by 0.01 cell must use a distinct exact-position cache identity');
assert.equal(afterB.pointPhysicalRayCount, 6);
const deferred = evaluatePointVisibility(exactCacheState, exactCacheObserver, { x: 10.521, y: 3.49 }, 1.7, attention);
assert.equal(deferred, null, 'third cold target in the same step must respect the two-probe budget');

const invalidationMap = normalizeMap(baseMap());
const invalidationState = createInitialState(invalidationMap, [unitData('invalidate-observer', 2, 3)]);
const invalidationObserver = invalidationState.units[0]!;
invalidationObserver.position = { x: 2.5, y: 3.5 };
invalidationObserver.attentionSettings.vision.maximumVisualRangeMeters = 2_000;
invalidationState.simulationStep = 1;
const first = evaluatePointVisibility(invalidationState, invalidationObserver, { x: 10.5, y: 3.5 }, 1.7, attention);
assert.ok(first);
const before = getPerceptionGeometryPreparationDiagnostics(invalidationState);
invalidationState.map.cells[3 * invalidationState.map.width + 6]!.height = 4;
markMapCellsDirty(invalidationState.map, 'height', { minX: 6, minY: 3, maxX: 6, maxY: 3 });
invalidationState.simulationStep += 1;
const second = evaluatePointVisibility(invalidationState, invalidationObserver, { x: 10.5, y: 3.5 }, 1.7, attention);
assert.ok(second);
const after = getPerceptionGeometryPreparationDiagnostics(invalidationState);
assert.ok(after.preparationCount > before.preparationCount, 'map revision must invalidate the target-probe cache');
clearPerceptionPointVisibilityCache(invalidationState);

const evidence = {
  transmissionTolerance: TRANSMISSION_TOLERANCE,
  cases: results,
  exactOpenPositionPreserved: true,
  exactVegetationPathLength: true,
  partialSilhouette: {
    visibleSampleCount: partial.visibleSampleCount,
    visualTransmission: round(partial.visualTransmission),
  },
  proneSilhouetteHidden: true,
  postureSensitiveNearRelief: true,
  postureSensitiveOffCenterPositions: true,
  exactInCellCacheIdentity: true,
  logicalProbeBudget: 2,
  physicalRaysPerProbe: 3,
  mapRevisionInvalidatedCache: true,
};
writeEvidence('point-los-parity.json', evidence);
console.log(`Unified visibility differential smoke passed: ${results.length} parity scenes, exact DDA, silhouette and cache coverage.`);

function compareCenterParity(fixture: typeof parityCases[number]) {
  const map = normalizeMap(fixture.map);
  const state = createInitialState(map, [unitData(`observer-${fixture.name}`, fixture.origin.x - 0.5, fixture.origin.y - 0.5)]);
  const observer = state.units[0]!;
  observer.position = { ...fixture.origin };
  observer.behaviorRuntime.posture = fixture.posture;
  observer.attentionSettings.vision.maximumVisualRangeMeters = 2_000;
  const point = computeLineOfSight(map, observer, fixture.target, fixture.targetHeightMeters);
  const field = getVisibilityGeometryField(map, {
    origin: fixture.origin,
    originHeightAboveGroundMeters: soldierPostureHeightMeters(fixture.posture),
    targetHeightAboveGroundMeters: fixture.targetHeightMeters,
    rangeCells: Math.max(map.width, map.height),
    channel: 'visual',
  });
  const reference = readVisibilityGeometryCell(field, fixture.target.x, fixture.target.y);
  return {
    name: fixture.name,
    pointBlocked: point.blocked,
    referenceBlocked: reference.hardBlocked,
    pointTransmission: round(point.visualTransmission),
    referenceTransmission: round(reference.visualTransmission),
    transmissionDelta: Math.abs(point.visualTransmission - reference.visualTransmission),
  };
}

function baseMap(): TacticalMapData {
  return { width: 14, height: 7, cellSize: 8, metersPerCell: 2, defaultTerrain: 'field', defaultHeight: 0, objects: [] };
}

function forestLengthMap(): TacticalMapData {
  return {
    width: 12,
    height: 8,
    cellSize: 8,
    metersPerCell: 2,
    defaultTerrain: 'field',
    defaultHeight: 0,
    objects: [],
    cellRects: [{ x1: 4, x2: 6, y1: 1, y2: 6, vegetationMaterialId: 'sparse_forest' }],
  };
}

function partialSilhouetteMap(): TacticalMapData {
  return {
    ...baseMap(),
    objects: [{
      id: 'low-cover',
      kind: 'cover',
      x: 6,
      y: 3,
      widthCells: 1,
      heightCells: 1,
      rotationRadians: 0,
      losHeightMeters: 1.5,
    }],
  };
}

function postureSensitiveNearReliefMap(): TacticalMapData {
  return {
    ...baseMap(),
    cellRects: [{ x1: 3, x2: 3, y1: 0, y2: 6, height: 1 }],
  };
}

function unitData(id: string, x: number, y: number) {
  return { id, label: id, labelRu: id, type: 'scout_team' as const, side: 'blue' as const, aiControl: 'manual' as const, x, y, viewRangeCells: 100 };
}

function round(value: number): number { return Math.round(value * 1000) / 1000; }
function writeEvidence(name: string, value: unknown): void {
  const directory = process.env.PERFORMANCE_EVIDENCE_DIR;
  if (!directory) return;
  mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(directory, name), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}
