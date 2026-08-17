import { getActiveEnvironmentProfile } from '../../core/map/EnvironmentProfileRuntime';
import { getSurfaceMaterial, getVegetationMaterial } from '../../core/map/EnvironmentMaterialProfile';
import { getCell, gridToCellLabel, resolveObjectCoverProperties, type MapObject, type TacticalMap } from '../../core/map/MapModel';
import { clearAttentionOverride, setAttentionMode, setSearchSector } from '../../core/perception/AttentionController';
import { radiansToDegrees, type AttentionMode } from '../../core/perception/AttentionModel';
import type { PerceptionContactMemory } from '../../core/perception/PerceptionContact';
import { applyAttentionProfileToUnit } from '../../core/perception/AttentionProfiles';
import { getAttentionProfileRegistry } from '../../core/perception/AttentionProfileStorage';
import type { SimulationState } from '../../core/simulation/SimulationState';
import { getMapObjectSpatialIndex, type MapObjectSpatialIndex } from '../../core/spatial/MapObjectSpatialIndex';
import { getDirectionalTerrainStaticGrid, type DirectionalTerrainStaticGrid } from '../../core/terrain/DirectionalTerrainStaticGrid';
import { sampleSmoothHeightLevel } from '../../core/terrain/SmoothTerrain';
import type { UnitModel } from '../../core/units/UnitModel';

export type PolygonLiveAvailability = 'available' | 'unavailable';

export interface PolygonInfoPoint {
  readonly x: number;
  readonly y: number;
  readonly pinned: boolean;
}

export interface PolygonInfoObjectItem {
  readonly id: string;
  readonly labelRu: string;
  readonly kind: MapObject['kind'];
  readonly coverProtection: number;
  readonly coverReliability: number;
  readonly concealment: number;
  readonly penetrable: boolean;
}

export interface PolygonInfoLiveData {
  readonly availability: PolygonLiveAvailability;
  readonly reasonRu: string | null;
  readonly point: PolygonInfoPoint;
  readonly cellLabel: string | null;
  readonly cellX: number | null;
  readonly cellY: number | null;
  readonly heightLevel: number | null;
  readonly slopePercent: number | null;
  readonly downhillDegrees: number | null;
  readonly surfaceNameRu: string | null;
  readonly vegetationNameRu: string | null;
  readonly passable: boolean | null;
  readonly surfaceResistance: number | null;
  readonly vegetationResistance: number | null;
  readonly physicalCost: number | null;
  readonly targetConcealment: number | null;
  readonly localConcealment: number | null;
  readonly nearbyObjects: readonly PolygonInfoObjectItem[];
  readonly nearbyUnits: { readonly availability: 'unavailable'; readonly reasonRu: string };
  readonly danger: { readonly availability: 'unavailable'; readonly reasonRu: string };
}

export type PolygonContactPresentationKind = 'current' | 'past' | 'assumption' | 'intel';

export interface PolygonContactLiveData {
  readonly id: string;
  readonly labelRu: string;
  readonly kind: PolygonContactPresentationKind;
  readonly source: PerceptionContactMemory['source'];
  readonly stage: PerceptionContactMemory['stage'];
  readonly confidence: number;
  readonly uncertaintyCells: number;
  readonly visibleNow: boolean;
  readonly observedNow: boolean;
  readonly lastKnownPosition: Readonly<{ x: number; y: number }> | null;
  readonly ageSeconds: number;
  readonly explanationRu: readonly string[];
}

export interface PolygonAttentionLiveData {
  readonly availability: PolygonLiveAvailability;
  readonly reasonRu: string | null;
  readonly unitId: string | null;
  readonly unitLabelRu: string | null;
  readonly profileId: string | null;
  readonly profileNameRu: string | null;
  readonly availableProfiles: ReadonlyArray<{ readonly id: string; readonly nameRu: string }>;
  readonly mode: AttentionMode | null;
  readonly modeSource: UnitModel['attentionRuntime']['modeSource'] | null;
  readonly focusDirectionDegrees: number | null;
  readonly focusTargetId: string | null;
  readonly searchCenterDegrees: number | null;
  readonly searchArcDegrees: number | null;
  readonly maximumVisualRangeMeters: number | null;
  readonly distanceFalloffStartMeters: number | null;
  readonly distanceFalloffExponent: number | null;
  readonly detectionVariancePercent: number | null;
  readonly focusAngleDegrees: number | null;
  readonly directAngleDegrees: number | null;
  readonly peripheralAngleDegrees: number | null;
  readonly rearMaximumRangeMeters: number | null;
  readonly contacts: readonly PolygonContactLiveData[];
}

