import type { UnitPosture } from '../behavior/BehaviorModel';
import { evaluateSmallArmsCover } from '../cover/SmallArmsCoverEvaluation';
import { distance, type GridPosition } from '../geometry';
import { getCell } from '../map/MapModel';
import type { SimulationState } from '../simulation/SimulationState';
import type { KnownThreatMemory, UnitModel } from '../units/UnitModel';

export type SoldierAwarenessMode = 'off' | 'all' | 'danger' | 'cover' | 'safe' | 'stealth' | 'memory' | 'uncertainty' | 'objective';

export interface SoldierAwarenessCell {
  x: number;
  y: number;
  danger: number;
  suppression: number;
  expectedProtection: number;
  coverReliability: number;
  concealment: number;
  uncertainty: number;
  safety: number;
  confidence: number;
  sourceRu: string;
}

export interface SoldierSafePosition {
  position: GridPosition;
  score: number;
  danger: number;
  expectedProtection: number;
  concealment: number;
  distanceCells: number;
  sourceRu: string;
}

export interface SoldierAwarenessReport {
  unitId: string;
  cacheKey: string;
  cells: SoldierAwarenessCell[];
  bestSafePositions: SoldierSafePosition[];
  currentPosition: SoldierAwarenessCell;
  routeDanger: number;
  threatConfidence: number;
}

interface CachedAwareness {
  key: string;
  report: SoldierAwarenessReport;
}

const cache = new WeakMap<UnitModel, CachedAwareness>();
const MAX_SAFE_POSITIONS = 8;

export function buildSoldierAwarenessReport(
  state: SimulationState,
  unit: UnitModel,
): SoldierAwarenessReport {
  const key = buildCacheKey(state, unit);
  const cached = cache.get(unit);
  if (cached?.key === key) return cached.report;

  const cells: SoldierAwarenessCell[] = [];
  for (let y = 0; y < state.map.height; y += 1) {
    for (let x = 0; x < state.map.width; x += 1) {
      cells.push(evaluateAwarenessCell(state, unit, { x: x + 0.5, y: y + 0.5 }, unit.behaviorRuntime.posture));
    }
  }

  const currentPosition = evaluateAwarenessCell(state, unit, unit.position, unit.behaviorRuntime.posture);
  const bestSafePositions = cells
    .map((cell) => ({
      position: { x: cell.x + 0.5, y: cell.y + 0.5 },
      score: cell.safety - distance(unit.position, { x: cell.x + 0.5, y: cell.y + 0.5 }) * 1.8,
      danger: cell.danger,
      expectedProtection: cell.expectedProtection,
      concealment: cell.concealment,
      distanceCells: distance(unit.position, { x: cell.x + 0.5, y: cell.y + 0.5 }),
      sourceRu: cell.sourceRu,
    }))
    .filter((item) => item.distanceCells <= 12 && item.score > 18)
    .sort((left, right) => right.score - left.score)
    .slice(0, MAX_SAFE_POSITIONS);
  const routeDanger = unit.order
    ? evaluateRouteDanger(state, unit, unit.position, unit.order.target)
    : currentPosition.danger;
  const threatConfidence = unit.tacticalKnowledge.threats.length > 0
    ? Math.round(Math.max(...unit.tacticalKnowledge.threats.map((threat) => threat.confidence)))
    : 0;

  const report: SoldierAwarenessReport = {
    unitId: unit.id,
    cacheKey: key,
    cells,
    bestSafePositions,
    currentPosition,
    routeDanger,
    threatConfidence,
  };
  cache.set(unit, { key, report });
  return report;
}

export function evaluateRouteDanger(
  state: SimulationState,
  unit: UnitModel,
  start: GridPosition,
  end: GridPosition,
): number {
  const length = distance(start, end);
  const samples = Math.max(2, Math.ceil(length * 2));
  let total = 0;
  for (let index = 0; index <= samples; index += 1) {
    const t = index / samples;
    const point = { x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t };
    total += evaluateAwarenessCell(state, unit, point, unit.behaviorRuntime.posture).danger;
  }
  return Math.round(total / (samples + 1));
}

