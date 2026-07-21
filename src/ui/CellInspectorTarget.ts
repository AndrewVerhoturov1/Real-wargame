import type { GridPosition } from '../core/geometry';
import { getSelectedUnit, type SimulationState } from '../core/simulation/SimulationState';
import type { UnitModel } from '../core/units/UnitModel';

export const ACQUIRE_RADIUS_CELLS = 2.5;
export const RELEASE_RADIUS_CELLS = 3.25;

export interface CellInspectorTarget {
  readonly cellX: number;
  readonly cellY: number;
  readonly snappedUnitId: string | null;
  readonly snappedUnitLabel: string | null;
}

/**
 * Resolves a short magnetic hover target without changing the operating-system cursor.
 * Enemy units are eligible only when the selected soldier currently sees that exact unit.
 */
export function resolveCellInspectorTarget(
  state: SimulationState,
  pointer: GridPosition,
  previousSnappedUnitId: string | null,
): CellInspectorTarget {
  const selected = getSelectedUnit(state);
  const retained = previousSnappedUnitId
    ? findUnitById(state.units, previousSnappedUnitId)
    : null;

  if (
    retained
    && isEligibleSnapUnit(state, selected, retained)
    && distanceSquared(pointer, retained.position) <= RELEASE_RADIUS_CELLS * RELEASE_RADIUS_CELLS
  ) {
    return unitTarget(state, retained);
  }

  const acquireRadiusSquared = ACQUIRE_RADIUS_CELLS * ACQUIRE_RADIUS_CELLS;
  let bestUnit: UnitModel | null = null;
  let bestDistanceSquared = acquireRadiusSquared;

  for (const unit of state.units) {
    if (!isEligibleSnapUnit(state, selected, unit)) continue;
    const candidateDistanceSquared = distanceSquared(pointer, unit.position);
    if (
      candidateDistanceSquared < bestDistanceSquared
      || (candidateDistanceSquared === bestDistanceSquared && bestUnit !== null && unit.id < bestUnit.id)
    ) {
      bestUnit = unit;
      bestDistanceSquared = candidateDistanceSquared;
    }
  }

  return bestUnit ? unitTarget(state, bestUnit) : pointerTarget(state, pointer);
}

function isEligibleSnapUnit(
  state: SimulationState,
  selected: UnitModel | undefined,
  unit: UnitModel,
): boolean {
  if (unit.id === state.selectedUnitId) return false;
  if (!selected) return unit.side === 'blue';
  if (unit.side === selected.side) return true;

  for (const contact of selected.perceptionKnowledge.contacts) {
    if (
      contact.sourceUnitId === unit.id
      && contact.source === 'visual'
      && contact.visibleNow
    ) return true;
  }
  return false;
}

function findUnitById(units: readonly UnitModel[], unitId: string): UnitModel | null {
  for (const unit of units) {
    if (unit.id === unitId) return unit;
  }
  return null;
}

function unitTarget(state: SimulationState, unit: UnitModel): CellInspectorTarget {
  return {
    cellX: clampCell(Math.floor(unit.position.x), state.map.width),
    cellY: clampCell(Math.floor(unit.position.y), state.map.height),
    snappedUnitId: unit.id,
    snappedUnitLabel: unit.labels.ru,
  };
}

function pointerTarget(state: SimulationState, pointer: GridPosition): CellInspectorTarget {
  return {
    cellX: clampCell(Math.floor(pointer.x), state.map.width),
    cellY: clampCell(Math.floor(pointer.y), state.map.height),
    snappedUnitId: null,
    snappedUnitLabel: null,
  };
}

function distanceSquared(left: GridPosition, right: GridPosition): number {
  const dx = left.x - right.x;
  const dy = left.y - right.y;
  return dx * dx + dy * dy;
}

function clampCell(value: number, size: number): number {
  return Math.max(0, Math.min(Math.max(0, size - 1), value));
}
