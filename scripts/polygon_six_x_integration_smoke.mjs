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

// Accepted Interface Linkage v1 presents one continuous live map surface below
// the top chrome. The product must not frame the existing Pixi board into a
// centred square or keep the old black letterbox presentation.
expectExcludes('src/combat-lab/polygon-map-surface.css', [
  '--polygon-map-size: min(',
  'width: var(--polygon-map-size)',
  'height: var(--polygon-map-size)',
]);
expectIncludes('src/combat-lab/polygon-map-surface.css', [
  'top: var(--polygon-chrome-h) !important;',
  'right: 0 !important;',
  'bottom: 0 !important;',
  'left: 0 !important;',
]);
expectIncludes('src/rendering/PixiApp.ts', [
  'fitMapToViewport',
]);

// Existing authoritative game editors remain the owners, but their Combat Lab
// catalogue must be presented as the prototype editor workspace rather than a
// grid of dark/independent cards.
expectIncludes('src/combat-lab/game-editors/CombatLabGameEditorCatalogue.ts', [
  'combat-lab-game-editor-workspace',
  'combat-lab-game-editor-nav',
  'combat-lab-game-editor-stage',
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