export interface PolygonMemoryLiveData {
  readonly availability: PolygonLiveAvailability;
  readonly reasonRu: string | null;
  readonly unitId: string | null;
  readonly unitLabelRu: string | null;
  readonly contactsRevision: number | null;
  readonly lastUpdatedSeconds: number | null;
  readonly currentCount: number;
  readonly pastCount: number;
  readonly assumptionCount: number;
  readonly intelCount: number;
  readonly contacts: readonly PolygonContactLiveData[];
  readonly estimatedFront: { readonly availability: 'unavailable'; readonly reasonRu: string };
}

const NO_NEARBY_UNIT_QUERY_RU = 'Нет принятого ограниченного пространственного запроса по юнитам для hover-пути.';
const NO_DANGER_OWNER_RU = 'Нет канонического владельца опасности для этой вкладки.';
const NO_FRONT_OWNER_RU = 'Нет канонического владельца оценённого фронта; вычисление в интерфейсе запрещено.';
const OBJECT_QUERY_RADIUS_CELLS = 2;
const MAX_NEARBY_OBJECTS = 12;

export interface PolygonInfoPreparedOwners {
  readonly map: TacticalMap;
  readonly directionalTerrain: DirectionalTerrainStaticGrid;
  readonly objectIndex: MapObjectSpatialIndex;
}

/** Call outside the pointer-move path. It only captures references to canonical prepared owners. */
export function preparePolygonInfoLiveOwners(state: SimulationState): PolygonInfoPreparedOwners {
  return {
    map: state.map,
    directionalTerrain: getDirectionalTerrainStaticGrid(state.map),
    objectIndex: getMapObjectSpatialIndex(state.map),
  };
}

export function readPolygonInfoLive(
  state: SimulationState,
  point: PolygonInfoPoint,
  prepared: PolygonInfoPreparedOwners,
): PolygonInfoLiveData {
  const cellX = Math.floor(point.x);
  const cellY = Math.floor(point.y);
  const cell = getCell(state.map, cellX, cellY);
  if (!cell) return unavailableInfo(point, 'Точка находится вне карты.');

  if (prepared.map !== state.map) return unavailableInfo(point, 'Подготовленные владельцы Инфо относятся к другой карте.');

  const environment = getActiveEnvironmentProfile();
  const surface = getSurfaceMaterial(environment, cell.surfaceMaterialId);
  const vegetation = getVegetationMaterial(environment, cell.vegetationMaterialId);
  const terrain = prepared.directionalTerrain;
  const terrainIndex = cellY * state.map.width + cellX;
  const slope = terrain.slopeMagnitude[terrainIndex];
  const downhillX = terrain.downhillX[terrainIndex];
  const downhillY = terrain.downhillY[terrainIndex];
  const nearbyObjects = prepared.objectIndex
    .queryCircle({ x: point.x, y: point.y }, OBJECT_QUERY_RADIUS_CELLS)
    .slice(0, MAX_NEARBY_OBJECTS)
    .map(toInfoObject);

  return {
    availability: 'available',
    reasonRu: null,
    point,
    cellLabel: gridToCellLabel(state.map, { x: point.x, y: point.y }),
    cellX,
    cellY,
    heightLevel: sampleSmoothHeightLevel(state.map, point.x, point.y),
    slopePercent: Number.isFinite(slope) ? slope * 100 : null,
    downhillDegrees: Number.isFinite(downhillX) && Number.isFinite(downhillY) && Math.hypot(downhillX, downhillY) > 1e-6
      ? normalizeDegrees(Math.atan2(downhillY, downhillX) * 180 / Math.PI)
      : null,
    surfaceNameRu: surface.nameRu,
    vegetationNameRu: vegetation.nameRu,
    passable: surface.movement.passable,
    surfaceResistance: surface.movement.resistance,
    vegetationResistance: vegetation.movement.resistance,
    physicalCost: surface.movement.physicalCost,
    targetConcealment: vegetation.visibility.targetConcealment,
    localConcealment: vegetation.visibility.localConcealment,
    nearbyObjects,
    nearbyUnits: { availability: 'unavailable', reasonRu: NO_NEARBY_UNIT_QUERY_RU },
    danger: { availability: 'unavailable', reasonRu: NO_DANGER_OWNER_RU },
  };
}

