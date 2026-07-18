import { distance, type GridPosition } from '../geometry';
import type { TacticalMap } from '../map/MapModel';
import { getMapRevisionSnapshot } from '../map/MapRuntimeState';
import type { PressureZone } from '../pressure/PressureZone';
import type { SimulationState } from '../simulation/SimulationState';
import type { UnitModel } from '../units/UnitModel';
import { computeLineOfSight } from '../visibility/LineOfSight';

const PLAN_KNOWLEDGE_METERS = 500;
const MAX_DANGER_ROWS = 6;

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
  dangers: KnowledgeDanger[];
}

interface UnitKnowledgeCacheEntry {
  readonly map: TacticalMap;
  readonly key: string;
  readonly report: UnitKnowledgeReport;
}

const reportCache = new WeakMap<UnitModel, UnitKnowledgeCacheEntry>();

/**
 * Lightweight knowledge summary for UI-only consumers.
 *
 * Cover candidates deliberately do not belong here. They are produced by the
 * canonical CoverSuitability system from danger, route-cost and navigation fields.
 */
export function buildUnitKnowledgeReport(state: SimulationState, unit: UnitModel): UnitKnowledgeReport {
  const key = buildUnitKnowledgeCacheKey(state, unit);
  const cached = reportCache.get(unit);
  if (cached && cached.map === state.map && cached.key === key) return cached.report;

  const viewRangeMeters = unit.viewRangeCells * state.map.metersPerCell;
  const report: UnitKnowledgeReport = {
    viewRangeMeters,
    knownAreaMeters: Math.max(viewRangeMeters, PLAN_KNOWLEDGE_METERS),
    dangers: buildKnownDangers(state, unit)
      .sort((left, right) => Number(right.visibleNow) - Number(left.visibleNow) || left.distanceMeters - right.distanceMeters)
      .slice(0, MAX_DANGER_ROWS),
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
    unit.tacticalKnowledge.revision,
    state.pressureZones.map((zone) => [
      zone.id,
      zone.x.toFixed(3),
      zone.y.toFixed(3),
      zone.strength.toFixed(2),
    ].join(':')).join('|'),
  ].join('#');
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
  if (!visibleNow && !insideZone) return null;
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
  if (zone.shape === 'circle') return distance(position, { x: zone.x, y: zone.y }) <= zone.radiusCells;
  return position.x >= zone.x - zone.widthCells / 2
    && position.x <= zone.x + zone.widthCells / 2
    && position.y >= zone.y - zone.heightCells / 2
    && position.y <= zone.y + zone.heightCells / 2;
}
