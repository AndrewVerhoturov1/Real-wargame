import assert from 'node:assert/strict';
import { normalizeMap, type TacticalMapData } from '../src/core/map/MapModel';
import {
  NAVIGATION_PROFILE_FORMAT_VERSION,
  NavigationProfileRegistry,
  createDefaultNavigationProfileRegistry,
} from '../src/core/navigation/NavigationProfiles';
import { resolveActiveNavigationProfile } from '../src/core/navigation/NavigationProfileResolver';
import {
  createRouteCostFieldCache,
  getRouteCostFieldDiagnostics,
  getRouteCostFields,
  readRouteCostCell,
} from '../src/core/navigation/RouteCostField';
import { evaluateNavigationReplan } from '../src/core/navigation/NavigationReplanPolicy';
import { findGridPath } from '../src/core/pathfinding/GridPathfinder';

verifyBuiltInRegistry();
verifyCustomProfilesAndMigration();
verifyResolverPriority();
verifyProfileSpecificRoutes();
verifyKnownDangerAndDetourLimit();
verifyCostFieldCacheAndHoverReads();
verifyReplanPolicy();

console.log('Navigation profiles smoke passed: registry, migration, resolver, profile-aware A*, subjective danger, detour bound, cache diagnostics and replan policy.');

function verifyBuiltInRegistry(): void {
  const registry = createDefaultNavigationProfileRegistry();
  assert.equal(registry.formatVersion, NAVIGATION_PROFILE_FORMAT_VERSION);
  assert.deepEqual(
    registry.listProfiles().filter((profile) => profile.builtIn).map((profile) => profile.id),
    ['normal', 'fast', 'stealth', 'attack', 'cautious', 'retreat', 'direct'],
  );
  assert.equal(registry.getProfile('normal').nameRu, 'Обычный');
  assert.equal(registry.getProfile('direct').maximumDetourRatio, 1);
  assert.equal(registry.deleteProfile('normal'), false, 'built-in profiles cannot be deleted');
}

function verifyCustomProfilesAndMigration(): void {
  const registry = createDefaultNavigationProfileRegistry();
  const custom = registry.copyProfile('stealth', 'woodland_scout', 'Woodland scout', 'Лесной разведчик');
  assert.equal(custom.builtIn, false);
  const originalRevision = custom.revision;
  registry.updateProfile('woodland_scout', {
    terrainCosts: { ...custom.terrainCosts, field: 1.8, sparseForest: 0.82 },
  });
  assert.ok(registry.getProfile('woodland_scout').revision > originalRevision);
  registry.renameProfile('woodland_scout', 'Woodland path', 'Лесной путь');

  const serialized = registry.exportJson();
  const restored = NavigationProfileRegistry.importJson(serialized);
  assert.equal(restored.getProfile('woodland_scout').nameRu, 'Лесной путь');
  assert.equal(restored.getProfile('woodland_scout').terrainCosts.field, 1.8);
  assert.equal(restored.deleteProfile('woodland_scout'), true);

  const migrated = NavigationProfileRegistry.fromUnknown({
    profiles: [{
      id: 'legacy',
      name: 'Legacy',
      nameRu: 'Старый',
      terrainCosts: { road: 0.7, field: 1.1 },
    }],
  });
  assert.equal(migrated.formatVersion, NAVIGATION_PROFILE_FORMAT_VERSION);
  assert.equal(migrated.getProfile('legacy').terrainCosts.road, 0.7);
  assert.equal(migrated.getProfile('legacy').replanRules.replanOnBlocked, true);
}

function verifyResolverPriority(): void {
  const registry = createDefaultNavigationProfileRegistry();
  assert.deepEqual(resolveActiveNavigationProfile(registry, {
    debugOverrideProfileId: 'direct',
    playerCommandMode: 'fast',
    behaviorMovementMode: 'retreat',
    unitRoleProfileId: 'cautious',
  }), { profileId: 'direct', source: 'debugOverride', profile: registry.getProfile('direct') });

  assert.equal(resolveActiveNavigationProfile(registry, {
    playerCommandMode: 'fast',
    behaviorMovementMode: 'retreat',
  }).source, 'playerCommand');
  assert.equal(resolveActiveNavigationProfile(registry, {
    behaviorMovementMode: 'retreat',
  }).profileId, 'retreat');
  assert.equal(resolveActiveNavigationProfile(registry, {}).profileId, 'normal');
}