export function readPolygonAttentionLive(state: SimulationState, unitId: string | null): PolygonAttentionLiveData {
  const unit = findUnit(state, unitId);
  const registry = getAttentionProfileRegistry();
  const availableProfiles = registry.listProfiles().map((profile) => ({ id: profile.id, nameRu: profile.nameRu }));
  if (!unit) return unavailableAttention(unitId, availableProfiles);

  const runtime = unit.attentionRuntime;
  const settings = unit.attentionSettings;
  const profile = settings.profiles[runtime.mode];
  const profileId = unit.playerAttentionProfileId;
  const profileNameRu = profileId && registry.hasProfile(profileId) ? registry.getProfile(profileId).nameRu : null;

  return {
    availability: 'available',
    reasonRu: null,
    unitId: unit.id,
    unitLabelRu: unit.labels.ru,
    profileId,
    profileNameRu,
    availableProfiles,
    mode: runtime.mode,
    modeSource: runtime.modeSource,
    focusDirectionDegrees: normalizeDegrees(radiansToDegrees(runtime.focusDirectionRadians)),
    focusTargetId: runtime.focusTargetId,
    searchCenterDegrees: normalizeDegrees(radiansToDegrees(runtime.searchCenterRadians)),
    searchArcDegrees: radiansToDegrees(runtime.searchArcRadians),
    maximumVisualRangeMeters: settings.vision.maximumVisualRangeMeters,
    distanceFalloffStartMeters: settings.vision.distanceFalloffStartMeters,
    distanceFalloffExponent: settings.vision.distanceFalloffExponent,
    detectionVariancePercent: settings.vision.detectionVariancePercent,
    focusAngleDegrees: profile.focusAngleDegrees,
    directAngleDegrees: profile.directAngleDegrees,
    peripheralAngleDegrees: profile.peripheralAngleDegrees,
    rearMaximumRangeMeters: profile.rearMaximumRangeMeters,
    contacts: unit.perceptionKnowledge.contacts.map((contact) => toContactData(contact, state.simulationTimeSeconds)),
  };
}

export function applyPolygonAttentionProfile(
  state: SimulationState,
  unitId: string,
  profileId: string,
): PolygonAttentionLiveData {
  const unit = requireUnit(state, unitId);
  const registry = getAttentionProfileRegistry();
  if (!registry.hasProfile(profileId)) throw new Error(`Unknown attention profile: ${profileId}`);
  applyAttentionProfileToUnit(unit, registry.getProfile(profileId));
  return readPolygonAttentionLive(state, unit.id);
}

export function setPolygonAttentionMode(
  state: SimulationState,
  unitId: string,
  mode: AttentionMode,
): PolygonAttentionLiveData {
  const unit = requireUnit(state, unitId);
  setAttentionMode(unit, mode, 'player');
  return readPolygonAttentionLive(state, unit.id);
}

export function setPolygonSearchSector(
  state: SimulationState,
  unitId: string,
  centerDegrees: number,
  arcDegrees: number,
): PolygonAttentionLiveData {
  const unit = requireUnit(state, unitId);
  setSearchSector(unit, centerDegrees * Math.PI / 180, arcDegrees * Math.PI / 180, 'player');
  return readPolygonAttentionLive(state, unit.id);
}

export function clearPolygonAttentionOverride(state: SimulationState, unitId: string): PolygonAttentionLiveData {
  const unit = requireUnit(state, unitId);
  clearAttentionOverride(unit);
  return readPolygonAttentionLive(state, unit.id);
}

export function readPolygonMemoryLive(state: SimulationState, unitId: string | null): PolygonMemoryLiveData {
  const unit = findUnit(state, unitId);
  if (!unit) {
    return {
      availability: 'unavailable',
      reasonRu: 'Юнит не выбран или отсутствует в текущем состоянии.',
      unitId,
      unitLabelRu: null,
      contactsRevision: null,
      lastUpdatedSeconds: null,
      currentCount: 0,
      pastCount: 0,
      assumptionCount: 0,
      intelCount: 0,
      contacts: [],
      estimatedFront: { availability: 'unavailable', reasonRu: NO_FRONT_OWNER_RU },
    };
  }

  const contacts = unit.perceptionKnowledge.contacts.map((contact) => toContactData(contact, state.simulationTimeSeconds));
  return {
    availability: 'available',
    reasonRu: null,
    unitId: unit.id,
    unitLabelRu: unit.labels.ru,
    contactsRevision: unit.perceptionKnowledge.revision,
    lastUpdatedSeconds: unit.perceptionKnowledge.lastUpdatedSeconds,
    currentCount: contacts.filter((contact) => contact.kind === 'current').length,
    pastCount: contacts.filter((contact) => contact.kind === 'past').length,
    assumptionCount: contacts.filter((contact) => contact.kind === 'assumption').length,
    intelCount: contacts.filter((contact) => contact.kind === 'intel').length,
    contacts,
    estimatedFront: { availability: 'unavailable', reasonRu: NO_FRONT_OWNER_RU },
  };
}

