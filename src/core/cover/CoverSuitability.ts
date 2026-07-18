import type { GridPosition } from '../geometry';
import type { TacticalMap } from '../map/MapModel';
import { getMapRevisionSnapshot } from '../map/MapRuntimeState';
import {
  buildUnitTacticalRouteContext,
  resolveUnitNavigationProfile,
} from '../navigation/NavigationRuntime';
import {
  getRouteCostFields,
  getSharedRouteCostFieldCache,
  type RouteCostFields,
} from '../navigation/RouteCostField';
import { getBuiltInNavigationProfile } from '../navigation/NavigationProfiles';
import type { SimulationState } from '../simulation/SimulationState';
import type { UnitModel } from '../units/UnitModel';

export type CoverClass = 'quick' | 'quality';

export type CoverCandidateReason =
  | 'accepted'
  | 'unreachable'
  | 'insufficient-danger-reduction'
  | 'route-too-long'
  | 'route-too-dangerous'
  | 'isolated-minimum'
  | 'dominated-by-closer-cover'
  | 'utility-too-low';

export const COVER_REJECTION_REASON_CODE = Object.freeze({
  none: 0,
  unreachable: 1,
  insufficientDangerReduction: 2,
  routeTooLong: 3,
  routeTooDangerous: 4,
  isolatedMinimum: 5,
  dominatedByCloserCover: 6,
  utilityTooLow: 7,
} as const);

export interface CoverSuitabilityConfig {
  readonly revision: number;
  readonly quickMaxRouteMeters: number;
  readonly qualityMaxRouteMeters: number;
  readonly maxVisitedCells: number;
  readonly quickMaxRouteCost: number;
  readonly qualityMaxRouteCost: number;
  readonly minimumAbsoluteDangerReduction: number;
  readonly minimumRelativeDangerReduction: number;
  readonly qualityAbsoluteDangerReduction: number;
  readonly maximumQuickRouteDanger: number;
  readonly maximumQualityRouteDanger: number;
  readonly routeDangerToleranceAboveCurrent: number;
  readonly minimumRegionCells: number;
  readonly stableNeighbourCount: number;
  readonly localDangerTolerance: number;
  readonly qualityMinimumUtility: number;
  readonly dominatedDangerTolerance: number;
  readonly dominatedDistanceRatio: number;
  readonly maxCandidatesPerClass: number;
}

export const COVER_SUITABILITY_CONFIG: CoverSuitabilityConfig = Object.freeze({
  revision: 3,
  quickMaxRouteMeters: 10,
  qualityMaxRouteMeters: 180,
  maxVisitedCells: 4096,
  quickMaxRouteCost: 28,
  qualityMaxRouteCost: 620,
  minimumAbsoluteDangerReduction: 10,
  minimumRelativeDangerReduction: 0.18,
  qualityAbsoluteDangerReduction: 17,
  maximumQuickRouteDanger: 82,
  maximumQualityRouteDanger: 72,
  routeDangerToleranceAboveCurrent: 8,
  minimumRegionCells: 2,
  stableNeighbourCount: 2,
  localDangerTolerance: 7,
  qualityMinimumUtility: 4,
  dominatedDangerTolerance: 5,
  dominatedDistanceRatio: 0.62,
  maxCandidatesPerClass: 8,
});

export interface CoverSourceVersions {
  readonly dangerFieldKey: string;
  readonly routeCostFieldKey: string;
  readonly navigationMapRevisionKey: string;
  readonly knownThreatRevision: number;
  readonly mapRevisionKey: string;
}

export interface CoverRegionSummary {
  readonly id: number;
  readonly coverClass: CoverClass;
  readonly areaCells: number;
  readonly minimumDanger: number;
  readonly averageDanger: number;
  readonly bestCellIndex: number;
  readonly bestPosition: GridPosition;
}

