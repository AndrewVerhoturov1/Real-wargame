import type { UnitPosture } from '../behavior/BehaviorModel';
import {
  getSoldierDangerField,
  type SoldierDangerField,
  type SoldierDangerFieldContext,
} from '../knowledge/SoldierDangerField';
import type { TacticalMap } from '../map/MapModel';
import { getMapRevisionSnapshot } from '../map/MapRuntimeState';
import { resolveCellVegetationDefinition } from '../map/VegetationDefinition';
import { buildNavigationGrid } from '../pathfinding/GridNavigation';
import {
  getDirectionalTerrainSectorBasis,
  type DirectionalTerrainSectorBasis,
} from '../terrain/DirectionalTerrainSectorBasis';
import {
  getDirectionalTerrainStaticGrid,
  type DirectionalTerrainStaticGrid,
} from '../terrain/DirectionalTerrainStaticGrid';
import type { FireThreatClass } from '../units/UnitModel';
import {
  prepareDirectionalRouteCostProjection,
  writeDirectionalRouteCostCell,
  type PreparedDirectionalRouteCostProjection,
} from './DirectionalRouteCostProjection';
import type { NavigationProfile, NavigationTerrainCostKey } from './NavigationProfiles';

const NAVIGATION_TERRAIN_KEYS: readonly NavigationTerrainCostKey[] = [
  'road',
  'field',
  'sparseForest',
  'denseForest',
  'rough',
  'swamp',
  'bridge',
  'ditch',
];
const NAVIGATION_TERRAIN_KEY_CODE = new Map<NavigationTerrainCostKey, number>(
  NAVIGATION_TERRAIN_KEYS.map((key, index) => [key, index]),
);

const mapIdentityByMap = new WeakMap<TacticalMap, number>();
let nextMapIdentity = 1;

export interface TacticalRouteKnownThreat {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly radiusCells: number;
  readonly widthCells: number;
  readonly heightCells: number;
  readonly rotationDegrees: number;
  readonly mode: 'area' | 'directional_fire';
  readonly strength: number;
  readonly suppression: number;
  readonly confidence: number;
  readonly uncertaintyCells: number;
  readonly directionDegrees?: number;
  readonly arcDegrees?: number;
  readonly rangeCells?: number;
  readonly minRangeCells?: number;
  readonly falloffPercent?: number;
  readonly fireThreatClass?: FireThreatClass | null;
}

export interface TacticalRouteContext {
  /** Metadata for diagnostics/ownership; world-field identity does not depend on the observer id. */
  readonly unitId: string;
  /** Changes static awareness and target-height visibility geometry. */
  readonly posture?: UnitPosture;
  readonly knowledgeRevision: number;
  readonly knownThreats: readonly TacticalRouteKnownThreat[];
  readonly exposureRevision?: number;
  readonly territoryRevision?: number;
}

export interface RouteCostAvailability {
  readonly danger: boolean;
  readonly exposure: boolean;
  readonly directionalTerrain: boolean;
  readonly cover: boolean;
  readonly enemyDistance: boolean;
  readonly territory: boolean;
}

export interface RouteCostFieldDiagnostics {
  readonly staticCostBuildCount: number;
  readonly dynamicCostBuildCount: number;
  readonly combinedCostBuildCount: number;
  readonly textureUploadCount: number;
  readonly hoverReadCount: number;
  readonly fullMapScanCount: number;
  readonly profileRevision: number;
  readonly knowledgeRevision: number;
  readonly snapshotReuseCount: number;
}

export interface RouteCostCellBreakdown {
  readonly passable: boolean;
  readonly terrainKey: NavigationTerrainCostKey;
  readonly terrainCost: number;
  readonly slopeCost: number;
  readonly dangerCost: number;
  readonly exposureCost: number;
  readonly directionalTerrainCost: number;
  readonly directionalSlope: number;
  readonly crestStrength: number;
  readonly valleyStrength: number;
  readonly silhouettePotential: number;
  readonly coverAdjustment: number;
  readonly enemyDistanceCost: number;
  readonly territoryCost: number;
  readonly totalCost: number;
  readonly availability: RouteCostAvailability;
}

interface StaticRouteCostField {
  readonly key: string;
  readonly width: number;
  readonly height: number;
  readonly passable: Uint8Array;
  readonly terrainKeys: NavigationTerrainCostKey[];
  readonly terrainKeyCodes: Uint8Array;
  readonly terrainCost: Float32Array;
  readonly slopeCost: Float32Array;
  readonly coverAdjustment: Float32Array;
  readonly directionalTerrain: DirectionalTerrainStaticGrid;
}

