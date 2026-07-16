import { isPlayerCommandOutstanding, type PlayerCommand } from '../orders/PlayerCommand';
import { buildCanonicalWorldThreatSet } from '../knowledge/CanonicalWorldThreat';
import type { UnitModel } from '../units/UnitModel';
import { resolveActiveNavigationProfile, type ResolvedNavigationProfile } from './NavigationProfileResolver';
import { getNavigationProfileRegistry } from './NavigationProfileStorage';
import type { TacticalRouteContext } from './RouteCostField';

const COALESCED_TACTICAL_SNAPSHOT_SECONDS = 0.5;
const MEANINGFUL_STRENGTH_DELTA = 20;
const MEANINGFUL_SUPPRESSION_DELTA = 15;
const MEANINGFUL_CONFIDENCE_DELTA = 20;

export interface TacticalRouteContextOptions {
  /** Initial player/AI orders require the newest known state; background consumers may coalesce it. */
  readonly freshness?: 'coalesced' | 'immediate';
  /** Required by the shared world-space unit-contact canonicalization. */
  readonly metersPerCell: number;
}

interface CachedTacticalRouteContext {
  readonly capturedAtSeconds: number;
  readonly sourceKnowledgeRevision: number;
  readonly canonicalThreatKey: string;
  readonly topologyKey: string;
  readonly context: TacticalRouteContext;
}

const tacticalContextByUnit = new WeakMap<UnitModel, CachedTacticalRouteContext>();

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

export function buildUnitTacticalRouteContext(
  unit: UnitModel,
  options: TacticalRouteContextOptions,
): TacticalRouteContext {
  const topologyKey = buildThreatTopologyKey(unit);
  const currentTimeSeconds = unit.tacticalKnowledge.lastUpdatedSeconds;
  const cached = tacticalContextByUnit.get(unit);
  if (
    cached
    && cached.topologyKey === topologyKey
    && cached.sourceKnowledgeRevision === unit.tacticalKnowledge.revision
  ) {
    return cached.context;
  }

  const canonical = buildCanonicalWorldThreatSet(
    unit.tacticalKnowledge.threats,
    options.metersPerCell,
  );
  if (cached && cached.topologyKey === topologyKey && cached.canonicalThreatKey === canonical.key) {
    tacticalContextByUnit.set(unit, {
      ...cached,
      sourceKnowledgeRevision: unit.tacticalKnowledge.revision,
    });
    return cached.context;
  }
  if (
    options.freshness === 'coalesced'
    && cached
    && cached.topologyKey === topologyKey
    && !hasMeaningfulTacticalChange(cached.context.knownThreats, canonical.threats)
  ) {
    tacticalContextByUnit.set(unit, {
      ...cached,
      sourceKnowledgeRevision: unit.tacticalKnowledge.revision,
      canonicalThreatKey: canonical.key,
    });
    return cached.context;
  }
  if (
    options.freshness === 'coalesced'
    && cached
    && cached.topologyKey === topologyKey
    && (
      cached.context.knowledgeRevision === unit.tacticalKnowledge.revision
      || currentTimeSeconds - cached.capturedAtSeconds < COALESCED_TACTICAL_SNAPSHOT_SECONDS
    )
  ) {
    return cached.context;
  }

  const context: TacticalRouteContext = {
    unitId: unit.id,
    originX: unit.position.x,
    originY: unit.position.y,
    posture: unit.behaviorRuntime.posture,
    knowledgeRevision: unit.tacticalKnowledge.revision,
    knownThreats: canonical.threats.map((threat) => ({
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
      fireThreatClass: threat.fireThreatClass ?? null,
    })),
  };
  tacticalContextByUnit.set(unit, {
    capturedAtSeconds: currentTimeSeconds,
    sourceKnowledgeRevision: unit.tacticalKnowledge.revision,
    canonicalThreatKey: canonical.key,
    topologyKey,
    context,
  });
  return context;
}

export function clearUnitTacticalRouteContext(unit: UnitModel): void {
  tacticalContextByUnit.delete(unit);
}

function buildThreatTopologyKey(unit: UnitModel): string {
  return unit.tacticalKnowledge.threats
    .map((threat) => [
      threat.id,
      threat.mode,
      threat.visibleNow ? 'visible' : 'remembered',
      threat.fireThreatClass ?? 'independent',
    ].join(':'))
    .sort()
    .join('|');
}

function hasMeaningfulTacticalChange(
  previous: TacticalRouteContext['knownThreats'],
  current: ReturnType<typeof buildCanonicalWorldThreatSet>['threats'],
): boolean {
  if (previous.length !== current.length) return true;
  const currentById = new Map(current.map((threat) => [threat.id, threat]));
  for (const before of previous) {
    const after = currentById.get(before.id);
    if (!after) return true;
    if (
      before.mode !== after.mode
      || before.x !== after.x
      || before.y !== after.y
      || before.radiusCells !== after.radiusCells
      || before.widthCells !== after.widthCells
      || before.heightCells !== after.heightCells
      || before.rotationDegrees !== after.rotationDegrees
      || before.directionDegrees !== after.directionDegrees
      || before.arcDegrees !== after.arcDegrees
      || before.rangeCells !== after.rangeCells
      || before.minRangeCells !== after.minRangeCells
      || before.falloffPercent !== after.falloffPercent
      || before.uncertaintyCells !== after.uncertaintyCells
      || before.fireThreatClass !== after.fireThreatClass
      || Math.abs(before.strength - after.strength) >= MEANINGFUL_STRENGTH_DELTA
      || Math.abs(before.suppression - after.suppression) >= MEANINGFUL_SUPPRESSION_DELTA
      || Math.abs(before.confidence - after.confidence) >= MEANINGFUL_CONFIDENCE_DELTA
    ) return true;
  }
  return false;
}

function defaultProfileForUnitRole(unit: UnitModel): string {
  if (unit.unitRoleNavigationProfileId) return unit.unitRoleNavigationProfileId;
  if (unit.type === 'scout_team') return 'stealth';
  if (unit.type === 'support_team') return 'cautious';
  return 'normal';
}
