import { readFile, writeFile } from 'node:fs/promises';

await patch('src/ai-node-editor/main.ts', (source) => replaceOnce(
  source,
  "    case 'SetAction': return { ...common, action: 'move_to', targetKey: 'best_cover_position' };\n    case 'SetMovementMode':",
  "    case 'SetAction': return { ...common, action: 'move_to', targetKey: 'best_cover_position' };\n    case 'Wait': return { ...common, durationSeconds: 2, timeoutSeconds: 0 };\n    case 'Reload': return { ...common, durationSeconds: 3, targetAmmo: 30, failIfNoWeapon: true };\n    case 'MoveToBlackboardPosition': return { ...common, targetKey: 'best_cover_position', acceptanceRadiusCells: 0.2, timeoutSeconds: 15, stuckTimeoutSeconds: 2.5, minimumProgressCells: 0.05, abortOnTargetLost: true };\n    case 'SetMovementMode':",
  'add stateful action defaults',
));

await patch('src/ai-node-editor/stateful-node-ui.ts', (source) => {
  source = replaceOnce(
    source,
    "} as const;\nlet scheduled = false;",
    "} as const;\nconst RELOAD_DEFAULTS = {\n  durationSeconds: 3,\n  targetAmmo: 30,\n  failIfNoWeapon: true,\n} as const;\nlet scheduled = false;",
    'add Reload defaults',
  );
  source = replaceOnce(
    source,
    "  if (!node || !['Wait', 'SequenceWithMemory', 'MoveToBlackboardPosition'].includes(String(node.type))) {",
    "  if (!node || !['Wait', 'Reload', 'SequenceWithMemory', 'MoveToBlackboardPosition'].includes(String(node.type))) {",
    'allow Reload human panel',
  );
  source = replaceOnce(
    source,
    "    `;\n  } else {\n    const targetKey = readTargetKey(node.parameters?.targetKey);",
    "    `;\n  } else if (node.type === 'Reload') {\n    const duration = readNonNegative(node.parameters?.durationSeconds, RELOAD_DEFAULTS.durationSeconds);\n    const targetAmmo = Math.round(readNonNegative(node.parameters?.targetAmmo, RELOAD_DEFAULTS.targetAmmo));\n    const failIfNoWeapon = readBoolean(node.parameters?.failIfNoWeapon, RELOAD_DEFAULTS.failIfNoWeapon);\n    section.innerHTML = `\n      <h4>Длительная перезарядка</h4>\n      <p>Патроны меняются только после успешного завершения. Отмена посередине не выдаёт полный магазин.</p>\n      <label class=\"human-control wide\" data-help=\"Сколько секунд боец остаётся занят перезарядкой. Время идёт по времени симуляции.\">\n        <span>Длительность, секунд</span>\n        <input id=\"stateful-reload-duration\" class=\"stateful-reload-field\" data-param-key=\"durationSeconds\" type=\"number\" min=\"0\" step=\"0.5\" value=\"${duration}\" />\n      </label>\n      <label class=\"human-control wide\" data-help=\"Сколько патронов будет установлено только после полного завершения перезарядки.\">\n        <span>Патронов после завершения</span>\n        <input id=\"stateful-reload-target-ammo\" class=\"stateful-reload-field\" data-param-key=\"targetAmmo\" type=\"number\" min=\"0\" step=\"1\" value=\"${targetAmmo}\" />\n      </label>\n      <label class=\"human-control wide\" data-help=\"При включении нода провалится, если у бойца нет пригодного оружия.\">\n        <span>Провалить, если нет оружия</span>\n        <input id=\"stateful-reload-require-weapon\" class=\"stateful-reload-field\" data-param-key=\"failIfNoWeapon\" type=\"checkbox\" ${failIfNoWeapon ? 'checked' : ''} />\n      </label>\n      <p class=\"stateful-move-safety-note\">При отмене сохраняется исходное число патронов. Полный магазин выдаётся только событием complete_reload.</p>\n    `;\n  } else {\n    const targetKey = readTargetKey(node.parameters?.targetKey);",
    'render Reload human controls',
  );
  source = replaceOnce(
    source,
    "  if (node.type === 'MoveToBlackboardPosition') {\n    installMoveParameterSync(section, nodeId, needsMoveDefaults(node.parameters));\n  }\n}",
    "  if (node.type === 'MoveToBlackboardPosition') {\n    installMoveParameterSync(section, nodeId, needsMoveDefaults(node.parameters));\n  } else if (node.type === 'Reload') {\n    installReloadParameterSync(section);\n  }\n}",
    'install Reload parameter sync',
  );
  source = replaceOnce(
    source,
    "function persistNewMoveNodeDefaults(): void {",
    "function installReloadParameterSync(section: HTMLElement): void {\n  const sync = (): void => {\n    const parametersArea = document.querySelector<HTMLTextAreaElement>('#node-parameters');\n    if (!parametersArea) return;\n    const parameters = readParameters(parametersArea.value);\n    parameters.durationSeconds = readInputNumber('#stateful-reload-duration', RELOAD_DEFAULTS.durationSeconds);\n    parameters.targetAmmo = Math.round(readInputNumber('#stateful-reload-target-ammo', RELOAD_DEFAULTS.targetAmmo));\n    parameters.failIfNoWeapon = document.querySelector<HTMLInputElement>('#stateful-reload-require-weapon')?.checked ?? RELOAD_DEFAULTS.failIfNoWeapon;\n    parametersArea.value = JSON.stringify(parameters, null, 2);\n  };\n\n  section.querySelectorAll<HTMLInputElement>('.stateful-reload-field')\n    .forEach((field) => field.addEventListener('input', sync));\n  document.querySelector<HTMLButtonElement>('.human-save-node')?.addEventListener('click', sync, { capture: true });\n  sync();\n}\n\nfunction persistNewMoveNodeDefaults(): void {",
    'add Reload parameter synchronization',
  );
  return source;
});

