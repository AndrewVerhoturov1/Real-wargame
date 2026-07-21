import type { StaticTacticalPositionKind } from './StaticTacticalPositionBasis';
import type { StaticTacticalCandidateIndexSettings } from './StaticTacticalPositionSettings';

export interface StaticTacticalCandidateListSnapshot {
  readonly chunkOffsets: Uint32Array;
  readonly chunkCounts: Uint16Array;
  readonly cellIndices: Uint32Array;
  readonly scores: Uint8Array;
  readonly postureMasks: Uint8Array;
  readonly dominantSectorMasks: Uint32Array;
}

export interface StaticTacticalCandidateIndexSnapshot {
  readonly version: 1;
  readonly width: number;
  readonly height: number;
  readonly sectorCount: number;
  readonly chunkSizeCells: number;
  readonly chunksX: number;
  readonly chunksY: number;
  readonly observation: StaticTacticalCandidateListSnapshot;
  readonly defense: StaticTacticalCandidateListSnapshot;
  readonly firing: StaticTacticalCandidateListSnapshot;
}

export interface StaticTacticalCandidateIndexInput {
  readonly width: number;
  readonly height: number;
  readonly sectorCount: number;
  readonly observationPotential: Uint8Array;
  readonly defensePotential: Uint8Array;
  readonly firingPotential: Uint8Array;
  readonly observationByDirection: Uint8Array;
  readonly protectionByDirection: Uint8Array;
  readonly firingByDirection: Uint8Array;
  readonly availablePostureMask: Uint8Array;
}

export interface StaticTacticalCandidateView {
  readonly cellIndex: number;
  readonly score: number;
  readonly postureMask: number;
  readonly dominantSectorMask: number;
}

interface MutableCandidate {
  readonly cellIndex: number;
  readonly x: number;
  readonly y: number;
  readonly score: number;
  readonly postureMask: number;
  readonly dominantSectorMask: number;
}

export function buildStaticTacticalCandidateIndex(
  input: StaticTacticalCandidateIndexInput,
  settings: StaticTacticalCandidateIndexSettings,
): StaticTacticalCandidateIndexSnapshot {
  assertInput(input);
  const chunkSizeCells = clampInt(settings.chunkSizeCells, 4, 64);
  const chunksX = Math.ceil(input.width / chunkSizeCells);
  const chunksY = Math.ceil(input.height / chunkSizeCells);
  return Object.freeze({
    version: 1,
    width: input.width,
    height: input.height,
    sectorCount: input.sectorCount,
    chunkSizeCells,
    chunksX,
    chunksY,
    observation: buildKindList(input, settings, 'observation', chunksX, chunksY, chunkSizeCells),
    defense: buildKindList(input, settings, 'defense', chunksX, chunksY, chunkSizeCells),
    firing: buildKindList(input, settings, 'firing', chunksX, chunksY, chunkSizeCells),
  });
}

export function createEmptyStaticTacticalCandidateIndex(
  width: number,
  height: number,
  sectorCount: number,
  chunkSizeCells = 16,
): StaticTacticalCandidateIndexSnapshot {
  const chunksX = Math.ceil(width / chunkSizeCells);
  const chunksY = Math.ceil(height / chunkSizeCells);
  const empty = emptyList(chunksX * chunksY);
  return Object.freeze({
    version: 1,
    width,
    height,
    sectorCount,
    chunkSizeCells,
    chunksX,
    chunksY,
    observation: empty,
    defense: emptyList(chunksX * chunksY),
    firing: emptyList(chunksX * chunksY),
  });
}