export interface CoverCandidateDiagnostic {
  readonly index: number;
  readonly x: number;
  readonly y: number;
  readonly position: GridPosition;
  readonly coverClass: CoverClass;
  readonly accepted: boolean;
  readonly reason: CoverCandidateReason;
  readonly currentDanger: number;
  readonly positionDanger: number;
  readonly absoluteDangerReduction: number;
  readonly relativeDangerReduction: number;
  readonly routeLengthMeters: number;
  readonly routeCost: number;
  readonly routeDanger: number;
  readonly averageRouteDanger: number;
  readonly regionId: number;
  readonly regionAreaCells: number;
  readonly regionMinimumDanger: number;
  readonly regionAverageDanger: number;
  readonly suitability: number;
  readonly utility: number;
}

export interface CoverSuitabilityResult {
  readonly unitId: string;
  readonly width: number;
  readonly height: number;
  readonly cacheKey: string;
  readonly coverSuitabilityField: Uint8Array;
  readonly quickCoverMask: Uint8Array;
  readonly qualityCoverMask: Uint8Array;
  /** Compact per-cell rejection codes; detailed objects are created only for top candidates. */
  readonly rejectionReasonCodes: Uint8Array;
  readonly bestQuickCoverCandidates: readonly CoverCandidateDiagnostic[];
  readonly bestQualityCoverCandidates: readonly CoverCandidateDiagnostic[];
  readonly regions: readonly CoverRegionSummary[];
  readonly versions: CoverSourceVersions;
  readonly currentDanger: number;
  readonly visitedCellCount: number;
}

export interface CoverSuitabilityDiagnostics {
  readonly buildCount: number;
  readonly cacheHitCount: number;
  readonly visitedCellCount: number;
  readonly lastCacheKey: string;
}

interface MutableDiagnostics {
  buildCount: number;
  cacheHitCount: number;
  visitedCellCount: number;
  lastCacheKey: string;
}

interface SearchWorkspace {
  width: number;
  height: number;
  routeCost: Float64Array;
  routeMeters: Float32Array;
  routeDangerSum: Float32Array;
  routeDangerMax: Uint8Array;
  routeSteps: Uint16Array;
  settled: Uint8Array;
  touched: Int32Array;
  touchedCount: number;
  regionQueue: Int32Array;
  regionVisited: Uint8Array;
  heapIndices: Int32Array;
  heapCosts: Float64Array;
  heapPositions: Int32Array;
  heapSize: number;
}

interface RegionBuild {
  summary: CoverRegionSummary;
  cells: number[];
}

const DIRECTION_X = new Int8Array([1, 0, -1, 0, 1, -1, -1, 1]);
const DIRECTION_Y = new Int8Array([0, 1, 0, -1, 1, 1, -1, -1]);
const DIRECTION_LENGTH = new Float32Array([1, 1, 1, 1, Math.SQRT2, Math.SQRT2, Math.SQRT2, Math.SQRT2]);

const resultCache = new WeakMap<UnitModel, { map: TacticalMap; key: string; result: CoverSuitabilityResult }>();
const workspaceByMap = new WeakMap<TacticalMap, SearchWorkspace>();
const diagnostics: MutableDiagnostics = {
  buildCount: 0,
  cacheHitCount: 0,
  visitedCellCount: 0,
  lastCacheKey: '',
};

export function getCoverSuitability(
  state: SimulationState,
  unit: UnitModel,
  config: CoverSuitabilityConfig = COVER_SUITABILITY_CONFIG,
): CoverSuitabilityResult {
  const resolved = resolveUnitNavigationProfile(unit).profile;
  // A diagnostic/direct profile may publish no danger weight. Cover remains based on
  // the canonical danger field, so use the balanced profile only to prepare fields.
  const profile = resolved.dangerWeight > 0 ? resolved : getBuiltInNavigationProfile('normal');
  const context = buildUnitTacticalRouteContext(unit, {
    freshness: 'immediate',
    metersPerCell: state.map.metersPerCell,
  });
  const fields = getRouteCostFields(
    state.map,
    profile,
    context,
    getSharedRouteCostFieldCache(state.map),
  );
  const startX = clampCell(Math.floor(unit.position.x), fields.width);
  const startY = clampCell(Math.floor(unit.position.y), fields.height);
  const key = [
    `unit:${unit.id}`,
    `position:${startX}:${startY}`,
    `posture:${unit.behaviorRuntime.posture}`,
    `route:${fields.cacheKey}`,
    `danger:${fields.dangerFieldKey}`,
    `config:${config.revision}`,
  ].join(';');
  const cached = resultCache.get(unit);
  if (cached?.map === state.map && cached.key === key) {
    diagnostics.cacheHitCount += 1;
    diagnostics.lastCacheKey = key;
    return cached.result;
  }

  const result = buildCoverSuitabilityFromFields(
    state.map,
    unit.id,
    unit.position,
    unit.tacticalKnowledge.revision,
    fields,
    config,
    key,
  );
  resultCache.set(unit, { map: state.map, key, result });
  diagnostics.buildCount += 1;
  diagnostics.visitedCellCount += result.visitedCellCount;
  diagnostics.lastCacheKey = key;
  return result;
}

