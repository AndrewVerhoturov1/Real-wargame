import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const failures = [];
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const exists = (relativePath) => fs.existsSync(path.join(root, relativePath));

function expectFile(relativePath) {
  if (!exists(relativePath)) failures.push(`${relativePath}: file is missing`);
}

function expectIncludes(relativePath, snippets) {
  if (!exists(relativePath)) {
    failures.push(`${relativePath}: file is missing`);
    return;
  }
  const source = read(relativePath);
  for (const snippet of snippets) {
    if (!source.includes(snippet)) failures.push(`${relativePath}: missing ${JSON.stringify(snippet)}`);
  }
}

function expectExcludes(relativePath, snippets) {
  if (!exists(relativePath)) {
    failures.push(`${relativePath}: file is missing`);
    return;
  }
  const source = read(relativePath);
  for (const snippet of snippets) {
    if (source.includes(snippet)) failures.push(`${relativePath}: must not include ${JSON.stringify(snippet)}`);
  }
}

for (const file of [
  'src/combat-lab/right-panel/PolygonRightPanelLive.ts',
  'src/combat-lab/right-panel/PolygonRightPanelLiveView.ts',
  'src/combat-lab/game-editors/CombatLabEditorShellBridge.ts',
  'src/combat-lab/game-editors/polygon-global-editor-feature-grid.css',
  'src/combat-lab/game-editors/PolygonGlobalEditorParity.ts',
  'src/combat-lab/game-editors/polygon-global-editor-inner-parity.css',
  'src/input/TacticalOrderRadialInput.ts',
  'src/ui/EntityContextMenu.ts',
  'src/ui/EntityContextMenuRouteRegistry.ts',
]) expectFile(file);

expectIncludes('src/combat-lab/ui/CombatLabRightPanelSeam.ts', [
  'activateTab(tabId: CombatLabRightPanelTab): void',
  'COMBAT_LAB_ACTIVATE_RIGHT_PANEL_EVENT',
  'workspaceRoot.dispatchEvent(new CustomEvent<CombatLabRightPanelTab>',
]);
expectIncludes('src/combat-lab/ui/CombatLabWorkspaceTabs.ts', [
  "COMBAT_LAB_ACTIVATE_RIGHT_PANEL_EVENT = 'combat-lab:activate-right-panel'",
  'if (isPolygonRightPanelTab(requested)) this.activateRightPanel(requested)',
]);
expectIncludes('src/combat-lab/main.ts', [
  'CombatLabEditorShellBridge.create',
  'state: session.state',
  'session,',
  'PolygonRightPanelLiveView',
  'preparePolygonInfoLiveOwners',
  'registerEntityContextMenuRoutes',
  'requestCombatLabGameEditorOpen',
  'rightPanel.activateTab(view)',
  'polygon-global-editor-feature-grid.css',
  'polygon-global-editor-inner-parity.css',
]);
expectIncludes('src/ui/EntityContextMenu.ts', [
  'getRegisteredEntityContextMenuRoutes',
]);
expectIncludes('src/input/TacticalOrderRadialInput.ts', [
  'contextRoutes: EntityContextMenuRoutes = {}',
]);

expectExcludes('src/combat-lab/polygon-map-surface.css', [
  '--polygon-map-size: min(',
  'top: var(--polygon-chrome-h) !important;',
  'right: 0 !important;',
  'bottom: 0 !important;',
  'left: 0 !important;',
]);
expectIncludes('src/combat-lab/polygon-map-surface.css', [
  '--polygon-map-frame-left-gap: 66px;',
  '--polygon-map-frame-right-gap: 64px;',
  'top: calc(var(--polygon-chrome-h) + 40px) !important;',
  'left: calc(var(--polygon-panel-gap) + var(--polygon-left-w) + var(--polygon-map-frame-left-gap)) !important;',
  'right: calc(var(--polygon-panel-gap) + var(--polygon-right-w) + var(--polygon-map-frame-right-gap)) !important;',
  'bottom: 39px !important;',
]);
expectIncludes('src/rendering/PixiApp.ts', [
  'fitMapToViewport',
  "const polygonSurface = document.body.classList.contains('app-shell-mode-combat-lab');",
  'backgroundAlpha: polygonSurface ? 0 : 1,',
  'const scale = Math.max(viewportWidth / mapWidth, viewportHeight / mapHeight);',
  'const focusUnit = getSelectedUnit(this.state);',
  'const targetX = viewportWidth * 0.46;',
  'const targetY = viewportHeight * 0.63;',
]);
expectExcludes('src/rendering/PixiApp.ts', [
  'const scale = Math.min(viewportWidth / mapWidth, viewportHeight / mapHeight);',
]);

expectIncludes('src/combat-lab/game-editors/CombatLabEditorShellBridge.ts', [
  'polygon-map-editor-parity',
  'polygon-unit-editor-parity',
  'polygon-editor-legacy-details',
  "session.executeInteractive({ kind: 'posture'",
  'Основа карты',
  'ТАКТИЧЕСКИЙ ЗНАК',
  "if (type === 'infantry_squad') return 'Пехотное отделение';",
]);

expectIncludes('src/combat-lab/game-editors/CombatLabGameEditorCatalogue.ts', [
  'combat-lab-game-editor-workspace',
  'combat-lab-game-editor-nav',
  'combat-lab-game-editor-stage',
  "selected.activation === 'embedded'",
  'selected.definition.mount',
  'GameEditorInstallation',
  'POLYGON_GLOBAL_EDITOR_GROUPS',
  "'routeProfiles'",
  "'tacticalPositions'",
  "'soldierArchetypes'",
  "'attentionProfiles'",
  "'perceptionProfiles'",
  "'movementProfiles'",
  "'weapons'",
  "'conditionProfiles'",
  "'surfaceTypes'",
  "'environmentProfiles'",
  "'directionalTerrain'",
  'installPolygonGlobalEditorParity',
]);
expectExcludes('src/combat-lab/game-editors/CombatLabGameEditorCatalogue.ts', [
  'for (const definition of registry.listForSurface(\'combat-lab\'))',
]);

expectIncludes('src/combat-lab/game-editors/PolygonGlobalEditorParity.ts', [
  'PolygonGlobalEditorId',
  'installPolygonGlobalEditorParity',
  "'routeProfiles'",
  "'tacticalPositions'",
  "'soldierArchetypes'",
  "'attentionProfiles'",
  "'perceptionProfiles'",
  "'movementProfiles'",
  "'weapons'",
  "'conditionProfiles'",
  "'environmentProfiles'",
  "'directionalTerrain'",
  'MutationObserver',
  'decorateRouteProfileEditor',
]);

expectIncludes('src/game-editors/createDefaultGameEditorRegistry.ts', [
  'mountNavigationProfileEditor',
  'mountTacticalPositionProfileEditor',
  'mountSoldierArchetypeEditor',
  'mountAttentionProfileEditor',
  'mountPerceptionProfileEditor',
  'mountMovementProfileEditor',
  'mountCombatCatalogEditor',
  'mountConditionProfileEditor',
  'mountEnvironmentProfileEditor',
  'mountDirectionalTerrainProfileEditor',
]);
expectExcludes('src/game-editors/createDefaultGameEditorRegistry.ts', [
  "id: 'surfaceTypes'",
]);

expectIncludes('src/combat-lab/right-panel/polygon-right-panel-live.css', [
  'polygon-info-parity',
  'polygon-info-kv-row',
]);

if (failures.length > 0) {
  console.error('Polygon six-X integration smoke failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Polygon six-X integration smoke passed.');
