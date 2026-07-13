import type { UnitPosture } from '../behavior/BehaviorModel';
import type { GridPosition } from '../geometry';
import type { TacticalMap } from '../map/MapModel';
import { getMapRevisionSnapshot } from '../map/MapRuntimeState';
import type { NavigationProfile } from '../navigation/NavigationProfiles';
import { buildNavigationGrid } from '../pathfinding/GridNavigation';
import { evaluateTerrainVisibilityRay } from '../visibility/VisibilityRaycast';
import { getVisibilityStaticGrid } from '../visibility/VisibilityStaticGrid';
import {
  getDirectionalTerrainStaticGrid,
  sampleDirectionalSlope,
} from './DirectionalTerrainStaticGrid';
import {
  buildThreatDirectionField,
  threatSectorBearingRadians,
  type DirectionalThreatSource,
} from './ThreatDirectionField';

const DEFAULT_RADIUS_CELLS = 10;
const DEFAULT_ROUGH_CANDIDATES = 32;
const DEFAULT_EXACT_CANDIDATES = 12;
const MAX_EXACT_THREATS = 3;
const MAX_CACHE_ENTRIES = 12;

export type DirectionalPositionPurpose = 'reverse_slope' | 'subcrest' | 'hidden_retreat';

export interface DirectionalTerrainPositionMetrics {
  readonly directionalSlope: number;
  readonly reverseSlopeQuality: number;
  readonly primaryThreatExposure: number;
  readonly flankExposure: number;
  readonly coverDepth: number;
  readonly crestStrength: number;
  readonly valleyStrength: number;
  readonly silhouetteRisk: number;
  readonly hiddenRetreatAvailable: boolean;
}

export interface DirectionalTerrainPositionCandidate {
  readonly position: GridPosition;
  readonly posture: UnitPosture;
  readonly score: number;
  readonly purpose: DirectionalPositionPurpose;
  readonly metrics: DirectionalTerrainPositionMetrics;
  readonly positiveReasonsRu: readonly string[];
  readonly negativeReasonsRu: readonly string[];
}

export interface DirectionalTerrainPositionReport {
  readonly cacheKey: string;
  readonly current: DirectionalTerrainPositionMetrics;
  readonly bestReverseSlopePosition: DirectionalTerrainPositionCandidate | null;
  readonly bestSubcrestPosition: DirectionalTerrainPositionCandidate | null;
  readonly bestHiddenRetreatPosition: DirectionalTerrainPositionCandidate | null;
  readonly evaluatedCandidateCount: number;
  readonly exactCandidateCount: number;
  readonly threatCount: number;
}

export interface DirectionalTerrainPositionQueryOptions {
  readonly unitId: string;
  readonly origin: GridPosition;
  readonly posture: UnitPosture;
  readonly threats: readonly DirectionalThreatSource[];
  readonly knowledgeRevision: number;
  readonly profile: NavigationProfile;
  readonly radiusCells?: number;
  readonly roughCandidateLimit?: number;
  readonly exactCandidateLimit?: number;
}

export interface DirectionalTerrainPositionQueryDiagnostics {
  readonly buildCount: number;
  readonly cacheHitCount: number;
  readonly roughCellCount: number;
  readonly exactRayCount: number;
  readonly rayProcessedCellCount: number;
  readonly cachedReportCount: number;
}

interface RuntimeCache {
  readonly reports: Map<string, DirectionalTerrainPositionReport>;
  readonly diagnostics: Omit<DirectionalTerrainPositionQueryDiagnostics, 'cachedReportCount'>;
}

interface RoughCandidate {
  readonly x: number;
  readonly y: number;
  readonly distanceCells: number;
  readonly directionalSlope: number;
  readonly reverseSlopeQuality: number;
  readonly crestStrength: number;
  readonly valleyStrength: number;
  readonly silhouetteRisk: number;
  readonly roughScore: number;
}

interface ExposureResult {
  readonly primaryThreatExposure: number;
  readonly flankExposure: number;
  readonly coverDepth: number;
}

const cacheByMap = new WeakMap<TacticalMap, RuntimeCache>();