export function buildCoverSuitabilityFromFields(
  map: TacticalMap,
  unitId: string,
  origin: GridPosition,
  knownThreatRevision: number,
  fields: RouteCostFields,
  config: CoverSuitabilityConfig = COVER_SUITABILITY_CONFIG,
  cacheKey = `cover:${unitId}:${Math.floor(origin.x)}:${Math.floor(origin.y)}:${fields.cacheKey}:${config.revision}`,
): CoverSuitabilityResult {
  const count = fields.width * fields.height;
  const suitability = new Uint8Array(count);
  const quickMask = new Uint8Array(count);
  const qualityMask = new Uint8Array(count);
  const rejectionCodes = new Uint8Array(count);
  const workspace = prepareWorkspace(map, fields.width, fields.height);
  const startX = clampCell(Math.floor(origin.x), fields.width);
  const startY = clampCell(Math.floor(origin.y), fields.height);
  const startIndex = startY * fields.width + startX;
  const currentDanger = fields.dangerPercent[startIndex] ?? 0;

  runBoundedSearch(map, fields, startIndex, workspace, config);

  for (let touchedIndex = 0; touchedIndex < workspace.touchedCount; touchedIndex += 1) {
    const index = workspace.touched[touchedIndex];
    if (index === startIndex || workspace.settled[index] === 0) continue;
    const positionDanger = fields.dangerPercent[index] ?? 0;
    const absoluteReduction = currentDanger - positionDanger;
    const relativeReduction = currentDanger > 0 ? absoluteReduction / currentDanger : 0;
    if (
      absoluteReduction < config.minimumAbsoluteDangerReduction
      || relativeReduction < config.minimumRelativeDangerReduction
    ) {
      rejectionCodes[index] = COVER_REJECTION_REASON_CODE.insufficientDangerReduction;
      continue;
    }

    const stability = evaluateLocalStability(fields, index, currentDanger, config);
    if (stability.stableNeighbours < config.stableNeighbourCount) {
      rejectionCodes[index] = COVER_REJECTION_REASON_CODE.isolatedMinimum;
      continue;
    }

    const routeMeters = workspace.routeMeters[index];
    const routeCost = workspace.routeCost[index];
    const routeDanger = workspace.routeDangerMax[index];
    const averageRouteDanger = workspace.routeSteps[index] > 0
      ? workspace.routeDangerSum[index] / workspace.routeSteps[index]
      : 0;
    const quickDangerLimit = Math.min(100, Math.max(
      config.maximumQuickRouteDanger,
      currentDanger + config.routeDangerToleranceAboveCurrent,
    ));
    const qualityDangerLimit = Math.min(100, Math.max(
      config.maximumQualityRouteDanger,
      currentDanger + config.routeDangerToleranceAboveCurrent,
    ));
    const stableAreaFactor = Math.min(1, stability.stableNeighbours / 5);
    // totalCost already contains the configured danger component. Keep path danger as
    // a hard constraint and diagnostic instead of subtracting it a second time here.
    suitability[index] = clampPercent(
      absoluteReduction * 0.72
      + relativeReduction * 34
      + stableAreaFactor * 18
      + Math.max(0, stability.neighbourAverage - positionDanger) * 0.22
      - routeCost * 0.08
      - routeMeters * 0.25,
    );

    const quickDistanceOk = routeMeters <= config.quickMaxRouteMeters + 1e-6;
    const quickCostOk = routeCost <= config.quickMaxRouteCost;
    const quickDangerOk = routeDanger <= quickDangerLimit;
    if (quickDistanceOk && quickCostOk && quickDangerOk) quickMask[index] = 1;

    const qualityUtility = calculateQualityUtility(
      absoluteReduction,
      relativeReduction,
      routeMeters,
      routeCost,
      stableAreaFactor,
    );
    const qualityDistanceOk = routeMeters > config.quickMaxRouteMeters
      && routeMeters <= config.qualityMaxRouteMeters + 1e-6;
    const qualityCostOk = routeCost <= config.qualityMaxRouteCost;
    const qualityDangerOk = routeDanger <= qualityDangerLimit;
    const qualityImprovementOk = absoluteReduction >= config.qualityAbsoluteDangerReduction;
    const qualityUtilityOk = qualityUtility >= config.qualityMinimumUtility;
    if (qualityDistanceOk && qualityCostOk && qualityDangerOk && qualityImprovementOk && qualityUtilityOk) {
      qualityMask[index] = 1;
    } else if (!quickMask[index]) {
      rejectionCodes[index] = !quickDistanceOk && routeMeters > config.qualityMaxRouteMeters
        ? COVER_REJECTION_REASON_CODE.routeTooLong
        : (!quickDangerOk && !qualityDangerOk)
          ? COVER_REJECTION_REASON_CODE.routeTooDangerous
          : COVER_REJECTION_REASON_CODE.utilityTooLow;
    }
  }

  const quickRegions = buildRegions(
    fields,
    quickMask,
    suitability,
    rejectionCodes,
    workspace,
    'quick',
    config.minimumRegionCells,
  );
  const qualityRegions = buildRegions(
    fields,
    qualityMask,
    suitability,
    rejectionCodes,
    workspace,
    'quality',
    config.minimumRegionCells,
    quickRegions.length,
  );

  const quickCandidates = quickRegions
    .map((region) => createCandidate(region, currentDanger, fields, workspace, suitability, 'quick'))
    .sort(compareQuickCandidates)
    .slice(0, config.maxCandidatesPerClass);

  const rawQualityCandidates = qualityRegions
    .map((region) => createCandidate(region, currentDanger, fields, workspace, suitability, 'quality'))
    .sort(compareQualityCandidates);
  const acceptedQualityCandidates: CoverCandidateDiagnostic[] = [];
  for (const candidate of rawQualityCandidates) {
    const dominated = acceptedQualityCandidates.some((closer) =>
      closer.routeLengthMeters <= candidate.routeLengthMeters * config.dominatedDistanceRatio
      && closer.positionDanger <= candidate.positionDanger + config.dominatedDangerTolerance,
    );
    if (dominated) {
      clearRegionMask(qualityMask, qualityRegions, candidate.regionId, rejectionCodes);
      continue;
    }
    acceptedQualityCandidates.push(candidate);
    if (acceptedQualityCandidates.length >= config.maxCandidatesPerClass) break;
  }

  const revisions = getMapRevisionSnapshot(map);
  const mapRevisionKey = [
    revisions.terrain,
    revisions.height,
    revisions.forest,
    revisions.objects,
  ].join(':');

  return {
    unitId,
    width: fields.width,
    height: fields.height,
    cacheKey,
    coverSuitabilityField: suitability,
    quickCoverMask: quickMask,
    qualityCoverMask: qualityMask,
    rejectionReasonCodes: rejectionCodes,
    bestQuickCoverCandidates: quickCandidates,
    bestQualityCoverCandidates: acceptedQualityCandidates,
    regions: [
      ...quickRegions.map((region) => region.summary),
      ...qualityRegions
        .filter((region) => qualityMask[region.summary.bestCellIndex] === 1)
        .map((region) => region.summary),
    ],
    versions: {
      dangerFieldKey: fields.dangerFieldKey,
      routeCostFieldKey: fields.cacheKey,
      navigationMapRevisionKey: fields.mapRevisionKey,
      knownThreatRevision,
      mapRevisionKey,
    },
    currentDanger,
    visitedCellCount: workspace.touchedCount,
  };
}

