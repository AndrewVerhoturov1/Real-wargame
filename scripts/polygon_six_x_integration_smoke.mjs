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
]);
expectIncludes('src/ui/EntityContextMenu.ts', [
  'getRegisteredEntityContextMenuRoutes',
]);
expectIncludes('src/input/TacticalOrderRadialInput.ts', [
  'contextRoutes: EntityContextMenuRoutes = {}',
]);

// Interface Linkage v1 has a continuous map surface and a central tactical map
// frame between the two floating panels. The real Pixi canvas itself occupies
// that frame; no black outer container or inner letterboxed board is allowed.
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

// Map and Unit tabs must present the accepted prototype structures first, while
// retaining the existing product-owned editors underneath as an advanced layer.
expectIncludes('src/combat-lab/game-editors/CombatLabEditorShellBridge.ts', [
  'polygon-map-editor-parity',
  'polygon-unit-editor-parity',
  'polygon-editor-legacy-details',
  "session.executeInteractive({ kind: 'posture'",
  'Основа карты',
  'Тактический знак',
]);

// Shared Editors must mount real embedded registry editors in the prototype
// workspace instead of leaving the main stage as a placeholder card.
expectIncludes('src/combat-lab/game-editors/CombatLabGameEditorCatalogue.ts', [
  'combat-lab-game-editor-workspace',
  'combat-lab-game-editor-nav',
  'combat-lab-game-editor-stage',
  "selected.activation === 'embedded'",
  'selected.definition.mount',
  'GameEditorInstallation',
]);

// LINZA still supplies real Info values; these markers are presentation-only
// hooks used to enforce the accepted compact light inspector language.
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