export function queryDirectionalTerrainPositions(
  map: TacticalMap,
  options: DirectionalTerrainPositionQueryOptions,
): DirectionalTerrainPositionReport {
  const runtime = getRuntime(map);
  const revisions = getMapRevisionSnapshot(map);
  const radiusCells = positiveInteger(options.radiusCells, DEFAULT_RADIUS_CELLS, 2, 40);
  const roughLimit = positiveInteger(options.roughCandidateLimit, DEFAULT_ROUGH_CANDIDATES, 4, 128);
  const exactLimit = positiveInteger(options.exactCandidateLimit, DEFAULT_EXACT_CANDIDATES, 1, 48);
  const key = [
    revisions.visual,
    revisions.terrain,
    revisions.height,
    revisions.forest,
    revisions.objects,
    options.unitId,
    quantize(options.origin.x, 0.5),
    quantize(options.origin.y, 0.5),
    options.posture,
    options.knowledgeRevision,
    options.profile.id,
    options.profile.revision,
    radiusCells,
    roughLimit,
    exactLimit,
  ].join(':');
  const existing = runtime.reports.get(key);
  if (existing) {
    runtime.diagnostics.cacheHitCount += 1;
    return existing;
  }

  const report = buildReport(map, options, key, radiusCells, roughLimit, exactLimit, runtime);
  runtime.reports.set(key, report);
  trimCache(runtime.reports, MAX_CACHE_ENTRIES);
  runtime.diagnostics.buildCount += 1;
  return report;
}

export function getDirectionalTerrainPositionQueryDiagnostics(
  map: TacticalMap,
): DirectionalTerrainPositionQueryDiagnostics {
  const runtime = getRuntime(map);
  return { ...runtime.diagnostics, cachedReportCount: runtime.reports.size };
}

export function clearDirectionalTerrainPositionQueryCache(map: TacticalMap): void {
  cacheByMap.delete(map);
}

function buildReport(
  map: TacticalMap,
  options: DirectionalTerrainPositionQueryOptions,
  cacheKey: string,
  radiusCells: number,
  roughLimit: number,
  exactLimit: number,
  runtime: RuntimeCache,
): DirectionalTerrainPositionReport {
  const terrain = getDirectionalTerrainStaticGrid(map);
  const visibility = getVisibilityStaticGrid(map);
  const navigation = buildNavigationGrid(map);
  const threatField = buildThreatDirectionField(options.origin.x, options.origin.y, options.threats);
  const primaryBearing = threatField.primarySector >= 0
    ? threatSectorBearingRadians(threatField.primarySector)
    : 0;
  const exactThreats = [...options.threats]
    .sort((left, right) => threatImportance(right) - threatImportance(left))
    .slice(0, MAX_EXACT_THREATS);
  const originX = clamp(Math.floor(options.origin.x), 0, map.width - 1);
  const originY = clamp(Math.floor(options.origin.y), 0, map.height - 1);
  const currentExposure = evaluateExposure(
    visibility,
    map.metersPerCell,
    options.origin,
    options.posture,
    exactThreats,
    threatField.primarySector,
    runtime,
  );
  const currentSlope = threatField.primarySector >= 0
    ? sampleDirectionalSlope(terrain, originX, originY, primaryBearing)
    : 0;
  const currentIndex = originY * map.width + originX;
  const current = metricsFor(
    currentSlope,
    terrain.crestStrength[currentIndex] / 255,
    terrain.valleyStrength[currentIndex] / 255,
    terrain.silhouettePotential[currentIndex] / 255,
    currentExposure,
  );

  if (threatField.primarySector < 0 || options.threats.length === 0) {
    return {
      cacheKey,
      current,
      bestReverseSlopePosition: null,
      bestSubcrestPosition: null,
      bestHiddenRetreatPosition: null,
      evaluatedCandidateCount: 0,
      exactCandidateCount: 0,
      threatCount: 0,
    };
  }

  const rough: RoughCandidate[] = [];
  const minX = Math.max(0, originX - radiusCells);
  const maxX = Math.min(map.width - 1, originX + radiusCells);
  const minY = Math.max(0, originY - radiusCells);
  const maxY = Math.min(map.height - 1, originY + radiusCells);
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const distanceCells = Math.hypot(x + 0.5 - options.origin.x, y + 0.5 - options.origin.y);
      if (distanceCells > radiusCells) continue;
      runtime.diagnostics.roughCellCount += 1;
      const index = y * map.width + x;
      if (!navigation.cells[index]?.passable) continue;
      const directionalSlope = sampleDirectionalSlope(terrain, x, y, primaryBearing);
      const reverseSlopeQuality = clamp01(-directionalSlope);
      const crestStrength = terrain.crestStrength[index] / 255;
      const valleyStrength = terrain.valleyStrength[index] / 255;
      const silhouetteRisk = terrain.silhouettePotential[index] / 255;
      const roughScore = reverseSlopeQuality * 55
        + valleyStrength * 14
        - crestStrength * 18
        - silhouetteRisk * 22
        - distanceCells * 0.45;
      rough.push({
        x,
        y,
        distanceCells,
        directionalSlope,
        reverseSlopeQuality,
        crestStrength,
        valleyStrength,
        silhouetteRisk,
        roughScore,
      });
    }
  }
  rough.sort((left, right) => right.roughScore - left.roughScore || left.distanceCells - right.distanceCells);
  const exactCandidates = rough.slice(0, Math.min(roughLimit, exactLimit));
  const evaluated = exactCandidates.map((candidate) => evaluateCandidate(
    candidate,
    options,
    visibility,
    map.metersPerCell,
    exactThreats,
    threatField.primarySector,
    runtime,
  ));

  return {
    cacheKey,
    current,
    bestReverseSlopePosition: bestForPurpose(evaluated, 'reverse_slope'),
    bestSubcrestPosition: bestForPurpose(evaluated, 'subcrest'),
    bestHiddenRetreatPosition: bestForPurpose(evaluated, 'hidden_retreat'),
    evaluatedCandidateCount: rough.length,
    exactCandidateCount: evaluated.length,
    threatCount: options.threats.length,
  };
}

