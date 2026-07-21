import type { UnitPosture } from '../../behavior/BehaviorModel';
import type { TacticalMap } from '../../map/MapModel';
import { traceVisibilityRayPath } from '../../visibility/VisibilityRayKernel';
import {
  postureIndex,
  type StaticTacticalPositionBasisSnapshot,
  type StaticTacticalPositionBuildDiagnostics,
} from './StaticTacticalPositionBasis';
import { buildStaticTacticalCandidateIndex } from './StaticTacticalCandidateIndex';
import { buildStaticTacticalPositionBasis, type StaticTacticalPositionBuildResult } from './StaticTacticalPositionBuilder';
import type { StaticTacticalPositionBasisIdentity } from './StaticTacticalPositionIdentity';
import type { StaticTacticalPositionSettings } from './StaticTacticalPositionSettings';

const POSTURES: readonly UnitPosture[] = ['standing', 'crouched', 'prone'];

/**
 * Quality-first refinement of the deterministic static basis.
 *
 * The base builder establishes canonical terrain/material channels. This pass
 * deliberately spends more worker time on angular ray sampling so narrow gaps,
 * wall edges, vegetation transmission and exposed summits are represented more
 * accurately. It still has no access to units, threats, orders or UI state.
 */
export function buildHighQualityStaticTacticalPositionBasis(
  map: TacticalMap,
  identity: StaticTacticalPositionBasisIdentity,
  settings: StaticTacticalPositionSettings,
): StaticTacticalPositionBuildResult {
  const base = buildStaticTacticalPositionBasis(map, identity, settings);
  const startedAt = nowMs();
  const snapshot = base.snapshot;
  const sectorCount = snapshot.sectorCount;
  const cellCount = snapshot.width * snapshot.height;
  let observationRays = base.diagnostics.observationRays;
  let firingRays = base.diagnostics.firingRays;

  for (let cellIndex = 0; cellIndex < cellCount; cellIndex += 1) {
    if ((snapshot.availablePostureMask[cellIndex] ?? 0) === 0) continue;
    const cellX = cellIndex % snapshot.width;
    const cellY = Math.floor(cellIndex / snapshot.width);
    const origin = { x: cellX + 0.5, y: cellY + 0.5 };
    const postureObservationScores: number[] = [];
    const postureFiringScores: number[] = [];
    const postureProtectionScores: number[] = [];

    for (const posture of POSTURES) {
      const observationBySector: number[] = [];
      const firingBySector: number[] = [];
      const protectionBySector: number[] = [];
      for (let sector = 0; sector < sectorCount; sector += 1) {
        const observationSamples = sampleSector(
          map,
          origin,
          posture,
          sector,
          sectorCount,
          settings.geometry.observationSamplesPerSector,
          settings.geometry.maximumObservationRangeMeters,
          settings,
        );
        const firingSamples = sampleSector(
          map,
          origin,
          posture,
          sector,
          sectorCount,
          settings.geometry.firingSamplesPerSector,
          settings.geometry.maximumFiringRangeMeters,
          settings,
        );
        observationRays += observationSamples.rayCount;
        firingRays += firingSamples.rayCount;
        const directionalOffset = cellIndex * sectorCount + sector;
        const oldObservation = decodeByte(snapshot.observationByDirection[directionalOffset] ?? 0);
        const oldFiring = decodeByte(snapshot.firingByDirection[directionalOffset] ?? 0);
        const oldProtection = decodeByte(snapshot.protectionByDirection[directionalOffset] ?? 0);
        const refinedObservation = clampPercent(oldObservation * 0.28 + observationSamples.observation * 0.72);
        const refinedFiring = clampPercent(oldFiring * 0.24 + firingSamples.firing * 0.76);
        const refinedProtection = clampPercent(oldProtection * 0.45 + firingSamples.protection * 0.55);
        const refinedClearance = clampPercent(firingSamples.immediateClearance);
        snapshot.observationByDirection[directionalOffset] = encodeByte(refinedObservation);
        snapshot.firingByDirection[directionalOffset] = encodeByte(refinedFiring);
        snapshot.protectionByDirection[directionalOffset] = encodeByte(refinedProtection);
        snapshot.immediateFireClearanceByDirection[directionalOffset] = encodeByte(refinedClearance);
        observationBySector.push(refinedObservation);
        firingBySector.push(refinedFiring);
        protectionBySector.push(refinedProtection);
      }
      const postureOffset = cellIndex * 3 + postureIndex(posture);
      const observationAggregate = aggregate(observationBySector);
      const firingAggregate = aggregate(firingBySector);
      const protectionAggregate = aggregate(protectionBySector);
      const postureObservation = clampPercent(
        observationAggregate.mean * 0.42
          + observationAggregate.peak * 0.34
          + observationAggregate.breadth * 0.24,
      );
      const postureFiring = clampPercent(
        firingAggregate.mean * 0.40
          + firingAggregate.peak * 0.36
          + firingAggregate.breadth * 0.24,
      );
      const postureProtection = clampPercent(
        protectionAggregate.mean * 0.46
          + protectionAggregate.peak * 0.20
          + protectionAggregate.minimum * 0.18
          + protectionAggregate.breadth * 0.16,
      );
      snapshot.observationByPosture[postureOffset] = encodeByte(postureObservation);
      snapshot.firingByPosture[postureOffset] = encodeByte(postureFiring);
      snapshot.staticProtectionByPosture[postureOffset] = encodeByte(
        Math.max(decodeByte(snapshot.staticProtectionByPosture[postureOffset] ?? 0), postureProtection),
      );
      postureObservationScores.push(postureObservation);
      postureFiringScores.push(postureFiring);
      postureProtectionScores.push(postureProtection);
    }

    const observationDirections = readDirections(snapshot.observationByDirection, cellIndex, sectorCount);
    const firingDirections = readDirections(snapshot.firingByDirection, cellIndex, sectorCount);
    const protectionDirections = readDirections(snapshot.protectionByDirection, cellIndex, sectorCount);
    const clearanceDirections = readDirections(snapshot.immediateFireClearanceByDirection, cellIndex, sectorCount);
    const reverseSlopeDirections = readDirections(snapshot.reverseSlopeByDirection, cellIndex, sectorCount);
    const observationAggregate = aggregate(observationDirections);
    const firingAggregate = aggregate(firingDirections);
    const protectionAggregate = aggregate(protectionDirections);
    const clearanceAggregate = aggregate(clearanceDirections);
    const reverseSlopeAggregate = aggregate(reverseSlopeDirections);
    const concealment = decodeByte(snapshot.concealment[cellIndex] ?? 0);
    const surfaceSuitability = decodeByte(snapshot.surfaceSuitability[cellIndex] ?? 0);
    const bestObservationPosture = Math.max(...postureObservationScores);
    const bestFiringPosture = Math.max(...postureFiringScores);
    const bestProtectionPosture = Math.max(...postureProtectionScores);
    const openExposure = clampPercent(
      observationAggregate.peak
        - concealment * 0.58
        - bestProtectionPosture * 0.42,
    );
    const directionalVulnerability = clampPercent(100 - protectionAggregate.minimum);

    snapshot.observationPotential[cellIndex] = encodeByte(clampPercent(
      bestObservationPosture * 0.43
        + observationAggregate.breadth * 0.22
        + observationAggregate.mean * 0.12
        + concealment * 0.12
        + bestProtectionPosture * 0.07
        + surfaceSuitability * 0.04
        - openExposure * 0.18,
    ));
    snapshot.defensePotential[cellIndex] = encodeByte(clampPercent(
      bestProtectionPosture * 0.36
        + protectionAggregate.mean * 0.22
        + protectionAggregate.minimum * 0.10
        + protectionAggregate.breadth * 0.13
        + reverseSlopeAggregate.mean * 0.09
        + concealment * 0.07
        + surfaceSuitability * 0.03
        - directionalVulnerability * 0.08,
    ));
    snapshot.firingPotential[cellIndex] = encodeByte(clampPercent(
      bestFiringPosture * 0.38
        + firingAggregate.breadth * 0.18
        + firingAggregate.mean * 0.12
        + clearanceAggregate.mean * 0.12
        + bestProtectionPosture * 0.08
        + concealment * 0.05
        + surfaceSuitability * 0.04
        + reverseSlopeAggregate.mean * 0.03
        - openExposure * 0.13,
    ));
  }

  const candidateIndex = buildStaticTacticalCandidateIndex({
    width: snapshot.width,
    height: snapshot.height,
    sectorCount: snapshot.sectorCount,
    observationPotential: snapshot.observationPotential,
    defensePotential: snapshot.defensePotential,
    firingPotential: snapshot.firingPotential,
    observationByDirection: snapshot.observationByDirection,
    protectionByDirection: snapshot.protectionByDirection,
    firingByDirection: snapshot.firingByDirection,
    availablePostureMask: snapshot.availablePostureMask,
  }, settings.index);
  const diagnostics: StaticTacticalPositionBuildDiagnostics = Object.freeze({
    ...base.diagnostics,
    buildMs: roundMs(base.diagnostics.buildMs + nowMs() - startedAt),
    observationRays,
    firingRays,
    observationCandidates: candidateIndex.observation.cellIndices.length,
    defenseCandidates: candidateIndex.defense.cellIndices.length,
    firingCandidates: candidateIndex.firing.cellIndices.length,
  });
  const refined: StaticTacticalPositionBasisSnapshot = Object.freeze({
    ...snapshot,
    candidateIndex,
    diagnostics,
  });
  return { snapshot: refined, diagnostics };
}