export function readStaticTacticalChunkCandidates(
  index: StaticTacticalCandidateIndexSnapshot,
  kind: StaticTacticalPositionKind,
  chunkX: number,
  chunkY: number,
): readonly StaticTacticalCandidateView[] {
  if (chunkX < 0 || chunkY < 0 || chunkX >= index.chunksX || chunkY >= index.chunksY) return [];
  const list = listForKind(index, kind);
  const chunkIndex = chunkY * index.chunksX + chunkX;
  const offset = list.chunkOffsets[chunkIndex] ?? 0;
  const count = list.chunkCounts[chunkIndex] ?? 0;
  const result: StaticTacticalCandidateView[] = new Array(count);
  for (let local = 0; local < count; local += 1) {
    const packedIndex = offset + local;
    result[local] = {
      cellIndex: list.cellIndices[packedIndex] ?? 0,
      score: list.scores[packedIndex] ?? 0,
      postureMask: list.postureMasks[packedIndex] ?? 0,
      dominantSectorMask: list.dominantSectorMasks[packedIndex] ?? 0,
    };
  }
  return result;
}

export function readStaticTacticalCandidatesInBounds(
  index: StaticTacticalCandidateIndexSnapshot,
  kind: StaticTacticalPositionKind,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): readonly StaticTacticalCandidateView[] {
  const firstChunkX = clampInt(Math.floor(minX / index.chunkSizeCells), 0, index.chunksX - 1);
  const firstChunkY = clampInt(Math.floor(minY / index.chunkSizeCells), 0, index.chunksY - 1);
  const lastChunkX = clampInt(Math.floor(maxX / index.chunkSizeCells), 0, index.chunksX - 1);
  const lastChunkY = clampInt(Math.floor(maxY / index.chunkSizeCells), 0, index.chunksY - 1);
  const result: StaticTacticalCandidateView[] = [];
  for (let chunkY = firstChunkY; chunkY <= lastChunkY; chunkY += 1) {
    for (let chunkX = firstChunkX; chunkX <= lastChunkX; chunkX += 1) {
      for (const candidate of readStaticTacticalChunkCandidates(index, kind, chunkX, chunkY)) {
        const x = candidate.cellIndex % index.width;
        const y = Math.floor(candidate.cellIndex / index.width);
        if (x < minX || y < minY || x > maxX || y > maxY) continue;
        result.push(candidate);
      }
    }
  }
  return result;
}

