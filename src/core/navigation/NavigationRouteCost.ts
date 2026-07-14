import type { TacticalMap } from '../map/MapModel';
import type { MoveOrderRouteCell } from '../orders/MoveOrder';
import { evaluateGridPathCost } from '../pathfinding/GridPathfinder';
import {
  createRouteCostFieldCache,
  getRouteCostFields,
  type RouteCostFieldCache,
  type TacticalRouteContext,
} from './RouteCostField';
import type { NavigationProfile } from './NavigationProfiles';

const sharedRouteCostFieldCache = createRouteCostFieldCache();

export function evaluateNavigationRouteCost(
  map: TacticalMap,
  cells: readonly MoveOrderRouteCell[],
  profile: NavigationProfile,
  tacticalContext: TacticalRouteContext | undefined,
  cache: RouteCostFieldCache = sharedRouteCostFieldCache,
): number {
  const fields = getRouteCostFields(map, profile, tacticalContext, cache);
  return round(evaluateGridPathCost(cells, fields), 6);
}

function round(value: number, digits: number): number {
  if (!Number.isFinite(value)) return value;
  const multiplier = 10 ** digits;
  return Math.round(value * multiplier) / multiplier;
}