function evaluateCandidate(
  rough: RoughCandidate,
  options: DirectionalTerrainPositionQueryOptions,
  visibility: ReturnType<typeof getVisibilityStaticGrid>,
  metersPerCell: number,
  exactThreats: readonly DirectionalThreatSource[],
  primarySector: number,
  runtime: RuntimeCache,
): readonly DirectionalTerrainPositionCandidate[] {
  const position = { x: rough.x + 0.5, y: rough.y + 0.5 };
  const exposure = evaluateExposure(
    visibility,
    metersPerCell,
    position,
    options.posture,
    exactThreats,
    primarySector,
    runtime,
  );
  const metrics = metricsFor(
    rough.directionalSlope,
    rough.crestStrength,
    rough.valleyStrength,
    rough.silhouetteRisk,
    exposure,
  );
  return (['reverse_slope', 'subcrest', 'hidden_retreat'] as const).map((purpose) => ({
    position,
    posture: options.posture,
    score: scoreCandidate(purpose, rough.distanceCells, metrics),
    purpose,
    metrics,
    positiveReasonsRu: positiveReasons(metrics),
    negativeReasonsRu: negativeReasons(metrics),
  }));
}

function evaluateExposure(
  visibility: ReturnType<typeof getVisibilityStaticGrid>,
  metersPerCell: number,
  position: GridPosition,
  posture: UnitPosture,
  threats: readonly DirectionalThreatSource[],
  primarySector: number,
  runtime: RuntimeCache,
): ExposureResult {
  if (threats.length === 0) return { primaryThreatExposure: 0, flankExposure: 0, coverDepth: 0 };
  const weighted = threats.map((threat) => ({ threat, importance: threatImportance(threat) }));
  const totalImportance = Math.max(0.001, weighted.reduce((sum, item) => sum + item.importance, 0));
  let primaryVisible = 0;
  let primaryTotal = 0;
  let flankExposure = 0;
  let hiddenWeight = 0;

  for (const item of weighted) {
    const sector = sectorForBearing(Math.atan2(item.threat.y - position.y, item.threat.x - position.x));
    const result = evaluateTerrainVisibilityRay(
      visibility,
      { x: item.threat.x, y: item.threat.y },
      position,
      1.6,
      postureHeightMeters(posture),
      metersPerCell,
    );
    runtime.diagnostics.exactRayCount += 1;
    runtime.diagnostics.rayProcessedCellCount += result.processedCells;
    const visibleStrength = result.visible ? item.importance * result.transmission : 0;
    if (sector === primarySector) {
      primaryTotal += item.importance;
      primaryVisible += visibleStrength;
    } else {
      flankExposure = Math.max(flankExposure, visibleStrength / totalImportance);
    }
    if (!result.visible) {
      const depth = result.blockedBy === 'forest'
        ? clamp01(1 - result.transmission)
        : clamp01(0.45 + result.occlusionDepthMeters / 1.5);
      hiddenWeight += item.importance * depth;
    }
  }

  return {
    primaryThreatExposure: primaryTotal > 0 ? clamp01(primaryVisible / primaryTotal) : 0,
    flankExposure: clamp01(flankExposure),
    coverDepth: clamp01(hiddenWeight / totalImportance),
  };
}

function metricsFor(
  directionalSlope: number,
  crestStrength: number,
  valleyStrength: number,
  silhouetteRisk: number,
  exposure: ExposureResult,
): DirectionalTerrainPositionMetrics {
  const reverseSlopeQuality = clamp01(-directionalSlope);
  return {
    directionalSlope,
    reverseSlopeQuality,
    primaryThreatExposure: exposure.primaryThreatExposure,
    flankExposure: exposure.flankExposure,
    coverDepth: exposure.coverDepth,
    crestStrength,
    valleyStrength,
    silhouetteRisk,
    hiddenRetreatAvailable: reverseSlopeQuality >= 0.35
      && exposure.primaryThreatExposure <= 0.35
      && (exposure.coverDepth >= 0.35 || valleyStrength >= 0.35),
  };
}

