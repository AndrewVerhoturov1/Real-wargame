import type { GridPosition } from '../geometry';
import type { SimulationState } from '../simulation/SimulationState';
import {
  setHoveredSimulationCover,
  setSelectedSimulationCover,
} from '../ui/RuntimeUiState';
import type { KnowledgeCover } from './UnitKnowledge';

export interface SimulationCoverCacheDiagnostics {
  buildCount: number;
  hitCount: number;
  coverCount: number;
}

/** @deprecated Legacy cover markers were removed. Use tactical-position queries. */
export function getSimulationCovers(_state: SimulationState): KnowledgeCover[] {
  return [];
}

/** @deprecated No legacy cache remains. */
export function invalidateSimulationCoverCache(_state: SimulationState): void {
  // Intentionally empty.
}

/** @deprecated Legacy cover hit-testing was removed. */
export function findSimulationCoverAtPosition(
  _state: SimulationState,
  _position: GridPosition,
  _radiusCells?: number,
): KnowledgeCover | null {
  return null;
}

/** @deprecated Legacy cover selection was removed. */
export function selectSimulationCoverAtPosition(
  state: SimulationState,
  _position: GridPosition,
): KnowledgeCover | null {
  setSelectedSimulationCover(state, null);
  return null;
}

/** @deprecated Legacy cover hover was removed. */
export function hoverSimulationCoverAtPosition(
  state: SimulationState,
  _position: GridPosition | null,
): KnowledgeCover | null {
  setHoveredSimulationCover(state, null);
  return null;
}

/** @deprecated Legacy cover selection was removed. */
export function getSelectedSimulationCover(_state: SimulationState): KnowledgeCover | null {
  return null;
}