interface SectorSampleAggregate {
  readonly observation: number;
  readonly firing: number;
  readonly protection: number;
  readonly immediateClearance: number;
  readonly rayCount: number;
}

function sampleSector(
  map: TacticalMap,
  origin: { readonly x: number; readonly y: number },
  posture: UnitPosture,
  sector: number,
  sectorCount: number,
  rawSampleCount: number,
  maximumRangeMeters: number,
  settings: StaticTacticalPositionSettings,
): SectorSampleAggregate {
  const sampleCount = Math.max(2, Math.floor(rawSampleCount));
  const sectorWidth = Math.PI * 2 / sectorCount;
  let observationSum = 0;
  let firingSum = 0;
  let protectionSum = 0;
  let clearanceSum = 0;
  let observationPeak = 0;
  let firingPeak = 0;
  for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
    const normalized = (sampleIndex + 0.5) / sampleCount - 0.5;
    const bearing = sector * sectorWidth + normalized * sectorWidth * 0.88;
    const target = pointAtMapBoundary(
      map,
      origin,
      bearing,
      maximumRangeMeters / Math.max(0.001, map.metersPerCell),
    );
    const requestedMeters = Math.max(
      0.001,
      Math.hypot(target.x - origin.x, target.y - origin.y) * map.metersPerCell,
    );
    const path = traceVisibilityRayPath(map, {
      origin,
      target,
      originHeightAboveGroundMeters: postureHeight(posture, settings),
      targetHeightAboveGroundMeters: settings.postures.standingHeightMeters,
      channel: 'combined',
    });
    const visibleDepth = clamp01((path.result.blockerDistanceMeters ?? requestedMeters) / requestedMeters);
    const observation = clampPercent(
      path.result.visualTransmission * 56
        + visibleDepth * 44,
    );
    const immediateClearance = readImmediateClearance(
      path.samples,
      path.result.blockerDistanceMeters,
      settings.geometry.immediateClearanceMeters,
    );
    const firing = clampPercent(
      path.result.fireTransmission * 52
        + visibleDepth * 34
        + immediateClearance * 0.14,
    );
    const protection = clampPercent(
      (1 - path.result.fireTransmission) * 68
        + (path.result.hardBlocked ? 32 : 0),
    );
    observationSum += observation;
    firingSum += firing;
    protectionSum += protection;
    clearanceSum += immediateClearance;
    observationPeak = Math.max(observationPeak, observation);
    firingPeak = Math.max(firingPeak, firing);
  }
  return {
    observation: clampPercent(observationSum / sampleCount * 0.72 + observationPeak * 0.28),
    firing: clampPercent(firingSum / sampleCount * 0.72 + firingPeak * 0.28),
    protection: clampPercent(protectionSum / sampleCount),
    immediateClearance: clampPercent(clearanceSum / sampleCount),
    rayCount: sampleCount,
  };
}

