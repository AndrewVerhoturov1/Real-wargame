import assert from 'node:assert/strict';
import { buildStaticTacticalCandidateIndex } from '../src/core/tactical/static/StaticTacticalCandidateIndex';

const width = 32;
const height = 16;
const sectorCount = 8;
const cellCount = width * height;
const observationPotential = new Uint8Array(cellCount);
const defensePotential = new Uint8Array(cellCount);
const firingPotential = new Uint8Array(cellCount);
const observationByDirection = new Uint8Array(cellCount * sectorCount);
const protectionByDirection = new Uint8Array(cellCount * sectorCount);
const firingByDirection = new Uint8Array(cellCount * sectorCount);
const availablePostureMask = new Uint8Array(cellCount).fill(7);

function peak(x: number, y: number, score: number, sector: number): void {
  const index = y * width + x;
  observationPotential[index] = score;
  defensePotential[index] = score;
  firingPotential[index] = score;
  observationByDirection[index * sectorCount + sector] = 255;
  protectionByDirection[index * sectorCount + sector] = 255;
  firingByDirection[index * sectorCount + sector] = 255;
}

peak(4, 4, 220, 0);
peak(5, 4, 215, 4); // Close, but directionally specialized in the opposite sector.
peak(10, 10, 210, 2);
peak(20, 5, 205, 6);
peak(25, 10, 200, 1);

const index = buildStaticTacticalCandidateIndex({
  width,
  height,
  sectorCount,
  observationPotential,
  defensePotential,
  firingPotential,
  observationByDirection,
  protectionByDirection,
  firingByDirection,
  availablePostureMask,
}, {
  chunkSizeCells: 16,
  maximumCandidatesPerKindPerChunk: 3,
  minimumSeparationCells: 3,
  observationThreshold: 80,
  defenseThreshold: 80,
  firingThreshold: 80,
  directionalDiversityThreshold: 40,
});

assert.equal(index.chunksX, 2);
assert.equal(index.chunksY, 1);
assert.ok(index.observation.cellIndices.length <= 6, 'chunk cap must bound the packed index');
assert.ok(index.defense.cellIndices.length <= 6, 'defense chunk cap must be applied independently');
assert.ok(index.firing.cellIndices.length <= 6, 'firing chunk cap must be applied independently');
assert.ok(index.observation.cellIndices.includes(4 + 4 * width));
assert.ok(index.observation.cellIndices.includes(5 + 4 * width), 'nearby opposite-direction variant must survive');
assert.equal(index.observation.chunkOffsets.length, 2);
assert.equal(index.observation.chunkCounts.length, 2);

console.log('static tactical candidate index smoke: ok');
