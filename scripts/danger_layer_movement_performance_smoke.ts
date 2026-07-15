import assert from 'node:assert/strict';
import {
  buildCanonicalWorldThreatSet,
  type CanonicalWorldThreatSetSnapshot,
} from '../src/core/knowledge/CanonicalWorldThreat';
import { buildAwarenessWorldField } from '../src/core/knowledge/AwarenessWorldFieldBuilder';
import type { AwarenessWorkerBuildSnapshot } from '../src/core/knowledge/AwarenessWorldWorkerProtocol';
import { buildSoldierAwarenessReport } from '../src/core/knowledge/SoldierAwarenessGrid';
import type { TacticalMapData } from '../src/core/map/MapModel';
import { createInitialState } from '../src/core/simulation/SimulationState';
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

// One subjective unit contact, with two observer-relative memory descriptions.
const unitThreatA = unitContact(red.position.x, red.position.y, 180, 180);
const unitThreatB = unitContact(red.position.x, red.position.y, 17, 42);
const canonicalA = buildCanonicalWorldThreatSet([unitThreatA], state.map.metersPerCell);
const canonicalB = buildCanonicalWorldThreatSet([unitThreatB], state.map.metersPerCell);
assert.equal(canonicalA.key, canonicalB.key, 'observer-relative direction/range must not enter canonical key');
assert.deepEqual(canonicalA.threats, canonicalB.threats, 'worker payload semantics must be canonical and byte-stable');
assert.equal(worldKey(canonicalA), worldKey(canonicalB), 'world raster key must be observer-position invariant');

const fieldA = buildAwarenessWorldField(state.map, workerSnapshot(1, canonicalA, { x: 171.5, y: 100.5 }));
const fieldB = buildAwarenessWorldField(state.map, workerSnapshot(2, canonicalB, { x: 120.5, y: 45.5 }));
assertTypedArrayEqual(fieldA.field.danger, fieldB.field.danger, 'danger');
assertTypedArrayEqual(fieldA.field.safety, fieldB.field.safety, 'safety');
assertTypedArrayEqual(fieldA.field.dangerPixels, fieldB.field.dangerPixels, 'dangerPixels');
assertTypedArrayEqual(fieldA.field.protectedThreatIndex, fieldB.field.protectedThreatIndex, 'protectedThreatIndex');
assert.equal(fieldA.rasterDigest, fieldB.rasterDigest, 'observer-position invariant fields need one raster digest');
assert.equal(fieldA.fieldIdentity, fieldB.fieldIdentity, 'applied field identity must be independent of observer position');

// Hidden objective movement is outside subjective knowledge and therefore outside the canonical payload.
red.position = { x: 30.5, y: 30.5 };
const hiddenCanonical = buildCanonicalWorldThreatSet([unitThreatA], state.map.metersPerCell);
assert.equal(hiddenCanonical.key, canonicalA.key, 'hidden objective movement must not alter canonical threat key');
assert.deepEqual(hiddenCanonical.threats, canonicalA.threats, 'hidden objective movement must not leak into payload');

// A real evidence-authored sector retains world direction/range and flips protected wall side.
const eastEvidence = buildCanonicalWorldThreatSet([
  directionalEvidence('incoming-east', 210.5, 100.5, 180),
], state.map.metersPerCell);
const westEvidence = buildCanonicalWorldThreatSet([
  directionalEvidence('incoming-west', 110.5, 100.5, 0),
], state.map.metersPerCell);
assert.notEqual(eastEvidence.key, westEvidence.key, 'world-authored direction must remain in the canonical key');
assert.equal(eastEvidence.threats[0]?.directionDegrees, 180);
assert.equal(eastEvidence.threats[0]?.arcDegrees, 55);
assert.equal(eastEvidence.threats[0]?.rangeCells, 180);

const eastField = buildAwarenessWorldField(state.map, workerSnapshot(3, eastEvidence, blue.position));
const westField = buildAwarenessWorldField(state.map, workerSnapshot(4, westEvidence, blue.position));
assert.notEqual(eastField.rasterDigest, westField.rasterDigest, 'genuine directional evidence must change raster bytes');
const westProtectedCell = cellIndex(150, 100);
const eastExposedCell = cellIndex(170, 100);
assert.ok(
  (eastField.field.expectedProtectionAgainstThreat[westProtectedCell] ?? 0)
    > (eastField.field.expectedProtectionAgainstThreat[eastExposedCell] ?? 0),
  'east-authored fire must prefer the west protected side of the wall',
);
assert.equal(eastField.field.protectedThreatIndex[westProtectedCell], 0);
const eastProtectedCell = cellIndex(170, 100);
const westExposedCell = cellIndex(150, 100);
assert.ok(
  (westField.field.expectedProtectionAgainstThreat[eastProtectedCell] ?? 0)
    > (westField.field.expectedProtectionAgainstThreat[westExposedCell] ?? 0),
  'west-authored fire must prefer the east protected side of the wall',
);
assert.equal(westField.field.protectedThreatIndex[eastProtectedCell], 0);

