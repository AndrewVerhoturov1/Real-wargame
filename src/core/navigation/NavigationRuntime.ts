import { isPlayerCommandOutstanding, type PlayerCommand } from '../orders/PlayerCommand';
import type { UnitModel } from '../units/UnitModel';
import { resolveActiveNavigationProfile, type ResolvedNavigationProfile } from './NavigationProfileResolver';
import { getNavigationProfileRegistry } from './NavigationProfileStorage';
import type { TacticalRouteContext } from './RouteCostField';

export function resolveUnitNavigationProfile(
  unit: UnitModel,
  command: PlayerCommand | null = unit.playerCommand,
): ResolvedNavigationProfile {
  const registry = getNavigationProfileRegistry();
  const activeCommand = isPlayerCommandOutstanding(command) ? command : null;
  const resolved = resolveActiveNavigationProfile(registry, {
    playerCommandProfileId: activeCommand?.navigationProfileId,
    playerCommandMode: activeCommand?.movementMode,
    selectedPlayerProfileId: unit.playerNavigationProfileId,
    behaviorMovementMode: unit.navigationMovementMode,
    unitRoleProfileId: defaultProfileForUnitRole(unit),
  });
  unit.activeNavigationProfileId = resolved.profileId;
  unit.activeNavigationProfileSource = resolved.source;
  return resolved;
}

export function buildUnitTacticalRouteContext(unit: UnitModel): TacticalRouteContext {
  return {
    unitId: unit.id,
    knowledgeRevision: unit.tacticalKnowledge.revision,
    knownThreats: unit.tacticalKnowledge.threats.map((threat) => ({
      id: threat.id,
      x: threat.x,
      y: threat.y,
      radiusCells: threat.radiusCells,
      widthCells: threat.widthCells,
      heightCells: threat.heightCells,
      rotationDegrees: threat.rotationDegrees,
      mode: threat.mode,
      strength: threat.strength,
      suppression: threat.suppression,
      confidence: threat.confidence,
      uncertaintyCells: threat.uncertaintyCells,
      directionDegrees: threat.directionDegrees,
      arcDegrees: threat.arcDegrees,
      rangeCells: threat.rangeCells,
      minRangeCells: threat.minRangeCells,
      falloffPercent: threat.falloffPercent,
    })),
  };
}

function defaultProfileForUnitRole(unit: UnitModel): string {
  if (unit.unitRoleNavigationProfileId) return unit.unitRoleNavigationProfileId;
  if (unit.type === 'scout_team') return 'stealth';
  if (unit.type === 'support_team') return 'cautious';
  return 'normal';
}
