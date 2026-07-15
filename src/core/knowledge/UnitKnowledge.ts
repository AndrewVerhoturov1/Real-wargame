import { distance, type GridPosition } from '../geometry';
import { type MapObject, type MapObjectKind, type TacticalMap } from '../map/MapModel';
import { getMapRevisionSnapshot } from '../map/MapRuntimeState';
import type { PressureZone } from '../pressure/PressureZone';
import type { SimulationState } from '../simulation/SimulationState';
import type { UnitModel } from '../units/UnitModel';
import { computeLineOfSight } from '../visibility/LineOfSight';

const NEAR_COVER_METERS = 35;
const PLAN_COVER_METERS = 500;
const MAX_COVER_ROWS = 10;
const MAX_DANGER_ROWS = 6;
const FAR_FOREST_BUCKET_CELLS = 5;

const COVER_KINDS = new Set<MapObjectKind>([
  'tree',
  'rock',
  'structure',
  'cover',
  'ditch',
  'crates',
  'fence',
  'post',
  'logs',
  'well',
  'bridge',
]);

export interface KnowledgeCover {
  id: string;
  labelRu: string;
  kindRu: string;
  x: number;
  y: number;
  distanceMeters: number;
  quality: number;
  sourceRu: string;
  visibleNow: boolean;
  currentCover: boolean;
}

export interface KnowledgeDanger {
  id: string;
  labelRu: string;
  x: number;
  y: number;
  distanceMeters: number;
  sourceRu: string;
  confidenceRu: string;
  visibleNow: boolean;
  strength: number;
}

export interface UnitKnowledgeReport {
  viewRangeMeters: number;
  knownAreaMeters: number;
  nearbyCovers: KnowledgeCover[];
  planCovers: KnowledgeCover[];
  dangers: KnowledgeDanger[];
}

interface UnitKnowledgeCacheEntry {
  readonly map: TacticalMap;
  readonly key: string;
  readonly report: UnitKnowledgeReport;
}

const reportCache = new WeakMap<UnitModel, UnitKnowledgeCacheEntry>();

export function buildUnitKnowledgeReport(state: SimulationState, unit: UnitModel): UnitKnowledgeReport {
  const key = buildUnitKnowledgeCacheKey(state, unit);
  const cached = reportCache.get(unit);
  if (cached && cached.map === state.map && cached.key === key) return cached.report;

  const viewRangeMeters = unit.viewRangeCells * state.map.metersPerCell;
  const knownAreaMeters = Math.max(viewRangeMeters, PLAN_COVER_METERS);
  const allCovers = [
    ...buildObjectCovers(state.map, unit),
    ...buildForestCovers(state.map, unit),
  ];

  const nearbyCovers = allCovers
    .filter((cover) => cover.distanceMeters <= NEAR_COVER_METERS)
    .sort(compareCoverForCurrentUse)
    .slice(0, MAX_COVER_ROWS);
  const planCovers = allCovers
    .filter((cover) => cover.distanceMeters > NEAR_COVER_METERS && cover.distanceMeters <= PLAN_COVER_METERS && cover.visibleNow)
    .sort(compareCoverForPlan)
    .slice(0, MAX_COVER_ROWS);
  const dangers = buildKnownDangers(state, unit)
    .sort((a, b) => Number(b.visibleNow) - Number(a.visibleNow) || a.distanceMeters - b.distanceMeters)
    .slice(0, MAX_DANGER_ROWS);

  const report = {
    viewRangeMeters,
    knownAreaMeters,
    nearbyCovers,
    planCovers,
    dangers,
  };
  reportCache.set(unit, { map: state.map, key, report });
  return report;
}

function buildUnitKnowledgeCacheKey(state: SimulationState, unit: UnitModel): string {
  const revisions = getMapRevisionSnapshot(state.map);
  return [
    state.map.width,
    state.map.height,
    state.map.metersPerCell,
    revisions.height,
    revisions.forest,
    revisions.objects,
    unit.position.x.toFixed(3),
    unit.position.y.toFixed(3),
    unit.viewRangeCells.toFixed(3),
    unit.behaviorRuntime.posture,
    state.pressureZones.map((zone) => [
      zone.id,
      zone.labels.ru,
      zone.shape,
      zone.x.toFixed(3),
      zone.y.toFixed(3),
      zone.radiusCells.toFixed(3),
      zone.widthCells.toFixed(3),
      zone.heightCells.toFixed(3),
      zone.strength.toFixed(2),
    ].join(':')).join('|'),
  ].join('#');
}

function buildObjectCovers(map: TacticalMap, unit: UnitModel): KnowledgeCover[] {
  const covers: KnowledgeCover[] = [];

  for (const object of map.objects) {
    if (!COVER_KINDS.has(object.kind)) {
      continue;
    }

    const distanceMeters = distance(unit.position, { x: object.x, y: object.y }) * map.metersPerCell;
    if (distanceMeters > PLAN_COVER_METERS) {
      continue;
    }

    const lineOfSight = computeLineOfSight(map, unit, { x: object.x, y: object.y });
    const visibleNow = !lineOfSight.blocked || distanceMeters <= NEAR_COVER_METERS;

    covers.push({
      id: object.id,
      labelRu: object.labels?.ru ?? formatObjectKind(object.kind),
      kindRu: formatObjectKind(object.kind),
      x: object.x,
      y: object.y,
      distanceMeters,
      quality: coverQualityForObject(object, distanceMeters),
      sourceRu: visibleNow ? 'вижу сам' : 'рядом / по памяти',
      visibleNow,
      currentCover: distanceMeters <= NEAR_COVER_METERS,
    });
  }

  return covers;
}