export function coverRejectionReasonAt(
  result: CoverSuitabilityResult,
  x: number,
  y: number,
): CoverCandidateReason {
  if (x < 0 || y < 0 || x >= result.width || y >= result.height) return 'unreachable';
  const index = y * result.width + x;
  if (result.quickCoverMask[index] === 1 || result.qualityCoverMask[index] === 1) return 'accepted';
  switch (result.rejectionReasonCodes[index]) {
    case COVER_REJECTION_REASON_CODE.insufficientDangerReduction: return 'insufficient-danger-reduction';
    case COVER_REJECTION_REASON_CODE.routeTooLong: return 'route-too-long';
    case COVER_REJECTION_REASON_CODE.routeTooDangerous: return 'route-too-dangerous';
    case COVER_REJECTION_REASON_CODE.isolatedMinimum: return 'isolated-minimum';
    case COVER_REJECTION_REASON_CODE.dominatedByCloserCover: return 'dominated-by-closer-cover';
    case COVER_REJECTION_REASON_CODE.utilityTooLow: return 'utility-too-low';
    default: return 'unreachable';
  }
}

export function invalidateCoverSuitability(unit: UnitModel): void {
  resultCache.delete(unit);
}

export function getCoverSuitabilityDiagnostics(): CoverSuitabilityDiagnostics {
  return { ...diagnostics };
}

