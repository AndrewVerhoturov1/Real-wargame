import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const requiredFiles = [
  'src/shared/AppShellMenu.ts',
  'src/shared/app-shell-menu.css',
  'src/shared/app-overlay/AppOverlayCoordinator.ts',
  'src/shared/app-overlay/AppModalLayer.ts',
  'src/shared/app-overlay/app-overlay.css',
];

for (const file of requiredFiles) {
  assert.equal(existsSync(file), true, `Не найден обязательный файл общего верхнего слоя: ${file}`);
}

const shell = readFileSync('src/shared/AppShellMenu.ts', 'utf8');
const shellCss = readFileSync('src/shared/app-shell-menu.css', 'utf8');
const coordinator = readFileSync('src/shared/app-overlay/AppOverlayCoordinator.ts', 'utf8');
const modal = readFileSync('src/shared/app-overlay/AppModalLayer.ts', 'utf8');
const modalCss = readFileSync('src/shared/app-overlay/app-overlay.css', 'utf8');
const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
const gameMain = readFileSync('src/main.ts', 'utf8');
const combatLabMain = readFileSync('src/combat-lab/main.ts', 'utf8');
const editorEntry = readFileSync('src/shared/AiEditorShellMenuEntry.ts', 'utf8');

assert.equal(packageJson.scripts?.['app-shell-overlay:smoke'], 'node scripts/app_shell_overlay_smoke.mjs');

assert.match(shell, /getAppOverlayCoordinator/);
assert.match(shell, /const installations = new WeakMap<Document/);
assert.equal((shell.match(/data-shell-action="open-menu"/g) ?? []).length, 1, 'На странице должен создаваться один компактный вызов меню.');
assert.match(shell, /this\.root\.innerHTML = '<button[^']*data-shell-action="open-menu"/);
assert.match(shell, /data-shell-action="open-menu"/);
assert.match(shell, /app-shell-menu-trigger/);
assert.match(shell, /openModal\(/);
assert.match(shell, /REAL WARGAME/);
assert.match(shell, /modeLink\('\/', 'game', 'Игра', mode\)/);
assert.match(shell, /modeLink\('\/ai-node-editor\.html', 'editor', 'Редактор ИИ', mode\)/);
assert.match(shell, /modeLink\('\/combat-lab\.html', 'combat-lab', 'Испытательный полигон', mode\)/);
assert.match(shell, /aria-current="page"/);
assert.match(shell, /app-shell-current-marker/);
assert.match(shell, /data-shell-action="exit"/);
assert.match(shell, /requestLabShutdown/);
assert.match(shell, /BroadcastChannel/);
assert.doesNotMatch(shell, /grid-template-columns:\s*auto auto auto/);
assert.doesNotMatch(shell, /top:\s*62px/);
assert.doesNotMatch(shell, /top:\s*104px/);
assert.doesNotMatch(shell, /margin-top:\s*(?:54|100)px/);
assert.doesNotMatch(shell, /height:\s*calc\(100vh\s*-\s*(?:54|100)px\)/);

assert.equal((coordinator.match(/document\.addEventListener\('keydown'/g) ?? []).length, 1, 'Координатор должен устанавливать один document keydown listener.');
assert.match(coordinator, /event\.defaultPrevented/);
assert.match(coordinator, /event\.key !== 'Escape'/);
assert.match(coordinator, /registerDismissLayer/);
assert.match(coordinator, /setEscapeFallback/);
assert.match(coordinator, /findHighestOpenLayer/);
assert.match(coordinator, /layer\.priority > highest\.priority/);
assert.match(coordinator, /if \(highestLayer\) \{[\s\S]*requestClose\(highestLayer\);[\s\S]*return;[\s\S]*if \(!this\.escapeFallback\)/);
assert.match(coordinator, /this\.escapeFallback\(\);/);
assert.match(coordinator, /requestClose/);
assert.match(coordinator, /document\.removeEventListener\('keydown'/);
assert.match(coordinator, /WeakMap<Document/);
assert.match(coordinator, /destroy\(\): void/);

assert.match(modal, /role', 'dialog'/);
assert.match(modal, /aria-modal', 'true'/);
assert.match(modal, /aria-label/);
assert.match(modal, /backgroundElement\.inert = true/);
assert.match(modal, /event\.key !== 'Tab'/);
assert.match(modal, /event\.shiftKey/);
assert.match(modal, /focusFirstAvailable/);
assert.match(modal, /restoreFocus/);
assert.match(modal, /trigger\.isConnected/);
assert.match(modal, /removeEventListener/);
assert.match(modal, /destroy\(\): void/);

assert.match(modalCss, /\.app-modal-layer/);
assert.match(modalCss, /position:\s*fixed/);
assert.match(modalCss, /background:\s*rgba\(/);
assert.match(modalCss, /\.app-modal-dialog/);
assert.match(modalCss, /overflow:\s*auto/);
assert.match(shellCss, /\.app-shell-menu-trigger/);
assert.match(shellCss, /position:\s*fixed/);
assert.match(shellCss, /@media\s*\(max-width:\s*1100px\)/);
assert.doesNotMatch(shellCss, /display:\s*none[^}]*app-shell-menu-actions/s);
assert.doesNotMatch(shellCss, /margin-top:\s*(?:54|100)px/);

for (const source of [gameMain, combatLabMain, editorEntry]) {
  assert.match(source, /const shellMenuInstallation = installAppShellMenu/);
  assert.match(source, /shellMenuInstallation\.destroy\(\)/);
}

console.log('App shell overlay and Escape contract smoke passed.');