interface DynamicRouteCostField {
  readonly key: string;
  readonly dangerFieldKey: string;
  readonly dangerPercent: Uint8Array;
  readonly dangerCost: Float32Array;
  readonly exposureCost: Float32Array;
  readonly directionalTerrainCost: Float32Array;
  readonly directionalSlope: Float32Array;
  readonly enemyDistanceCost: Float32Array;
  readonly territoryCost: Float32Array;
  readonly totalCost: Float32Array;
  readonly primaryThreatSector: number;
  readonly threatSectorWeights: Float32Array;
  readonly availability: RouteCostAvailability;
}

export interface RouteCostFields {
  readonly mapIdentity: number;
  readonly mapRevisionKey: string;
  readonly width: number;
  readonly height: number;
  readonly profileId: string;
  readonly profileRevision: number;
  readonly knowledgeRevision: number;
  readonly dangerFieldKey: string;
  readonly passable: Uint8Array;
  readonly terrainKeys: readonly NavigationTerrainCostKey[];
  readonly terrainKeyCodes: Uint8Array;
  readonly terrainCost: Float32Array;
  readonly slopeCost: Float32Array;
  readonly dangerPercent: Uint8Array;
  readonly dangerCost: Float32Array;
  readonly exposureCost: Float32Array;
  readonly directionalTerrainCost: Float32Array;
  readonly directionalSlope: Float32Array;
  readonly crestStrength: Uint8Array;
  readonly valleyStrength: Uint8Array;
  readonly silhouettePotential: Uint8Array;
  readonly primaryThreatSector: number;
  readonly threatSectorWeights: Float32Array;
  readonly coverAdjustment: Float32Array;
  readonly enemyDistanceCost: Float32Array;
  readonly territoryCost: Float32Array;
  readonly totalCost: Float32Array;
  readonly availability: RouteCostAvailability;
  readonly cacheKey: string;
}

export interface RouteCostFieldCache {
  readonly staticFields: Map<string, StaticRouteCostField>;
  readonly dynamicFields: Map<string, DynamicRouteCostField>;
  readonly combinedFields: Map<string, RouteCostFields>;
  contextFields: WeakMap<TacticalRouteContext, Map<string, RouteCostFields>>;
  diagnostics: {
    staticCostBuildCount: number;
    dynamicCostBuildCount: number;
    combinedCostBuildCount: number;
    textureUploadCount: number;
    hoverReadCount: number;
    fullMapScanCount: number;
    profileRevision: number;
    knowledgeRevision: number;
    snapshotReuseCount: number;
  };
}

const sharedCacheByMap = new WeakMap<TacticalMap, RouteCostFieldCache>();

export function createRouteCostFieldCache(): RouteCostFieldCache {
  return {
    staticFields: new Map(),
    dynamicFields: new Map(),
    combinedFields: new Map(),
    contextFields: new WeakMap(),
    diagnostics: {
      staticCostBuildCount: 0,
      dynamicCostBuildCount: 0,
      combinedCostBuildCount: 0,
      textureUploadCount: 0,
      hoverReadCount: 0,
      fullMapScanCount: 0,
      profileRevision: 0,
      knowledgeRevision: 0,
      snapshotReuseCount: 0,
    },
  };
}

/** The sole default owner for route-cost fields used by evaluators, A* and replanning. */
export function getRouteCostMapIdentity(map: TacticalMap): number {
  return getMapIdentity(map);
}

export function getSharedRouteCostFieldCache(map: TacticalMap): RouteCostFieldCache {
  const existing = sharedCacheByMap.get(map);
  if (existing) return existing;
  const created = createRouteCostFieldCache();
  sharedCacheByMap.set(map, created);
  return created;
}

export function clearSharedRouteCostFieldCache(map: TacticalMap): void {
  sharedCacheByMap.delete(map);
}

