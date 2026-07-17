import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { normalizeMap, type TacticalMapData } from '../src/core/map/MapModel';
import { markMapCellsDirty } from '../src/core/map/MapRuntimeState';
import { createInitialState } from '../src/core/simulation/SimulationState';
import { computeLineOfSight } from '../src/core/visibility/LineOfSight';
import { clearPerceptionPointVisibilityCache, evaluatePointVisibility, getPerceptionGeometryPreparationDiagnostics } from '../src/core/visibility/PointVisibility';
import { getVisibilityGeometryField, readVisibilityGeometryCell } from '../src/core/visibility/VisibilityGeometryField';
import type { UnitPosture } from '../src/core/behavior/BehaviorModel';
import type { AttentionSample } from '../src/core/perception/AttentionModel';

const TRANSMISSION_TOLERANCE = 0.22;
const attention: AttentionSample = { zone: 'focus', weight: 1, bearingRadians: 0, angularDifferenceRadians: 0 };
const cases: Array<{
  name: string;
  map: TacticalMapData;
  origin: { x: number; y: number };
  target: { x: number; y: number };
  posture: UnitPosture;
  targetHeightMeters: number;
}> = [
  {
    name: 'open-standing',
    map: baseMap(), origin: { x: 2.5, y: 3.5 }, target: { x: 10.5, y: 3.5 }, posture: 'standing', targetHeightMeters: 1.4,
  },
  {
    name: 'structure-shadow',
    map: { ...baseMap(), objects: [{ id: 'wall', kind: 'structure', x: 5, y: 2, widthCells: 1, heightCells: 3, rotationRadians: 0, losHeightMeters: 5 }] },
    origin: { x: 2.5, y: 3.5 }, target: { x: 10.5, y: 3.5 }, posture: 'standing', targetHeightMeters: 1.4,
  },
  {
    name: 'terrain-ridge',
    map: { ...baseMap(), cellRects: [{ x1: 5, x2: 7, y1: 0, y2: 6, height: 4 }] },
    origin: { x: 2.5, y: 3.5 }, target: { x: 10.5, y: 3.5 }, posture: 'standing', targetHeightMeters: 1.4,
  },
  {
    name: 'sparse-vegetation',
    map: { ...baseMap(), metersPerCell: 2, cellRects: [{ x1: 4, x2: 7, y1: 2, y2: 4, forest: 1 }] },
    origin: { x: 2.5, y: 3.5 }, target: { x: 10.5, y: 3.5 }, posture: 'standing', targetHeightMeters: 1.4,
  },
  {
    name: 'crouched-height-difference',
    map: baseMap(), origin: { x: 2.5, y: 2.5 }, target: { x: 9.5, y: 4.5 }, posture: 'crouched', targetHeightMeters: 2.2,
  },
  {
    name: 'prone-open',
    map: baseMap(), origin: { x: 3.5, y: 5.5 }, target: { x: 9.5, y: 5.5 }, posture: 'prone', targetHeightMeters: 0.35,
  },
];

const results = cases.map((fixture) => compare(fixture));
for (const result of results) {
  assert.equal(result.pointBlocked, result.referenceBlocked, `${result.name}: blocked/unblocked parity`);
  assert.ok(result.transmissionDelta <= TRANSMISSION_TOLERANCE, `${result.name}: transmission delta ${result.transmissionDelta} exceeds ${TRANSMISSION_TOLERANCE}`);
}

const movingFixture = cases[0]!;
const movingA = compare(movingFixture);
const movingB = compare({ ...movingFixture, name: 'moving-observer-target', origin: { x: 3.5, y: 3.5 }, target: { x: 11.5, y: 4.5 } });
assert.equal(movingB.pointBlocked, movingB.referenceBlocked);
assert.notEqual(movingA.pointKey, movingB.pointKey, 'moving observer/target must create a distinct point-probe cache identity');

