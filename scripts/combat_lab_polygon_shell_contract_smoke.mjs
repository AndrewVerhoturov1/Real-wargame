import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [hosts, tabs, main, shellCss, compatCss] = await Promise.all([
  readFile('src/combat-lab/ui/CombatLabWorkspaceHosts.ts', 'utf8'),
  readFile('src/combat-lab/ui/CombatLabWorkspaceTabs.ts', 'utf8'),
  readFile('src/combat-lab/main.ts', 'utf8'),
  readFile('src/combat-lab/polygon-shell.css', 'utf8'),
  readFile('src/combat-lab/polygon-shell-compat.css', 'utf8'),
]);

for (const [id, label] of [
  ['scene', 'Карта'],
  ['program', 'Программа'],
  ['laboratory', 'Лаборатория'],
  ['metrics', 'Метрики'],
  ['journal', 'Журнал'],
  ['batch', 'Серия'],
  ['parameters', 'Параметры'],
  ['settings', 'Общие редакторы'],
]) {
  assert.match(hosts, new RegExp(`tabId:\\s*'${id}'[^\\n]*labelRu:\\s*'${label}'`));
}

for (const label of ['Программа', 'Лаборатория', 'Редактор карты', 'Редактор юнита', 'Серия', 'Метрики', 'Журнал']) {
  assert.match(tabs, new RegExp(`labelRu:\\s*'${label}'`), `Visible left-panel tab must include ${label}.`);
}
for (const label of ['Юнит', 'Инфо', 'Внимание', 'Память']) {
  assert.match(tabs, new RegExp(`labelRu:\\s*'${label}'`));
}

