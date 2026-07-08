import { distance, type GridPosition } from '../geometry';
import { getCell, type MapObject, type MapObjectKind, type TacticalMap, type TerrainKind } from '../map/MapModel';
import { getPressureReportAtPosition, type PressureZone } from '../pressure/PressureZone';
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
  field: {
    cover: 0,
    concealment: 5,
    openness: 90,
  },
  forest: {
    cover: 20,
    concealment: 70,
    openness: 30,
  },
  road: {
    cover: 0,
    concealment: 0,
    openness: 95,
  },
  swamp: {
    cover: 10,
    concealment: 45,
    openness: 45,
  },
  rough: {
    cover: 35,
    concealment: 35,
    openness: 50,
  },
  water: {
    cover: 0,
    concealment: 0,
    openness: 100,
  },
};

const OBJECT_SCORES: Record<MapObjectKind, PlaceScore> = {
  tree: {
    cover: 15,
    concealment: 55,
    openness: 35,
  },
  rock: {
    cover: 55,
    concealment: 15,
    openness: 35,
  },
  structure: {
    cover: 75,
    concealment: 55,
    openness: 10,
  },
  cover: {
    cover: 80,
    concealment: 35,
    openness: 15,
  },
  ditch: {
    cover: 90,
    concealment: 60,
    openness: 10,
  },
  crates: {
    cover: 35,
    concealment: 25,
    openness: 45,
  },
  fence: {
    cover: 25,
    concealment: 15,
    openness: 60,
  },
  post: {
    cover: 45,
    concealment: 25,
    openness: 45,
  },
  logs: {
    cover: 50,
    concealment: 25,
    openness: 40,
  },
  well: {
    cover: 35,
    concealment: 15,
    openness: 45,
  },
  bridge: {
    cover: 15,
    concealment: 5,
    openness: 85,
  },
};

export function buildEnvironmentSensorReport(state: SimulationState, unit: UnitModel): EnvironmentSensorReport {
  const placeScore = scorePlace(state.map, unit.position);
  const pressureReport = getPressureReportAtPosition(unit.position, state.pressureZones);
  const bestCoverNearby = findBestCoverNearby(state.map, unit.position);
  const knownThreat = findNearestKnownThreat(state.pressureZones, unit.position, state.map.metersPerCell);

  return {
    danger: pressureReport ? Math.round(pressureReport.rawPressure) : 0,
    zoneStressPerSecond: pressureReport ? Math.round(pressureReport.stressPerSecond) : 0,
    cover: placeScore.cover,
    concealment: placeScore.concealment,
    openness: placeScore.openness,
    bestCoverNearby,
    knownThreat,
  };
}

function scorePlace(map: TacticalMap, position: GridPosition): PlaceScore {
  const cellX = Math.floor(position.x);
  const cellY = Math.floor(position.y);
  const cell = getCell(map, cellX, cellY);
  const terrainScore = cell ? TERRAIN_SCORES[cell.terrain] : TERRAIN_SCORES.field;
  const strongestObjectScore = getStrongestObjectScoreAtPosition(map, position);

  return {
    cover: clampPercent(Math.max(terrainScore.cover, strongestObjectScore.cover)),
    concealment: clampPercent(Math.max(terrainScore.concealment, strongestObjectScore.concealment)),
    openness: clampPercent(Math.min(terrainScore.openness, strongestObjectScore.openness)),
  };
}

function getStrongestObjectScoreAtPosition(map: TacticalMap, position: GridPosition): PlaceScore {
  let bestScore: PlaceScore = {
    cover: 0,
    concealment: 0,
    openness: 100,
  };

  for (const object of map.objects) {
    if (!isPositionInsideObject(position, object)) {
      continue;
    }

    const score = OBJECT_SCORES[object.kind];

    if (score.cover + score.concealment > bestScore.cover + bestScore.concealment) {
      bestScore = score;
    }
  }

  return bestScore;
}

