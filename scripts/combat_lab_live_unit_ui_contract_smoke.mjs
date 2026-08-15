import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [hosts, tabs, inspector, extension, css] = await Promise.all([
  readFile('src/combat-lab/ui/CombatLabWorkspaceHosts.ts', 'utf8'),
  readFile('src/combat-lab/ui/CombatLabWorkspaceTabs.ts', 'utf8'),
  readFile('src/combat-lab/ui/CombatLabLiveUnitInspector.ts', 'utf8'),
  readFile('src/combat-lab/CombatLabExtension.ts', 'utf8'),
  readFile('src/combat-lab/polygon-shell.css', 'utf8'),
]);

assert.match(hosts, /POLYGON_RIGHT_PANEL_DEFINITIONS/);
assert.match(hosts, /export interface CombatLabRightPanelHosts/);
for (const id of ['unit', 'info', 'attention', 'memory']) {
  assert.match(hosts, new RegExp(`readonly\\s+${id}:\\s*HTMLElement`));
}
assert.match(tabs, /readonly rightHosts:\s*CombatLabRightPanelHosts/);
assert.match(tabs, /rightHosts/);

for (const token of [
  'buildCombatLabLiveUnitSnapshot',
  'session.executeInteractive',
  "kind: 'posture'",
  'requestCombatLabGameEditorOpen',
  'selectedUnitId',
  'reasonRu',
  'getSelectedUnit',
]) {
  assert.match(inspector, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
}
assert.doesNotMatch(inspector, /behaviorRuntime\.posture\s*=/, 'Right Panel must never directly mutate live posture.');
assert.doesNotMatch(inspector, /(?:let|const|private|readonly)\s+selectedUnit\s*=/, 'Right Panel must not own a second selected-unit store.');
assert.doesNotMatch(inspector, /new\s+CombatLabVisualSession\s*\(/, 'Right Panel must use the existing visual session.');
assert.match(inspector, /Выберите бойца на карте/);
assert.match(inspector, /Приказ игрока/);
assert.match(inspector, /Действие сейчас/);
assert.match(inspector, /Вооружение/);
assert.match(inspector, /Ранения/);
assert.match(inspector, /Связанные профили/);

assert.match(extension, /CombatLabLiveUnitInspector/);
assert.match(extension, /liveUnitInspector\.refresh\(\)/);
assert.match(extension, /liveUnitInspector\.destroy\(\)/);

assert.match(css, /\.polygon-live-unit/);
assert.match(css, /\.polygon-live-unit__posture/);
assert.match(css, /\.polygon-live-unit__entity-link/);

console.log('Combat Lab LIVE Unit UI contract smoke passed.');
