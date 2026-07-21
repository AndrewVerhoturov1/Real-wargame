import type { UnitPosture } from '../../behavior/BehaviorModel';
import { getAwarenessStaticField } from '../../knowledge/AwarenessStaticField';
import type { TacticalMap } from '../../map/MapModel';
import { getActiveEnvironmentProfile } from '../../map/EnvironmentProfileRuntime';
import { getSurfaceMaterial } from '../../map/EnvironmentMaterialProfile';
import { resolveCellVegetationDefinition } from '../../map/VegetationDefinition';
import { buildNavigationGrid } from '../../pathfinding/GridNavigation';
import {
  DIRECTIONAL_SECTOR_RADIANS,
  getDirectionalTerrainSectorBasis,
} from '../../terrain/DirectionalTerrainSectorBasis';
import { traceVisibilityRayPath } from '../../visibility/VisibilityRayKernel';
import {
  createStaticTacticalPositionBasisArrays,
  postureBit,
  postureIndex,
  STATIC_TACTICAL_POSTURE_ALL,
  type StaticTacticalPositionBasisSnapshot,
  type StaticTacticalPositionBuildDiagnostics,
} from './StaticTacticalPositionBasis';
import { buildStaticTacticalCandidateIndex } from './StaticTacticalCandidateIndex';
import {
  staticTacticalPositionIdentityKey,
  type StaticTacticalPositionBasisIdentity,
} from './StaticTacticalPositionIdentity';
import type {
  StaticTacticalKindWeights,
  StaticTacticalPositionSettings,
} from './StaticTacticalPositionSettings';

const POSTURES: readonly UnitPosture[] = ['standing', 'crouched', 'prone'];

export interface StaticTacticalPositionBuildResult {
  readonly snapshot: StaticTacticalPositionBasisSnapshot;
  readonly diagnostics: StaticTacticalPositionBuildDiagnostics;
}

interface DirectionProbe {
  readonly observation: number;
  readonly firing: number;
  readonly protection: number;
  readonly immediateFireClearance: number;
}

interface CellAggregates {
  readonly mean: number;
  readonly peak: number;
  readonly breadth: number;
  readonly minimum: number;
}

/**
 * Deterministic full-map objective tactical analysis.
 *
 * This function intentionally performs substantial work once per exact static
 * identity. It never reads unit state, threats, orders, weapons, UI or renderer
 * objects. Subjective searches consume the immutable result later.
 */
