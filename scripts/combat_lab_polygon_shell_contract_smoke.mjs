import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [hosts, tabs, main, shellCss, compatCss, exactCss] = await Promise.all([
  readFile('src/combat-lab/ui/CombatLabWorkspaceHosts.ts', 'utf8'),
  readFile('src/combat-lab/ui/CombatLabWorkspaceTabs.ts', 'utf8'),
  readFile('src/combat-lab/main.ts', 'utf8'),
  readFile('src/combat-lab/polygon-shell.css', 'utf8'),
  readFile('src/combat-lab/polygon-shell-compat.css', 'utf8'),
  readFile('src/combat-lab/polygon-shell-exact.css', 'utf8'),
]);
const visualCss = `${shellCss}\n${compatCss}\n${exactCss}`;

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
assert.match(tabs, /polygon-shell-map-placeholder/,
  'The approved visual pass must mask the live map with a prototype-style placeholder.');
assert.match(tabs, /polygon-shell-map-board/,
  'The placeholder must include the central prototype-style board field.');
assert.match(tabs, /polygon-shell-left/);
assert.match(tabs, /polygon-shell-left-tabs/);
assert.match(tabs, /polygon-shell-right/);
assert.match(tabs, /polygon-shell-right-tabs/);
assert.match(tabs, /polygon-shell-hidden-hosts/);
assert.match(tabs, /setCollapsed\(/);
assert.match(tabs, /setRightCollapsed\(/);
assert.match(tabs, /sessionStorage/);
assert.match(tabs, /normalizeVisibleWorkspaceTab\(storedTab\)/,
  'Persisted utility tabs from the old shell must normalize to a visible prototype workspace.');
assert.match(tabs, /if\s*\(value\s*===\s*null\s*\|\|\s*value\s*===\s*undefined\s*\|\|\s*value\s*===\s*''\)\s*return\s*'program'/,
  'A fresh exact-shell session must open on the prototype Program workspace before generic workspace normalization.');
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
assert.match(main, /\.\/polygon-shell-exact\.css/);

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
  '--polygon-grid-small: 20px',
  '--polygon-grid-large: 80px',
  '--polygon-placeholder-bg: #c5c4ba',
  '--polygon-placeholder-board: #b7b4a6',
]) {
  assert.ok(visualCss.includes(token), `Missing exact prototype token: ${token}`);
}
assert.match(visualCss, /grid-template-columns:\s*auto\s+minmax\(0,\s*1fr\)\s+auto/);
assert.match(visualCss, /\.polygon-shell-history-strip[\s\S]*top:\s*var\(--polygon-topbar-h\)/);
assert.match(visualCss, /\.polygon-shell-history-strip[\s\S]*height:\s*var\(--polygon-history-h\)/);
assert.match(visualCss, /\.polygon-shell-viewport[\s\S]*inset:\s*var\(--polygon-chrome-h\)\s+0\s+0/);
assert.match(exactCss, /\.polygon-shell-map-placeholder[\s\S]*pointer-events:\s*none/,
  'Map placeholder must remain inert and must not fabricate map interaction.');
assert.match(exactCss, /\.polygon-shell-map-placeholder[\s\S]*background-image:[\s\S]*linear-gradient/,
  'Map placeholder must reproduce the prototype grid instead of exposing the live map.');
assert.match(exactCss, /\.polygon-shell-map-board[\s\S]*background:\s*var\(--polygon-placeholder-board\)/,
  'Central board must use the screenshot-matched placeholder board tone.');
assert.match(exactCss, /#app\s+canvas[\s\S]*visibility:\s*hidden\s*!important/,
  'The live product canvas must be visually hidden during the placeholder-only visual pass.');
assert.match(exactCss, /--polygon-board-gap:\s*65px/);
assert.match(exactCss, /@media\s*\(max-width:\s*1120px\)[\s\S]*--polygon-board-gap:\s*45px/);
assert.match(exactCss, /\.polygon-shell-left-tabs,[\s\S]*\.polygon-shell-right-tabs\s*\{[\s\S]*gap:\s*5px;[\s\S]*padding:\s*9px\s+10px;/,
  'Panel tab rows must retain the prototype spacing so Journal stays on the second row.');
assert.match(exactCss, /\.polygon-shell-tab\s*\{[\s\S]*padding:\s*5px\s+9px;[\s\S]*letter-spacing:\s*\.045em;/,
  'Panel tabs must match the prototype density and typography.');
assert.match(visualCss, /left:\s*var\(--polygon-panel-gap\)/);
assert.match(visualCss, /right:\s*var\(--polygon-panel-gap\)/);
assert.match(visualCss, /width:\s*var\(--polygon-left-w\)/);
assert.match(visualCss, /width:\s*var\(--polygon-right-w\)/);
assert.match(visualCss, /background:\s*linear-gradient\(180deg,\s*var\(--polygon-top\),\s*var\(--polygon-top-2\)\)/);
assert.match(visualCss, /\.polygon-shell-left-tabs[\s\S]*flex-wrap:\s*wrap/);
assert.match(visualCss, /\.polygon-shell-tab\.active[\s\S]*background:\s*var\(--polygon-top\)/);
assert.match(visualCss, /\.polygon-shell-tab\.active:focus[\s\S]*background:\s*var\(--polygon-top\)\s*!important/,
  'Focused active tabs must keep the accepted olive active state.');
assert.match(visualCss, /combat-lab-dock-collapsed[\s\S]*\.polygon-shell-topbar[\s\S]*\.polygon-shell-run-toolbar[\s\S]*display:\s*block\s*!important/,
  'Collapsing the left panel must not hide the global run controls in the new top bar.');
assert.match(visualCss, /\.polygon-shell-hidden-hosts[\s\S]*display:\s*none/);
assert.match(visualCss, /combat-lab-dock-collapsed/);
assert.match(visualCss, /polygon-shell-right-collapsed/);
assert.match(visualCss, /@media\s*\(max-width:\s*1120px\)/);
assert.match(visualCss, /\.simulation-sidebar[\s\S]*display:\s*none\s*!important/);
assert.match(visualCss, /\.simulation-unit-bar[\s\S]*display:\s*none\s*!important/);
assert.match(visualCss, /app-shell-menu-trigger/);

console.log('Exact prototype Polygon shell contract smoke passed.');