function scoreCandidate(
  purpose: DirectionalPositionPurpose,
  distanceCells: number,
  metrics: DirectionalTerrainPositionMetrics,
): number {
  const distancePenalty = distanceCells * 0.5;
  if (purpose === 'subcrest') {
    const subcrestShape = clamp01(1 - Math.abs(metrics.crestStrength - 0.42) / 0.42);
    return roundScore(
      metrics.reverseSlopeQuality * 25
      + metrics.coverDepth * 30
      + subcrestShape * 26
      - metrics.primaryThreatExposure * 30
      - metrics.flankExposure * 18
      - metrics.silhouetteRisk * 24
      - distancePenalty,
    );
  }
  if (purpose === 'hidden_retreat') {
    return roundScore(
      metrics.coverDepth * 42
      + metrics.reverseSlopeQuality * 30
      + metrics.valleyStrength * 18
      - metrics.primaryThreatExposure * 45
      - metrics.flankExposure * 25
      - metrics.silhouetteRisk * 15
      - distanceCells * 0.3,
    );
  }
  return roundScore(
    metrics.reverseSlopeQuality * 45
    + metrics.coverDepth * 35
    + metrics.valleyStrength * 12
    - metrics.primaryThreatExposure * 35
    - metrics.flankExposure * 20
    - metrics.crestStrength * 12
    - metrics.silhouetteRisk * 22
    - distancePenalty,
  );
}

function bestForPurpose(
  evaluated: readonly (readonly DirectionalTerrainPositionCandidate[])[],
  purpose: DirectionalPositionPurpose,
): DirectionalTerrainPositionCandidate | null {
  const candidates = evaluated.flat().filter((candidate) => candidate.purpose === purpose);
  candidates.sort((left, right) => right.score - left.score);
  return candidates[0] ?? null;
}

function positiveReasons(metrics: DirectionalTerrainPositionMetrics): string[] {
  const reasons: string[] = [];
  if (metrics.reverseSlopeQuality >= 0.45) reasons.push('обратный склон прикрывает от главного направления');
  if (metrics.coverDepth >= 0.45) reasons.push('точка глубоко скрыта рельефом или объектом');
  if (metrics.primaryThreatExposure <= 0.2) reasons.push('низкая открытость главной угрозе');
  if (metrics.flankExposure <= 0.2) reasons.push('низкая фланговая открытость');
  if (metrics.valleyStrength >= 0.35) reasons.push('ложбина помогает скрытому движению');
  if (metrics.hiddenRetreatAvailable) reasons.push('есть условия для скрытого отхода');
  return reasons;
}

function negativeReasons(metrics: DirectionalTerrainPositionMetrics): string[] {
  const reasons: string[] = [];
  if (metrics.primaryThreatExposure >= 0.55) reasons.push('позиция видна с главного направления');
  if (metrics.flankExposure >= 0.4) reasons.push('позиция открыта с фланга');
  if (metrics.crestStrength >= 0.55) reasons.push('позиция находится на гребне');
  if (metrics.silhouetteRisk >= 0.55) reasons.push('высокий риск силуэта');
  return reasons;
}

function threatImportance(threat: DirectionalThreatSource): number {
  const confidence = clamp01(threat.confidence / 100);
  const force = clamp01(Math.max(threat.strength, threat.suppression) / 100);
  const uncertainty = Math.max(0, threat.uncertaintyCells);
  return confidence * (0.25 + force * 0.75) / (1 + uncertainty / 4);
}

function sectorForBearing(value: number): number {
  const full = Math.PI * 2;
  const normalized = value < 0 ? value + full : value;
  return Math.round(normalized / (Math.PI / 4)) % 8;
}

function postureHeightMeters(posture: UnitPosture): number {
  switch (posture) {
    case 'prone': return 0.35;
    case 'crouched': return 1.05;
    case 'standing':
    default: return 1.7;
  }
}

function getRuntime(map: TacticalMap): RuntimeCache {
  let runtime = cacheByMap.get(map);
  if (!runtime) {
    runtime = {
      reports: new Map(),
      diagnostics: {
        buildCount: 0,
        cacheHitCount: 0,
        roughCellCount: 0,
        exactRayCount: 0,
        rayProcessedCellCount: 0,
      },
    };
    cacheByMap.set(map, runtime);
  }
  return runtime;
}

function positiveInteger(value: number | undefined, fallback: number, min: number, max: number): number {
  const numeric = Number.isFinite(value) ? Math.round(value ?? fallback) : fallback;
  return clamp(numeric, min, max);
}

function quantize(value: number, step: number): string {
  return (Math.round(value / step) * step).toFixed(2);
}

function trimCache<T>(cache: Map<string, T>, maximum: number): void {
  while (cache.size > maximum) {
    const first = cache.keys().next().value as string | undefined;
    if (!first) break;
    cache.delete(first);
  }
}

function roundScore(value: number): number {
  return Math.round(Math.max(0, Math.min(100, value)) * 10) / 10;
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
