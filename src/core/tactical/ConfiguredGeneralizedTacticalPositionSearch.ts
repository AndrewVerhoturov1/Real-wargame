import {
  searchGeneralizedTacticalPositions as searchBase,
  type GeneralizedTacticalPositionFieldView,
  type GeneralizedTacticalPositionSearchRequest,
} from './GeneralizedTacticalPositionSearchRuntime';
import type { TacticalPositionSearchResult } from './TacticalPositionSearch';
import { readTacticalPositionSearchSettings } from './TacticalPositionNodeSettingsTransport';

export function searchGeneralizedTacticalPositions(
  field: GeneralizedTacticalPositionFieldView,
  request: GeneralizedTacticalPositionSearchRequest,
): TacticalPositionSearchResult {
  const settings = request.settings ?? readTacticalPositionSearchSettings(request.target);
  return searchBase(field, settings ? { ...request, settings } : request);
}
