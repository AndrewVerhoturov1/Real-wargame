import { readFile, writeFile } from 'node:fs/promises';

const changedFiles = [];

await edit('src/core/pathfinding/GridPathfinder.ts', (source) => replaceExact(
  source,
  'tacticalSearch.visitedCells + (baseline.ok ? baseline.visitedCells : 0)',
  'tacticalSearch.visitedCells',
));

await edit('src/core/orders/PlayerCommand.ts', (source) => replaceExact(
  source,
  'readonly movementMode: NavigationMovementMode;',
  'readonly movementMode?: NavigationMovementMode;',
));

await edit('src/core/units/UnitModel.ts', (source) => {
  let updated = source;
  updated = replaceExact(updated, 'unitRoleNavigationProfileId: string | null;', 'unitRoleNavigationProfileId?: string | null;');
  updated = replaceExact(updated, 'navigationMovementMode: NavigationMovementMode | null;', 'navigationMovementMode?: NavigationMovementMode | null;');
  updated = replaceExact(updated, 'activeNavigationProfileId: string;', 'activeNavigationProfileId?: string;');
  updated = replaceExact(updated, 'activeNavigationProfileSource: NavigationProfileSource;', 'activeNavigationProfileSource?: NavigationProfileSource;');
  return updated;
});

await edit('src/core/navigation/RouteCostField.ts', (source) => {
  let updated = source;
  updated = insertAfter(
    updated,
    "import type { NavigationProfile, NavigationTerrainCostKey } from './NavigationProfiles';\n",
    "\nconst mapIdentityByMap = new WeakMap<TacticalMap, number>();\nlet nextMapIdentity = 1;\n",
    'mapIdentityByMap',
  );
  updated = replaceExact(
    updated,
    '  const staticKey = [\n    map.width,',
    '  const staticKey = [\n    getMapIdentity(map),\n    map.width,',
  );
  updated = insertBefore(
    updated,
    'function trimCache<T>(cache: Map<string, T>, maximum: number): void {',
    "function getMapIdentity(map: TacticalMap): number {\n  const existing = mapIdentityByMap.get(map);\n  if (existing !== undefined) return existing;\n  const identity = nextMapIdentity;\n  nextMapIdentity += 1;\n  mapIdentityByMap.set(map, identity);\n  return identity;\n}\n\n",
    'function getMapIdentity(map: TacticalMap)',
  );
  return updated;
});

await edit('src/core/navigation/NavigationReplanPolicy.ts', (source) => replaceExact(
  source,
  "    reason === 'blocked'\n    || improvementRatio !== null",
  "    reason === 'blocked'\n    || reason === 'profile_changed'\n    || improvementRatio !== null",
));

await edit('src/core/ai/AiStatefulMoveGameBridge.ts', (source) => {
  let updated = source;
  updated = insertAfter(
    updated,
    "import type { GridPosition } from '../geometry';\n",
    "import { buildUnitTacticalRouteContext, resolveUnitNavigationProfile } from '../navigation/NavigationRuntime';\n",
    'resolveUnitNavigationProfile',
  );
  updated = replaceExact(
    updated,
    "    if (effect.type === 'begin_move') {\n      const planned = planMoveOrder(state.map, unit.position, effect.targetPosition, {\n        source: 'ai',\n        ownerToken: effect.ownerToken,\n        allowGoalAdjustment: false,\n      });",
    "    if (effect.type === 'begin_move') {\n      const resolvedNavigation = resolveUnitNavigationProfile(unit, null);\n      const planned = planMoveOrder(state.map, unit.position, effect.targetPosition, {\n        source: 'ai',\n        ownerToken: effect.ownerToken,\n        allowGoalAdjustment: false,\n        movementMode: unit.navigationMovementMode ?? 'normal',\n        navigationProfile: resolvedNavigation.profile,\n        navigationProfileSource: resolvedNavigation.source,\n        tacticalContext: buildUnitTacticalRouteContext(unit),\n      });",
  );
  return updated;
});