function evaluateAwarenessCell(
  state: SimulationState,
  unit: UnitModel,
  position: GridPosition,
  posture: UnitPosture,
): SoldierAwarenessCell {
  const cell = getCell(state.map, Math.floor(position.x), Math.floor(position.y));
  let remainingSafe = 1;
  let remainingUnsuppressed = 1;
  let confidenceTotal = 0;
  let confidenceWeight = 0;
  let uncertainty = 0;
  const terrainConcealment = forestConcealment(cell?.forest ?? 0);
  let strongestCover = {
    expectedProtection: 0,
    reliability: 0,
    concealment: terrainConcealment,
    sourceRu: terrainConcealment > 0 ? 'лес' : 'открытая местность',
  };
  let bestConcealment = terrainConcealment;
  let bestConcealmentSource = strongestCover.sourceRu;

  for (const threat of unit.tacticalKnowledge.threats) {
    const factor = threatFactorAtPosition(position, threat);
    if (factor <= 0) continue;

    const confidenceFactor = threat.confidence / 100;
    const cover = evaluateSmallArmsCover(state.map, { x: threat.x, y: threat.y }, position, posture);
    const uncovered = 1 - cover.expectedProtection / 100;
    const danger = clampPercent(threat.strength * factor * confidenceFactor * uncovered);
    const suppression = clampPercent(threat.suppression * factor * confidenceFactor * uncovered);
    remainingSafe *= 1 - danger / 100;
    remainingUnsuppressed *= 1 - suppression / 100;
    confidenceTotal += threat.confidence * factor;
    confidenceWeight += factor;
    uncertainty = Math.max(uncertainty, clampPercent((100 - threat.confidence) + threat.uncertaintyCells * 5));

    if (cover.expectedProtection > strongestCover.expectedProtection) {
      strongestCover = {
        expectedProtection: cover.expectedProtection,
        reliability: cover.reliability,
        concealment: Math.max(cover.concealment, terrainConcealment),
        sourceRu: cover.sourceRu,
      };
    }
    if (cover.concealment > bestConcealment) {
      bestConcealment = cover.concealment;
      bestConcealmentSource = cover.sourceRu;
    }
  }

  if (unit.tacticalKnowledge.threats.length === 0) {
    const reliefProtection = reliefLocalProtection(state, position, posture);
    strongestCover = {
      expectedProtection: reliefProtection,
      reliability: reliefProtection,
      concealment: terrainConcealment,
      sourceRu: terrainConcealment > 0 ? 'лес' : reliefProtection > 0 ? 'складка местности' : 'нет известной угрозы',
    };
  }

  const danger = clampPercent(100 * (1 - remainingSafe));
  const suppression = clampPercent(100 * (1 - remainingUnsuppressed));
  const confidence = confidenceWeight > 0 ? clampPercent(confidenceTotal / confidenceWeight) : 0;
  const terrainPenalty = terrainMovementPenalty(cell?.terrain ?? 'field');
  const concealment = clampPercent(Math.max(strongestCover.concealment, bestConcealment) + postureConcealmentBonus(posture));
  const sourceRu = bestConcealment > strongestCover.concealment ? bestConcealmentSource : strongestCover.sourceRu;
  const safety = clampPercent(
    strongestCover.expectedProtection * 0.62
      + concealment * 0.18
      + (100 - danger) * 0.45
      - suppression * 0.18
      - uncertainty * 0.08
      - terrainPenalty,
  );

  return {
    x: Math.floor(position.x),
    y: Math.floor(position.y),
    danger,
    suppression,
    expectedProtection: strongestCover.expectedProtection,
    coverReliability: strongestCover.reliability,
    concealment,
    uncertainty,
    safety,
    confidence,
    sourceRu,
  };
}

