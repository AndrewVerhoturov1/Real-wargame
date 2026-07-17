import type { TacticalMap } from '../map/MapModel';
import {
  DIRECTIONAL_SECTOR_COUNT,
  DIRECTIONAL_SECTOR_RADIANS,
  type DirectionalTerrainSectorBasis,
} from '../terrain/DirectionalTerrainSectorBasis';
import {
  buildThreatDirectionField,
  type DirectionalThreatSource,
  type ThreatDirectionField,
} from '../terrain/ThreatDirectionField';
import type { NavigationProfile } from './NavigationProfiles';

const THREAT_POSITION_BUCKET_CELLS = 0.1;
const NORMALIZED_WEIGHT_BUCKET = 0.0001;
const UNCERTAINTY_HALF_WEIGHT_CELLS = 4;
const FULL_TURN_RADIANS = Math.PI * 2;
const ZERO_DISTANCE_SQUARED = 1e-12;

interface WeightedThreat {
  readonly threat: DirectionalThreatSource;
  readonly weight: number;
}

export interface PreparedDirectionalRouteCostProjection {
  readonly key: string;
  readonly threatField: ThreatDirectionField;
  readonly weightedThreats: readonly WeightedThreat[];
  readonly totalThreatWeight: number;
  readonly primaryThreatIndex: number;
  readonly available: boolean;
}

export function prepareDirectionalRouteCostProjection(
  map: TacticalMap,
  basisKey: string,
  threats: readonly DirectionalThreatSource[],
): PreparedDirectionalRouteCostProjection {
  const weights = threats.map(threatWeight);
  const totalWeightForKey = weights.reduce((sum, weight) => sum + weight, 0);
  const weightedThreats = threats
    .map((threat, index): WeightedThreat => ({ threat, weight: weights[index] ?? 0 }))
    .filter((entry) => entry.weight > 1e-6);
  const totalThreatWeight = weightedThreats.reduce((sum, entry) => sum + entry.weight, 0);
  const primaryThreatIndex = strongestThreatIndex(weightedThreats);
  const threatField = buildThreatDirectionField(map.width / 2, map.height / 2, threats);
  return {
    key: [
      basisKey,
      ...threats.map((threat, index) => [
        threat.id,
        quantize(threat.x, THREAT_POSITION_BUCKET_CELLS),
        quantize(threat.y, THREAT_POSITION_BUCKET_CELLS),
        quantize(totalWeightForKey > 1e-6 ? (weights[index] ?? 0) / totalWeightForKey : 0, NORMALIZED_WEIGHT_BUCKET),
      ].join(':')),
    ].join('#'),
    threatField,
    weightedThreats,
    totalThreatWeight,
    primaryThreatIndex,
    available: threatField.totalWeight > 1e-6 && totalThreatWeight > 1e-6 && primaryThreatIndex >= 0,
  };
}

