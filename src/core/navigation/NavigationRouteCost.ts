import type { TacticalMap } from '../map/MapModel';
import type { MoveOrderRouteCell } from '../orders/MoveOrder';
import { evaluateGridPathCost } from '../pathfinding/GridPathfinder';
import {
  getSharedRouteCostFieldCache,
  getRouteCostFields,
  type RouteCostFieldCache,
  type RouteCostFields,
  type TacticalRouteContext,
} from './RouteCostField';
import type { NavigationProfile } from './NavigationProfiles';

export function evaluateNavigationRouteCost(
  map: TacticalMap,
  cells: readonly MoveOrderRouteCell[],
  profile: NavigationProfile,
  tacticalContext: TacticalRouteContext | undefined,
  cache: RouteCostFieldCache = getSharedRouteCostFieldCache(map),
): number {
  const fields = getRouteCostFields(map, profile, tacticalContext, cache);
  return evaluatePreparedNavigationRouteCost(cells, fields);
}

export function evaluatePreparedNavigationRouteCost(
  cells: readonly MoveOrderRouteCell[],
  fields: RouteCostFields,
): number {
  return round(evaluateGridPathCost(cells, fields), 6);
}

function round(value: number, digits: number): number {
  if (!Number.isFinite(value)) return value;
  const multiplier = 10 ** digits;
  return Math.round(value * multiplier) / multiplier;
}