export function getRouteCostFields(
  map: TacticalMap,
  profile: NavigationProfile,
  tacticalContext: TacticalRouteContext | undefined,
  cache: RouteCostFieldCache,
): RouteCostFields {
  const revisions = getMapRevisionSnapshot(map);
  const mapIdentity = getMapIdentity(map);
  const mapRevisionKey = [revisions.terrain, revisions.height, revisions.forest, revisions.objects].join(':');
  const staticKey = [
    mapIdentity,
    map.width,
    map.height,
    revisions.terrain,
    revisions.height,
    revisions.forest,
    revisions.objects,
    profile.id,
    profile.revision,
  ].join(':');
  let staticField = cache.staticFields.get(staticKey);
  if (!staticField) {
    staticField = buildStaticField(map, profile, staticKey, cache);
    cache.staticFields.set(staticKey, staticField);
    trimCache(cache.staticFields, 8);
  }

  const contextRequestKey = tacticalContext
    ? [
      staticKey,
      tacticalContext.exposureRevision ?? 0,
      tacticalContext.territoryRevision ?? 0,
    ].join(':')
    : null;
  if (tacticalContext && contextRequestKey) {
    const ready = cache.contextFields.get(tacticalContext)?.get(contextRequestKey);
    if (ready) {
      cache.diagnostics.snapshotReuseCount += 1;
      return ready;
    }
  }

  const knowledgeRevision = tacticalContext?.knowledgeRevision ?? 0;
  const knownThreats = tacticalContext?.knownThreats ?? [];
  const hasKnownThreats = knownThreats.length > 0;
  // Profiles that do not consume danger must remain lazy. Route diagnostics use
  // bounded point sampling when no worker-owned danger field is required.
  const needsDanger = hasKnownThreats && profile.dangerWeight > 0;
  const needsDirectionalTerrain = hasKnownThreats && hasDirectionalTerrainWeights(profile);
  const usesTacticalKnowledge = needsDanger || needsDirectionalTerrain;
  const effectiveKnowledgeRevision = usesTacticalKnowledge ? knowledgeRevision : 0;
  const directionalBasis = needsDanger || needsDirectionalTerrain
    ? getDirectionalTerrainSectorBasis(map)
    : undefined;
  const directionalProjection = needsDirectionalTerrain && directionalBasis
    ? prepareDirectionalRouteCostProjection(map, directionalBasis.key, knownThreats)
    : null;
  const dangerContext = needsDanger ? buildSoldierDangerFieldContext(tacticalContext) : null;
  const dangerField = dangerContext
    ? getSoldierDangerField(map, dangerContext, { directionalBasis })
    : null;
  const dynamicKey = [
    staticKey,
    effectiveKnowledgeRevision,
    profile.exposureWeight > 0 ? tacticalContext?.exposureRevision ?? 0 : 0,
    tacticalContext?.territoryRevision ?? 0,
    dangerField?.key ?? 'no-danger',
    directionalProjection?.key ?? 'no-directional',
  ].join(':');
  let dynamicField = cache.dynamicFields.get(dynamicKey);
  if (!dynamicField) {
    dynamicField = buildDynamicField(
      map,
      profile,
      tacticalContext,
      dangerField,
      directionalBasis,
      directionalProjection,
      staticField,
      dynamicKey,
      cache,
    );
    cache.dynamicFields.set(dynamicKey, dynamicField);
    trimCache(cache.dynamicFields, 12);
  }

  const combinedKey = `${staticKey}|${dynamicKey}`;
  const existing = cache.combinedFields.get(combinedKey);
  if (existing) {
    publishContextField(cache, tacticalContext, contextRequestKey, existing);
    return existing;
  }

  const combined: RouteCostFields = {
    mapIdentity,
    mapRevisionKey,
    width: map.width,
    height: map.height,
    profileId: profile.id,
    profileRevision: profile.revision,
    knowledgeRevision: effectiveKnowledgeRevision,
    dangerFieldKey: dynamicField.dangerFieldKey,
    passable: staticField.passable,
    terrainKeys: staticField.terrainKeys,
    terrainKeyCodes: staticField.terrainKeyCodes,
    terrainCost: staticField.terrainCost,
    slopeCost: staticField.slopeCost,
    dangerPercent: dynamicField.dangerPercent,
    dangerCost: dynamicField.dangerCost,
    exposureCost: dynamicField.exposureCost,
    directionalTerrainCost: dynamicField.directionalTerrainCost,
    directionalSlope: dynamicField.directionalSlope,
    crestStrength: staticField.directionalTerrain.crestStrength,
    valleyStrength: staticField.directionalTerrain.valleyStrength,
    silhouettePotential: staticField.directionalTerrain.silhouettePotential,
    primaryThreatSector: dynamicField.primaryThreatSector,
    threatSectorWeights: dynamicField.threatSectorWeights,
    coverAdjustment: staticField.coverAdjustment,
    enemyDistanceCost: dynamicField.enemyDistanceCost,
    territoryCost: dynamicField.territoryCost,
    totalCost: dynamicField.totalCost,
    availability: dynamicField.availability,
    cacheKey: combinedKey,
  };
  cache.diagnostics.combinedCostBuildCount += 1;
  cache.combinedFields.set(combinedKey, combined);
  publishContextField(cache, tacticalContext, contextRequestKey, combined);
  trimCache(cache.combinedFields, 12);
  cache.diagnostics.profileRevision = profile.revision;
  cache.diagnostics.knowledgeRevision = effectiveKnowledgeRevision;
  return combined;
}

