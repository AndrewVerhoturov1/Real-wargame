import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeMap, type TacticalMapData } from '../src/core/map/MapModel';
import {
  assertStaticTacticalPositionBasisShape,
  readStaticTacticalDirectionalValue,
  readStaticTacticalPostureValue,
} from '../src/core/tactical/static/StaticTacticalPositionBasis';
import { buildHighQualityStaticTacticalPositionBasis } from '../src/core/tactical/static/HighQualityStaticTacticalPositionBuilder';
import {
  createStaticTacticalPositionBasisIdentity,
  STATIC_TACTICAL_POSITION_ALGORITHM_VERSION,
} from '../src/core/tactical/static/StaticTacticalPositionIdentity';
import { createDefaultStaticTacticalPositionSettings } from '../src/core/tactical/static/StaticTacticalPositionSettings';

const settings = createDefaultStaticTacticalPositionSettings();

verifyQualityBuilderIsTheCanonicalRuntimePath();
verifyMinimalAndIrregularMaps();
verifyDeterminismAndIndependentFields();
verifyWallDirectionAndPostures();
verifyVegetationAndRelief();
verifyClosedAndOpenMaps();

console.log('static tactical position basis smoke: ok');

function verifyQualityBuilderIsTheCanonicalRuntimePath(): void {
  const worker = readFileSync('src/workers/StaticTacticalPositionWorker.ts', 'utf8');
  const service = readFileSync('src/core/tactical/static/StaticTacticalPositionService.ts', 'utf8');
  assert.ok(worker.includes('buildHighQualityStaticTacticalPositionBasis'), 'worker must use the quality-first builder');
  assert.ok(service.includes('buildHighQualityStaticTacticalPositionBasis'), 'synchronous fallback must match the worker algorithm');
  assert.ok(STATIC_TACTICAL_POSITION_ALGORITHM_VERSION >= 2, 'quality-first output must have a new exact algorithm identity');
}

function verifyMinimalAndIrregularMaps(): void {
  const minimal = build(openMap(1, 1));
  assertStaticTacticalPositionBasisShape(minimal);
  assert.equal(minimal.observationPotential.length, 1);
  assert.equal(minimal.observationByDirection.length, settings.sectors.count);
  assert.equal(minimal.candidateIndex.chunksX, 1);
  assert.equal(minimal.candidateIndex.chunksY, 1);

  const irregular = build(openMap(17, 19));
  assertStaticTacticalPositionBasisShape(irregular);
  assert.equal(irregular.candidateIndex.chunksX, 2);
  assert.equal(irregular.candidateIndex.chunksY, 2);
  assertChunkCaps(irregular);
}

function verifyDeterminismAndIndependentFields(): void {
  const map = normalizeMap({
    ...openMapData(9, 7),
    cellRects: [
      { x1: 5, x2: 8, y1: 0, y2: 6, terrain: 'forest', forest: 2 },
      { x1: 2, x2: 3, y1: 2, y2: 4, terrain: 'rough', height: 2 },
    ],
    objects: [{
      id: 'deterministic-wall', kind: 'structure', x: 4, y: 3,
      widthCells: 1, heightCells: 5, losHeightMeters: 2.4,
    }],
  });
  const first = build(map);
  const second = build(map);
  for (const key of cellAndDirectionalArrayKeys()) {
    assert.deepEqual(first[key], second[key], `${key} must be deterministic`);
  }
  assert.deepEqual(first.candidateIndex, second.candidateIndex, 'candidate index must be deterministic');
  assert.notEqual(first.observationPotential.buffer, first.defensePotential.buffer);
  assert.notEqual(first.observationPotential.buffer, first.firingPotential.buffer);
  assert.ok(
    differs(first.observationPotential, first.defensePotential)
      || differs(first.observationPotential, first.firingPotential),
    'observation, defense and firing must not collapse into one field',
  );
}

function verifyWallDirectionAndPostures(): void {
  const map = normalizeMap({
    ...openMapData(11, 7),
    objects: [{
      id: 'east-low-wall', kind: 'cover', x: 6, y: 3,
      widthCells: 1, heightCells: 5, losHeightMeters: 1.15,
      coverProtection: 90, coverReliability: 95, penetrable: false,
    }],
  });
  const basis = build(map);
  const cellIndex = 3 * map.width + 4;
  const east = 0;
  const west = 4;
  const eastProtection = readStaticTacticalDirectionalValue(basis.protectionByDirection, basis, cellIndex, east);
  const westProtection = readStaticTacticalDirectionalValue(basis.protectionByDirection, basis, cellIndex, west);
  const eastObservation = readStaticTacticalDirectionalValue(basis.observationByDirection, basis, cellIndex, east);
  const westObservation = readStaticTacticalDirectionalValue(basis.observationByDirection, basis, cellIndex, west);
  const eastFiring = readStaticTacticalDirectionalValue(basis.firingByDirection, basis, cellIndex, east);
  const westFiring = readStaticTacticalDirectionalValue(basis.firingByDirection, basis, cellIndex, west);
  assert.ok(eastProtection > westProtection, 'wall-facing defense must exceed the open side');
  assert.ok(eastObservation < westObservation, 'wall must reduce observation in its direction');
  assert.ok(eastFiring < westFiring, 'wall must reduce firing in its direction');

  const observationByPosture = [
    readStaticTacticalPostureValue(basis.observationByPosture, cellIndex, 'standing'),
    readStaticTacticalPostureValue(basis.observationByPosture, cellIndex, 'crouched'),
    readStaticTacticalPostureValue(basis.observationByPosture, cellIndex, 'prone'),
  ];
  const firingByPosture = [
    readStaticTacticalPostureValue(basis.firingByPosture, cellIndex, 'standing'),
    readStaticTacticalPostureValue(basis.firingByPosture, cellIndex, 'crouched'),
    readStaticTacticalPostureValue(basis.firingByPosture, cellIndex, 'prone'),
  ];
  assert.ok(new Set(observationByPosture).size > 1 || new Set(firingByPosture).size > 1, 'postures must remain physically distinct near low cover');
}