export function buildStaticTacticalPositionBasis(
  map: TacticalMap,
  identity: StaticTacticalPositionBasisIdentity,
  settings: StaticTacticalPositionSettings,
): StaticTacticalPositionBuildResult {
  assertIdentityMatchesMap(map, identity, settings);
  const startedAt = nowMs();
  const cellCount = map.width * map.height;
  const sectorCount = settings.sectors.count;
  const arrays = createStaticTacticalPositionBasisArrays(map.width, map.height, sectorCount);
  const navigation = buildNavigationGrid(map);
  const terrainBasis = getDirectionalTerrainSectorBasis(map);
  const staticFields = {
    standing: getAwarenessStaticField(map, 'standing'),
    crouched: getAwarenessStaticField(map, 'crouched'),
    prone: getAwarenessStaticField(map, 'prone'),
  } as const;
  const profile = getActiveEnvironmentProfile();
  let cellsProcessed = 0;
  let observationRays = 0;
  let firingRays = 0;
  let blockedCells = 0;

  for (let cellIndex = 0; cellIndex < cellCount; cellIndex += 1) {
    const navigationCell = navigation.cells[cellIndex];
    if (!navigationCell?.passable) {
      blockedCells += 1;
      continue;
    }
    cellsProcessed += 1;
    const x = cellIndex % map.width;
    const y = Math.floor(cellIndex / map.width);
    const origin = { x: x + 0.5, y: y + 0.5 };
    const cell = map.cells[cellIndex]!;
    const vegetation = resolveCellVegetationDefinition(cell);
    const surface = getSurfaceMaterial(profile, cell.surfaceMaterialId);
    const localConcealment = clampPercent(Math.max(
      vegetation.visibility.localConcealment,
      vegetation.movement.tacticalConcealment * 100,
    ));
    const surfaceSuitability = clampPercent(
      surface.movement.passable
        ? 100 / Math.max(1, navigationCell.movementCost)
        : 0,
    );
    arrays.concealment[cellIndex] = encodeByte(localConcealment);
    arrays.surfaceSuitability[cellIndex] = encodeByte(surfaceSuitability);
    arrays.availablePostureMask[cellIndex] = STATIC_TACTICAL_POSTURE_ALL;

    const postureObservation: number[] = [];
    const postureFiring: number[] = [];
    const postureProtection: number[] = [];
    const directionalObservation = new Array<number>(sectorCount).fill(0);
    const directionalFiring = new Array<number>(sectorCount).fill(0);
    const directionalProtection = new Array<number>(sectorCount).fill(0);
    const directionalClearance = new Array<number>(sectorCount).fill(0);

    for (const posture of POSTURES) {
      const postureOffset = cellIndex * 3 + postureIndex(posture);
      const localStatic = staticFields[posture];
      const staticProtection = clampPercent(localStatic.expectedProtection[cellIndex] ?? 0);
      const postureConcealment = clampPercent(Math.max(localConcealment, localStatic.concealment[cellIndex] ?? 0));
      arrays.staticProtectionByPosture[postureOffset] = encodeByte(staticProtection);
      const observationValues: number[] = [];
      const firingValues: number[] = [];
      const protectionValues: number[] = [];

      for (let sector = 0; sector < sectorCount; sector += 1) {
        const bearing = sectorBearing(sector, sectorCount);
        const probe = probeDirection(map, origin, posture, bearing, settings);
        observationRays += 1;
        firingRays += 1;
        const terrainOffset = cellIndex * terrainBasisSectorCount(terrainBasis) + remapSector(
          sector,
          sectorCount,
          terrainBasisSectorCount(terrainBasis),
        );
        const terrainProtection = decodePercent(terrainBasis.protection[terrainOffset] ?? 0);
        const terrainExposure = decodePercent(terrainBasis.exposure[terrainOffset] ?? 0);
        const reverseSlope = clampPercent(Math.max(0, -(terrainBasis.slope[terrainOffset] ?? 0)) * 100);
        const vegetationProtection = clampPercent(
          Math.min(
            vegetation.fire.maximumProtection,
            vegetation.fire.protectionPerMeter * settings.geometry.immediateClearanceMeters,
          ),
        );
        const combinedProtection = clampPercent(
          probe.protection * 0.46
            + terrainProtection * 0.28
            + staticProtection * 0.20
            + vegetationProtection * 0.10
            - terrainExposure * postureExposure(posture, settings) * 0.12,
        );
        const observation = clampPercent(
          probe.observation
            + postureConcealment * 0.05
            - terrainExposure * postureExposure(posture, settings) * 0.10,
        );
        const firing = clampPercent(
          probe.firing * 0.78
            + probe.immediateFireClearance * 0.18
            + combinedProtection * 0.06
            - terrainExposure * postureExposure(posture, settings) * 0.10,
        );

        observationValues.push(observation);
        firingValues.push(firing);
        protectionValues.push(combinedProtection);
        directionalObservation[sector] = Math.max(directionalObservation[sector]!, observation);
        directionalFiring[sector] = Math.max(directionalFiring[sector]!, firing);
        directionalProtection[sector] = Math.max(directionalProtection[sector]!, combinedProtection);
        directionalClearance[sector] = Math.max(directionalClearance[sector]!, probe.immediateFireClearance);
        arrays.reverseSlopeByDirection[cellIndex * sectorCount + sector] = encodeByte(reverseSlope);
      }

      const observationAggregate = aggregateDirections(observationValues);
      const firingAggregate = aggregateDirections(firingValues);
      const protectionAggregate = aggregateDirections(protectionValues);
      arrays.observationByPosture[postureOffset] = encodeByte(
        observationAggregate.mean * 0.45 + observationAggregate.peak * 0.35 + observationAggregate.breadth * 0.20,
      );
      arrays.firingByPosture[postureOffset] = encodeByte(
        firingAggregate.mean * 0.42 + firingAggregate.peak * 0.38 + firingAggregate.breadth * 0.20,
      );
      postureObservation.push(decodeByte(arrays.observationByPosture[postureOffset] ?? 0));
      postureFiring.push(decodeByte(arrays.firingByPosture[postureOffset] ?? 0));
      postureProtection.push(
        protectionAggregate.mean * 0.45
          + protectionAggregate.peak * 0.25
          + protectionAggregate.breadth * 0.20
          + protectionAggregate.minimum * 0.10,
      );
    }

    for (let sector = 0; sector < sectorCount; sector += 1) {
      const offset = cellIndex * sectorCount + sector;
      arrays.observationByDirection[offset] = encodeByte(directionalObservation[sector] ?? 0);
      arrays.firingByDirection[offset] = encodeByte(directionalFiring[sector] ?? 0);
      arrays.protectionByDirection[offset] = encodeByte(directionalProtection[sector] ?? 0);
      arrays.immediateFireClearanceByDirection[offset] = encodeByte(directionalClearance[sector] ?? 0);
    }

    const observationDirections = aggregateDirections(directionalObservation);
    const firingDirections = aggregateDirections(directionalFiring);
    const defenseDirections = aggregateDirections(directionalProtection);
    const bestObservationPosture = Math.max(...postureObservation);
    const bestFiringPosture = Math.max(...postureFiring);
    const bestProtectionPosture = Math.max(...postureProtection);
    const exposure = clampPercent(
      decodePercent(terrainBasis.crestRisk[cellIndex] ?? 0) * 0.42
        + decodePercent(terrainBasis.silhouetteRisk[cellIndex] ?? 0) * 0.58,
    );
    const slopePenalty = directionalSlopePenalty(terrainBasis, cellIndex);

    arrays.observationPotential[cellIndex] = encodeByte(scoreOverall(
      settings.observation,
      bestObservationPosture,
      observationDirections,
      localConcealment,
      bestProtectionPosture,
      exposure,
      slopePenalty,
      surfaceSuitability,
    ));
    arrays.defensePotential[cellIndex] = encodeByte(scoreOverall(
      settings.defense,
      bestProtectionPosture,
      defenseDirections,
      localConcealment,
      bestProtectionPosture,
      exposure,
      slopePenalty,
      surfaceSuitability,
    ));
    arrays.firingPotential[cellIndex] = encodeByte(scoreOverall(
      settings.firing,
      bestFiringPosture,
      firingDirections,
      localConcealment,
      bestProtectionPosture,
      exposure,
      slopePenalty,
      surfaceSuitability,
    ));
  }

  const candidateIndex = buildStaticTacticalCandidateIndex({
    width: map.width,
    height: map.height,
    sectorCount,
    observationPotential: arrays.observationPotential,
    defensePotential: arrays.defensePotential,
    firingPotential: arrays.firingPotential,
    observationByDirection: arrays.observationByDirection,
    protectionByDirection: arrays.protectionByDirection,
    firingByDirection: arrays.firingByDirection,
    availablePostureMask: arrays.availablePostureMask,
  }, settings.index);
  const diagnostics: StaticTacticalPositionBuildDiagnostics = Object.freeze({
    buildMs: roundMs(nowMs() - startedAt),
    cellsProcessed,
    observationRays,
    firingRays,
    blockedCells,
    observationCandidates: candidateIndex.observation.cellIndices.length,
    defenseCandidates: candidateIndex.defense.cellIndices.length,
    firingCandidates: candidateIndex.firing.cellIndices.length,
  });
  const snapshot: StaticTacticalPositionBasisSnapshot = Object.freeze({
    version: 1,
    identity,
    identityKey: staticTacticalPositionIdentityKey(identity),
    width: map.width,
    height: map.height,
    metersPerCell: map.metersPerCell,
    sectorCount,
    ...arrays,
    candidateIndex,
    settings,
    diagnostics,
    builtAtMs: Date.now(),
  });
  return { snapshot, diagnostics };
}