await edit('src/core/simulation/SimulationTick.ts', (source) => {
  let updated = source;
  updated = insertAfter(
    updated,
    "import { clampGridPositionToMap } from '../map/MapModel';\n",
    "import { buildUnitTacticalRouteContext, resolveUnitNavigationProfile } from '../navigation/NavigationRuntime';\nimport { evaluateNavigationReplan } from '../navigation/NavigationReplanPolicy';\n",
    'evaluateNavigationReplan',
  );
  updated = replaceBetween(
    updated,
    'function ensureRoutePassable(unit: UnitModel, state: SimulationState): boolean {',
    'function completeLinkedPlayerCommand(unit: UnitModel, order: MoveOrder): void {',
    `function ensureRoutePassable(unit: UnitModel, state: SimulationState): boolean {
  const order = unit.order;
  const routeCells = order?.routeCells;
  const requestedTarget = order?.requestedTarget;
  if (!order || !routeCells || routeCells.length === 0 || !requestedTarget) return true;

  const currentCell = {
    x: Math.floor(unit.position.x),
    y: Math.floor(unit.position.y),
  };
  const previousIndex = Math.max(0, order.routeCellIndex ?? 0);
  const matchingIndex = routeCells.findIndex((cell, index) => (
    index >= previousIndex && cell.x === currentCell.x && cell.y === currentCell.y
  ));
  if (matchingIndex >= 0) order.routeCellIndex = matchingIndex;

  const startIndex = Math.min(routeCells.length - 1, (order.routeCellIndex ?? previousIndex) + 1);
  const endIndex = Math.min(routeCells.length - 1, startIndex + ROUTE_LOOKAHEAD_CELLS - 1);
  let blocked = false;
  for (let index = startIndex; index <= endIndex; index += 1) {
    const cell = routeCells[index];
    if (isMapCellPassable(state.map, cell.x, cell.y)) continue;
    blocked = true;
    break;
  }

  const resolvedNavigation = resolveUnitNavigationProfile(unit, unit.playerCommand);
  const tacticalContext = buildUnitTacticalRouteContext(unit);
  const evaluation = evaluateNavigationReplan({
    order,
    profile: resolvedNavigation.profile,
    nowSeconds: state.simulationTimeSeconds,
    blocked,
    currentProfileRevision: resolvedNavigation.profile.revision,
    currentKnowledgeRevision: tacticalContext.knowledgeRevision,
  });
  if (!evaluation.shouldSearch) return true;

  const movementMode = order.movementMode
    ?? unit.playerCommand?.movementMode
    ?? unit.navigationMovementMode
    ?? 'normal';
  const reason = evaluation.reason ?? (blocked ? 'blocked' : 'navigation_changed');
  const reasonRu = evaluation.reasonRu ?? 'Изменились условия построения маршрута.';
  const replanned = planMoveOrder(state.map, unit.position, requestedTarget, {
    source: order.source,
    ownerToken: order.ownerToken,
    playerCommandId: order.playerCommandId,
    routeStatus: 'replanned',
    routeRevision: (order.routeRevision ?? 1) + 1,
    movementMode,
    navigationProfile: resolvedNavigation.profile,
    navigationProfileSource: resolvedNavigation.source,
    tacticalContext,
    replanCount: (order.replanCount ?? 0) + 1,
    lastReplanAtSeconds: state.simulationTimeSeconds,
    lastReplanReason: reason,
    lastReplanReasonRu: reasonRu,
  });

  order.lastReplanAtSeconds = state.simulationTimeSeconds;
  order.lastReplanReason = reason;
  order.lastReplanReasonRu = reasonRu;
  order.knowledgeRevision = tacticalContext.knowledgeRevision;
  order.navigationProfileRevision = resolvedNavigation.profile.revision;

  if (!replanned.ok) {
    if (!blocked) {
      unit.behaviorRuntime.lastEvent = 'move_route_replan_rejected';
      unit.behaviorRuntime.reason = 'Новый маршрут не найден; сохранён текущий путь.';
      return true;
    }
    unit.order = null;
    blockLinkedPlayerCommand(unit, order, replanned.reason, replanned.reasonRu);
    setState(unit, 'observing', 'route unavailable');
    unit.behaviorRuntime.currentAction = 'observe';
    unit.behaviorRuntime.lastEvent = 'move_route_unavailable';
    unit.behaviorRuntime.reason = \\`Маршрут недоступен: \\${replanned.reasonRu}\\`;
    return false;
  }

  const replacementDecision = evaluateNavigationReplan({
    order,
    profile: resolvedNavigation.profile,
    nowSeconds: state.simulationTimeSeconds,
    blocked,
    currentProfileRevision: resolvedNavigation.profile.revision,
    currentKnowledgeRevision: tacticalContext.knowledgeRevision,
    candidateCost: replanned.order.pathCost,
  });
  if (!replacementDecision.shouldReplace) {
    unit.behaviorRuntime.lastEvent = 'move_route_replan_hysteresis';
    unit.behaviorRuntime.reason = 'Новый маршрут улучшает путь недостаточно; сохранён текущий маршрут.';
    return true;
  }

  unit.order = replanned.order;
  unit.behaviorRuntime.lastEvent = 'move_route_replanned';
  unit.behaviorRuntime.reason = \\`Маршрут перестроен: \\${replanned.path.reasonRu}\\`;
  return true;
}

`,
    'move_route_replan_hysteresis',
  );
  return updated;
});