export function resetCoverSuitabilityDiagnostics(): void {
  diagnostics.buildCount = 0;
  diagnostics.cacheHitCount = 0;
  diagnostics.visitedCellCount = 0;
  diagnostics.lastCacheKey = '';
}

function runBoundedSearch(
  map: TacticalMap,
  fields: RouteCostFields,
  startIndex: number,
  workspace: SearchWorkspace,
  config: CoverSuitabilityConfig,
): void {
  resetWorkspace(workspace);
  workspace.routeCost[startIndex] = 0;
  workspace.routeMeters[startIndex] = 0;
  // Route danger intentionally starts after leaving the current cell. Current danger
  // is the comparison baseline and must not prevent an emergency escape from it.
  workspace.routeDangerSum[startIndex] = 0;
  workspace.routeDangerMax[startIndex] = 0;
  workspace.routeSteps[startIndex] = 0;
  touch(workspace, startIndex);
  heapPushOrDecrease(workspace, startIndex, 0);
  let visited = 0;

  while (workspace.heapSize > 0 && visited < config.maxVisitedCells) {
    const currentIndex = heapPop(workspace);
    if (currentIndex < 0 || workspace.settled[currentIndex] === 1) continue;
    workspace.settled[currentIndex] = 1;
    visited += 1;

    const currentMeters = workspace.routeMeters[currentIndex];
    if (currentMeters >= config.qualityMaxRouteMeters) continue;
    const currentX = currentIndex % fields.width;
    const currentY = Math.floor(currentIndex / fields.width);

    for (let direction = 0; direction < DIRECTION_X.length; direction += 1) {
      const dx = DIRECTION_X[direction];
      const dy = DIRECTION_Y[direction];
      const stepLength = DIRECTION_LENGTH[direction];
      const nextX = currentX + dx;
      const nextY = currentY + dy;
      if (!isPassable(fields, nextX, nextY)) continue;
      if (dx !== 0 && dy !== 0 && (
        !isPassable(fields, currentX + dx, currentY)
        || !isPassable(fields, currentX, currentY + dy)
      )) continue;

      const nextIndex = nextY * fields.width + nextX;
      if (workspace.settled[nextIndex] === 1) continue;
      const nextMeters = currentMeters + stepLength * map.metersPerCell;
      if (nextMeters > config.qualityMaxRouteMeters + 1e-6) continue;
      const leftCost = fields.totalCost[currentIndex];
      const rightCost = fields.totalCost[nextIndex];
      if (!Number.isFinite(leftCost) || !Number.isFinite(rightCost)) continue;
      const stepCost = stepLength * Math.max(0.05, (leftCost + rightCost) / 2);
      const nextCost = workspace.routeCost[currentIndex] + stepCost;
      if (nextCost > config.qualityMaxRouteCost || nextCost + 1e-9 >= workspace.routeCost[nextIndex]) continue;

      if (!Number.isFinite(workspace.routeCost[nextIndex])) touch(workspace, nextIndex);
      workspace.routeCost[nextIndex] = nextCost;
      workspace.routeMeters[nextIndex] = nextMeters;
      const danger = fields.dangerPercent[nextIndex] ?? 0;
      workspace.routeDangerSum[nextIndex] = workspace.routeDangerSum[currentIndex] + danger;
      workspace.routeDangerMax[nextIndex] = Math.max(workspace.routeDangerMax[currentIndex], danger);
      workspace.routeSteps[nextIndex] = Math.min(65535, workspace.routeSteps[currentIndex] + 1);
      heapPushOrDecrease(workspace, nextIndex, nextCost);
    }
  }
}

