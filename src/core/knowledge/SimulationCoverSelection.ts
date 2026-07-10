import { distance, type GridPosition } from '../geometry';
import { getSelectedUnit, type SimulationState } from '../simulation/SimulationState';
import {
  getSimulationLayerState,
  setHoveredSimulationCover,
  setSelectedSimulationCover,
} from '../ui/RuntimeUiState';
import { buildUnitKnowledgeReport, type KnowledgeCover } from './UnitKnowledge';

const DEFAULT_HIT_RADIUS_CELLS = 0.72;

interface CoverCacheEntry {
  key: string;
  covers: KnowledgeCover[];
}

export interface SimulationCoverCacheDiagnostics {
  buildCount: number;
  hitCount: number;
  coverCount: number;
}

type CoverCacheDebugWindow = Window & {
  __realWargameCoverCacheDebug?: SimulationCoverCacheDiagnostics;
};

const coverCache = new WeakMap<SimulationState, CoverCacheEntry>();
let buildCount = 0;
let hitCount = 0;

export function getSimulationCovers(state: SimulationState): KnowledgeCover[] {
  const unit = getSelectedUnit(state);
  if (!unit) {
    publishDiagnostics(0);
    return [];
  }

  const key = buildCoverCacheKey(state, unit.id, unit.position.x, unit.position.y, unit.tacticalKnowledge.revision);
  const cached = coverCache.get(state);
  if (cached?.key === key) {
    hitCount += 1;
    publishDiagnostics(cached.covers.length);
    return cached.covers;
  }

  const report = buildUnitKnowledgeReport(state, unit);
  const unique = new Map<string, KnowledgeCover>();
  for (const cover of [...report.nearbyCovers, ...report.planCovers]) unique.set(cover.id, cover);
  const covers = [...unique.values()];

  coverCache.set(state, { key, covers });
  buildCount += 1;
  publishDiagnostics(covers.length);
  return covers;
}

export function invalidateSimulationCoverCache(state: SimulationState): void {
  coverCache.delete(state);
}

export function findSimulationCoverAtPosition(
  state: SimulationState,
  position: GridPosition,
  radiusCells = DEFAULT_HIT_RADIUS_CELLS,
): KnowledgeCover | null {
  let best: KnowledgeCover | null = null;
  let bestDistance = radiusCells;
  for (const cover of getSimulationCovers(state)) {
    const candidateDistance = distance(position, { x: cover.x, y: cover.y });
    if (candidateDistance <= bestDistance) {
      best = cover;
      bestDistance = candidateDistance;
    }
  }
  return best;
}

export function selectSimulationCoverAtPosition(
  state: SimulationState,
  position: GridPosition,
): KnowledgeCover | null {
  const cover = findSimulationCoverAtPosition(state, position);
  setSelectedSimulationCover(state, cover?.id ?? null);
  return cover;
}

export function hoverSimulationCoverAtPosition(
  state: SimulationState,
  position: GridPosition | null,
): KnowledgeCover | null {
  const cover = position ? findSimulationCoverAtPosition(state, position) : null;
  setHoveredSimulationCover(state, cover?.id ?? null);
  return cover;
}

export function getSelectedSimulationCover(state: SimulationState): KnowledgeCover | null {
  const selectedCoverId = getSimulationLayerState(state).selectedCoverId;
  if (!selectedCoverId) return null;
  return getSimulationCovers(state).find((cover) => cover.id === selectedCoverId) ?? null;
}

function buildCoverCacheKey(
  state: SimulationState,
  unitId: string,
  unitX: number,
  unitY: number,
  knowledgeRevision: number,
): string {
  const quarterX = Math.floor(unitX * 4) / 4;
  const quarterY = Math.floor(unitY * 4) / 4;
  const objectKey = state.map.objects
    .map((object) => [
      object.id,
      object.kind,
      object.x.toFixed(2),
      object.y.toFixed(2),
      object.widthCells.toFixed(2),
      object.heightCells.toFixed(2),
    ].join(':'))
    .join('|');

  return [
    `map:${state.map.width}x${state.map.height}:${state.map.cellSize}`,
    `scene:${state.editor.lastMessage}`,
    `objects:${objectKey}`,
    `unit:${unitId}`,
    `position:${quarterX.toFixed(2)}:${quarterY.toFixed(2)}`,
    `knowledge:${knowledgeRevision}`,
  ].join(';');
}

function publishDiagnostics(coverCount: number): void {
  (window as CoverCacheDebugWindow).__realWargameCoverCacheDebug = {
    buildCount,
    hitCount,
    coverCount,
  };
}
