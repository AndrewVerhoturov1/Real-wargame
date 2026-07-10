import { findBestCoverForThreat } from '../cover/CoverEvaluation';
import { distance, type GridPosition } from '../geometry';
import {
  getCell,
  resolveObjectCoverProperties,
  type MapObject,
  type TacticalMap,
  type TerrainKind,
} from '../map/MapModel';
import { resolvePressureZoneSettings } from '../pressure/PressureZone';
import { evaluateThreatsAtPosition } from '../pressure/ThreatEvaluation';
import type { SimulationState } from '../simulation/SimulationState';
import type { UnitModel } from '../units/UnitModel';

export interface BestCoverSensor {
  exists: boolean;
  quality: number;
  distanceCells: number | null;
  distanceMeters: number | null;
  direction: string;
  position: GridPosition | null;
}

export interface KnownThreatSensor {
  exists: boolean;
  distanceCells: number | null;
  distanceMeters: number | null;
  confidence: number;
  label: string;
}

export interface EnvironmentSensorReport {
  danger: number;
  suppression: number;
  zoneStressPerSecond: number;
  cover: number;
  concealment: number;
  openness: number;
  bestCoverNearby: BestCoverSensor;
  knownThreat: KnownThreatSensor;
}

interface PlaceScore {
  cover: number;
  concealment: number;
  openness: number;
}

const BEST_COVER_SEARCH_RADIUS_CELLS = 5;

const TERRAIN_SCORES: Record<TerrainKind, PlaceScore> = {
  field: { cover: 0, concealment: 5, openness: 90 },
  forest: { cover: 20, concealment: 70, openness: 30 },
  road: { cover: 0, concealment: 0, openness: 95 },
  swamp: { cover: 10, concealment: 45, openness: 45 },
  rough: { cover: 35, concealment: 35, openness: 50 },
  water: { cover: 0, concealment: 0, openness: 100 },
};

export function buildEnvironmentSensorReport(state: SimulationState, unit: UnitModel): EnvironmentSensorReport {
  const placeScore = scorePlace(state.map, unit.position);
  const threats = evaluateThreatsAtPosition(state.map, unit, state.pressureZones);
  const bestCover = findBestCoverForThreat(
    state.map,
    unit.position,
    threats.targetPosition,
    unit.behaviorRuntime.posture,
    BEST_COVER_SEARCH_RADIUS_CELLS,
  );
  const strongest = threats.strongest;
  const threatSettings = strongest ? resolvePressureZoneSettings(strongest.zone) : null;
  const threatKnown = Boolean(strongest && threatSettings && (threatSettings.sourceKnown || threatSettings.sourceVisible));

  return {
    danger: threats.danger,
    suppression: threats.suppression,
    zoneStressPerSecond: Math.round(threats.stressPerSecond),
    cover: strongest?.coverProtection ?? placeScore.cover,
    concealment: placeScore.concealment,
    openness: placeScore.openness,
    bestCoverNearby: {
      exists: Boolean(bestCover.position),
      quality: bestCover.protection,
      distanceCells: bestCover.position ? roundOne(bestCover.distanceCells) : null,
      distanceMeters: bestCover.position ? Math.round(bestCover.distanceCells * state.map.metersPerCell) : null,
      direction: bestCover.position ? getDirectionLabel(unit.position, bestCover.position) : 'нет',
      position: bestCover.position,
    },
    knownThreat: {
      exists: threatKnown,
      distanceCells: strongest ? roundOne(strongest.distanceCells) : null,
      distanceMeters: strongest ? Math.round(strongest.distanceCells * state.map.metersPerCell) : null,
      confidence: threatKnown ? Math.max(strongest?.danger ?? 0, strongest?.suppression ?? 0) : 0,
      label: threatKnown ? strongest?.zone.labels.ru ?? 'угроза' : 'нет',
    },
  };
}

function scorePlace(map: TacticalMap, position: GridPosition): PlaceScore {
  const cell = getCell(map, Math.floor(position.x), Math.floor(position.y));
  const terrainScore = cell ? TERRAIN_SCORES[cell.terrain] : TERRAIN_SCORES.field;
  const strongestObjectScore = getStrongestObjectScoreAtPosition(map, position);

  return {
    cover: clampPercent(Math.max(terrainScore.cover, strongestObjectScore.cover)),
    concealment: clampPercent(Math.max(terrainScore.concealment, strongestObjectScore.concealment)),
    openness: clampPercent(Math.min(terrainScore.openness, strongestObjectScore.openness)),
  };
}

function getStrongestObjectScoreAtPosition(map: TacticalMap, position: GridPosition): PlaceScore {
  let bestScore: PlaceScore = { cover: 0, concealment: 0, openness: 100 };

  for (const object of map.objects) {
    if (!isPositionInsideObject(position, object)) continue;

    const properties = resolveObjectCoverProperties(object);
    const score: PlaceScore = {
      cover: properties.coverProtection,
      concealment: properties.concealment,
      openness: clampPercent(100 - Math.max(properties.coverProtection, properties.concealment) * 0.85),
    };

    if (score.cover + score.concealment > bestScore.cover + bestScore.concealment) {
      bestScore = score;
    }
  }

  return bestScore;
}

function isPositionInsideObject(position: GridPosition, object: MapObject): boolean {
  const center = {
    x: object.x + object.widthCells / 2,
    y: object.y + object.heightCells / 2,
  };
  const dx = position.x - center.x;
  const dy = position.y - center.y;
  const cos = Math.cos(-object.rotationRadians);
  const sin = Math.sin(-object.rotationRadians);
  const localX = dx * cos - dy * sin;
  const localY = dx * sin + dy * cos;

  return Math.abs(localX) <= object.widthCells / 2 && Math.abs(localY) <= object.heightCells / 2;
}

function getDirectionLabel(from: GridPosition, to: GridPosition): string {
  const dx = to.x - from.x;
  const dy = to.y - from.y;

  if (distance(from, to) < 0.01) return 'здесь';

  const horizontal = dx < -0.35 ? 'запад' : dx > 0.35 ? 'восток' : '';
  const vertical = dy < -0.35 ? 'север' : dy > 0.35 ? 'юг' : '';
  if (horizontal && vertical) return `${vertical}-${horizontal}`;
  return vertical || horizontal || 'рядом';
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function roundOne(value: number): number {
  return Math.round(value * 10) / 10;
}