function evaluateLocalStability(
  fields: RouteCostFields,
  index: number,
  currentDanger: number,
  config: CoverSuitabilityConfig,
): { stableNeighbours: number; neighbourAverage: number } {
  const x = index % fields.width;
  const y = Math.floor(index / fields.width);
  const danger = fields.dangerPercent[index] ?? 0;
  let stableNeighbours = 0;
  let sum = 0;
  let samples = 0;
  for (let direction = 0; direction < DIRECTION_X.length; direction += 1) {
    const nx = x + DIRECTION_X[direction];
    const ny = y + DIRECTION_Y[direction];
    if (!isPassable(fields, nx, ny)) continue;
    const neighbourDanger = fields.dangerPercent[ny * fields.width + nx] ?? 0;
    sum += neighbourDanger;
    samples += 1;
    if (
      neighbourDanger <= danger + config.localDangerTolerance
      && currentDanger - neighbourDanger >= config.minimumAbsoluteDangerReduction * 0.65
    ) stableNeighbours += 1;
  }
  return {
    stableNeighbours,
    neighbourAverage: samples > 0 ? sum / samples : danger,
  };
}

function buildRegions(
  fields: RouteCostFields,
  mask: Uint8Array,
  suitability: Uint8Array,
  rejectionCodes: Uint8Array,
  workspace: SearchWorkspace,
  coverClass: CoverClass,
  minimumCells: number,
  idOffset = 0,
): RegionBuild[] {
  for (let index = 0; index < workspace.touchedCount; index += 1) {
    workspace.regionVisited[workspace.touched[index]] = 0;
  }
  const regions: RegionBuild[] = [];
  for (let touchedIndex = 0; touchedIndex < workspace.touchedCount; touchedIndex += 1) {
    const seed = workspace.touched[touchedIndex];
    if (mask[seed] === 0 || workspace.regionVisited[seed] === 1) continue;
    let queueStart = 0;
    let queueEnd = 0;
    workspace.regionQueue[queueEnd++] = seed;
    workspace.regionVisited[seed] = 1;
    const cells: number[] = [];
    let minimumDanger = 100;
    let dangerSum = 0;
    let bestIndex = seed;
    let bestScore = -1;

    while (queueStart < queueEnd) {
      const index = workspace.regionQueue[queueStart++];
      cells.push(index);
      const danger = fields.dangerPercent[index] ?? 0;
      minimumDanger = Math.min(minimumDanger, danger);
      dangerSum += danger;
      if (suitability[index] > bestScore) {
        bestScore = suitability[index];
        bestIndex = index;
      }
      const x = index % fields.width;
      const y = Math.floor(index / fields.width);
      for (let direction = 0; direction < DIRECTION_X.length; direction += 1) {
        const nx = x + DIRECTION_X[direction];
        const ny = y + DIRECTION_Y[direction];
        if (nx < 0 || ny < 0 || nx >= fields.width || ny >= fields.height) continue;
        const neighbour = ny * fields.width + nx;
        if (mask[neighbour] === 0 || workspace.regionVisited[neighbour] === 1) continue;
        workspace.regionVisited[neighbour] = 1;
        workspace.regionQueue[queueEnd++] = neighbour;
      }
    }

    if (cells.length < minimumCells) {
      for (const index of cells) {
        mask[index] = 0;
        rejectionCodes[index] = COVER_REJECTION_REASON_CODE.isolatedMinimum;
      }
      continue;
    }
    const id = idOffset + regions.length;
    regions.push({
      cells,
      summary: {
        id,
        coverClass,
        areaCells: cells.length,
        minimumDanger,
        averageDanger: dangerSum / cells.length,
        bestCellIndex: bestIndex,
        bestPosition: {
          x: bestIndex % fields.width + 0.5,
          y: Math.floor(bestIndex / fields.width) + 0.5,
        },
      },
    });
  }
  return regions;
}

