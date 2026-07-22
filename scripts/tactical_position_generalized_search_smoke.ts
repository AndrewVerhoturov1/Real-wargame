import assert from 'node:assert/strict';
import { normalizeMap } from '../src/core/map/MapModel';
import {
  searchGeneralizedTacticalPositions,
  type GeneralizedTacticalPositionFieldView,
  type GeneralizedTacticalPositionSearchRequest,
} from '../src/core/tactical/GeneralizedTacticalPositionSearch';
import { buildHighQualityStaticTacticalPositionBasis } from '../src/core/tactical/static/HighQualityStaticTacticalPositionBuilder';
import { buildStaticTacticalCandidateIndex } from '../src/core/tactical/static/StaticTacticalCandidateIndex';
import { createStaticTacticalPositionBasisIdentity } from '../src/core/tactical/static/StaticTacticalPositionIdentity';
import { normalizeStaticTacticalPositionSettings } from '../src/core/tactical/static/StaticTacticalPositionSettings';

const map = normalizeMap({
  width: 12,
  height: 12,
  cellSize: 4,
  metersPerCell: 2,
  defaultTerrain: 'field',
  defaultHeight: 0,
});
const settings = normalizeStaticTacticalPositionSettings({
  index: {
    observationThreshold: 0,
    defenseThreshold: 0,
    firingThreshold: 0,
    directionalDiversityThreshold: 0,
    minimumSeparationCells: 0,
    maximumCandidatesPerKindPerChunk: 32,
  },
});
const identity = createStaticTacticalPositionBasisIdentity(map, settings);
const builtBasis = buildHighQualityStaticTacticalPositionBasis(map, identity, settings).snapshot;
const cellCount = map.width * map.height;
const indexedCell = 5 * map.width + 6;
const indexedPotential = new Uint8Array(cellCount);
indexedPotential[indexedCell] = 255;
const indexedDirections = new Uint8Array(cellCount * settings.sectors.count);
indexedDirections[indexedCell * settings.sectors.count] = 255;
const indexedPostureMask = new Uint8Array(cellCount);
indexedPostureMask[indexedCell] = 7;
const indexedPostures = new Uint8Array(cellCount * 3);
indexedPostures.fill(255, indexedCell * 3, indexedCell * 3 + 3);
const basis = {
  ...builtBasis,
  observationByDirection: indexedDirections,
  protectionByDirection: indexedDirections,
  firingByDirection: indexedDirections,
  availablePostureMask: indexedPostureMask,
  staticProtectionByPosture: indexedPostures,
  observationByPosture: indexedPostures,
  firingByPosture: indexedPostures,
  candidateIndex: buildStaticTacticalCandidateIndex({
    width: map.width,
    height: map.height,
    sectorCount: settings.sectors.count,
    observationPotential: indexedPotential,
    defensePotential: indexedPotential,
    firingPotential: indexedPotential,
    observationByDirection: indexedDirections,
    protectionByDirection: indexedDirections,
    firingByDirection: indexedDirections,
    availablePostureMask: indexedPostureMask,
  }, settings.index),
};
const field: GeneralizedTacticalPositionFieldView = {
  width: map.width,
  height: map.height,
  metersPerCell: map.metersPerCell,
  passable: new Uint8Array(cellCount).fill(1),
  movementCost: new Float32Array(cellCount).fill(1),
  danger: new Uint8Array(cellCount).fill(8),
  suppression: new Uint8Array(cellCount),
  concealment: new Uint8Array(cellCount).fill(20),
  safety: new Uint8Array(cellCount).fill(80),
  expectedProtectionAgainstThreat: new Uint8Array(cellCount).fill(15),
  uncertainty: new Uint8Array(cellCount).fill(5),
  reverseSlopeQuality: new Uint8Array(cellCount),
  forwardSlopeRisk: new Uint8Array(cellCount),
  staticProtectionByPosture: {
    standing: new Uint8Array(cellCount).fill(20),
    crouched: new Uint8Array(cellCount).fill(30),
    prone: new Uint8Array(cellCount).fill(40),
  },
  staticBasis: basis,
  map,
};

const observation = run('observation');
const defense = run('defense');
const firing = run('firing');
const cover = run('cover');
for (const [label, result] of Object.entries({ observation, defense, firing, cover })) {
  assert.ok(result.candidates.length > 0, `${label} sector search must work without exact rays`);
  assert.ok(result.candidates.length <= 4);
  assert.ok((result.diagnostics.indexedCandidates ?? 0) < cellCount, `${label} must not scan every map cell`);
  assert.ok((result.diagnostics.preliminaryCandidates ?? 0) <= 8);
  assert.ok((result.diagnostics.exactCandidates ?? 0) <= 4);
  assert.equal(result.diagnostics.exactRays, 0);
  assert.ok(result.diagnostics.routeExpandedCells <= 48);
}
assert.ok(cover.candidates.every((candidate) => candidate.kind === 'defense'));
assert.deepEqual(
  cover.candidates.map((candidate) => candidate.position),
  defense.candidates.map((candidate) => candidate.position),
  'legacy cover must use the defense candidate path',
);

console.log('tactical position generalized search smoke: ok');

function run(kind: GeneralizedTacticalPositionSearchRequest['kind']) {
  return searchGeneralizedTacticalPositions(field, {
    requestIdentity: `bounded:${kind}`,
    kind,
    objective: 'balanced',
    origin: { x: 5.5, y: 5.5 },
    currentPosture: 'standing',
    orderTarget: null,
    referenceThreatId: null,
    referenceThreatPosition: null,
    target: {
      mode: 'sector',
      bearingRadians: 0,
      arcRadians: Math.PI / 2,
    },
    searchRadiusMeters: 20,
    maxRouteExpansions: 48,
    maxCandidates: 4,
    minimumSeparationMeters: 1,
    limits: {
      preliminaryCandidates: 8,
      exactCandidates: 4,
      exactRayLimit: 0,
      maxPositionDanger: 100,
      minimumLineQuality: 0,
      maximumRouteCost: 10000,
    },
  });
}