// Canonical unit contacts still drive directional terrain/reverse-slope semantics from subjective x/y.
blue.tacticalKnowledge.threats = canonicalA.threats.map((threat) => ({ ...threat }));
blue.tacticalKnowledge.revision += 1;
const reverseSlopeReport = buildSoldierAwarenessReport(state, blue);
const reverseSlopeCells = reverseSlopeReport.cells.filter((cell) => (
  cell.reverseSlopeQuality > 0
  && cell.protectedAgainstThreatId === unitThreatA.id
));
assert.ok(reverseSlopeCells.length > 0, 'canonical unit contact must preserve reverse-slope protection evidence');

console.log(JSON.stringify({
  map: `${WIDTH}x${HEIGHT}`,
  observerPositionInvariance: {
    canonicalKey: canonicalA.key,
    worldKey: worldKey(canonicalA),
    rasterDigest: fieldA.rasterDigest,
    byteIdentical: {
      danger: true,
      safety: true,
      dangerPixels: true,
      protectedThreatIndex: true,
    },
  },
  observerRelativeMemoryChanges: {
    rawDirection: [unitThreatA.directionDegrees, unitThreatB.directionDegrees],
    rawRange: [unitThreatA.rangeCells, unitThreatB.rangeCells],
    canonicalPayloadEqual: true,
  },
  directionalEvidence: {
    eastKey: eastEvidence.key,
    westKey: westEvidence.key,
    eastRasterDigest: eastField.rasterDigest,
    westRasterDigest: westField.rasterDigest,
    protectedSideFlipped: true,
  },
  hiddenHostile: {
    objectivePosition: red.position,
    subjectivePosition: { x: unitThreatA.x, y: unitThreatA.y },
    canonicalKeyUnchanged: true,
  },
  reverseSlope: {
    qualifyingCells: reverseSlopeCells.length,
    protectedAgainstThreatId: unitThreatA.id,
  },
}, null, 2));

function workerSnapshot(
  jobId: number,
  canonical: CanonicalWorldThreatSetSnapshot,
  compatibilityOrigin: { x: number; y: number },
): AwarenessWorkerBuildSnapshot {
  return {
    jobId,
    rasterKey: worldKey(canonical),
    canonicalThreatKey: canonical.key,
    mapKey: 'semantic-map',
    unitId: blue.id,
    posture: blue.behaviorRuntime.posture,
    compatibilityOrigin,
    threats: canonical.threats,
    knowledgeRevision: blue.tacticalKnowledge.revision,
    orderTarget: null,
    finalExact: true,
  };
}

function worldKey(canonical: CanonicalWorldThreatSetSnapshot): string {
  return [
    'map:semantic-map',
    `unit:${blue.id}`,
    `posture:${blue.behaviorRuntime.posture}`,
    `canonicalThreats:${canonical.key}`,
  ].join(';');
}

function unit(id: string): UnitModel {
  const found = state.units.find((item) => item.id === id);
  assert.ok(found, `unit ${id} must exist`);
  return found;
}

function unitContact(
  x: number,
  y: number,
  directionDegrees: number,
  rangeCells: number,
): KnownThreatMemory {
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
    directionDegrees,
    arcDegrees: 160,
    rangeCells,
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

function directionalEvidence(
  id: string,
  x: number,
  y: number,
  directionDegrees: number,
): KnownThreatMemory {
  return {
    id,
    labelRu: 'направленный входящий огонь',
    mode: 'directional_fire',
    x,
    y,
    radiusCells: 0,
    widthCells: 0,
    heightCells: 0,
    rotationDegrees: 0,
    strength: 92,
    suppression: 60,
    stressPerSecond: 18,
    directionDegrees,
    arcDegrees: 55,
    rangeCells: 180,
    minRangeCells: 0,
    falloffPercent: 45,
    confidence: 90,
    uncertaintyCells: 1,
    source: 'fire_pressure',
    visibleNow: false,
    lastSeenSeconds: -1,
    lastUpdatedSeconds: 0,
    evidenceCount: 3,
    lastEvidenceSeconds: 0,
  };
}

function cellIndex(x: number, y: number): number {
  return y * WIDTH + x;
}

function assertTypedArrayEqual(
  left: ArrayLike<number>,
  right: ArrayLike<number>,
  label: string,
): void {
  assert.equal(left.length, right.length, `${label} length mismatch`);
  for (let index = 0; index < left.length; index += 1) {
    assert.equal(left[index], right[index], `${label} differs at byte/value ${index}`);
  }
}