export function writeDirectionalRouteCostCell(
  prepared: PreparedDirectionalRouteCostProjection,
  basis: DirectionalTerrainSectorBasis,
  profile: NavigationProfile,
  index: number,
  cellX: number,
  cellY: number,
  directionalTerrainCost: Float32Array,
  directionalSlope: Float32Array,
): void {
  if (!prepared.available) return;
  const primaryThreat = prepared.weightedThreats[prepared.primaryThreatIndex]!;
  const primaryDx = primaryThreat.threat.x - cellX;
  const primaryDy = primaryThreat.threat.y - cellY;
  const primaryAtCell = primaryDx * primaryDx + primaryDy * primaryDy <= ZERO_DISTANCE_SQUARED;
  let totalWeight = prepared.totalThreatWeight;
  let localPrimaryThreatIndex = prepared.primaryThreatIndex;

  if (primaryAtCell) {
    totalWeight = 0;
    let strongestWeight = 0;
    for (let threatIndex = 0; threatIndex < prepared.weightedThreats.length; threatIndex += 1) {
      const candidate = prepared.weightedThreats[threatIndex]!;
      const dx = candidate.threat.x - cellX;
      const dy = candidate.threat.y - cellY;
      if (dx * dx + dy * dy <= ZERO_DISTANCE_SQUARED) continue;
      totalWeight += candidate.weight;
      if (candidate.weight > strongestWeight) {
        strongestWeight = candidate.weight;
        localPrimaryThreatIndex = threatIndex;
      }
    }
  }
  if (totalWeight <= 1e-6) return;

  const localPrimary = prepared.weightedThreats[localPrimaryThreatIndex]!;
  const primaryBearing = normalizeRadians(Math.atan2(
    localPrimary.threat.y - cellY,
    localPrimary.threat.x - cellX,
  ));
  let weightedForward = 0;
  let weightedReverse = 0;
  let worstFlankExposure = 0;
  let primarySlopeValue = 0;
  let primaryExposureValue = 0;
  const sectorOffset = index * DIRECTIONAL_SECTOR_COUNT;

  for (let threatIndex = 0; threatIndex < prepared.weightedThreats.length; threatIndex += 1) {
    const entry = prepared.weightedThreats[threatIndex]!;
    const dx = entry.threat.x - cellX;
    const dy = entry.threat.y - cellY;
    if (dx * dx + dy * dy <= ZERO_DISTANCE_SQUARED) continue;
    const bearing = normalizeRadians(Math.atan2(dy, dx));
    const normalizedWeight = entry.weight / totalWeight;
    const sectorPosition = bearing / DIRECTIONAL_SECTOR_RADIANS;
    const lower = Math.floor(sectorPosition);
    const baseSector = lower % DIRECTIONAL_SECTOR_COUNT;
    const fraction = sectorPosition - lower;
    const nextSector = (baseSector + 1) % DIRECTIONAL_SECTOR_COUNT;
    const slope = (basis.slope[sectorOffset + baseSector] ?? 0) * (1 - fraction)
      + (basis.slope[sectorOffset + nextSector] ?? 0) * fraction;
    const exposure = ((basis.exposure[sectorOffset + baseSector] ?? 0) * (1 - fraction)
      + (basis.exposure[sectorOffset + nextSector] ?? 0) * fraction) / 100;
    weightedForward += clamp01(slope) * normalizedWeight;
    weightedReverse += clamp01(-slope) * normalizedWeight;
    const rawBearingDifference = Math.abs(bearing - primaryBearing);
    const bearingDifference = Math.min(rawBearingDifference, FULL_TURN_RADIANS - rawBearingDifference);
    if (bearingDifference >= Math.PI / 2) {
      worstFlankExposure = Math.max(worstFlankExposure, exposure * Math.min(1, normalizedWeight * 4));
    }
    if (threatIndex === localPrimaryThreatIndex && bearingDifference <= 1e-6) {
      primarySlopeValue = slope;
      primaryExposureValue = exposure;
    }
  }

  const weights = profile.directionalTerrain;
  const forward = encodePercent(weightedForward) / 100;
  const reverse = encodePercent(weightedReverse) / 100;
  const crest = (basis.crestRisk[index] ?? 0) / 100;
  const silhouette = (basis.silhouetteRisk[index] ?? 0) / 100;
  const valley = (basis.valleyProtection[index] ?? 0) / 100;
  const criticalExposure = Math.max(
    encodePercent(primaryExposureValue) / 100,
    encodePercent(worstFlankExposure) / 100,
  );
  const base = forward * weights.forwardSlopePenalty
    - reverse * weights.reverseSlopePreference
    + crest * weights.crestPenalty
    + silhouette * weights.silhouettePenalty
    - valley * weights.valleyPreference;
  directionalTerrainCost[index] = Math.max(
    -0.95,
    base + Math.max(0, base) * criticalExposure * weights.criticalSectorMultiplier,
  );
  directionalSlope[index] = primarySlopeValue;
}

function strongestThreatIndex(threats: readonly WeightedThreat[]): number {
  let strongestIndex = -1;
  let strongestWeight = 0;
  for (let index = 0; index < threats.length; index += 1) {
    const weight = threats[index]!.weight;
    if (weight > strongestWeight) {
      strongestWeight = weight;
      strongestIndex = index;
    }
  }
  return strongestIndex;
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

function quantize(value: number, step: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value / step) * step;
}

function normalizeRadians(value: number): number {
  const normalized = value % FULL_TURN_RADIANS;
  return normalized < 0 ? normalized + FULL_TURN_RADIANS : normalized;
}

function encodePercent(value01: number): number {
  return Math.round(clamp01(value01) * 100);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}