export function routeCostFieldsMatch(
  map: TacticalMap,
  profile: NavigationProfile,
  fields: RouteCostFields,
): boolean {
  const revisions = getMapRevisionSnapshot(map);
  return fields.mapIdentity === getMapIdentity(map)
    && fields.mapRevisionKey === [revisions.terrain, revisions.height, revisions.forest, revisions.objects].join(':')
    && fields.width === map.width
    && fields.height === map.height
    && fields.profileId === profile.id
    && fields.profileRevision === profile.revision;
}

export function readRouteCostCell(
  fields: RouteCostFields,
  x: number,
  y: number,
  cache?: RouteCostFieldCache,
): RouteCostCellBreakdown | null {
  if (cache) cache.diagnostics.hoverReadCount += 1;
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= fields.width || y >= fields.height) {
    return null;
  }
  const index = y * fields.width + x;
  return {
    passable: fields.passable[index] === 1,
    terrainKey: fields.terrainKeys[index]
      ?? NAVIGATION_TERRAIN_KEYS[fields.terrainKeyCodes[index] ?? 1]
      ?? 'field',
    terrainCost: fields.terrainCost[index],
    slopeCost: fields.slopeCost[index],
    dangerCost: fields.dangerCost[index],
    exposureCost: fields.exposureCost[index],
    directionalTerrainCost: fields.directionalTerrainCost[index],
    directionalSlope: fields.directionalSlope[index],
    crestStrength: fields.crestStrength[index] / 255,
    valleyStrength: fields.valleyStrength[index] / 255,
    silhouettePotential: fields.silhouettePotential[index] / 255,
    coverAdjustment: fields.coverAdjustment[index],
    enemyDistanceCost: fields.enemyDistanceCost[index],
    territoryCost: fields.territoryCost[index],
    totalCost: fields.totalCost[index],
    availability: fields.availability,
  };
}

export function markRouteCostTextureUploaded(cache: RouteCostFieldCache): void {
  cache.diagnostics.textureUploadCount += 1;
}

export function getRouteCostFieldDiagnostics(cache: RouteCostFieldCache): RouteCostFieldDiagnostics {
  return { ...cache.diagnostics };
}

export function clearRouteCostFieldCache(cache: RouteCostFieldCache): void {
  cache.staticFields.clear();
  cache.dynamicFields.clear();
  cache.combinedFields.clear();
  cache.contextFields = new WeakMap();
}

function buildStaticField(
  map: TacticalMap,
  profile: NavigationProfile,
  key: string,
  cache: RouteCostFieldCache,
): StaticRouteCostField {
  const grid = buildNavigationGrid(map);
  const directionalTerrain = getDirectionalTerrainStaticGrid(map);
  const count = map.width * map.height;
  const passable = new Uint8Array(count);
  const terrainKeys = new Array<NavigationTerrainCostKey>(count);
  const terrainKeyCodes = new Uint8Array(count);
  const terrainCost = new Float32Array(count);
  const slopeCost = new Float32Array(count);
  const coverAdjustment = new Float32Array(count);
  const ditchCells = buildPassableObjectMask(map, 'ditch');

  cache.diagnostics.staticCostBuildCount += 1;
  cache.diagnostics.fullMapScanCount += 1;

  for (let index = 0; index < count; index += 1) {
    const cell = map.cells[index];
    const navigation = grid.cells[index];
    const vegetation = resolveCellVegetationDefinition(cell);
    passable[index] = navigation.passable ? 1 : 0;
    const terrainKey = resolveTerrainKey(cell.terrain, vegetation.layer, navigation.bridge, ditchCells[index] === 1);
    terrainKeys[index] = terrainKey;
    terrainKeyCodes[index] = NAVIGATION_TERRAIN_KEY_CODE.get(terrainKey) ?? 1;
    terrainCost[index] = navigation.passable ? profile.terrainCosts[terrainKey] : Number.POSITIVE_INFINITY;
    slopeCost[index] = navigation.passable ? estimateLocalSlope(map, cell.x, cell.y) * profile.slopeWeight : 0;
    const concealment = Math.max(
      vegetation.movement.tacticalConcealment,
      ditchCells[index] ? 0.45 : 0,
    );
    coverAdjustment[index] = navigation.passable ? -profile.coverWeight * concealment : 0;
  }

  return {
    key,
    width: map.width,
    height: map.height,
    passable,
    terrainKeys,
    terrainKeyCodes,
    terrainCost,
    slopeCost,
    coverAdjustment,
    directionalTerrain,
  };
}