function verifyVegetationAndRelief(): void {
  const open = build(openMap(9, 9));
  const forestMap = normalizeMap({
    ...openMapData(9, 9),
    cellRects: [{ x1: 3, x2: 5, y1: 3, y2: 5, terrain: 'forest', forest: 2 }],
  });
  const forest = build(forestMap);
  const center = 4 * 9 + 4;
  assert.ok(forest.concealment[center]! > open.concealment[center]!, 'vegetation must increase local concealment');
  assert.ok(
    forest.observationPotential[center] !== open.observationPotential[center]
      || forest.firingPotential[center] !== open.firingPotential[center],
    'vegetation must affect at least one tactical field',
  );

  const reliefMap = normalizeMap({
    ...openMapData(9, 9),
    heightMap: Array.from({ length: 9 }, (_, y) => Array.from({ length: 9 }, (_, x) => (
      x === 4 && y === 4 ? 4 : x >= 4 ? 2 : 0
    ))),
  });
  const relief = build(reliefMap);
  assert.ok(relief.reverseSlopeByDirection.some((value) => value > 0), 'non-flat terrain must create reverse-slope directions');
  assert.ok(open.reverseSlopeByDirection.every((value) => value === 0), 'flat terrain must not invent reverse slopes');
  assert.ok(relief.observationPotential[center]! < 255, 'an exposed summit must not receive an unbounded maximum observation score');
}

function verifyClosedAndOpenMaps(): void {
  const open = build(openMap(8, 8));
  const center = 4 * 8 + 4;
  assert.ok(open.defensePotential[center]! < 230, 'a fully open cell must not receive near-maximum defense');

  const closed = build(normalizeMap({
    ...openMapData(8, 8),
    defaultTerrain: 'water',
  }));
  assert.ok(closed.availablePostureMask.every((value) => value === 0));
  assert.equal(closed.candidateIndex.observation.cellIndices.length, 0);
  assert.equal(closed.candidateIndex.defense.cellIndices.length, 0);
  assert.equal(closed.candidateIndex.firing.cellIndices.length, 0);
  assertChunkCaps(open);
}

function build(map: ReturnType<typeof normalizeMap>) {
  const identity = createStaticTacticalPositionBasisIdentity(map, settings);
  return buildHighQualityStaticTacticalPositionBasis(map, identity, settings).snapshot;
}

function openMap(width: number, height: number) {
  return normalizeMap(openMapData(width, height));
}

function openMapData(width: number, height: number): TacticalMapData {
  return {
    width,
    height,
    cellSize: 4,
    metersPerCell: 2,
    defaultTerrain: 'field',
    defaultHeight: 0,
  };
}

function assertChunkCaps(basis: ReturnType<typeof build>): void {
  const maximum = basis.candidateIndex.chunksX
    * basis.candidateIndex.chunksY
    * basis.settings.index.maximumCandidatesPerKindPerChunk;
  assert.ok(basis.candidateIndex.observation.cellIndices.length <= maximum);
  assert.ok(basis.candidateIndex.defense.cellIndices.length <= maximum);
  assert.ok(basis.candidateIndex.firing.cellIndices.length <= maximum);
}

function differs(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return true;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return true;
  }
  return false;
}

function cellAndDirectionalArrayKeys(): readonly Array<
  | 'observationPotential'
  | 'defensePotential'
  | 'firingPotential'
  | 'observationByDirection'
  | 'protectionByDirection'
  | 'firingByDirection'
  | 'availablePostureMask'
  | 'concealment'
  | 'staticProtectionByPosture'
  | 'observationByPosture'
  | 'firingByPosture'
  | 'surfaceSuitability'
  | 'reverseSlopeByDirection'
  | 'immediateFireClearanceByDirection'
> {
  return [
    'observationPotential', 'defensePotential', 'firingPotential',
    'observationByDirection', 'protectionByDirection', 'firingByDirection',
    'availablePostureMask', 'concealment', 'staticProtectionByPosture',
    'observationByPosture', 'firingByPosture', 'surfaceSuitability',
    'reverseSlopeByDirection', 'immediateFireClearanceByDirection',
  ];
}
