import { readFileSync, writeFileSync, rmSync } from 'node:fs';

function read(path) { return readFileSync(path, 'utf8'); }
function write(path, value) { writeFileSync(path, value, 'utf8'); }
function replaceExact(source, search, replacement, label) {
  if (!source.includes(search)) throw new Error(`Patch anchor missing: ${label}`);
  return source.replace(search, replacement);
}
function replaceRegex(source, expression, replacement, label) {
  if (!expression.test(source)) throw new Error(`Patch pattern missing: ${label}`);
  return source.replace(expression, replacement);
}

// Remove the obsolete second shell menu and Auto 4–5 implementation.
{
  const path = 'src/ai-node-editor/main.ts';
  let source = read(path);
  source = replaceExact(source, "import '../shared/app-shell-menu.css';\n", '', 'editor shell CSS import');
  source = replaceExact(source, "import { installAppShellMenu } from '../shared/AppShellMenu';\n", '', 'editor shell import');
  source = replaceExact(source, "\ninstallAppShellMenu({ mode: 'editor' });\n", '\n', 'editor shell install');
  source = replaceExact(source, '          <button id="run-check-45" class="ai-editor-button primary" type="button">Auto 4–5</button>\n', '', 'Auto 4–5 button');
  source = replaceExact(source, "  document.querySelector<HTMLButtonElement>('#run-check-45')?.addEventListener('click', () => { void runSimpleCheck45(); });\n", '', 'Auto 4–5 listener');
  source = replaceRegex(
    source,
    /async function runSimpleCheck45\(\): Promise<void> \{.*?\}\nasync function validateGraphThroughEngine/s,
    'async function validateGraphThroughEngine',
    'Auto 4–5 handler',
  );
  write(path, source);
}

// Build one unified editor navigation owner.
{
  const path = 'src/ai-node-editor/NavigationProfileEditor.ts';
  let source = read(path);
  source = replaceExact(
    source,
    "} from '../core/navigation/NavigationProfileStorage';\n",
    "} from '../core/navigation/NavigationProfileStorage';\nimport { exitLab, openGameTab } from '../shared/AppShellMenu';\n",
    'shared editor actions import',
  );
  source = replaceExact(source, "type EditorTab = 'graph' | 'blackboard' | 'profiles' | 'diagnostics';", "type EditorTab = 'graph' | 'blackboard' | 'profiles';", 'editor tab type');
  source = replaceRegex(
    source,
    /navigation\.innerHTML = `\n[\s\S]*?`;\nconst panel/,
    `navigation.innerHTML = \`\n  <div class="navigation-profile-main-tabs">\n    <button type="button" data-navigation-tab="graph">Граф поведения</button>\n    <button type="button" data-navigation-tab="profiles">Профили движения</button>\n    <button type="button" data-navigation-tab="blackboard">Данные бойца</button>\n  </div>\n  <div class="navigation-profile-global-actions" data-editor-global-actions></div>\n  <div class="navigation-profile-app-actions">\n    <button type="button" data-editor-action="refresh">Обновить</button>\n    <button type="button" data-editor-action="open-game">Открыть игру</button>\n    <button type="button" data-editor-action="exit" class="danger">Выход</button>\n  </div>\n\`;\nconst panel`,
    'unified editor navigation markup',
  );
  source = replaceRegex(
    source,
    /navigation\.addEventListener\('click', \(event\) => \{[\s\S]*?\n\}\);\n\nsubscribeNavigationProfileRegistry/,
    `navigation.addEventListener('click', (event) => {\n  const target = event.target instanceof Element ? event.target : null;\n  const tabButton = target?.closest<HTMLButtonElement>('[data-navigation-tab]');\n  if (tabButton) {\n    showTab(tabButton.dataset.navigationTab as EditorTab);\n    return;\n  }\n  const actionButton = target?.closest<HTMLButtonElement>('[data-editor-action]');\n  if (!actionButton) return;\n  if (actionButton.dataset.editorAction === 'refresh') window.location.reload();\n  else if (actionButton.dataset.editorAction === 'open-game') openGameTab();\n  else if (actionButton.dataset.editorAction === 'exit') void exitLab();\n});\n\nsubscribeNavigationProfileRegistry`,
    'unified editor navigation handlers',
  );
  source = replaceExact(source, "  else if (tab === 'diagnostics') renderDiagnostics();\n", '', 'diagnostics route');
  source = replaceExact(source, '<h2>Чёрная доска</h2>', '<h2>Данные бойца</h2>', 'blackboard heading');
  source = replaceExact(
    source,
    '<p>Постоянные профили маршрута здесь не хранятся. Ниже показаны текущие исходные значения памяти графа.</p>',
    '<p>Исходные значения памяти, которыми пользуется граф поведения. Профили маршрута хранятся отдельно.</p>',
    'blackboard help',
  );
  source = replaceRegex(source, /\nfunction renderDiagnostics\(\): void \{[\s\S]*?\n\}\n\nfunction renderNumericField/, '\nfunction renderNumericField', 'standalone diagnostics page');
  source = replaceExact(source, 'rows="3"', 'rows="2"', 'compact profile descriptions');
  write(path, source);
}