await patch('src/core/ai/AiGraphValidation.ts', (source) => {
  source = replaceOnce(
    source,
    '    validateNodeParameters(nodeValue.parameters, issues, id);',
    '    validateNodeParameters(nodeValue.type, nodeValue.parameters, issues, id);',
    'pass node type into parameter validation',
  );
  source = replaceOnce(
    source,
    'function validateNodeParameters(parametersValue: unknown, issues: AiGraphValidationIssue[], nodeId: string): void {',
    'function validateNodeParameters(nodeType: unknown, parametersValue: unknown, issues: AiGraphValidationIssue[], nodeId: string): void {',
    'extend parameter validator signature',
  );
  source = replaceOnce(
    source,
    "  for (const [key, value] of Object.entries(parametersValue)) {\n    if (!isNonEmptyString(key)) {\n      issues.push(errorIssue('PARAMETER_KEY_EMPTY', `Node ${nodeId} has an empty parameter key.`, `У ноды ${nodeId} найден пустой ключ параметра.`, nodeId));\n    }\n\n    if (!isSupportedValue(value)) {\n      issues.push(errorIssue('PARAMETER_VALUE_UNSUPPORTED', `Node ${nodeId} parameter ${key} has an unsupported value. Allowed: string, number, boolean, null, and position {x,y}.`, `У ноды ${nodeId} параметр ${key} имеет неподдерживаемое значение. Разрешены строки, числа, boolean, null и позиция {x,y}.`, nodeId));\n    }\n  }\n}",
    "  for (const [key, value] of Object.entries(parametersValue)) {\n    if (!isNonEmptyString(key)) {\n      issues.push(errorIssue('PARAMETER_KEY_EMPTY', `Node ${nodeId} has an empty parameter key.`, `У ноды ${nodeId} найден пустой ключ параметра.`, nodeId));\n    }\n\n    if (!isSupportedValue(value)) {\n      issues.push(errorIssue('PARAMETER_VALUE_UNSUPPORTED', `Node ${nodeId} parameter ${key} has an unsupported value. Allowed: string, number, boolean, null, and position {x,y}.`, `У ноды ${nodeId} параметр ${key} имеет неподдерживаемое значение. Разрешены строки, числа, boolean, null и позиция {x,y}.`, nodeId));\n    }\n  }\n\n  if (nodeType === 'Reload') validateReloadParameters(parametersValue, issues, nodeId);\n}\n\nfunction validateReloadParameters(parameters: UnknownRecord, issues: AiGraphValidationIssue[], nodeId: string): void {\n  validateNonNegativeNumberParameter(parameters, 'durationSeconds', false, 'RELOAD_DURATION_INVALID', 'Reload durationSeconds must be a non-negative number.', 'У ноды «Перезарядить» длительность должна быть неотрицательным числом.', issues, nodeId);\n  validateNonNegativeNumberParameter(parameters, 'targetAmmo', true, 'RELOAD_TARGET_AMMO_INVALID', 'Reload targetAmmo must be a non-negative integer.', 'У ноды «Перезарядить» число патронов после завершения должно быть неотрицательным целым числом.', issues, nodeId);\n  const failIfNoWeapon = parameters.failIfNoWeapon;\n  if (typeof failIfNoWeapon !== 'boolean') {\n    issues.push(errorIssue('RELOAD_WEAPON_FLAG_INVALID', 'Reload failIfNoWeapon must be boolean.', 'У ноды «Перезарядить» параметр «Провалить, если нет оружия» должен быть да/нет.', nodeId));\n  }\n}\n\nfunction validateNonNegativeNumberParameter(\n  parameters: UnknownRecord,\n  key: string,\n  requireInteger: boolean,\n  code: string,\n  message: string,\n  messageRu: string,\n  issues: AiGraphValidationIssue[],\n  nodeId: string,\n): void {\n  const value = parameters[key];\n  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || (requireInteger && !Number.isInteger(value))) {\n    issues.push(errorIssue(code, message, messageRu, nodeId));\n  }\n}",
    'add Reload parameter validation',
  );
  return source;
});

