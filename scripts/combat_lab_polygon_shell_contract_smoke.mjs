import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [hosts, tabs, extension, main, shellCss] = await Promise.all([
  readFile('src/combat-lab/ui/CombatLabWorkspaceHosts.ts', 'utf8'),
  readFile('src/combat-lab/ui/CombatLabWorkspaceTabs.ts', 'utf8'),
  readFile('src/combat-lab/CombatLabExtension.ts', 'utf8'),
  readFile('src/combat-lab/main.ts', 'utf8'),
  readFile('src/combat-lab/polygon-shell.css', 'utf8'),
]);

const primaryTabs = [
  ['scene', 'Карта'],
  ['program', 'Программа'],
  ['laboratory', 'Лаборатория'],
  ['metrics', 'Метрики'],
  ['journal', 'Журнал'],
  ['batch', 'Серия'],
];
for (const [id, label] of primaryTabs) {
  assert.match(hosts, new RegExp(`tabId:\\s*'${id}'[^\\n]*labelRu:\\s*'${label}'`));
}
assert.match(hosts, /COMBAT_LAB_PRIMARY_WORKSPACE_TAB_DEFINITIONS/);
assert.match(hosts, /COMBAT_LAB_AUXILIARY_WORKSPACE_TAB_DEFINITIONS/);
assert.match(hosts, /tabId:\s*'parameters'[^\n]*labelRu:\s*'Параметры'/);
assert.match(hosts, /tabId:\s*'settings'[^\n]*labelRu:\s*'Общие редакторы'/);

for (const label of ['Юнит', 'Инфо', 'Внимание', 'Память']) {
  assert.match(tabs, new RegExp(`labelRu:\\s*'${label}'`));
}
assert.match(tabs, /polygon-shell-header/);
assert.match(tabs, /polygon-shell-primary-tabs/);
assert.match(tabs, /polygon-shell-left/);
assert.match(tabs, /polygon-shell-center/);
assert.match(tabs, /polygon-shell-right/);
assert.match(tabs, /polygon-shell-timeline/);
assert.match(tabs, /setCollapsed\(/);
assert.match(tabs, /setRightCollapsed\(/);
assert.match(tabs, /sessionStorage/);
assert.doesNotMatch(tabs, /selectedUnitId\s*=|new\s+CombatLabVisualSession|new\s+(?:PIXI\.)?Application\s*\(/);
assert.doesNotMatch(tabs, /window\.[A-Za-z_$][\w$]*\s*=/, 'Shell must not publish a new window/global API.');

assert.match(extension, /hosts\.laboratory/);
assert.match(extension, /не подключена к продуктовым параметрам/i);
assert.doesNotMatch(extension, /fake|demo Unit|synthetic Series/i);

assert.match(main, /\.\/polygon-shell\.css/);
assert.match(shellCss, /grid-template-columns:\s*var\(--polygon-shell-left-width\)\s+minmax\(0,\s*1fr\)\s+var\(--polygon-shell-right-width\)/);
assert.match(shellCss, /combat-lab-dock-collapsed/);
assert.match(shellCss, /polygon-shell-right-collapsed/);
assert.match(shellCss, /@media\s*\(max-width:\s*980px\)/);
assert.match(shellCss, /@media\s*\(max-height:\s*720px\)/);
assert.match(shellCss, /\.simulation-sidebar[\s\S]*display:\s*none\s*!important/);
assert.match(shellCss, /\.simulation-unit-bar[\s\S]*display:\s*none\s*!important/);

console.log('Polygon shell contract smoke passed.');