function buildForestCovers(map: TacticalMap, unit: UnitModel): KnowledgeCover[] {
  const covers: KnowledgeCover[] = [];
  const usedFarBuckets = new Set<string>();

  for (const cell of map.cells) {
    if (cell.forest === 0) {
      continue;
    }

    const x = cell.x + 0.5;
    const y = cell.y + 0.5;
    const distanceMeters = distance(unit.position, { x, y }) * map.metersPerCell;
    if (distanceMeters > PLAN_COVER_METERS) {
      continue;
    }

    const isNear = distanceMeters <= NEAR_COVER_METERS;
    if (!isNear) {
      const bucket = `${Math.floor(cell.x / FAR_FOREST_BUCKET_CELLS)}:${Math.floor(cell.y / FAR_FOREST_BUCKET_CELLS)}:${cell.forest}`;
      if (usedFarBuckets.has(bucket)) {
        continue;
      }
      usedFarBuckets.add(bucket);
    }

    const lineOfSight = computeLineOfSight(map, unit, { x, y });
    const visibleNow = !lineOfSight.blocked || isNear;
    if (!visibleNow && !isNear) {
      continue;
    }

    covers.push({
      id: `forest-${cell.x}-${cell.y}`,
      labelRu: cell.forest === 2 ? 'густой лес' : 'редкий лес',
      kindRu: cell.forest === 2 ? 'густой лес' : 'редкий лес',
      x,
      y,
      distanceMeters,
      quality: Math.max(20, Math.min(85, (cell.forest === 2 ? 70 : 48) - distanceMeters * 0.06)),
      sourceRu: visibleNow ? 'вижу сам' : 'рядом / по памяти',
      visibleNow,
      currentCover: isNear,
    });
  }

  return covers;
}

function buildKnownDangers(state: SimulationState, unit: UnitModel): KnowledgeDanger[] {
  return state.pressureZones
    .map((zone) => buildDanger(state.map, unit, zone))
    .filter((danger): danger is KnowledgeDanger => danger !== null);
}

function buildDanger(map: TacticalMap, unit: UnitModel, zone: PressureZone): KnowledgeDanger | null {
  const target = { x: zone.x, y: zone.y };
  const distanceMeters = distance(unit.position, target) * map.metersPerCell;
  const lineOfSight = computeLineOfSight(map, unit, target);
  const visibleNow = !lineOfSight.blocked && distanceMeters <= unit.viewRangeCells * map.metersPerCell * 1.25;
  const insideZone = isUnitInsideZone(unit.position, zone);

  if (!visibleNow && !insideZone) {
    return null;
  }

  return {
    id: zone.id,
    labelRu: zone.labels.ru,
    x: zone.x,
    y: zone.y,
    distanceMeters,
    sourceRu: visibleNow ? 'вижу сам' : 'нахожусь внутри / чувствую давление',
    confidenceRu: visibleNow ? 'высокая' : 'средняя',
    visibleNow,
    strength: zone.strength,
  };
}

function isUnitInsideZone(position: GridPosition, zone: PressureZone): boolean {
  if (zone.shape === 'circle') {
    return distance(position, { x: zone.x, y: zone.y }) <= zone.radiusCells;
  }

  return (
    position.x >= zone.x - zone.widthCells / 2 &&
    position.x <= zone.x + zone.widthCells / 2 &&
    position.y >= zone.y - zone.heightCells / 2 &&
    position.y <= zone.y + zone.heightCells / 2
  );
}

function compareCoverForCurrentUse(a: KnowledgeCover, b: KnowledgeCover): number {
  return b.quality - a.quality || a.distanceMeters - b.distanceMeters;
}

function compareCoverForPlan(a: KnowledgeCover, b: KnowledgeCover): number {
  return a.distanceMeters - b.distanceMeters || b.quality - a.quality;
}

function coverQualityForObject(object: MapObject, distanceMeters: number): number {
  const base: Record<MapObjectKind, number> = {
    structure: 92,
    cover: 88,
    ditch: 82,
    logs: 76,
    rock: 72,
    crates: 68,
    fence: 58,
    tree: 50,
    post: 54,
    well: 44,
    bridge: 38,
  };

  return Math.max(5, Math.min(100, Math.round((base[object.kind] ?? 35) - distanceMeters * 0.08)));
}

function formatObjectKind(kind: MapObjectKind): string {
  const names: Record<MapObjectKind, string> = {
    tree: 'дерево',
    rock: 'камень',
    structure: 'дом',
    cover: 'укрытие',
    ditch: 'канава',
    logs: 'брёвна',
    crates: 'ящики / бочки',
    fence: 'забор',
    post: 'пост / бочки',
    well: 'колодец / круглый объект',
    bridge: 'мост',
  };
  return names[kind] ?? kind;
}