function buildDynamicField(
  map: TacticalMap,
  profile: NavigationProfile,
  tacticalContext: TacticalRouteContext | undefined,
  dangerField: SoldierDangerField | null,
  directionalBasis: DirectionalTerrainSectorBasis | undefined,
  directionalProjection: PreparedDirectionalRouteCostProjection | null,
  staticField: StaticRouteCostField,
  key: string,
  cache: RouteCostFieldCache,
): DynamicRouteCostField {
  const count = map.width * map.height;
  const dangerPercent = new Uint8Array(count);
  const dangerCost = new Float32Array(count);
  const exposureCost = new Float32Array(count);
  const directionalTerrainCost = new Float32Array(count);
  const directionalSlope = new Float32Array(count);
  const enemyDistanceCost = new Float32Array(count);
  const territoryCost = new Float32Array(count);
  const totalCost = new Float32Array(count);
  const knownThreats = tacticalContext?.knownThreats ?? [];
  const directionalAvailable = Boolean(
    directionalBasis
    && directionalProjection?.available
    && hasDirectionalTerrainWeights(profile),
  );

  cache.diagnostics.dynamicCostBuildCount += 1;
  cache.diagnostics.fullMapScanCount += 1;

  for (let y = 0; y < map.height; y += 1) {
    for (let x = 0; x < map.width; x += 1) {
      const index = y * map.width + x;
      if (!staticField.passable[index]) {
        totalCost[index] = Number.POSITIVE_INFINITY;
        continue;
      }
      if (dangerField) {
        const rawDanger = dangerField.danger[index] ?? 0;
        dangerPercent[index] = rawDanger;
        if (profile.dangerWeight > 0) dangerCost[index] = profile.dangerWeight * rawDanger / 100;
      }
      if (directionalAvailable && directionalBasis && directionalProjection) {
        writeDirectionalRouteCostCell(
          directionalProjection,
          directionalBasis,
          profile,
          index,
          x + 0.5,
          y + 0.5,
          directionalTerrainCost,
          directionalSlope,
        );
      }
      totalCost[index] = Math.max(0.05,
        staticField.terrainCost[index]
        + staticField.slopeCost[index]
        + dangerCost[index]
        + exposureCost[index]
        + directionalTerrainCost[index]
        + staticField.coverAdjustment[index]
        + enemyDistanceCost[index]
        + territoryCost[index]);
    }
  }

  return {
    key,
    dangerFieldKey: dangerField?.key ?? '',
    dangerPercent,
    dangerCost,
    exposureCost,
    directionalTerrainCost,
    directionalSlope,
    enemyDistanceCost,
    territoryCost,
    totalCost,
    primaryThreatSector: directionalProjection?.threatField.primarySector ?? -1,
    threatSectorWeights: directionalProjection?.threatField.normalizedSectorWeights ?? new Float32Array(8),
    availability: {
      danger: Boolean(dangerField && knownThreats.length > 0),
      exposure: false,
      directionalTerrain: directionalAvailable,
      cover: true,
      enemyDistance: false,
      territory: false,
    },
  };
}

function publishContextField(
  cache: RouteCostFieldCache,
  tacticalContext: TacticalRouteContext | undefined,
  contextRequestKey: string | null,
  field: RouteCostFields,
): void {
  if (!tacticalContext || !contextRequestKey) return;
  let readyByKey = cache.contextFields.get(tacticalContext);
  if (!readyByKey) {
    readyByKey = new Map();
    cache.contextFields.set(tacticalContext, readyByKey);
  }
  readyByKey.set(contextRequestKey, field);
}

