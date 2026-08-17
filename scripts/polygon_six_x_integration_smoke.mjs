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
  'button.click()',
]);
expectIncludes('src/combat-lab/main.ts', [
  'CombatLabEditorShellBridge.create',
  'PolygonRightPanelLiveView',
  'preparePolygonInfoLiveOwners',
  'registerEntityContextMenuRoutes',
  'requestCombatLabGameEditorOpen',
  "rightPanel.activateTab(view)",
]);
expectIncludes('src/ui/EntityContextMenu.ts', [
  'getRegisteredEntityContextMenuRoutes',
]);
expectIncludes('src/input/TacticalOrderRadialInput.ts', [
  'contextRoutes: EntityContextMenuRoutes = {}',
]);

if (failures.length > 0) {
  console.error('Polygon six-X integration smoke failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Polygon six-X integration smoke passed.');
