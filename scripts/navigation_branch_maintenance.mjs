import { readFile, writeFile } from 'node:fs/promises';

const changedFiles = [];

await edit('src/core/navigation/RouteCostField.ts', (source) => {
  let updated = source;
  const identityBlock = "const mapIdentityByMap = new WeakMap<TacticalMap, number>();\nlet nextMapIdentity = 1;\n\n";
  updated = updated.split(identityBlock).join('');
  updated = insertAfter(updated,
    "import type { NavigationProfile, NavigationTerrainCostKey } from './NavigationProfiles';\n",
    `\n${identityBlock}`,
    'const mapIdentityByMap = new WeakMap<TacticalMap, number>();');

  const identityFunction = "function getMapIdentity(map: TacticalMap): number {\n  const existing = mapIdentityByMap.get(map);\n  if (existing !== undefined) return existing;\n  const identity = nextMapIdentity;\n  nextMapIdentity += 1;\n  mapIdentityByMap.set(map, identity);\n  return identity;\n}\n\n";
  updated = updated.split(identityFunction).join('');
  updated = insertBefore(updated,
    'function trimCache<T>(cache: Map<string, T>, maximum: number): void {',
    identityFunction,
    'function getMapIdentity(map: TacticalMap)');
  if (!updated.includes('  const staticKey = [\n    getMapIdentity(map),')) {
    updated = replaceExact(updated,
      '  const staticKey = [\n    map.width,',
      '  const staticKey = [\n    getMapIdentity(map),\n    map.width,');
  }
  return updated;
});

await edit('src/core/pathfinding/GridPathfinder.ts', (source) => source.replaceAll(
  'tacticalSearch.visitedCells + (baseline.ok ? baseline.visitedCells : 0)',
  'tacticalSearch.visitedCells',
));

await edit('src/core/navigation/NavigationReplanPolicy.ts', (source) => {
  if (source.includes("reason === 'profile_changed'")) return source;
  return replaceExact(source,
    "    reason === 'blocked'\n    || improvementRatio !== null",
    "    reason === 'blocked'\n    || reason === 'profile_changed'\n    || improvementRatio !== null");
});

await edit('src/core/ai/AiStatefulMoveGameBridge.ts', (source) => {
  let updated = insertAfter(source,
    "import type { GridPosition } from '../geometry';\n",
    "import { buildUnitTacticalRouteContext, resolveUnitNavigationProfile } from '../navigation/NavigationRuntime';\n",
    'resolveUnitNavigationProfile');
  if (!updated.includes('navigationProfile: resolvedNavigation.profile')) {
    updated = replaceExact(updated,
      "    if (effect.type === 'begin_move') {\n      const planned = planMoveOrder(state.map, unit.position, effect.targetPosition, {\n        source: 'ai',\n        ownerToken: effect.ownerToken,\n        allowGoalAdjustment: false,\n      });",
      "    if (effect.type === 'begin_move') {\n      const resolvedNavigation = resolveUnitNavigationProfile(unit, null);\n      const planned = planMoveOrder(state.map, unit.position, effect.targetPosition, {\n        source: 'ai',\n        ownerToken: effect.ownerToken,\n        allowGoalAdjustment: false,\n        movementMode: unit.navigationMovementMode ?? 'normal',\n        navigationProfile: resolvedNavigation.profile,\n        navigationProfileSource: resolvedNavigation.source,\n        tacticalContext: buildUnitTacticalRouteContext(unit),\n      });");
  }
  return updated;
});

await edit('src/core/simulation/SimulationTick.ts', (source) => {
  let updated = source;
  updated = updated.replace("import { planMoveOrder } from '../orders/MoveOrderPlanning';\n", '');
  updated = updated.replace("import { isMapCellPassable } from '../pathfinding/GridNavigation';\n", '');
  updated = updated.replace('const ROUTE_LOOKAHEAD_CELLS = 6;\n', '');
  updated = insertAfter(updated,
    "import { clampGridPositionToMap } from '../map/MapModel';\n",
    "import { ensureNavigationRouteCurrent } from '../navigation/NavigationRouteReplanner';\n",
    'ensureNavigationRouteCurrent');
  if (!updated.includes('return ensureNavigationRouteCurrent(unit, state);')) {
    updated = replaceBetween(updated,
      'function ensureRoutePassable(unit: UnitModel, state: SimulationState): boolean {',
      'function completeLinkedPlayerCommand(unit: UnitModel, order: MoveOrder): void {',
      "function ensureRoutePassable(unit: UnitModel, state: SimulationState): boolean {\n  return ensureNavigationRouteCurrent(unit, state);\n}\n\n");
  }
  return updated;
});

await edit('src/main.ts', (source) => {
  let updated = insertAfter(source,
    "import './command-plan-route-overlay.css';\n",
    "import './route-cost-overlay.css';\n",
    "import './route-cost-overlay.css';");
  updated = insertAfter(updated,
    "import { installCommandPlanRouteUi } from './ui/CommandPlanRouteUi';\n",
    "import { installRouteCostOverlayUi } from './ui/RouteCostOverlayUi';\n",
    'installRouteCostOverlayUi');
  updated = insertAfter(updated,
    'const destroyCommandPlanRouteUi = installCommandPlanRouteUi(state, forceRenderAtNativeMapQuality);\n',
    'const destroyRouteCostOverlayUi = installRouteCostOverlayUi(state, forceRenderAtNativeMapQuality);\n',
    'const destroyRouteCostOverlayUi =');
  updated = insertAfter(updated,
    '  destroyCommandPlanRouteUi();\n',
    '  destroyRouteCostOverlayUi();\n',
    'destroyRouteCostOverlayUi();');
  return updated;
});

await edit('src/rendering/PixiApp.ts', (source) => {
  let updated = insertAfter(source,
    "import { PixiMapRenderer } from './PixiMapRenderer';\n",
    "import { PixiRouteCostOverlayRenderer } from './PixiRouteCostOverlayRenderer';\n",
    'PixiRouteCostOverlayRenderer');
  updated = insertAfter(updated,
    '  private readonly mapRenderer = new PixiMapRenderer();\n',
    '  private readonly routeCostOverlayRenderer = new PixiRouteCostOverlayRenderer();\n',
    'routeCostOverlayRenderer = new PixiRouteCostOverlayRenderer');
  updated = insertAfter(updated,
    '      this.mapRenderer.container,\n',
    '      this.routeCostOverlayRenderer.container,\n',
    'this.routeCostOverlayRenderer.container');
  updated = insertAfter(updated,
    '    this.overlayRenderer.destroy();\n',
    '    this.routeCostOverlayRenderer.destroy();\n',
    'this.routeCostOverlayRenderer.destroy();');
  updated = insertAfter(updated,
    '    this.awarenessHeatmapRenderer.render(this.state);\n',
    '    this.routeCostOverlayRenderer.render(this.state);\n',
    'this.routeCostOverlayRenderer.render(this.state);');
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

function replaceBetween(source, startMarker, endMarker, replacement) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  if (start < 0 || end < 0) throw new Error(`Replace range was not found: ${startMarker} -> ${endMarker}`);
  return source.slice(0, start) + replacement + source.slice(end);
}

console.log(`Navigation branch maintenance complete. Changed files: ${changedFiles.length}.`);
