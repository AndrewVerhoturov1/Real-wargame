import { distance, type GridPosition } from '../geometry';
import { getSelectedUnit, type SimulationState } from '../simulation/SimulationState';
import {
  getSimulationLayerState,
  setHoveredSimulationCover,
  setSelectedSimulationCover,
} from '../ui/RuntimeUiState';
import { buildUnitKnowledgeReport, type KnowledgeCover } from './UnitKnowledge';

const DEFAULT_HIT_RADIUS_CELLS = 0.72;

export function getSimulationCovers(state: SimulationState): KnowledgeCover[] {
  const unit = getSelectedUnit(state);
  if (!unit) return [];

  const report = buildUnitKnowledgeReport(state, unit);
  const covers = [...report.nearbyCovers, ...report.planCovers];
  const unique = new Map<string, KnowledgeCover>();
  for (const cover of covers) unique.set(cover.id, cover);
  return [...unique.values()];
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