// Move AI Dictionary into the unified global action slot.
{
  const path = 'src/ai-node-editor/AiDictionaryEditorIntegration.ts';
  let source = read(path);
  source = replaceRegex(
    source,
    /function installOpenButton\(\):void \{[\s\S]*?\}\nfunction enhanceHumanNodeSelectors/,
    `function installOpenButton():void {\n  const actions=document.querySelector<HTMLElement>('[data-editor-global-actions]');\n  if(!actions||actions.querySelector('[data-action="ai-dictionary"]'))return;\n  const button=document.createElement('button');\n  button.type='button';\n  button.className='navigation-profile-global-button';\n  button.dataset.action='ai-dictionary';\n  button.textContent='Словарь ИИ';\n  button.title='Открыть интерактивный словарь значений, проверок и действий ИИ';\n  button.addEventListener('click',()=>panel.open());\n  actions.append(button);\n}\nfunction enhanceHumanNodeSelectors`,
    'dictionary unified-menu button',
  );
  write(path, source);
}

// Move AI Tools into the same global action slot.
{
  const path = 'src/ai-node-editor/AiDictionaryWorkbench.ts';
  let source = read(path);
  source = replaceRegex(
    source,
    /function installWorkbenchButton\(\): void \{[\s\S]*?\n\}\n\nfunction openWorkbench/,
    `function installWorkbenchButton(): void {\n  const actions = document.querySelector<HTMLElement>('[data-editor-global-actions]');\n  if (!actions || actions.querySelector('[data-action="ai-dictionary-workbench"]')) return;\n  const button = document.createElement('button');\n  button.type = 'button';\n  button.className = 'navigation-profile-global-button';\n  button.dataset.action = 'ai-dictionary-workbench';\n  button.textContent = 'Инструменты ИИ';\n  button.title = 'Пользовательская память, проверка графа и история решений';\n  button.addEventListener('click', () => openWorkbench('memory'));\n  actions.append(button);\n}\n\nfunction openWorkbench`,
    'workbench unified-menu button',
  );
  write(path, source);
}