function hasDirectionalTerrainWeights(profile: NavigationProfile): boolean {
  const value = profile.directionalTerrain;
  return value.forwardSlopePenalty > 0
    || value.reverseSlopePreference > 0
    || value.crestPenalty > 0
    || value.silhouettePenalty > 0
    || value.valleyPreference > 0;
}

function resolveTerrainKey(
  terrain: TacticalMap['cells'][number]['terrain'],
  forestLayer: number,
  bridge: boolean,
  ditch: boolean,
): NavigationTerrainCostKey {
  if (bridge) return 'bridge';
  if (ditch) return 'ditch';
  if (forestLayer >= 2) return 'denseForest';
  if (forestLayer >= 1) return 'sparseForest';
  switch (terrain) {
    case 'road': return 'road';
    case 'rough': return 'rough';
    case 'swamp': return 'swamp';
    case 'field':
    case 'water':
    default: return 'field';
  }
}

function buildPassableObjectMask(map: TacticalMap, kind: 'ditch'): Uint8Array {
  const mask = new Uint8Array(map.width * map.height);
  for (const object of map.objects) {
    if (object.kind !== kind) continue;
    const centerX = object.x + 0.5;
    const centerY = object.y + 0.5;
    const extent = Math.ceil(Math.hypot(object.widthCells, object.heightCells) / 2) + 1;
    const minX = Math.max(0, Math.floor(centerX - extent));
    const maxX = Math.min(map.width - 1, Math.ceil(centerX + extent));
    const minY = Math.max(0, Math.floor(centerY - extent));
    const maxY = Math.min(map.height - 1, Math.ceil(centerY + extent));
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        if (pointInsideRotatedObject(x + 0.5, y + 0.5, object)) mask[y * map.width + x] = 1;
      }
    }
  }
  return mask;
}

function pointInsideRotatedObject(x: number, y: number, object: TacticalMap['objects'][number]): boolean {
  const centerX = object.x + 0.5;
  const centerY = object.y + 0.5;
  const dx = x - centerX;
  const dy = y - centerY;
  const cosine = Math.cos(-object.rotationRadians);
  const sine = Math.sin(-object.rotationRadians);
  const localX = dx * cosine - dy * sine;
  const localY = dx * sine + dy * cosine;
  return Math.abs(localX) <= object.widthCells / 2 && Math.abs(localY) <= object.heightCells / 2;
}

function estimateLocalSlope(map: TacticalMap, x: number, y: number): number {
  const center = map.cells[y * map.width + x]?.height ?? 0;
  let maximum = 0;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    const nextX = x + dx;
    const nextY = y + dy;
    if (nextX < 0 || nextY < 0 || nextX >= map.width || nextY >= map.height) continue;
    maximum = Math.max(maximum, Math.abs((map.cells[nextY * map.width + nextX]?.height ?? center) - center));
  }
  return maximum;
}

function buildSoldierDangerFieldContext(
  tacticalContext: TacticalRouteContext | undefined,
): SoldierDangerFieldContext | null {
  if (!tacticalContext) return null;
  return {
    unitId: tacticalContext.unitId,
    posture: tacticalContext.posture ?? 'standing',
    knowledgeRevision: tacticalContext.knowledgeRevision,
    threats: tacticalContext.knownThreats.map((threat) => ({
      id: threat.id,
      mode: threat.mode,
      x: threat.x,
      y: threat.y,
      radiusCells: threat.radiusCells,
      widthCells: threat.widthCells,
      heightCells: threat.heightCells,
      rotationDegrees: threat.rotationDegrees,
      strength: threat.strength,
      suppression: threat.suppression,
      confidence: threat.confidence,
      uncertaintyCells: threat.uncertaintyCells,
      directionDegrees: threat.directionDegrees ?? 0,
      arcDegrees: threat.arcDegrees ?? 45,
      rangeCells: threat.rangeCells ?? Math.max(0.5, threat.radiusCells),
      minRangeCells: threat.minRangeCells ?? 0,
      falloffPercent: threat.falloffPercent ?? 0,
      fireThreatClass: threat.fireThreatClass ?? null,
    })),
  };
}

function getMapIdentity(map: TacticalMap): number {
  const existing = mapIdentityByMap.get(map);
  if (existing !== undefined) return existing;
  const identity = nextMapIdentity;
  nextMapIdentity += 1;
  mapIdentityByMap.set(map, identity);
  return identity;
}

function trimCache<T>(cache: Map<string, T>, maximum: number): void {
  while (cache.size > maximum) {
    const oldest = cache.keys().next().value as string | undefined;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}