function threatFactorAtPosition(position: GridPosition, threat: KnownThreatMemory): number {
  const dx = position.x - threat.x;
  const dy = position.y - threat.y;
  const range = Math.hypot(dx, dy);
  const uncertaintyBonus = threat.uncertaintyCells;

  if (threat.mode === 'directional_fire') {
    if (range < Math.max(0, threat.minRangeCells - uncertaintyBonus)) return 0;
    if (range > threat.rangeCells + uncertaintyBonus) return 0;
    const bearing = normalizeDegrees(Math.atan2(dy, dx) * 180 / Math.PI);
    const allowedArc = Math.min(360, threat.arcDegrees + uncertaintyBonus * 10);
    if (angularDifference(bearing, threat.directionDegrees) > allowedArc / 2) return 0;
    const progress = Math.max(0, Math.min(1, (range - threat.minRangeCells) / Math.max(0.001, threat.rangeCells - threat.minRangeCells)));
    return Math.max(0.05, 1 - progress * threat.falloffPercent / 100);
  }

  if (threat.radiusCells > 0) {
    return range <= threat.radiusCells + uncertaintyBonus
      ? Math.max(0.2, 1 - range / Math.max(1, threat.radiusCells + uncertaintyBonus) * 0.35)
      : 0;
  }

  const rotation = -(threat.rotationDegrees ?? 0) * Math.PI / 180;
  const localX = dx * Math.cos(rotation) - dy * Math.sin(rotation);
  const localY = dx * Math.sin(rotation) + dy * Math.cos(rotation);
  return Math.abs(localX) <= threat.widthCells / 2 + uncertaintyBonus
    && Math.abs(localY) <= threat.heightCells / 2 + uncertaintyBonus
    ? 1
    : 0;
}

function buildCacheKey(state: SimulationState, unit: UnitModel): string {
  const objectKey = state.map.objects.map((object) => [
    object.id,
    object.x.toFixed(2),
    object.y.toFixed(2),
    object.widthCells.toFixed(2),
    object.heightCells.toFixed(2),
    object.rotationRadians.toFixed(2),
    object.coverProtection ?? '',
    object.coverReliability ?? '',
    object.concealment ?? '',
  ].join(':')).join('|');
  const terrainKey = state.map.cells.map((cell) => `${cell.height},${cell.forest},${cell.terrain}`).join(';');
  return [
    unit.id,
    unit.tacticalKnowledge.revision,
    unit.behaviorRuntime.posture,
    unit.position.x.toFixed(2),
    unit.position.y.toFixed(2),
    unit.order?.target.x.toFixed(2) ?? '',
    unit.order?.target.y.toFixed(2) ?? '',
    objectKey,
    terrainKey,
  ].join('#');
}

function reliefLocalProtection(state: SimulationState, position: GridPosition, posture: UnitPosture): number {
  const center = getCell(state.map, Math.floor(position.x), Math.floor(position.y));
  if (!center) return 0;
  const neighbors = [
    getCell(state.map, center.x - 1, center.y),
    getCell(state.map, center.x + 1, center.y),
    getCell(state.map, center.x, center.y - 1),
    getCell(state.map, center.x, center.y + 1),
  ].filter(Boolean);
  const rise = Math.max(0, ...neighbors.map((neighbor) => (neighbor?.height ?? center.height) - center.height));
  const postureBonus = posture === 'prone' ? 18 : posture === 'crouched' ? 9 : 0;
  return clampPercent(rise * 22 + postureBonus);
}

function forestConcealment(forest: number): number {
  return forest === 2 ? 82 : forest === 1 ? 52 : 0;
}

function postureConcealmentBonus(posture: UnitPosture): number {
  if (posture === 'prone') return 18;
  if (posture === 'crouched') return 8;
  return 0;
}

function terrainMovementPenalty(terrain: string): number {
  if (terrain === 'water') return 35;
  if (terrain === 'swamp') return 18;
  if (terrain === 'rough') return 7;
  return 0;
}

function normalizeDegrees(value: number): number {
  const result = value % 360;
  return result < 0 ? result + 360 : result;
}

function angularDifference(left: number, right: number): number {
  const difference = Math.abs(normalizeDegrees(left) - normalizeDegrees(right));
  return Math.min(difference, 360 - difference);
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}
