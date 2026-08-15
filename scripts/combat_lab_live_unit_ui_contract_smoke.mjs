import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [hosts, tabs, inspector, main, css] = await Promise.all([
  readFile('src/combat-lab/ui/CombatLabWorkspaceHosts.ts', 'utf8'),
  readFile('src/combat-lab/ui/CombatLabWorkspaceTabs.ts', 'utf8'),
  readFile('src/combat-lab/ui/CombatLabLiveUnitInspector.ts', 'utf8'),
  readFile('src/combat-lab/main.ts', 'utf8'),
  readFile('src/combat-lab/ui/combat-lab-live-unit.css', 'utf8'),
]);

assert.match(hosts, /POLYGON_RIGHT_PANEL_DEFINITIONS/);
assert.match(hosts, /export interface CombatLabRightPanelHosts/);
for (const id of ['unit', 'info', 'attention', 'memory']) {
  assert.match(hosts, new RegExp(`readonly\\s+${id}:\\s*HTMLElement`));
}
assert.match(tabs, /readonly rightHosts:\s*CombatLabRightPanelHosts/);
assert.match(tabs, /data\.polygonRightContent/);

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
assert.doesNotMatch(inspector, /private\s+(?:readonly\s+)?selectedUnit\b|selectedUnitStore/, 'Right Panel must not own a second selected-unit store.');
assert.doesNotMatch(inspector, /new\s+CombatLabVisualSession\s*\(/, 'Right Panel must use the existing visual session.');
assert.match(inspector, /Выберите бойца на карте/);
assert.match(inspector, /Приказ игрока/);
assert.match(inspector, /Действие сейчас/);
assert.match(inspector, /Вооружение/);
assert.match(inspector, /Ранения/);
assert.match(inspector, /Связанные профили/);

assert.match(main, /CombatLabLiveUnitInspector/);
assert.match(main, /context\.addTickerListener\(\(\) => liveUnitInspector\.refresh\(\)\)/);
assert.match(main, /services\.selection\.subscribe\(\(\) => liveUnitInspector\.refresh\(true\)\)/);
assert.match(main, /services\.draft\.subscribe\(\(\) => liveUnitInspector\.refresh\(true\)\)/);
assert.match(main, /liveUnitInspector\.destroy\(\)/);
assert.match(main, /data-polygon-right-content="unit"/);

assert.match(css, /\.polygon-live-unit/);
assert.match(css, /\.polygon-live-unit__posture/);
assert.match(css, /\.polygon-live-unit__entity-link/);

console.log('Combat Lab LIVE Unit UI contract smoke passed.');