assert.match(tabs, /polygon-shell-topbar/);
assert.match(tabs, /polygon-shell-brand-mark/);
assert.match(tabs, /polygon-shell-history-strip/);
assert.match(tabs, /polygon-shell-history-track/);
assert.match(tabs, /polygon-shell-history-live/);
assert.match(tabs, /polygon-shell-left/);
assert.match(tabs, /polygon-shell-left-tabs/);
assert.match(tabs, /polygon-shell-right/);
assert.match(tabs, /polygon-shell-right-tabs/);
assert.match(tabs, /polygon-shell-hidden-hosts/);
assert.match(tabs, /ФАЙЛ/);
assert.match(tabs, /РЕДАКТОРЫ/);
assert.match(tabs, /ВИД ▾/);
assert.match(tabs, /ФИЛЬТРЫ/);
assert.match(tabs, /ХРОНОЛОГИЯ ▾/);
assert.match(tabs, /setCollapsed\(/);
assert.match(tabs, /setRightCollapsed\(/);
assert.match(tabs, /sessionStorage/);
assert.match(tabs, /normalizeVisibleWorkspaceTab\(storedTab\)/,
  'Persisted utility tabs from the old shell must normalize to a visible prototype workspace.');
assert.match(tabs, /POLYGON_LEFT_WORKSPACE_DEFINITIONS\.some\(\(definition\) => definition\.tabId === normalized\)/,
  'Visible-tab normalization must use the accepted seven-tab palette.');
assert.ok((tabs.match(/requestWorkspaceResize\(\)/g) ?? []).length >= 3,
  'The shell must request an initial viewport resize in addition to both collapse-state resizes.');

assert.doesNotMatch(tabs, /polygon-shell-primary-tabs/, 'Global full-width workspace tabs are not part of the accepted prototype shell.');
assert.doesNotMatch(tabs, /polygon-shell-auxiliary-tabs/, 'Old auxiliary tabs must not be visible in the new shell.');
assert.doesNotMatch(tabs, /polygon-shell-timeline/, 'ARKA shell must not restore the previous fake bottom timeline component.');
assert.doesNotMatch(tabs, /polygon-shell-empty-state/, 'Visible shell bodies stay blank until product owners are integrated.');
assert.doesNotMatch(tabs, /44\s*\/\s*54|событий\s*·\s*◆|Демонстрационная replay/i,
  'The visual history strip must not copy demo event counts or fake replay state from standalone HTML.');
assert.doesNotMatch(tabs, /selectedUnitId\s*=|new\s+CombatLabVisualSession|new\s+(?:PIXI\.)?Application\s*\(/);
assert.doesNotMatch(tabs, /window\.[A-Za-z_$][\w$]*\s*=/, 'Shell must not publish a new window/global API.');

assert.match(main, /workspaceHosts\.laboratory/);
assert.doesNotMatch(`${tabs}\n${main}`, /demo Unit|synthetic Series/i);
assert.match(main, /\.\/polygon-shell\.css/);
assert.match(main, /\.\/polygon-shell-compat\.css/);

for (const token of [
  '--polygon-topbar-h: 58px',
  '--polygon-history-h: 30px',
  '--polygon-chrome-h: calc(var(--polygon-topbar-h) + var(--polygon-history-h))',
  '--polygon-left-w: 372px',
  '--polygon-right-w: 336px',
  '--polygon-panel-gap: 14px',
  '--polygon-top: #344321',
  '--polygon-top-2: #273318',
  '--polygon-accent: #d8b941',
  '--polygon-panel-solid: #f6f5ee',
]) {
  assert.ok(shellCss.includes(token), `Missing exact prototype token: ${token}`);
}
assert.match(shellCss, /grid-template-columns:\s*auto\s+minmax\(0,\s*1fr\)\s+auto/);
assert.match(shellCss, /\.polygon-shell-history-strip[\s\S]*top:\s*var\(--polygon-topbar-h\)/);
assert.match(shellCss, /\.polygon-shell-history-strip[\s\S]*height:\s*var\(--polygon-history-h\)/);
assert.match(shellCss, /\.polygon-shell-history-track[\s\S]*width:\s*min\(290px,\s*24vw\)/);
assert.match(shellCss, /\.polygon-shell-viewport[\s\S]*inset:\s*var\(--polygon-chrome-h\)\s+0\s+0/);
assert.match(shellCss, /workspace-simulation\s+#app,[\s\S]*top:\s*var\(--polygon-chrome-h\)\s*!important/);
assert.match(shellCss, /left:\s*var\(--polygon-panel-gap\)/);
assert.match(shellCss, /right:\s*var\(--polygon-panel-gap\)/);
assert.match(shellCss, /width:\s*var\(--polygon-left-w\)/);
assert.match(shellCss, /width:\s*var\(--polygon-right-w\)/);
assert.match(shellCss, /background:\s*linear-gradient\(180deg,\s*var\(--polygon-top\),\s*var\(--polygon-top-2\)\)/);
assert.match(shellCss, /\.polygon-shell-left-tabs[\s\S]*flex-wrap:\s*wrap/);
assert.match(shellCss, /\.polygon-shell-tab\.active[\s\S]*background:\s*var\(--polygon-top\)/);
assert.match(shellCss, /\.polygon-shell-tab\.active:focus[\s\S]*background:\s*var\(--polygon-top\)\s*!important/,
  'Focused active tabs must keep the accepted olive active state.');
assert.match(shellCss, /combat-lab-dock-collapsed[\s\S]*\.polygon-shell-topbar[\s\S]*\.polygon-shell-run-toolbar[\s\S]*display:\s*block\s*!important/,
  'Collapsing the left panel must not hide the global run controls in the new top bar.');
assert.match(shellCss, /\.polygon-shell-hidden-hosts[\s\S]*display:\s*none/);
assert.match(shellCss, /combat-lab-dock-collapsed/);
assert.match(shellCss, /polygon-shell-right-collapsed/);
assert.match(shellCss, /@media\s*\(max-width:\s*1120px\)/);
assert.match(shellCss, /\.simulation-sidebar[\s\S]*display:\s*none\s*!important/);
assert.match(shellCss, /\.simulation-unit-bar[\s\S]*display:\s*none\s*!important/);
assert.match(compatCss, /app-shell-menu-trigger/);

console.log('Exact prototype Polygon shell contract smoke passed.');