function createCandidate(
  region: RegionBuild,
  currentDanger: number,
  fields: RouteCostFields,
  workspace: SearchWorkspace,
  suitability: Uint8Array,
  coverClass: CoverClass,
): CoverCandidateDiagnostic {
  const index = region.summary.bestCellIndex;
  const positionDanger = fields.dangerPercent[index] ?? 0;
  const absoluteDangerReduction = currentDanger - positionDanger;
  const relativeDangerReduction = currentDanger > 0 ? absoluteDangerReduction / currentDanger : 0;
  const averageRouteDanger = workspace.routeSteps[index] > 0
    ? workspace.routeDangerSum[index] / workspace.routeSteps[index]
    : 0;
  const utility = coverClass === 'quality'
    ? calculateQualityUtility(
        absoluteDangerReduction,
        relativeDangerReduction,
        workspace.routeMeters[index],
        workspace.routeCost[index],
        Math.min(1, region.summary.areaCells / 6),
      )
    : suitability[index] - workspace.routeMeters[index] * 1.8;
  return {
    index,
    x: index % fields.width,
    y: Math.floor(index / fields.width),
    position: { ...region.summary.bestPosition },
    coverClass,
    accepted: true,
    reason: 'accepted',
    currentDanger,
    positionDanger,
    absoluteDangerReduction,
    relativeDangerReduction,
    routeLengthMeters: workspace.routeMeters[index],
    routeCost: workspace.routeCost[index],
    routeDanger: workspace.routeDangerMax[index],
    averageRouteDanger,
    regionId: region.summary.id,
    regionAreaCells: region.summary.areaCells,
    regionMinimumDanger: region.summary.minimumDanger,
    regionAverageDanger: region.summary.averageDanger,
    suitability: suitability[index],
    utility,
  };
}

function calculateQualityUtility(
  absoluteReduction: number,
  relativeReduction: number,
  routeMeters: number,
  routeCost: number,
  stability: number,
): number {
  const distancePenalty = Math.log2(1 + routeMeters / 10) * 5.5;
  return absoluteReduction * (0.72 + relativeReduction * 0.48)
    + stability * 13
    - distancePenalty
    - routeCost * 0.055;
}

function compareQuickCandidates(left: CoverCandidateDiagnostic, right: CoverCandidateDiagnostic): number {
  return left.routeLengthMeters - right.routeLengthMeters
    || left.routeCost - right.routeCost
    || left.routeDanger - right.routeDanger
    || right.absoluteDangerReduction - left.absoluteDangerReduction
    || right.regionAreaCells - left.regionAreaCells;
}

function compareQualityCandidates(left: CoverCandidateDiagnostic, right: CoverCandidateDiagnostic): number {
  return right.utility - left.utility
    || left.positionDanger - right.positionDanger
    || left.routeDanger - right.routeDanger
    || left.routeCost - right.routeCost
    || left.routeLengthMeters - right.routeLengthMeters;
}

function clearRegionMask(
  mask: Uint8Array,
  regions: RegionBuild[],
  regionId: number,
  rejectionCodes: Uint8Array,
): void {
  const region = regions.find((candidate) => candidate.summary.id === regionId);
  if (!region) return;
  for (const index of region.cells) {
    mask[index] = 0;
    rejectionCodes[index] = COVER_REJECTION_REASON_CODE.dominatedByCloserCover;
  }
}

