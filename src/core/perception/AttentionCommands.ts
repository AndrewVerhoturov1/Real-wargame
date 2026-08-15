import { applyAttentionProfileToUnit } from './AttentionProfiles';
import { getAttentionProfileRegistry } from './AttentionProfileStorage';
import { clearAttentionOverride, setAttentionMode, setSearchSector } from './AttentionController';
import { degreesToRadians, type AttentionMode } from './AttentionModel';
import type { UnitModel } from '../units/UnitModel';

export type AttentionModeSelection = AttentionMode | 'automatic';

/** Product-owned command boundary for the Polygon attention controls. */
export function applyUnitAttentionProfile(unit: UnitModel, profileId: string | null): boolean {
  if (!profileId || profileId === 'individual') {
    unit.playerAttentionProfileId = null;
    return true;
  }
  const registry = getAttentionProfileRegistry();
  if (!registry.hasProfile(profileId)) return false;
  applyAttentionProfileToUnit(unit, registry.getProfile(profileId));
  return true;
}

/** Product-owned command boundary for mode selection including Auto. */
export function applyUnitAttentionMode(unit: UnitModel, selection: AttentionModeSelection): void {
  if (selection === 'automatic') {
    clearAttentionOverride(unit);
    return;
  }
  if (selection === 'search') {
    setSearchSector(
      unit,
      unit.facingRadians,
      degreesToRadians(unit.attentionSettings.profiles.search.defaultSearchArcDegrees),
      'player',
    );
    return;
  }
  setAttentionMode(unit, selection, 'player');
}

export function applyUnitAttentionSearchSector(
  unit: UnitModel,
  centerRadians: number,
  arcRadians: number,
): void {
  setSearchSector(unit, centerRadians, arcRadians, 'player');
}