function verifyProfileSpecificRoutes(): void {
  const registry = createDefaultNavigationProfileRegistry();
  const cells: TacticalMapData['cells'] = [];
  for (let x = 1; x <= 10; x += 1) {
    cells.push({ x, y: 1, terrain: 'forest', forest: 2 });
    cells.push({ x, y: 2, terrain: 'forest', forest: 1 });
  }
  const map = normalizeMap(makeMap(12, 7, cells));
  const start = { x: 0.5, y: 3.5 };
  const goal = { x: 11.5, y: 3.5 };
  const cache = createRouteCostFieldCache();

  const fast = findGridPath(map, start, goal, {
    navigationProfile: registry.getProfile('fast'),
    costFieldCache: cache,
  });
  const stealth = findGridPath(map, start, goal, {
    navigationProfile: registry.getProfile('stealth'),
    costFieldCache: cache,
  });
  const direct = findGridPath(map, start, goal, {
    navigationProfile: registry.getProfile('direct'),
    costFieldCache: cache,
  });

  assert.equal(fast.ok, true);
  assert.equal(stealth.ok, true);
  assert.equal(direct.ok, true);
  if (!fast.ok || !stealth.ok || !direct.ok) return;
  assert.ok(fast.cells.filter((cell) => cell.y === 3).length >= 10, 'fast should stay close to the shortest open route');
  assert.ok(stealth.cells.some((cell) => cell.y <= 2), 'stealth should use forest concealment when the detour is allowed');
  assert.ok(direct.distanceMeters <= fast.distanceMeters + map.metersPerCell, 'direct should be practically shortest');
  assert.equal(stealth.profileId, 'stealth');
  assert.ok(stealth.costBreakdown.terrainCost > 0);
}

function verifyKnownDangerAndDetourLimit(): void {
  const registry = createDefaultNavigationProfileRegistry();
  const map = normalizeMap(makeMap(15, 9, []));
  const start = { x: 0.5, y: 4.5 };
  const goal = { x: 14.5, y: 4.5 };
  const tacticalContext = {
    unitId: 'soldier-1',
    knowledgeRevision: 7,
    knownThreats: [{
      id: 'known-fire',
      x: 7.5,
      y: 4.5,
      radiusCells: 2.8,
      widthCells: 0,
      heightCells: 0,
      rotationDegrees: 0,
      mode: 'area' as const,
      strength: 100,
      suppression: 90,
      confidence: 100,
      uncertaintyCells: 0.5,
    }],
  };

  const direct = findGridPath(map, start, goal, {
    navigationProfile: registry.getProfile('direct'),
    tacticalContext,
  });
  const retreat = findGridPath(map, start, goal, {
    navigationProfile: registry.getProfile('retreat'),
    tacticalContext,
  });
  assert.equal(direct.ok, true);
  assert.equal(retreat.ok, true);
  if (!direct.ok || !retreat.ok) return;
  assert.ok(retreat.cells.some((cell) => Math.abs(cell.y - 4) >= 2), 'retreat should avoid a known threat');
  assert.ok(
    minimumDistanceToPoint(retreat.cells, 7.5, 4.5) > minimumDistanceToPoint(direct.cells, 7.5, 4.5) + 1,
    'retreat should keep more separation from the known threat than direct movement',
  );

  const limitedProfile = {
    ...registry.getProfile('retreat'),
    id: 'limited-retreat',
    maximumDetourRatio: 1.05,
    revision: 1,
  };
  const limited = findGridPath(map, start, goal, {
    navigationProfile: limitedProfile,
    tacticalContext,
  });
  assert.equal(limited.ok, true);
  if (!limited.ok) return;
  assert.ok(limited.detourRatio <= 1.05 + 0.0001);
  assert.equal(limited.detourLimited, true);
  assert.match(limited.routeReasonRu, /обход|длиннее|огранич/i);
}