function readImmediateClearance(
  samples: readonly { readonly distanceMeters: number; readonly hardBlocked: boolean; readonly fireTransmission: number }[],
  blockerDistanceMeters: number | null,
  clearanceMeters: number,
): number {
  if (blockerDistanceMeters !== null && blockerDistanceMeters <= clearanceMeters) return 0;
  let transmission = 1;
  for (const sample of samples) {
    if (sample.distanceMeters > clearanceMeters) break;
    if (sample.hardBlocked) return 0;
    transmission = Math.min(transmission, sample.fireTransmission);
  }
  return clampPercent(transmission * 100);
}

function readDirections(values: Uint8Array, cellIndex: number, sectorCount: number): number[] {
  const result = new Array<number>(sectorCount);
  const offset = cellIndex * sectorCount;
  for (let sector = 0; sector < sectorCount; sector += 1) {
    result[sector] = decodeByte(values[offset + sector] ?? 0);
  }
  return result;
}

function aggregate(values: readonly number[]): {
  readonly mean: number;
  readonly peak: number;
  readonly minimum: number;
  readonly breadth: number;
} {
  if (values.length === 0) return { mean: 0, peak: 0, minimum: 0, breadth: 0 };
  let sum = 0;
  let peak = 0;
  let minimum = 100;
  let useful = 0;
  for (const value of values) {
    const normalized = clampPercent(value);
    sum += normalized;
    peak = Math.max(peak, normalized);
    minimum = Math.min(minimum, normalized);
    if (normalized >= 42) useful += 1;
  }
  return {
    mean: sum / values.length,
    peak,
    minimum,
    breadth: useful / values.length * 100,
  };
}