function unavailableInfo(point: PolygonInfoPoint, reasonRu: string): PolygonInfoLiveData {
  return {
    availability: 'unavailable', reasonRu, point, cellLabel: null, cellX: null, cellY: null,
    heightLevel: null, slopePercent: null, downhillDegrees: null, surfaceNameRu: null, vegetationNameRu: null,
    passable: null, surfaceResistance: null, vegetationResistance: null, physicalCost: null, targetConcealment: null, localConcealment: null,
    nearbyObjects: [],
    nearbyUnits: { availability: 'unavailable', reasonRu: NO_NEARBY_UNIT_QUERY_RU },
    danger: { availability: 'unavailable', reasonRu: NO_DANGER_OWNER_RU },
  };
}

function unavailableAttention(
  unitId: string | null,
  availableProfiles: ReadonlyArray<{ readonly id: string; readonly nameRu: string }>,
): PolygonAttentionLiveData {
  return {
    availability: 'unavailable', reasonRu: 'Юнит не выбран или отсутствует в текущем состоянии.', unitId,
    unitLabelRu: null, profileId: null, profileNameRu: null, availableProfiles, mode: null, modeSource: null,
    focusDirectionDegrees: null, focusTargetId: null, searchCenterDegrees: null, searchArcDegrees: null,
    maximumVisualRangeMeters: null, distanceFalloffStartMeters: null, distanceFalloffExponent: null,
    detectionVariancePercent: null, focusAngleDegrees: null, directAngleDegrees: null, peripheralAngleDegrees: null,
    rearMaximumRangeMeters: null, contacts: [],
  };
}

function toInfoObject(object: MapObject): PolygonInfoObjectItem {
  const cover = resolveObjectCoverProperties(object);
  return {
    id: object.id,
    labelRu: object.labels?.ru ?? mapObjectKindLabelRu(object.kind),
    kind: object.kind,
    coverProtection: cover.coverProtection,
    coverReliability: cover.coverReliability,
    concealment: cover.concealment,
    penetrable: cover.penetrable,
  };
}

function toContactData(contact: PerceptionContactMemory, nowSeconds: number): PolygonContactLiveData {
  return {
    id: contact.id,
    labelRu: contact.labelRu,
    kind: classifyContact(contact),
    source: contact.source,
    stage: contact.stage,
    confidence: contact.confidence,
    uncertaintyCells: contact.uncertaintyCells,
    visibleNow: contact.visibleNow,
    observedNow: contact.observedNow,
    lastKnownPosition: contact.lastKnownPosition ? { ...contact.lastKnownPosition } : null,
    ageSeconds: Math.max(0, nowSeconds - contact.lastUpdatedSeconds),
    explanationRu: [...contact.explanationRu],
  };
}

function classifyContact(contact: PerceptionContactMemory): PolygonContactPresentationKind {
  if (contact.source === 'reported') return 'intel';
  if (contact.source === 'sound' || contact.source === 'fire_pressure' || contact.stage === 'cue' || contact.stage === 'suspicion') {
    return 'assumption';
  }
  if (contact.visibleNow || contact.observedNow) return 'current';
  return 'past';
}

function findUnit(state: SimulationState, unitId: string | null): UnitModel | null {
  if (!unitId) return null;
  return state.units.find((unit) => unit.id === unitId) ?? null;
}

function requireUnit(state: SimulationState, unitId: string): UnitModel {
  const unit = findUnit(state, unitId);
  if (!unit) throw new Error(`Unit not found: ${unitId}`);
  return unit;
}

function normalizeDegrees(value: number): number {
  const normalized = value % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

function mapObjectKindLabelRu(kind: MapObject['kind']): string {
  switch (kind) {
    case 'tree': return 'Дерево';
    case 'rock': return 'Камень';
    case 'structure': return 'Сооружение';
    case 'cover': return 'Укрытие';
    case 'ditch': return 'Канава';
    case 'crates': return 'Ящики';
    case 'fence': return 'Ограда';
    case 'post': return 'Столб';
    case 'logs': return 'Брёвна';
    case 'well': return 'Колодец';
    case 'bridge': return 'Мост';
  }
}
