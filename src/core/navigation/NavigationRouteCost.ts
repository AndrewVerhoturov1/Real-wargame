import type { TacticalMap } from '../map/MapModel';
import type { MoveOrderRouteCell } from '../orders/MoveOrder';
import {
  createRouteCostFieldCache,
  getRouteCostFields,
  type RouteCostFieldCache,
  type TacticalRouteContext,
} from './RouteCostField';
import type { NavigationProfile } from './NavigationProfiles';

const CARDINAL_STEP_LENGTH = 1;
const DIAGONAL_STEP_LENGTH = Math.SQRT2;
const MINIMUM_STEP_COST = 0.05;
const sharedRouteCostFieldCache = createRouteCostFieldCache();

export function evaluateNavigationRouteCost(
  map: TacticalMap,
  cells: readonly MoveOrderRouteCell[],
  profile: NavigationProfile,
  tacticalContext: TacticalRouteContext | undefined,
  cache: RouteCostFieldCache = sharedRouteCostFieldCache,
): number {
  if (cells.length <= 1) return 0;
  const fields = getRouteCostFields(map, profile, tacticalContext, cache);
  let totalCost = 0;

  for (let index = 1; index < cells.length; index += 1) {
    const previous = cells[index - 1];
    const current = cells[index];
    if (!isCellInside(fields.width, fields.height, previous) || !isCellInside(fields.width, fields.height, current)) {
      return Number.POSITIVE_INFINITY;
    }
    const previousCost = fields.totalCost[previous.y * fields.width + previous.x];
    const currentCost = fields.totalCost[current.y * fields.width + current.x];
    if (!Number.isFinite(previousCost) || !Number.isFinite(currentCost)) return Number.POSITIVE_INFINITY;
    const stepLength = previous.x !== current.x && previous.y !== current.y
      ? DIAGONAL_STEP_LENGTH
      : CARDINAL_STEP_LENGTH;
    totalCost += stepLength * Math.max(MINIMUM_STEP_COST, (previousCost + currentCost) / 2);
  }

  return round(totalCost, 6);
}

function isCellInside(
  width: number,
  height: number,
  cell: MoveOrderRouteCell,
): boolean {
  return Number.isInteger(cell.x)
    && Number.isInteger(cell.y)
    && cell.x >= 0
    && cell.y >= 0
    && cell.x < width
    && cell.y < height;
}

function round(value: number, digits: number): number {
  const multiplier = 10 ** digits;
  return Math.round(value * multiplier) / multiplier;
}