function findBestCoverNearby(map: TacticalMap, position: GridPosition): BestCoverSensor {
  const currentScore = scorePlace(map, position);
  let bestPosition: GridPosition | null = null;
  let bestQuality = currentScore.cover;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let yOffset = -BEST_COVER_SEARCH_RADIUS_CELLS; yOffset <= BEST_COVER_SEARCH_RADIUS_CELLS; yOffset += 1) {
    for (let xOffset = -BEST_COVER_SEARCH_RADIUS_CELLS; xOffset <= BEST_COVER_SEARCH_RADIUS_CELLS; xOffset += 1) {
      const candidate: GridPosition = {
        x: Math.floor(position.x + xOffset) + 0.5,
        y: Math.floor(position.y + yOffset) + 0.5,
      };
      const candidateDistance = distance(position, candidate);

      if (candidateDistance === 0 || candidateDistance > BEST_COVER_SEARCH_RADIUS_CELLS) {
        continue;
      }

      if (candidate.x < 0.5 || candidate.y < 0.5 || candidate.x > map.width - 0.5 || candidate.y > map.height - 0.5) {
        continue;
      }

      const score = scorePlace(map, candidate);
      const isBetterQuality = score.cover > bestQuality;
      const isSameQualityCloser = score.cover === bestQuality && candidateDistance < bestDistance;

      if (isBetterQuality || isSameQualityCloser) {
        bestPosition = candidate;
        bestQuality = score.cover;
        bestDistance = candidateDistance;
      }
    }
  }

  const hasBetterCover = bestPosition !== null && bestQuality > currentScore.cover;

  return {
    exists: hasBetterCover,
    quality: hasBetterCover ? bestQuality : currentScore.cover,
    distanceCells: hasBetterCover ? roundOne(bestDistance) : null,
    distanceMeters: hasBetterCover ? Math.round(bestDistance * map.metersPerCell) : null,
    direction: hasBetterCover && bestPosition ? getDirectionLabel(position, bestPosition) : 'нет',
    position: hasBetterCover ? bestPosition : null,
  };
}

function findNearestKnownThreat(
  zones: PressureZone[],
  position: GridPosition,
  metersPerCell: number,
): KnownThreatSensor {
  let nearestZone: PressureZone | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const zone of zones) {
    const zoneCenter = { x: zone.x, y: zone.y };
    const zoneDistance = Math.max(0, distance(position, zoneCenter) - getThreatZoneRadius(zone));

    if (zoneDistance < nearestDistance) {
      nearestDistance = zoneDistance;
      nearestZone = zone;
    }
  }

  if (!nearestZone) {
    return {
      exists: false,
      distanceCells: null,
      distanceMeters: null,
      confidence: 0,
      label: 'нет',
    };
  }

  const confidence = clampPercent(nearestZone.strength - nearestDistance * 7);

  return {
    exists: confidence > 0,
    distanceCells: roundOne(nearestDistance),
    distanceMeters: Math.round(nearestDistance * metersPerCell),
    confidence: Math.round(confidence),
    label: nearestZone.labels.ru,
  };
}

function getThreatZoneRadius(zone: PressureZone): number {
  if (zone.shape === 'circle') {
    return zone.radiusCells;
  }

  return Math.max(zone.widthCells, zone.heightCells) / 2;
}

function isPositionInsideObject(position: GridPosition, object: MapObject): boolean {
  const center = { x: object.x + 0.5, y: object.y + 0.5 };
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

  if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) {
    return 'здесь';
  }

  const horizontal = dx < -0.35 ? 'запад' : dx > 0.35 ? 'восток' : '';
  const vertical = dy < -0.35 ? 'север' : dy > 0.35 ? 'юг' : '';

  if (horizontal && vertical) {
    return `${vertical}-${horizontal}`;
  }

  return vertical || horizontal || 'рядом';
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function roundOne(value: number): number {
  return Math.round(value * 10) / 10;
}
