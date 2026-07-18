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
  revision: 1,
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
  parent: Int32Array;
  touched: Int32Array;
  touchedCount: number;
  regionQueue: Int32Array;
  regionVisited: Uint8Array;
}

interface RegionBuild {
  summary: CoverRegionSummary;
  cells: number[];
}

const DIAGONAL = Math.SQRT2;
const DIRECTIONS: ReadonlyArray<readonly [number, number, number]> = [
  [1, 0, 1], [0, 1, 1], [-1, 0, 1], [0, -1, 1],
  [1, 1, DIAGONAL], [-1, 1, DIAGONAL], [-1, -1, DIAGONAL], [1, -1, DIAGONAL],
];

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
  // A diagnostic/direct profile deliberately does not publish danger. Cover suitability
  // must still use the canonical danger field, so fall back to the balanced profile only
  // for field preparation while preserving the same navigation grid and map revisions.
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
    `knowledge:${unit.tacticalKnowledge.revision}`,
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
    ) continue;

    const stability = evaluateLocalStability(fields, index, currentDanger, config);
    if (stability.stableNeighbours < config.stableNeighbourCount) continue;

    const routeMeters = workspace.routeMeters[index];
    const routeCost = workspace.routeCost[index];
    const routeDanger = workspace.routeDangerMax[index];
    const averageRouteDanger = workspace.routeSteps[index] > 0
      ? workspace.routeDangerSum[index] / workspace.routeSteps[index]
      : currentDanger;
    const routeDangerLimit = Math.min(
      100,
      Math.max(currentDanger + config.routeDangerToleranceAboveCurrent, config.maximumQualityRouteDanger),
    );
    const stableAreaFactor = Math.min(1, stability.stableNeighbours / 5);
    const baseSuitability = clampPercent(
      absoluteReduction * 0.72
      + relativeReduction * 34
      + stableAreaFactor * 18
      + Math.max(0, stability.neighbourAverage - positionDanger) * 0.22
      - averageRouteDanger * 0.09,
    );
    suitability[index] = baseSuitability;

    if (
      routeMeters <= config.quickMaxRouteMeters + 1e-6
      && routeCost <= config.quickMaxRouteCost
      && routeDanger <= Math.min(config.maximumQuickRouteDanger, routeDangerLimit)
    ) {
      quickMask[index] = 1;
    }

    const qualityUtility = calculateQualityUtility(
      absoluteReduction,
      relativeReduction,
      routeMeters,
      routeCost,
      routeDanger,
      stableAreaFactor,
    );
    if (
      routeMeters > config.quickMaxRouteMeters
      && routeMeters <= config.qualityMaxRouteMeters + 1e-6
      && routeCost <= config.qualityMaxRouteCost
      && absoluteReduction >= config.qualityAbsoluteDangerReduction
      && routeDanger <= routeDangerLimit
      && routeDanger <= config.maximumQualityRouteDanger
      && qualityUtility >= config.qualityMinimumUtility
    ) {
      qualityMask[index] = 1;
    }
  }

  const quickRegions = buildRegions(
    fields,
    quickMask,
    suitability,
    workspace,
    'quick',
    config.minimumRegionCells,
  );
  const qualityRegions = buildRegions(
    fields,
    qualityMask,
    suitability,
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
      clearRegionMask(qualityMask, qualityRegions, candidate.regionId);
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
  const heap = new MinHeap();
  workspace.routeCost[startIndex] = 0;
  workspace.routeMeters[startIndex] = 0;
  workspace.routeDangerSum[startIndex] = fields.dangerPercent[startIndex] ?? 0;
  workspace.routeDangerMax[startIndex] = fields.dangerPercent[startIndex] ?? 0;
  workspace.routeSteps[startIndex] = 1;
  workspace.parent[startIndex] = -1;
  touch(workspace, startIndex);
  heap.push(startIndex, 0);
  let visited = 0;

  while (heap.size > 0 && visited < config.maxVisitedCells) {
    const current = heap.pop();
    if (!current || workspace.settled[current.index] === 1) continue;
    if (current.cost > workspace.routeCost[current.index] + 1e-9) continue;
    workspace.settled[current.index] = 1;
    visited += 1;

    const currentMeters = workspace.routeMeters[current.index];
    if (currentMeters >= config.qualityMaxRouteMeters) continue;
    const currentX = current.index % fields.width;
    const currentY = Math.floor(current.index / fields.width);

    for (const [dx, dy, stepLength] of DIRECTIONS) {
      const nextX = currentX + dx;
      const nextY = currentY + dy;
      if (!isPassable(fields, nextX, nextY)) continue;
      if (dx !== 0 && dy !== 0 && (
        !isPassable(fields, currentX + dx, currentY)
        || !isPassable(fields, currentX, currentY + dy)
      )) continue;

      const nextIndex = nextY * fields.width + nextX;
      const nextMeters = currentMeters + stepLength * map.metersPerCell;
      if (nextMeters > config.qualityMaxRouteMeters + 1e-6) continue;
      const leftCost = fields.totalCost[current.index];
      const rightCost = fields.totalCost[nextIndex];
      if (!Number.isFinite(leftCost) || !Number.isFinite(rightCost)) continue;
      const stepCost = stepLength * Math.max(0.05, (leftCost + rightCost) / 2);
      const nextCost = workspace.routeCost[current.index] + stepCost;
      if (nextCost > config.qualityMaxRouteCost || nextCost + 1e-9 >= workspace.routeCost[nextIndex]) continue;

      if (!Number.isFinite(workspace.routeCost[nextIndex])) touch(workspace, nextIndex);
      workspace.routeCost[nextIndex] = nextCost;
      workspace.routeMeters[nextIndex] = nextMeters;
      const danger = fields.dangerPercent[nextIndex] ?? 0;
      workspace.routeDangerSum[nextIndex] = workspace.routeDangerSum[current.index] + danger;
      workspace.routeDangerMax[nextIndex] = Math.max(workspace.routeDangerMax[current.index], danger);
      workspace.routeSteps[nextIndex] = Math.min(65535, workspace.routeSteps[current.index] + 1);
      workspace.parent[nextIndex] = current.index;
      heap.push(nextIndex, nextCost);
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
  for (const [dx, dy] of DIRECTIONS) {
    const nx = x + dx;
    const ny = y + dy;
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
  workspace: SearchWorkspace,
  coverClass: CoverClass,
  minimumCells: number,
  idOffset = 0,
): RegionBuild[] {
  workspace.regionVisited.fill(0);
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
      for (const [dx, dy] of DIRECTIONS) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= fields.width || ny >= fields.height) continue;
        const neighbour = ny * fields.width + nx;
        if (mask[neighbour] === 0 || workspace.regionVisited[neighbour] === 1) continue;
        workspace.regionVisited[neighbour] = 1;
        workspace.regionQueue[queueEnd++] = neighbour;
      }
    }

    if (cells.length < minimumCells) {
      for (const index of cells) mask[index] = 0;
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
    : currentDanger;
  const utility = coverClass === 'quality'
    ? calculateQualityUtility(
        absoluteDangerReduction,
        relativeDangerReduction,
        workspace.routeMeters[index],
        workspace.routeCost[index],
        workspace.routeDangerMax[index],
        Math.min(1, region.summary.areaCells / 6),
      )
    : suitability[index] - workspace.routeMeters[index] * 1.8 - averageRouteDanger * 0.1;
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
  routeDanger: number,
  stability: number,
): number {
  const distancePenalty = Math.log2(1 + routeMeters / 10) * 5.5;
  return absoluteReduction * (0.72 + relativeReduction * 0.48)
    + stability * 13
    - distancePenalty
    - routeCost * 0.055
    - routeDanger * 0.12;
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

function clearRegionMask(mask: Uint8Array, regions: RegionBuild[], regionId: number): void {
  const region = regions.find((candidate) => candidate.summary.id === regionId);
  if (!region) return;
  for (const index of region.cells) mask[index] = 0;
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
    parent: new Int32Array(count),
    touched: new Int32Array(count),
    touchedCount: 0,
    regionQueue: new Int32Array(count),
    regionVisited: new Uint8Array(count),
  };
  created.routeCost.fill(Number.POSITIVE_INFINITY);
  created.parent.fill(-1);
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
    workspace.parent[cell] = -1;
  }
  workspace.touchedCount = 0;
}

function touch(workspace: SearchWorkspace, index: number): void {
  workspace.touched[workspace.touchedCount++] = index;
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

interface HeapItem {
  index: number;
  cost: number;
}

class MinHeap {
  private readonly values: HeapItem[] = [];

  get size(): number {
    return this.values.length;
  }

  push(index: number, cost: number): void {
    const value = { index, cost };
    this.values.push(value);
    let child = this.values.length - 1;
    while (child > 0) {
      const parent = Math.floor((child - 1) / 2);
      if (this.values[parent].cost <= value.cost) break;
      this.values[child] = this.values[parent];
      child = parent;
    }
    this.values[child] = value;
  }

  pop(): HeapItem | null {
    if (this.values.length === 0) return null;
    const root = this.values[0];
    const last = this.values.pop();
    if (!last || this.values.length === 0) return root;
    let parent = 0;
    while (true) {
      const left = parent * 2 + 1;
      if (left >= this.values.length) break;
      const right = left + 1;
      const child = right < this.values.length && this.values[right].cost < this.values[left].cost
        ? right
        : left;
      if (this.values[child].cost >= last.cost) break;
      this.values[parent] = this.values[child];
      parent = child;
    }
    this.values[parent] = last;
    return root;
  }
}