function probeDirection(
  map: TacticalMap,
  origin: { readonly x: number; readonly y: number },
  posture: UnitPosture,
  bearing: number,
  settings: StaticTacticalPositionSettings,
): DirectionProbe {
  const rangeMeters = Math.max(
    settings.geometry.maximumObservationRangeMeters,
    settings.geometry.maximumFiringRangeMeters,
  );
  const target = pointAtMapBoundary(map, origin, bearing, rangeMeters / Math.max(0.001, map.metersPerCell));
  const requestedMeters = Math.max(0.001, Math.hypot(target.x - origin.x, target.y - origin.y) * map.metersPerCell);
  const path = traceVisibilityRayPath(map, {
    origin,
    target,
    originHeightAboveGroundMeters: postureHeight(posture, settings),
    targetHeightAboveGroundMeters: settings.postures.standingHeightMeters,
    channel: 'combined',
  });
  const trace = path.result;
  const visibleDepth = clamp01((trace.blockerDistanceMeters ?? requestedMeters) / requestedMeters);
  const observationTransmission = clamp01(trace.visualTransmission);
  const fireTransmission = clamp01(trace.fireTransmission);
  const observation = clampPercent(
    visibleDepth * 62
      + observationTransmission * 38,
  );
  const firing = clampPercent(
    visibleDepth * 54
      + fireTransmission * 46,
  );
  const protection = clampPercent(
    (1 - fireTransmission) * 60
      + (trace.hardBlocked ? 40 : 0),
  );
  const immediateFireClearance = readImmediateClearance(
    path.samples,
    trace.blockerDistanceMeters,
    settings.geometry.immediateClearanceMeters,
  );
  return { observation, firing, protection, immediateFireClearance };
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

function scoreOverall(
  weights: StaticTacticalKindWeights,
  primary: number,
  directions: CellAggregates,
  concealment: number,
  protection: number,
  exposure: number,
  slopePenalty: number,
  surfaceSuitability: number,
): number {
  const positiveWeight = weights.primary
    + weights.directionalBreadth
    + weights.concealment
    + weights.protection
    + 0.12;
  const positive = primary * weights.primary
    + directions.breadth * weights.directionalBreadth
    + concealment * weights.concealment
    + protection * weights.protection
    + surfaceSuitability * 0.12;
  const penalty = exposure * weights.exposurePenalty + slopePenalty * weights.slopePenalty;
  return clampPercent(positive / Math.max(0.001, positiveWeight) - penalty);
}

function aggregateDirections(values: readonly number[]): CellAggregates {
  if (values.length === 0) return { mean: 0, peak: 0, breadth: 0, minimum: 0 };
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
    breadth: useful / values.length * 100,
    minimum,
  };
}

