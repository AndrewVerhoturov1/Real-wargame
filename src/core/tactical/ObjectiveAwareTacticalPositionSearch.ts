import {
  searchGeneralizedTacticalPositions,
  type GeneralizedTacticalPositionFieldView,
  type GeneralizedTacticalPositionSearchRequest,
} from './GeneralizedTacticalPositionSearch';
import type { TacticalPositionSearchResult } from './TacticalPositionSearch';

/**
 * Compatibility entry point. Objective-aware ranking now belongs to the
 * canonical generalized search and uses the node-provided settings directly.
 */
export function searchObjectiveAwareTacticalPositions(
  field: GeneralizedTacticalPositionFieldView,
  request: GeneralizedTacticalPositionSearchRequest,
): TacticalPositionSearchResult {
  return searchGeneralizedTacticalPositions(field, request);
}
