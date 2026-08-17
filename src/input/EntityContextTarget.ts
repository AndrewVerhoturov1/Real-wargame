import type { GridPosition } from '../core/geometry';
import { getMapObjectCenter, isPointInsideMapObject } from '../core/map/MapObjectGeometry';
import type { SimulationState } from '../core/simulation/SimulationState';
import { findUnitAtGridPosition } from '../core/units/UnitModel';

export type EntityContextTarget =
  | {
      readonly kind: 'unit';
      readonly id: string;
      readonly anchorGrid: GridPosition;
      readonly labelRu: string;
    }
  | {
      readonly kind: 'map-object';
      readonly id: string;
      readonly anchorGrid: GridPosition;
      readonly labelRu: string;
    };

/**
 * Resolve the real entity under a discrete pointer-down. This deliberately does
 * not run from pointer-move/ticker paths: unit picking reuses the canonical unit
 * helper and map-object picking reuses canonical map-object geometry.
 */
export function resolveEntityContextTarget(
  state: SimulationState,
  grid: GridPosition,
): EntityContextTarget | null {
  const unit = findUnitAtGridPosition(state.units, grid);
  if (unit) {
    return Object.freeze({
      kind: 'unit',
      id: unit.id,
      anchorGrid: Object.freeze({ ...unit.position }),
      labelRu: unit.labels.ru || unit.id,
    });
  }

  for (let index = state.map.objects.length - 1; index >= 0; index -= 1) {
    const object = state.map.objects[index];
    if (!object || !isPointInsideMapObject(object, grid)) continue;
    return Object.freeze({
      kind: 'map-object',
      id: object.id,
      anchorGrid: Object.freeze(getMapObjectCenter(object)),
      labelRu: object.labels?.ru || object.id,
    });
  }

  return null;
}