// Repair menu and profile-page geometry without stacked fixed offsets.
{
  const path = 'src/ai-node-editor/navigation-profile-editor.css';
  let source = read(path);
  source = replaceRegex(
    source,
    /^\.navigation-profile-tabs \{[\s\S]*?\.navigation-profile-tabs button\.active \{[\s\S]*?\n\}\n\n/,
    `.navigation-profile-tabs {\n  position: sticky;\n  top: 0;\n  z-index: 1000;\n  min-height: 50px;\n  display: grid;\n  grid-template-columns: auto minmax(0, 1fr) auto;\n  gap: 10px;\n  align-items: center;\n  padding: 6px 12px;\n  border-bottom: 1px solid #2e4035;\n  background: rgba(14, 21, 17, 0.99);\n  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.28);\n}\n\n.navigation-profile-main-tabs,\n.navigation-profile-global-actions,\n.navigation-profile-app-actions {\n  display: flex;\n  align-items: center;\n  gap: 6px;\n  min-width: 0;\n}\n\n.navigation-profile-global-actions {\n  justify-content: flex-start;\n}\n\n.navigation-profile-app-actions {\n  justify-content: flex-end;\n}\n\n.navigation-profile-tabs button {\n  min-height: 34px;\n  padding: 6px 12px;\n  border: 1px solid #40584a;\n  border-radius: 6px;\n  background: #19251d;\n  color: #d8e7d7;\n  cursor: pointer;\n  white-space: nowrap;\n}\n\n.navigation-profile-tabs button.active {\n  border-color: #8dbc80;\n  background: #29412f;\n  color: #ffffff;\n  box-shadow: inset 0 -2px 0 #a6d397;\n}\n\n.navigation-profile-tabs button.danger {\n  border-color: rgba(255, 112, 88, 0.55);\n  color: #ffd5cd;\n  background: rgba(108, 35, 25, 0.75);\n}\n\n`,
    'unified navigation CSS',
  );
  source = replaceExact(source, '  min-height: calc(100vh - 52px);', '  height: calc(100vh - 50px);\n  min-height: 0;\n  overflow: hidden;', 'workbench height');
  source = replaceExact(source, '  min-height: calc(100vh - 52px);\n}', '  height: 100%;\n  min-height: 0;\n}', 'profile layout height');
  source = replaceRegex(
    source,
    /\.navigation-profile-list-panel \{[\s\S]*?\n\}/,
    `.navigation-profile-list-panel {\n  height: 100%;\n  min-height: 0;\n  overflow: auto;\n  padding: 14px;\n  border-right: 1px solid #2c3e32;\n  background: #151e17;\n}`,
    'profile list geometry',
  );
  source = replaceRegex(
    source,
    /\.navigation-profile-form-panel \{[\s\S]*?\n\}/,
    `.navigation-profile-form-panel {\n  min-width: 0;\n  height: 100%;\n  min-height: 0;\n  padding: 14px 18px 34px;\n  overflow: auto;\n  scrollbar-gutter: stable;\n}`,
    'profile form geometry',
  );
  source = replaceRegex(
    source,
    /\.navigation-profile-form-heading \{[\s\S]*?\n\}/,
    `.navigation-profile-form-heading {\n  position: sticky;\n  top: 0;\n  z-index: 3;\n  display: grid;\n  grid-template-columns: minmax(0, 1fr) auto;\n  gap: 14px;\n  align-items: center;\n  margin: 0 0 12px;\n  padding: 10px 12px;\n  border: 1px solid #2c3e32;\n  border-radius: 8px;\n  background: rgba(16, 23, 17, 0.98);\n  backdrop-filter: blur(8px);\n}`,
    'profile heading geometry',
  );
  source += `\n\n.navigation-profile-tabs + #ai-node-editor-root .ai-editor-shell {\n  height: calc(100vh - 50px);\n}\n\n.navigation-profile-form-heading h2 {\n  margin-top: 2px;\n  font-size: 20px;\n}\n\n.navigation-profile-form-heading p {\n  margin: 4px 0 0;\n  max-width: 760px;\n  font-size: 12px;\n  line-height: 1.35;\n}\n\n.navigation-profile-global-button {\n  border-color: #587762 !important;\n  background: #203328 !important;\n}\n\n@media (max-width: 1320px) {\n  .navigation-profile-tabs { grid-template-columns: 1fr auto; }\n  .navigation-profile-global-actions { order: 3; grid-column: 1 / -1; }\n  .navigation-profile-tabs + #ai-node-editor-root .ai-editor-shell,\n  .navigation-profile-workbench { height: calc(100vh - 90px); }\n}\n`;
  write(path, source);
}

// Keep the focused contract aligned with the dedicated compact stylesheet.
{
  const path = 'scripts/ui_compact_route_controls_smoke.ts';
  let source = read(path);
  source = replaceExact(source, "const workspaceCss = read('src/tactical-workspace.css');", "const workspaceCss = read('src/tactical-workspace-compact-route.css');", 'compact stylesheet contract');
  write(path, source);
}

rmSync('scripts/apply_compact_editor_patch.mjs', { force: true });
rmSync('.github/workflows/tmp-apply-compact-editor.yml', { force: true });
console.log('Applied compact editor navigation patch and removed temporary patch machinery.');