await edit('src/main.ts', (source) => {
  let updated = source;
  updated = insertAfter(
    updated,
    "import './command-plan-route-overlay.css';\n",
    "import './route-cost-overlay.css';\n",
    "import './route-cost-overlay.css';",
  );
  updated = insertAfter(
    updated,
    "import { installCommandPlanRouteUi } from './ui/CommandPlanRouteUi';\n",
    "import { installRouteCostOverlayUi } from './ui/RouteCostOverlayUi';\n",
    'installRouteCostOverlayUi',
  );
  updated = insertAfter(
    updated,
    'const destroyCommandPlanRouteUi = installCommandPlanRouteUi(state, forceRenderAtNativeMapQuality);\n',
    'const destroyRouteCostOverlayUi = installRouteCostOverlayUi(state, forceRenderAtNativeMapQuality);\n',
    'destroyRouteCostOverlayUi = installRouteCostOverlayUi',
  );
  updated = insertAfter(
    updated,
    '  destroyCommandPlanRouteUi();\n',
    '  destroyRouteCostOverlayUi();\n',
    'destroyRouteCostOverlayUi();',
  );
  return updated;
});

await edit('src/rendering/PixiApp.ts', (source) => {
  let updated = source;
  updated = insertAfter(
    updated,
    "import { PixiMapRenderer } from './PixiMapRenderer';\n",
    "import { PixiRouteCostOverlayRenderer } from './PixiRouteCostOverlayRenderer';\n",
    'PixiRouteCostOverlayRenderer',
  );
  updated = insertAfter(
    updated,
    '  private readonly mapRenderer = new PixiMapRenderer();\n',
    '  private readonly routeCostOverlayRenderer = new PixiRouteCostOverlayRenderer();\n',
    'routeCostOverlayRenderer = new PixiRouteCostOverlayRenderer',
  );
  updated = insertAfter(
    updated,
    '      this.mapRenderer.container,\n',
    '      this.routeCostOverlayRenderer.container,\n',
    'this.routeCostOverlayRenderer.container',
  );
  updated = insertAfter(
    updated,
    '    this.overlayRenderer.destroy();\n',
    '    this.routeCostOverlayRenderer.destroy();\n',
    'this.routeCostOverlayRenderer.destroy();',
  );
  updated = insertAfter(
    updated,
    '    this.awarenessHeatmapRenderer.render(this.state);\n',
    '    this.routeCostOverlayRenderer.render(this.state);\n',
    'this.routeCostOverlayRenderer.render(this.state);',
  );
  updated = insertAfter(
    updated,
    '      ...formatBehaviorInspector(selectedUnit, this.locale),\n',
    "      ...formatNavigationInspector(selectedUnit, this.locale),\n",
    'formatNavigationInspector(selectedUnit',
  );
  updated = insertBefore(
    updated,
    'function buildTimestampForFileName(): string {',
    `function formatNavigationInspector(unit: UnitModel | undefined, locale: Locale): string[] {
  if (!unit) return [];
  const order = unit.order;
  const ru = locale === 'ru';
  const profileId = order?.navigationProfileId ?? unit.activeNavigationProfileId ?? 'normal';
  const source = order?.navigationProfileSource ?? unit.activeNavigationProfileSource ?? 'default';
  if (!order) {
    return [ru
      ? \\`Профиль маршрута: \\${profileId} · источник \\${source} · активного пути нет\\`
      : \\`Route profile: \\${profileId} · source \\${source} · no active route\\`];
  }
  const detour = order.detourRatio === undefined ? '—' : \\`+\\${Math.round(Math.max(0, order.detourRatio - 1) * 100)}%\\`;
  return ru
    ? [
        \\`Профиль маршрута: \\${profileId} · источник \\${source}\\`,
        \\`Цена / длина / обход: \\${order.pathCost?.toFixed(1) ?? '—'} / \\${Math.round(order.pathDistanceMeters ?? 0)} м / \\${detour}\\`,
        \\`Причина маршрута: \\${order.pathReasonRu ?? '—'}\\`,
        \\`Перестроений: \\${order.replanCount ?? 0} · последнее: \\${order.lastReplanReasonRu ?? '—'}\\`,
      ]
    : [
        \\`Route profile: \\${profileId} · source \\${source}\\`,
        \\`Cost / length / detour: \\${order.pathCost?.toFixed(1) ?? '—'} / \\${Math.round(order.pathDistanceMeters ?? 0)} m / \\${detour}\\`,
        \\`Route reason: \\${order.pathReason ?? '—'}\\`,
        \\`Replans: \\${order.replanCount ?? 0} · last: \\${order.lastReplanReason ?? '—'}\\`,
      ];
}

`,
    'function formatNavigationInspector(',
  );
  return updated;
});

