const SECTOR_COUNT = 8;
const SECTOR_RADIANS = Math.PI / 4;
const UNCERTAINTY_HALF_WEIGHT_CELLS = 4;

export interface DirectionalThreatSource {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly strength: number;
  readonly suppression: number;
  readonly confidence: number;
  readonly uncertaintyCells: number;
}

export interface ThreatDirectionField {
  readonly sectorWeights: Float32Array;
  readonly normalizedSectorWeights: Float32Array;
  readonly totalWeight: number;
  readonly primarySector: number;
  readonly primaryBearingRadians: number;
  readonly strongestSectorShare: number;
  readonly contributingThreatCount: number;
}

export function buildThreatDirectionField(
  originX: number,
  originY: number,
  threats: readonly DirectionalThreatSource[],
): ThreatDirectionField {
  const sectorWeights = new Float32Array(SECTOR_COUNT);
  let contributingThreatCount = 0;

  for (const threat of threats) {
    const dx = threat.x - originX;
    const dy = threat.y - originY;
    if (Math.hypot(dx, dy) <= 1e-6) continue;
    const weight = threatWeight(threat);
    if (weight <= 1e-6) continue;
    contributingThreatCount += 1;

    const bearing = normalizeRadians(Math.atan2(dy, dx));
    const sectorPosition = bearing / SECTOR_RADIANS;
    const baseSector = Math.floor(sectorPosition) % SECTOR_COUNT;
    const fraction = sectorPosition - Math.floor(sectorPosition);
    const nextSector = (baseSector + 1) % SECTOR_COUNT;
    sectorWeights[baseSector] += weight * (1 - fraction);
    sectorWeights[nextSector] += weight * fraction;
  }

  let totalWeight = 0;
  let primarySector = -1;
  let primaryWeight = 0;
  for (let index = 0; index < SECTOR_COUNT; index += 1) {
    const value = sectorWeights[index];
    totalWeight += value;
    if (value > primaryWeight) {
      primaryWeight = value;
      primarySector = index;
    }
  }

  const normalizedSectorWeights = new Float32Array(SECTOR_COUNT);
  if (totalWeight > 1e-6) {
    for (let index = 0; index < SECTOR_COUNT; index += 1) {
      normalizedSectorWeights[index] = sectorWeights[index] / totalWeight;
    }
  }

  return {
    sectorWeights,
    normalizedSectorWeights,
    totalWeight,
    primarySector,
    primaryBearingRadians: primarySector >= 0 ? threatSectorBearingRadians(primarySector) : 0,
    strongestSectorShare: totalWeight > 1e-6 ? primaryWeight / totalWeight : 0,
    contributingThreatCount,
  };
}

export function threatSectorBearingRadians(index: number): number {
  const normalized = ((Math.round(index) % SECTOR_COUNT) + SECTOR_COUNT) % SECTOR_COUNT;
  return normalized * SECTOR_RADIANS;
}

function threatWeight(threat: DirectionalThreatSource): number {
  const confidence01 = percent01(threat.confidence);
  const force01 = percent01(Math.max(threat.strength, threat.suppression));
  const uncertainty = Math.max(0, finite(threat.uncertaintyCells));
  const uncertaintyAttenuation = 1 / (1 + uncertainty / UNCERTAINTY_HALF_WEIGHT_CELLS);
  return confidence01 * (0.25 + force01 * 0.75) * uncertaintyAttenuation;
}

function percent01(value: number): number {
  return Math.max(0, Math.min(1, finite(value) / 100));
}

function finite(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function normalizeRadians(value: number): number {
  const full = Math.PI * 2;
  const normalized = value % full;
  return normalized < 0 ? normalized + full : normalized;
}