const invalidationMap = normalizeMap(baseMap());
const invalidationState = createInitialState(invalidationMap, [unitData('invalidate-observer', 2, 3)]);
const invalidationObserver = invalidationState.units[0]!;
invalidationState.simulationStep = 1;
const first = evaluatePointVisibility(invalidationState, invalidationObserver, { x: 10.5, y: 3.5 }, 1.4, attention);
assert.ok(first);
const before = getPerceptionGeometryPreparationDiagnostics(invalidationState);
invalidationState.map.cells[3 * invalidationState.map.width + 6]!.height = 4;
markMapCellsDirty(invalidationState.map, 'height', { minX: 6, minY: 3, maxX: 6, maxY: 3 });
invalidationState.simulationStep += 1;
const second = evaluatePointVisibility(invalidationState, invalidationObserver, { x: 10.5, y: 3.5 }, 1.4, attention);
assert.ok(second);
const after = getPerceptionGeometryPreparationDiagnostics(invalidationState);
assert.ok(after.preparationCount > before.preparationCount, 'map revision must invalidate the point-LOS cache');
clearPerceptionPointVisibilityCache(invalidationState);

const hiddenKnowledgeRevision = invalidationObserver.tacticalKnowledge.revision;
const hiddenTarget = invalidationState.units[0]!.position;
hiddenTarget.x += 0.2;
assert.equal(invalidationObserver.tacticalKnowledge.revision, hiddenKnowledgeRevision, 'point LOS geometry must not mutate subjective hidden-contact knowledge');

const evidence = {
  transmissionTolerance: TRANSMISSION_TOLERANCE,
  cases: [...results, movingB],
  mapRevisionInvalidatedCache: true,
  postureCases: ['standing', 'crouched', 'prone'],
  movingObserverTargetParity: true,
  hiddenContactSemanticsPreserved: true,
};
writeEvidence('point-los-parity.json', evidence);
console.log(`Point-LOS differential parity smoke passed: ${evidence.cases.length} fixed/moving scenes, transmission tolerance ${TRANSMISSION_TOLERANCE}.`);

function compare(fixture: typeof cases[number]) {
  const map = normalizeMap(fixture.map);
  const state = createInitialState(map, [unitData(`observer-${fixture.name}`, fixture.origin.x - 0.5, fixture.origin.y - 0.5)]);
  const observer = state.units[0]!;
  observer.position = { ...fixture.origin };
  observer.behaviorRuntime.posture = fixture.posture;
  observer.attentionSettings.vision.maximumVisualRangeMeters = 2_000;
  state.simulationStep = 1;
  const point = computeLineOfSight(map, observer, fixture.target, fixture.targetHeightMeters);
  const field = getVisibilityGeometryField(map, {
    origin: fixture.origin,
    originHeightAboveGroundMeters: eyeHeight(fixture.posture),
    targetHeightAboveGroundMeters: fixture.targetHeightMeters,
    rangeCells: Math.max(map.width, map.height),
  });
  const reference = readVisibilityGeometryCell(field, fixture.target.x, fixture.target.y);
  const pointResult = evaluatePointVisibility(state, observer, fixture.target, fixture.targetHeightMeters, attention);
  assert.ok(pointResult || point.blocked, `${fixture.name}: point evaluation must return or be blocked`);
  const diagnostics = getPerceptionGeometryPreparationDiagnostics(state);
  return {
    name: fixture.name,
    pointBlocked: point.blocked,
    referenceBlocked: reference.hardBlocked,
    pointTransmission: round(point.visualTransmission),
    referenceTransmission: round(reference.visualTransmission),
    transmissionDelta: round(Math.abs(point.visualTransmission - reference.visualTransmission)),
    pointKey: `${fixture.origin.x}:${fixture.origin.y}:${fixture.target.x}:${fixture.target.y}:${fixture.posture}:${diagnostics.preparationCount}`,
  };
}

function baseMap(): TacticalMapData {
  return { width: 14, height: 7, cellSize: 8, metersPerCell: 2, defaultTerrain: 'field', defaultHeight: 0, objects: [] };
}

function unitData(id: string, x: number, y: number) {
  return { id, label: id, labelRu: id, type: 'scout_team' as const, side: 'blue' as const, aiControl: 'manual' as const, x, y, viewRangeCells: 100 };
}

function eyeHeight(posture: UnitPosture): number {
  return posture === 'prone' ? 0.35 : posture === 'crouched' ? 1.1 : 1.7;
}
function round(value: number): number { return Math.round(value * 1000) / 1000; }
function writeEvidence(name: string, value: unknown): void {
  const directory = process.env.PERFORMANCE_EVIDENCE_DIR;
  if (!directory) return;
  mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(directory, name), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}