async function edit(path, transform) {
  const original = await readFile(path, 'utf8');
  const updated = transform(original);
  if (updated === original) return;
  await writeFile(path, updated, 'utf8');
  changedFiles.push(path);
  console.log(`Updated ${path}`);
}

function replaceExact(source, before, after) {
  if (source.includes(before)) return source.replaceAll(before, after);
  if (source.includes(after)) return source;
  throw new Error(`Expected source pattern was not found: ${before.slice(0, 140)}`);
}

function insertAfter(source, anchor, insertion, marker) {
  if (source.includes(marker)) return source;
  const index = source.indexOf(anchor);
  if (index < 0) throw new Error(`Insert-after anchor was not found: ${anchor.slice(0, 140)}`);
  return source.slice(0, index + anchor.length) + insertion + source.slice(index + anchor.length);
}

function insertBefore(source, anchor, insertion, marker) {
  if (source.includes(marker)) return source;
  const index = source.indexOf(anchor);
  if (index < 0) throw new Error(`Insert-before anchor was not found: ${anchor.slice(0, 140)}`);
  return source.slice(0, index) + insertion + source.slice(index);
}

function replaceBetween(source, startMarker, endMarker, replacement, marker) {
  if (source.includes(marker)) return source;
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  if (start < 0 || end < 0) throw new Error(`Replace range was not found: ${startMarker} -> ${endMarker}`);
  return source.slice(0, start) + replacement + source.slice(end);
}

console.log(`Navigation branch maintenance complete. Changed files: ${changedFiles.length}.`);