await patch('scripts/ai_node_editor_smoke.mjs', (source) => {
  source = replaceOnce(
    source,
    "  'src/ai-node-editor/human-node-ui.ts',\n  'src/ai-node-editor/editor-click-guard.ts',",
    "  'src/ai-node-editor/human-node-ui.ts',\n  'src/ai-node-editor/stateful-node-ui.ts',\n  'src/ai-node-editor/editor-click-guard.ts',",
    'require stateful node UI file',
  );
  source = replaceOnce(
    source,
    "expectContains(html, '/src/ai-node-editor/human-node-ui.ts', 'HTML должен подключать human node UI layer.');",
    "expectContains(html, '/src/ai-node-editor/human-node-ui.ts', 'HTML должен подключать human node UI layer.');\nexpectContains(html, '/src/ai-node-editor/stateful-node-ui.ts', 'HTML должен подключать stateful node UI layer.');",
    'assert stateful UI script',
  );
  source = replaceOnce(
    source,
    "expectContains(main, 'createDefaultParameters', 'Новые ноды должны получать человекочитаемые параметры по умолчанию.');",
    "expectContains(main, 'createDefaultParameters', 'Новые ноды должны получать человекочитаемые параметры по умолчанию.');\nfor (const needle of [\"case 'Reload'\", 'durationSeconds: 3', 'targetAmmo: 30', 'failIfNoWeapon: true']) {\n  expectContains(main, needle, `Новая нода Reload должна получать параметр по умолчанию: ${needle}`);\n}",
    'assert Reload defaults',
  );
  source = replaceOnce(
    source,
    "  'Action', 'Действие',\n  'Movement Mode', 'Режим движения',",
    "  'Action', 'Действие',\n  'Reload', 'Перезарядить',\n  'Movement Mode', 'Режим движения',",
    'assert Reload palette labels',
  );
  source = replaceOnce(
    source,
    "const engineCore = readText('scripts/ai_engine_core.mjs');",
    "const statefulUi = readText('src/ai-node-editor/stateful-node-ui.ts');\nfor (const needle of [\n  \"node.type === 'Reload'\",\n  'Длительная перезарядка',\n  'Длительность, секунд',\n  'Патронов после завершения',\n  'Провалить, если нет оружия',\n  'stateful-reload-duration',\n  'stateful-reload-target-ammo',\n  'stateful-reload-require-weapon',\n]) expectContains(statefulUi, needle, `Reload human UI должен содержать: ${needle}`);\n\nconst validationSource = readText('src/core/ai/AiGraphValidation.ts');\nfor (const needle of ['RELOAD_DURATION_INVALID', 'RELOAD_TARGET_AMMO_INVALID', 'RELOAD_WEAPON_FLAG_INVALID']) {\n  expectContains(validationSource, needle, `Валидация Reload должна содержать: ${needle}`);\n}\n\nfor (const needle of ['begin_reload', 'complete_reload', 'cancel_reload']) {\n  expectContains(gameBridge, needle, `Игровой мост Reload должен обрабатывать: ${needle}`);\n}\n\nconst engineCore = readText('scripts/ai_engine_core.mjs');",
    'assert Reload UI validation and bridge effects',
  );
  return source;
});

await patch('.github/workflows/preview-core-checks.yml', (source) => {
  source = replaceOnce(
    source,
    "      - name: Stateful AI movement bridge smoke\n        id: move_bridge",
    "      - name: AI reload runtime smoke\n        id: reload\n        if: steps.install.outcome == 'success'\n        continue-on-error: true\n        run: npm run reload:smoke\n\n      - name: Stateful AI movement bridge smoke\n        id: move_bridge",
    'add Reload smoke step',
  );
  source = replaceOnce(
    source,
    '          COMPOSITE_OUTCOME: ${{ steps.composite.outcome }}\n          MOVE_BRIDGE_OUTCOME:',
    '          COMPOSITE_OUTCOME: ${{ steps.composite.outcome }}\n          RELOAD_OUTCOME: ${{ steps.reload.outcome }}\n          MOVE_BRIDGE_OUTCOME:',
    'publish Reload outcome env',
  );
  source = replaceOnce(
    source,
    '              composite: process.env.COMPOSITE_OUTCOME,\n              move_bridge:',
    '              composite: process.env.COMPOSITE_OUTCOME,\n              reload: process.env.RELOAD_OUTCOME,\n              move_bridge:',
    'publish Reload outcome status',
  );
  return source;
});

console.log('Reload stage 4 UI, validation and CI patch applied.');

async function patch(path, transform) {
  const before = await readFile(path, 'utf8');
  const after = transform(before);
  if (after === before) throw new Error(`${path}: patch made no changes`);
  await writeFile(path, after);
}

function replaceOnce(source, search, replacement, label) {
  if (source.includes(replacement)) return source;
  const first = source.indexOf(search);
  if (first < 0) throw new Error(`${label}: expected source fragment not found`);
  if (source.indexOf(search, first + search.length) >= 0) throw new Error(`${label}: source fragment is not unique`);
  return `${source.slice(0, first)}${replacement}${source.slice(first + search.length)}`;
}