function pointAtMapBoundary(
  map: TacticalMap,
  origin: { readonly x: number; readonly y: number },
  bearing: number,
  requestedCells: number,
): { readonly x: number; readonly y: number } {
  const dx = Math.cos(bearing);
  const dy = Math.sin(bearing);
  const candidates = [requestedCells];
  if (dx > 0) candidates.push((map.width - 0.001 - origin.x) / dx);
  else if (dx < 0) candidates.push((0.001 - origin.x) / dx);
  if (dy > 0) candidates.push((map.height - 0.001 - origin.y) / dy);
  else if (dy < 0) candidates.push((0.001 - origin.y) / dy);
  const positive = candidates.filter((value) => value > 0 && Number.isFinite(value));
  const distanceCells = Math.max(0.05, Math.min(...positive));
  return {
    x: clamp(origin.x + dx * distanceCells, 0.001, map.width - 0.001),
    y: clamp(origin.y + dy * distanceCells, 0.001, map.height - 0.001),
  };
}

function postureHeight(posture: UnitPosture, settings: StaticTacticalPositionSettings): number {
  if (posture === 'standing') return settings.postures.standingHeightMeters;
  if (posture === 'crouched') return settings.postures.crouchedHeightMeters;
  return settings.postures.proneHeightMeters;
}

function encodeByte(percent: number): number {
  return Math.round(clampPercent(percent) / 100 * 255);
}

function decodeByte(value: number): number {
  return clamp(value, 0, 255) / 255 * 100;
}

function clampPercent(value: number): number {
  return clamp(Number.isFinite(value) ? value : 0, 0, 100);
}

function clamp01(value: number): number {
  return clamp(Number.isFinite(value) ? value : 0, 0, 1);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function roundMs(value: number): number {
  return Math.round(Math.max(0, value) * 100) / 100;
}

function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}