function buildKindList(
  input: StaticTacticalCandidateIndexInput,
  settings: StaticTacticalCandidateIndexSettings,
  kind: StaticTacticalPositionKind,
  chunksX: number,
  chunksY: number,
  chunkSizeCells: number,
): StaticTacticalCandidateListSnapshot {
  const chunkCount = chunksX * chunksY;
  const chunkCandidates: MutableCandidate[][] = Array.from({ length: chunkCount }, () => []);
  const potential = potentialForKind(input, kind);
  const directional = directionalForKind(input, kind);
  const threshold = thresholdForKind(settings, kind);
  const maximumPerChunk = clampInt(settings.maximumCandidatesPerKindPerChunk, 1, 32);
  const minimumSeparation = Math.max(0, settings.minimumSeparationCells);
  const diversityThreshold = clampByte(settings.directionalDiversityThreshold);

  for (let y = 0; y < input.height; y += 1) {
    for (let x = 0; x < input.width; x += 1) {
      const cellIndex = y * input.width + x;
      const score = potential[cellIndex] ?? 0;
      const postureMask = input.availablePostureMask[cellIndex] ?? 0;
      if (score < threshold || postureMask === 0) continue;
      const dominantSectorMask = buildDirectionalSignature(
        directional,
        cellIndex,
        input.sectorCount,
        diversityThreshold,
      );
      const scalarMaximum = isLocalMaximum(potential, input.width, input.height, x, y, score);
      const directionalMaximum = isDirectionalLocalMaximum(
        directional,
        input.width,
        input.height,
        input.sectorCount,
        x,
        y,
        dominantSectorMask,
      );
      if (!scalarMaximum && !directionalMaximum) continue;
      const chunkX = Math.floor(x / chunkSizeCells);
      const chunkY = Math.floor(y / chunkSizeCells);
      const chunkIndex = chunkY * chunksX + chunkX;
      chunkCandidates[chunkIndex]!.push({
        cellIndex,
        x,
        y,
        score,
        postureMask,
        dominantSectorMask,
      });
    }
  }

  const selectedByChunk: MutableCandidate[][] = new Array(chunkCount);
  let total = 0;
  for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex += 1) {
    const source = chunkCandidates[chunkIndex]!;
    source.sort((left, right) => right.score - left.score || left.cellIndex - right.cellIndex);
    const selected: MutableCandidate[] = [];
    for (const candidate of source) {
      if (selected.length >= maximumPerChunk) break;
      const conflicts = selected.some((existing) => {
        const distance = Math.hypot(existing.x - candidate.x, existing.y - candidate.y);
        if (distance >= minimumSeparation) return false;
        return directionalSimilarity(existing.dominantSectorMask, candidate.dominantSectorMask) >= 0.67;
      });
      if (conflicts) continue;
      selected.push(candidate);
    }
    selectedByChunk[chunkIndex] = selected;
    total += selected.length;
  }

  const chunkOffsets = new Uint32Array(chunkCount);
  const chunkCounts = new Uint16Array(chunkCount);
  const cellIndices = new Uint32Array(total);
  const scores = new Uint8Array(total);
  const postureMasks = new Uint8Array(total);
  const dominantSectorMasks = new Uint32Array(total);
  let offset = 0;
  for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex += 1) {
    const selected = selectedByChunk[chunkIndex] ?? [];
    chunkOffsets[chunkIndex] = offset;
    chunkCounts[chunkIndex] = selected.length;
    for (const candidate of selected) {
      cellIndices[offset] = candidate.cellIndex;
      scores[offset] = candidate.score;
      postureMasks[offset] = candidate.postureMask;
      dominantSectorMasks[offset] = candidate.dominantSectorMask;
      offset += 1;
    }
  }

  return Object.freeze({
    chunkOffsets,
    chunkCounts,
    cellIndices,
    scores,
    postureMasks,
    dominantSectorMasks,
  });
}

function potentialForKind(input: StaticTacticalCandidateIndexInput, kind: StaticTacticalPositionKind): Uint8Array {
  if (kind === 'observation') return input.observationPotential;
  if (kind === 'defense') return input.defensePotential;
  return input.firingPotential;
}

function directionalForKind(input: StaticTacticalCandidateIndexInput, kind: StaticTacticalPositionKind): Uint8Array {
  if (kind === 'observation') return input.observationByDirection;
  if (kind === 'defense') return input.protectionByDirection;
  return input.firingByDirection;
}

function thresholdForKind(settings: StaticTacticalCandidateIndexSettings, kind: StaticTacticalPositionKind): number {
  if (kind === 'observation') return clampByte(settings.observationThreshold);
  if (kind === 'defense') return clampByte(settings.defenseThreshold);
  return clampByte(settings.firingThreshold);
}

function isLocalMaximum(
  values: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
  score: number,
): boolean {
  for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
    for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
      if (offsetX === 0 && offsetY === 0) continue;
      const nextX = x + offsetX;
      const nextY = y + offsetY;
      if (nextX < 0 || nextY < 0 || nextX >= width || nextY >= height) continue;
      const nextIndex = nextY * width + nextX;
      const next = values[nextIndex] ?? 0;
      if (next > score) return false;
      if (next === score && nextIndex < y * width + x) return false;
    }
  }
  return true;
}

