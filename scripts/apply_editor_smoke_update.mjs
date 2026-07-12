import { readFileSync, writeFileSync, rmSync } from 'node:fs';

const path = 'scripts/ai_node_editor_smoke.mjs';
let source = readFileSync(path, 'utf8');
const oldBlock = `expectContains(main, 'installAppShellMenu', 'Редактор должен подключать общее верхнее меню.');
expectContains(main, "mode: 'editor'", 'Редактор должен использовать editor-режим общего меню.');`;
const newBlock = `expectNotContains(main, 'installAppShellMenu', 'Редактор больше не должен устанавливать второе верхнее меню.');
expectNotContains(main, "mode: 'editor'", 'Редактор не должен использовать отдельный editor-режим старого shell menu.');
expectNotContains(main, 'run-check-45', 'Устаревшая кнопка Auto 4–5 должна быть полностью удалена.');
expectNotContains(main, 'runSimpleCheck45', 'Устаревший обработчик Auto 4–5 должен быть полностью удалён.');
const profileEditor = readText('src/ai-node-editor/NavigationProfileEditor.ts');
for (const needle of ['Данные бойца', 'data-editor-global-actions', 'data-editor-action="refresh"', 'data-editor-action="open-game"', 'data-editor-action="exit"']) {
  expectContains(profileEditor, needle, \`Единое меню редактора должно содержать: \${needle}\`);
}
expectNotContains(profileEditor, 'data-navigation-tab="diagnostics"', 'Отдельная вкладка Диагностика должна быть удалена.');`;
if (!source.includes(oldBlock)) throw new Error('AI editor smoke anchor missing');
source = source.replace(oldBlock, newBlock);
writeFileSync(path, source, 'utf8');
rmSync('scripts/apply_editor_smoke_update.mjs', { force: true });
rmSync('.github/workflows/tmp-apply-editor-smoke.yml', { force: true });
console.log('Updated AI editor smoke for the unified navigation.');
