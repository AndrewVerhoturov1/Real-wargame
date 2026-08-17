import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(path, 'utf8');
const [seam, inspector, presentation, css, main] = await Promise.all([
  read('src/combat-lab/ui/CombatLabRightPanelSeam.ts'),
  read('src/combat-lab/ui/CombatLabLiveUnitInspector.ts'),
  read('src/combat-lab/ui/CombatLabLiveUnitPresentation.ts'),
  read('src/combat-lab/ui/combat-lab-live-unit.css'),
  read('src/combat-lab/main.ts'),
]);

for (const tab of ['unit', 'info', 'attention', 'memory']) {
  assert.match(seam, new RegExp(`'${tab}'`));
  assert.match(seam, new RegExp(`data-polygon-right-panel=\\"\\$\\{tabId\\}\\"|data-polygon-right-panel`));
}
assert.match(seam, /getCombatLabWorkspaceServices/);
assert.match(seam, /selection: services\.selection/);
assert.doesNotMatch(seam, /new CombatLabSelectionController/);

assert.match(inspector, /getSelectedUnit\(this\.options\.state\)/);
assert.match(inspector, /this\.options\.session\.executeInteractive/);
assert.match(inspector, /kind: 'posture'/);
assert.match(inspector, /requestCombatLabGameEditorOpen/);
assert.match(inspector, /unit-pose-button__icon/);
assert.match(inspector, /Приказ игрока/);
assert.match(inspector, /Действие сейчас/);
assert.match(inspector, /Дополнительно/);
assert.doesNotMatch(inspector, /behaviorRuntime\.posture\s*=/);
assert.doesNotMatch(inspector, /state\.selectedUnitId\s*=/);

assert.match(presentation, /getEffectiveCombatCapabilities/);
assert.match(presentation, /infantryCombatRuntime/);
assert.match(presentation, /playerCommand/);
assert.match(presentation, /primaryWeapon/);
assert.match(presentation, /resolveCombatLabSelectedUnitProfileLinks/);
assert.doesNotMatch(presentation, /fake/i);

for (const exact of [
  'padding: 7px 8px 10px',
  'min-height: 31px',
  'grid-template-columns: repeat(4, minmax(0, 1fr))',
  'grid-template-columns: 52px minmax(0, 1fr)',
  'height: 28px',
  'border-left-color: #9a8434',
  'border-left-color: #607d68',
]) assert.ok(css.includes(exact), `Missing approved Unit-tab CSS token: ${exact}`);

assert.match(main, /getCombatLabRightPanelSeam/);
assert.match(main, /rightPanel\.selection\.subscribe/);
assert.match(main, /services\.draft\.subscribe/);
assert.match(main, /context\.addTickerListener/);
assert.match(main, /removeDraftListener\(\)/);
assert.match(main, /removeSelectionListener\(\)/);
assert.match(main, /removeTickerListener\(\)/);

console.log('Combat Lab LIVE Unit UI contract smoke passed.');