function isDirectionalLocalMaximum(
  values: Uint8Array,
  width: number,
  height: number,
  sectorCount: number,
  x: number,
  y: number,
  dominantSectorMask: number,
): boolean {
  const cellIndex = y * width + x;
  for (let sector = 0; sector < Math.min(sectorCount, 32); sector += 1) {
    if ((dominantSectorMask & (1 << sector)) === 0) continue;
    const score = values[cellIndex * sectorCount + sector] ?? 0;
    let maximum = true;
    for (let offsetY = -1; offsetY <= 1 && maximum; offsetY += 1) {
      for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
        if (offsetX === 0 && offsetY === 0) continue;
        const nextX = x + offsetX;
        const nextY = y + offsetY;
        if (nextX < 0 || nextY < 0 || nextX >= width || nextY >= height) continue;
        const nextIndex = nextY * width + nextX;
        const next = values[nextIndex * sectorCount + sector] ?? 0;
        if (next > score || (next === score && nextIndex < cellIndex)) {
          maximum = false;
          break;
        }
      }
    }
    if (maximum) return true;
  }
  return false;
}

function buildDirectionalSignature(
  values: Uint8Array,
  cellIndex: number,
  sectorCount: number,
  diversityThreshold: number,
): number {
  const offset = cellIndex * sectorCount;
  let peak = 0;
  for (let sector = 0; sector < sectorCount; sector += 1) peak = Math.max(peak, values[offset + sector] ?? 0);
  const threshold = Math.max(diversityThreshold, peak - 36);
  let mask = 0;
  for (let sector = 0; sector < Math.min(sectorCount, 32); sector += 1) {
    if ((values[offset + sector] ?? 0) >= threshold) mask |= 1 << sector;
  }
  return mask >>> 0;
}

function directionalSimilarity(left: number, right: number): number {
  const intersection = bitCount((left & right) >>> 0);
  const union = bitCount((left | right) >>> 0);
  return union === 0 ? 1 : intersection / union;
}

function bitCount(value: number): number {
  let count = 0;
  let next = value >>> 0;
  while (next !== 0) {
    next &= next - 1;
    count += 1;
  }
  return count;
}

function listForKind(
  index: StaticTacticalCandidateIndexSnapshot,
  kind: StaticTacticalPositionKind,
): StaticTacticalCandidateListSnapshot {
  if (kind === 'observation') return index.observation;
  if (kind === 'defense') return index.defense;
  return index.firing;
}

function emptyList(chunkCount: number): StaticTacticalCandidateListSnapshot {
  return Object.freeze({
    chunkOffsets: new Uint32Array(chunkCount),
    chunkCounts: new Uint16Array(chunkCount),
    cellIndices: new Uint32Array(0),
    scores: new Uint8Array(0),
    postureMasks: new Uint8Array(0),
    dominantSectorMasks: new Uint32Array(0),
  });
}

function assertInput(input: StaticTacticalCandidateIndexInput): void {
  const cellCount = input.width * input.height;
  const directionalCount = cellCount * input.sectorCount;
  if (!Number.isInteger(input.width) || input.width <= 0 || !Number.isInteger(input.height) || input.height <= 0) {
    throw new Error('Static tactical candidate index dimensions are invalid.');
  }
  if (!Number.isInteger(input.sectorCount) || input.sectorCount <= 0 || input.sectorCount > 32) {
    throw new Error('Static tactical candidate index sector count must be between 1 and 32.');
  }
  if (
    input.observationPotential.length !== cellCount
    || input.defensePotential.length !== cellCount
    || input.firingPotential.length !== cellCount
    || input.availablePostureMask.length !== cellCount
  ) {
    throw new Error(`Static tactical candidate cell array length mismatch; expected ${cellCount}.`);
  }
  if (
    input.observationByDirection.length !== directionalCount
    || input.protectionByDirection.length !== directionalCount
    || input.firingByDirection.length !== directionalCount
  ) {
    throw new Error(`Static tactical candidate directional array length mismatch; expected ${directionalCount}.`);
  }
}

function clampByte(value: number): number {
  return clampInt(value, 0, 255);
}

function clampInt(value: number, minimum: number, maximum: number): number {
  const normalized = Number.isFinite(value) ? Math.floor(value) : minimum;
  return Math.max(minimum, Math.min(maximum, normalized));
}