function prepareWorkspace(map: TacticalMap, width: number, height: number): SearchWorkspace {
  const existing = workspaceByMap.get(map);
  if (existing && existing.width === width && existing.height === height) return existing;
  const count = width * height;
  const created: SearchWorkspace = {
    width,
    height,
    routeCost: new Float64Array(count),
    routeMeters: new Float32Array(count),
    routeDangerSum: new Float32Array(count),
    routeDangerMax: new Uint8Array(count),
    routeSteps: new Uint16Array(count),
    settled: new Uint8Array(count),
    touched: new Int32Array(count),
    touchedCount: 0,
    regionQueue: new Int32Array(count),
    regionVisited: new Uint8Array(count),
    heapIndices: new Int32Array(count),
    heapCosts: new Float64Array(count),
    heapPositions: new Int32Array(count),
    heapSize: 0,
  };
  created.routeCost.fill(Number.POSITIVE_INFINITY);
  created.heapPositions.fill(-1);
  workspaceByMap.set(map, created);
  return created;
}

function resetWorkspace(workspace: SearchWorkspace): void {
  for (let index = 0; index < workspace.touchedCount; index += 1) {
    const cell = workspace.touched[index];
    workspace.routeCost[cell] = Number.POSITIVE_INFINITY;
    workspace.routeMeters[cell] = 0;
    workspace.routeDangerSum[cell] = 0;
    workspace.routeDangerMax[cell] = 0;
    workspace.routeSteps[cell] = 0;
    workspace.settled[cell] = 0;
    workspace.heapPositions[cell] = -1;
  }
  workspace.touchedCount = 0;
  workspace.heapSize = 0;
}

function touch(workspace: SearchWorkspace, index: number): void {
  workspace.touched[workspace.touchedCount++] = index;
}

function heapPushOrDecrease(workspace: SearchWorkspace, index: number, cost: number): void {
  let position = workspace.heapPositions[index];
  if (position < 0) {
    position = workspace.heapSize;
    workspace.heapSize += 1;
    workspace.heapIndices[position] = index;
    workspace.heapPositions[index] = position;
  }
  workspace.heapCosts[position] = cost;
  while (position > 0) {
    const parent = (position - 1) >> 1;
    if (workspace.heapCosts[parent] <= cost) break;
    moveHeapEntry(workspace, parent, position);
    position = parent;
  }
  workspace.heapIndices[position] = index;
  workspace.heapCosts[position] = cost;
  workspace.heapPositions[index] = position;
}

function heapPop(workspace: SearchWorkspace): number {
  if (workspace.heapSize <= 0) return -1;
  const rootIndex = workspace.heapIndices[0];
  const lastPosition = workspace.heapSize - 1;
  const lastIndex = workspace.heapIndices[lastPosition];
  const lastCost = workspace.heapCosts[lastPosition];
  workspace.heapSize = lastPosition;
  workspace.heapPositions[rootIndex] = -1;
  if (lastPosition === 0) return rootIndex;

  let position = 0;
  while (true) {
    const left = position * 2 + 1;
    if (left >= lastPosition) break;
    const right = left + 1;
    const child = right < lastPosition && workspace.heapCosts[right] < workspace.heapCosts[left]
      ? right
      : left;
    if (workspace.heapCosts[child] >= lastCost) break;
    moveHeapEntry(workspace, child, position);
    position = child;
  }
  workspace.heapIndices[position] = lastIndex;
  workspace.heapCosts[position] = lastCost;
  workspace.heapPositions[lastIndex] = position;
  return rootIndex;
}

function moveHeapEntry(workspace: SearchWorkspace, from: number, to: number): void {
  const index = workspace.heapIndices[from];
  workspace.heapIndices[to] = index;
  workspace.heapCosts[to] = workspace.heapCosts[from];
  workspace.heapPositions[index] = to;
}

function isPassable(fields: RouteCostFields, x: number, y: number): boolean {
  return Number.isInteger(x)
    && Number.isInteger(y)
    && x >= 0 && y >= 0
    && x < fields.width && y < fields.height
    && fields.passable[y * fields.width + x] === 1;
}

function clampCell(value: number, size: number): number {
  return Math.max(0, Math.min(size - 1, value));
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}