function verifyCostFieldCacheAndHoverReads(): void {
  const registry = createDefaultNavigationProfileRegistry();
  const map = normalizeMap(makeMap(20, 12, [{ x: 5, y: 5, terrain: 'forest', forest: 2 }]));
  const cache = createRouteCostFieldCache();
  const profile = registry.getProfile('stealth');
  const context = { unitId: 'soldier', knowledgeRevision: 1, knownThreats: [] };

  const first = getRouteCostFields(map, profile, context, cache);
  const second = getRouteCostFields(map, profile, context, cache);
  assert.equal(second, first, 'same revisions should reuse the exact cached field object');
  let diagnostics = getRouteCostFieldDiagnostics(cache);
  assert.equal(diagnostics.staticCostBuildCount, 1);
  assert.equal(diagnostics.dynamicCostBuildCount, 1);
  assert.equal(diagnostics.fullMapScanCount, 2);

  readRouteCostCell(first, 5, 5, cache);
  readRouteCostCell(first, 6, 5, cache);
  diagnostics = getRouteCostFieldDiagnostics(cache);
  assert.equal(diagnostics.hoverReadCount, 2);
  assert.equal(diagnostics.staticCostBuildCount, 1, 'hover must not rebuild static cost');
  assert.equal(diagnostics.dynamicCostBuildCount, 1, 'hover must not rebuild dynamic cost');

  getRouteCostFields(map, profile, { ...context, knowledgeRevision: 2 }, cache);
  diagnostics = getRouteCostFieldDiagnostics(cache);
  assert.equal(diagnostics.staticCostBuildCount, 1);
  assert.equal(diagnostics.dynamicCostBuildCount, 2);
}

function verifyReplanPolicy(): void {
  const registry = createDefaultNavigationProfileRegistry();
  const profile = registry.getProfile('retreat');
  const base = {
    routeRevision: 1,
    navigationProfileRevision: profile.revision,
    knowledgeRevision: 4,
    lastReplanAtSeconds: 10,
    pathCost: 100,
  };

  assert.equal(evaluateNavigationReplan({
    order: base,
    profile,
    nowSeconds: 10.2,
    blocked: false,
    currentProfileRevision: profile.revision,
    currentKnowledgeRevision: 5,
  }).shouldSearch, false, 'cooldown must suppress danger churn');

  assert.equal(evaluateNavigationReplan({
    order: base,
    profile,
    nowSeconds: 20,
    blocked: true,
    currentProfileRevision: profile.revision,
    currentKnowledgeRevision: 4,
  }).reason, 'blocked');

  const candidate = evaluateNavigationReplan({
    order: base,
    profile,
    nowSeconds: 20,
    blocked: false,
    currentProfileRevision: profile.revision,
    currentKnowledgeRevision: 8,
    candidateCost: 80,
  });
  assert.equal(candidate.shouldReplace, true);
  assert.equal(candidate.reason, 'danger_changed');

  assert.equal(evaluateNavigationReplan({
    order: base,
    profile,
    nowSeconds: 20,
    blocked: false,
    currentProfileRevision: profile.revision,
    currentKnowledgeRevision: 8,
    candidateCost: 96,
  }).shouldReplace, false, 'hysteresis must reject small improvements');
}

function minimumDistanceToPoint(cells: ReadonlyArray<{ x: number; y: number }>, x: number, y: number): number {
  return cells.reduce((minimum, cell) => Math.min(minimum, Math.hypot(cell.x + 0.5 - x, cell.y + 0.5 - y)), Number.POSITIVE_INFINITY);
}

function makeMap(width: number, height: number, cells: TacticalMapData['cells']): TacticalMapData {
  return {
    width,
    height,
    cellSize: 24,
    metersPerCell: 2,
    defaultTerrain: 'field',
    defaultHeight: 0,
    cells,
    objects: [],
  };
}