function directionalSlopePenalty(
  basis: ReturnType<typeof getDirectionalTerrainSectorBasis>,
  cellIndex: number,
): number {
  const count = terrainBasisSectorCount(basis);
  let penalty = 0;
  for (let sector = 0; sector < count; sector += 1) {
    penalty += Math.min(1, Math.abs(basis.slope[cellIndex * count + sector] ?? 0)) * 100;
  }
  return penalty / count;
}

function terrainBasisSectorCount(basis: ReturnType<typeof getDirectionalTerrainSectorBasis>): number {
  const cellCount = basis.width * basis.height;
  return Math.max(1, Math.floor(basis.protection.length / Math.max(1, cellCount)));
}

function remapSector(sector: number, sourceCount: number, targetCount: number): number {
  return Math.round(sector / sourceCount * targetCount) % targetCount;
}

function sectorBearing(sector: number, sectorCount: number): number {
  if (sectorCount === 8) return sector * DIRECTIONAL_SECTOR_RADIANS;
  return sector * Math.PI * 2 / sectorCount;
}

function pointAtMapBoundary(
  map: TacticalMap,
  origin: { readonly x: number; readonly y: number },
  bearing: number,
  requestedCells: number,
): { x: number; y: number } {
  const dx = Math.cos(bearing);
  const dy = Math.sin(bearing);
  const candidates = [requestedCells];
  if (dx > 0) candidates.push((map.width - 0.001 - origin.x) / dx);
  else if (dx < 0) candidates.push((0.001 - origin.x) / dx);
  if (dy > 0) candidates.push((map.height - 0.001 - origin.y) / dy);
  else if (dy < 0) candidates.push((0.001 - origin.y) / dy);
  const distanceCells = Math.max(0.05, Math.min(...candidates.filter((value) => value > 0)));
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

function postureExposure(posture: UnitPosture, settings: StaticTacticalPositionSettings): number {
  if (posture === 'standing') return settings.postures.standingExposure;
  if (posture === 'crouched') return settings.postures.crouchedExposure;
  return settings.postures.proneExposure;
}

function assertIdentityMatchesMap(
  map: TacticalMap,
  identity: StaticTacticalPositionBasisIdentity,
  settings: StaticTacticalPositionSettings,
): void {
  if (identity.width !== map.width || identity.height !== map.height) {
    throw new Error('Static tactical identity dimensions do not match the map.');
  }
  if (identity.sectorCount !== settings.sectors.count) {
    throw new Error('Static tactical identity sector count does not match settings.');
  }
}

function encodeByte(percent: number): number {
  return Math.round(clampPercent(percent) / 100 * 255);
}

function decodeByte(value: number): number {
  return clampByte(value) / 255 * 100;
}

function decodePercent(value: number): number {
  return clampPercent(value);
}

function clampPercent(value: number): number {
  return clamp(Number.isFinite(value) ? value : 0, 0, 100);
}

function clampByte(value: number): number {
  return Math.round(clamp(Number.isFinite(value) ? value : 0, 0, 255));
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
