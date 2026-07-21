import assert from 'node:assert/strict';
import { normalizeMap } from '../src/core/map/MapModel';
import { searchObjectiveAwareTacticalPositions } from '../src/core/tactical/ObjectiveAwareTacticalPositionSearch';
import type {
  GeneralizedTacticalPositionFieldView,
  GeneralizedTacticalPositionSearchRequest,
} from '../src/core/tactical/GeneralizedTacticalPositionSearch';
import { buildHighQualityStaticTacticalPositionBasis } from '../src/core/tactical/static/HighQualityStaticTacticalPositionBuilder';
import { buildStaticTacticalCandidateIndex } from '../src/core/tactical/static/StaticTacticalCandidateIndex';
import { createStaticTacticalPositionBasisIdentity } from '../src/core/tactical/static/StaticTacticalPositionIdentity';
import { normalizeStaticTacticalPositionSettings } from '../src/core/tactical/static/StaticTacticalPositionSettings';

const map = normalizeMap({
  width: 32,
  height: 8,
  cellSize: 4,
  metersPerCell: 1,
  defaultTerrain: 'field',
  defaultHeight: 0,
});
const settings = normalizeStaticTacticalPositionSettings({
  index: {
    chunkSizeCells: 16,
    observationThreshold: 0,
    defenseThreshold: 0,
    firingThreshold: 0,
    directionalDiversityThreshold: 0,
    minimumSeparationCells: 0,
    maximumCandidatesPerKindPerChunk: 16,
  },
});
const identity = createStaticTacticalPositionBasisIdentity(map, settings);
const builtBasis = buildHighQualityStaticTacticalPositionBasis(map, identity, settings).snapshot;
const cellCount = map.width * map.height;
const farCell = 4 * map.width + 4;
const nearCell = 4 * map.width + 24;
const potentials = new Uint8Array(cellCount);
potentials[farCell] = 255;
potentials[nearCell] = 255;
const directions = new Uint8Array(cellCount * settings.sectors.count);
directions[farCell * settings.sectors.count] = 255;
directions[nearCell * settings.sectors.count] = 255;
const postureMask = new Uint8Array(cellCount);
postureMask[farCell] = 7;
postureMask[nearCell] = 7;
const basis = {
  ...builtBasis,
  candidateIndex: buildStaticTacticalCandidateIndex({
    width: map.width,
    height: map.height,
    sectorCount: settings.sectors.count,
    observationPotential: potentials,
    defensePotential: potentials,
    firingPotential: potentials,
    observationByDirection: directions,
    protectionByDirection: directions,
    firingByDirection: directions,
    availablePostureMask: postureMask,
  }, settings.index),
};
const field: GeneralizedTacticalPositionFieldView = {
  width: map.width,
  height: map.height,
  metersPerCell: map.metersPerCell,
  passable: new Uint8Array(cellCount).fill(1),
  movementCost: new Float32Array(cellCount).fill(1),
  danger: new Uint8Array(cellCount).fill(5),
  suppression: new Uint8Array(cellCount),
  concealment: new Uint8Array(cellCount).fill(20),
  safety: new Uint8Array(cellCount).fill(85),
  expectedProtectionAgainstThreat: new Uint8Array(cellCount).fill(25),
  uncertainty: new Uint8Array(cellCount).fill(5),
  reverseSlopeQuality: new Uint8Array(cellCount),
  forwardSlopeRisk: new Uint8Array(cellCount),
  staticProtectionByPosture: {
    standing: new Uint8Array(cellCount).fill(30),
    crouched: new Uint8Array(cellCount).fill(40),
    prone: new Uint8Array(cellCount).fill(50),
  },
  staticBasis: basis,
};

const advance = run('advance_to_threat');
const withdraw = run('withdraw_from_threat');
assert.equal(advance.candidates.length, 1);
assert.equal(withdraw.candidates.length, 1);
assert.ok(
  advance.candidates[0]!.position.x > 20,
  `advance must select the near-threat side, got x=${advance.candidates[0]!.position.x}`,
);
assert.ok(
  withdraw.candidates[0]!.position.x < 10,
  `withdraw must select the far side, got x=${withdraw.candidates[0]!.position.x}`,
);
assert.notDeepEqual(
  advance.candidates[0]!.position,
  withdraw.candidates[0]!.position,
  'advance and withdraw must not select the same defense position on a symmetric field',
);

console.log('tactical position objective ranking smoke: ok');

function run(objective: GeneralizedTacticalPositionSearchRequest['objective']) {
  return searchObjectiveAwareTacticalPositions(field, {
    requestIdentity: `objective:${objective}`,
    kind: 'defense',
    objective,
    origin: { x: 16.5, y: 4.5 },
    currentPosture: 'standing',
    orderTarget: null,
    referenceThreatId: 'known-threat',
    referenceThreatPosition: { x: 28.5, y: 4.5 },
    target: {
      mode: 'sector',
      bearingRadians: 0,
      arcRadians: Math.PI / 3,
    },
    searchRadiusMeters: 26,
    maxRouteExpansions: 512,
    maxCandidates: 1,
    minimumSeparationMeters: 1,
    limits: {
      preliminaryCandidates: 16,
      exactCandidates: 8,
      exactRayLimit: 0,
      maxPositionDanger: 100,
      minimumLineQuality: 0,
      maximumRouteCost: 10000,
    },
  });
}
