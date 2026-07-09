import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const requiredFiles = [
  'ai-node-editor.html',
  'lab-launch.html',
  'Run-Real-Wargame-Lab.bat',
  'src/ai-node-editor/main.ts',
  'src/ai-node-editor/human-node-ui.ts',
  'src/ai-node-editor/ai-node-editor.css',
  'src/ai-node-editor/ai-node-editor-authoring.css',
  'src/ai-node-editor/human-node-ui.css',
  'src/ai-game-bridge.css',
  'src/shared/AppShellMenu.ts',
  'src/shared/app-shell-menu.css',
  'src/core/ai/AiGameBridge.ts',
  'src/data/ai/soldier_default_survival_graph.json',
  'scripts/local_ai_engine.mjs',
  'scripts/real_wargame_lab_manager.mjs',
  'Run-AI-Node-Editor.bat',
];

for (const file of requiredFiles) {
  const absolutePath = path.join(repoRoot, file);
  if (!existsSync(absolutePath)) fail(`Не найден обязательный файл: ${file}`);
  console.log(`[OK] file exists: ${file}`);
}

const html = readText('ai-node-editor.html');
expectContains(html, '/src/ai-node-editor/main.ts', 'HTML должен подключать AI Node Editor entrypoint.');
expectContains(html, '/src/ai-node-editor/human-node-ui.ts', 'HTML должен подключать human node UI layer.');
expectContains(html, 'real-wargame.ai-node-editor.graph.v6', 'HTML должен bootstrap-ить новый чистый graph storage v6.');
expectNotContains(html, 'graph.v5', 'Старый graph storage v5 не должен поднимать старый грязный canvas.');

const labLaunchHtml = readText('lab-launch.html');
expectContains(labLaunchHtml, '/src/shared/AppShellMenu.ts', 'Страница общего запуска должна использовать shared shell для открытия вкладок.');
expectContains(labLaunchHtml, 'openGameTab', 'Общий запуск должен открывать игру.');
expectContains(labLaunchHtml, 'openEditorTab', 'Общий запуск должен открывать редактор.');

const main = readText('src/ai-node-editor/main.ts');
expectContains(main, 'real-wargame.ai-node-editor.graph.v6', 'Редактор должен использовать новый graph storage v6.');
expectContains(main, 'installAppShellMenu', 'Редактор должен подключать общее верхнее меню.');
expectContains(main, "mode: 'editor'", 'Редактор должен использовать editor-режим общего меню.');
expectContains(main, 'addNodeFromPalette', 'Редактор должен уметь добавлять ноды из палитры.');
expectContains(main, 'startConnectionDrag', 'Связи должны создаваться протягиванием из порта.');
expectContains(main, 'createDefaultParameters', 'Новые ноды должны получать человекочитаемые параметры по умолчанию.');
expectNotContains(main, 'DangerAbove', 'Редактор не должен держать legacy DangerAbove.');
expectNotContains(main, 'StressAbove', 'Редактор не должен держать legacy StressAbove.');
expectNotContains(main, 'ScoreDanger', 'Редактор не должен создавать legacy ScoreDanger.');
expectNotContains(main, 'FindBestCover', 'Редактор не должен создавать legacy FindBestCover.');

const appMain = readText('src/main.ts');
expectContains(appMain, 'installAiGameBridge', 'Игра должна подключать мост AI-графа к SimulationState.');
expectContains(appMain, 'installAiGameBridge(state)', 'Мост должен запускаться после создания state.');
expectContains(appMain, './ai-game-bridge.css', 'Игра должна подключать стили реплик бойца.');
expectContains(appMain, 'installAppShellMenu', 'Игра должна подключать общее верхнее меню.');
expectContains(appMain, "mode: 'game'", 'Игра должна использовать game-режим общего меню.');

const shellMenu = readText('src/shared/AppShellMenu.ts');
for (const needle of [
  'Редактор ИИ солдат',
  'Новая игра',
  'Выход',
  'Обновить',
  'Открыть игру',
  'openEditorTab',
  'openGameTab',
  'requestLabShutdown',
  'BroadcastChannel',
  'real-wargame.lab.close-tabs',
  'http://127.0.0.1:8799/lab/shutdown',
]) expectContains(shellMenu, needle, `Общее меню должно содержать: ${needle}`);

const shellCss = readText('src/shared/app-shell-menu.css');
expectContains(shellCss, '.app-shell-menu', 'CSS должен оформлять общее меню.');
expectContains(shellCss, '.app-shell-exit-button', 'CSS должен выделять кнопку выхода.');

const labManager = readText('scripts/real_wargame_lab_manager.mjs');
for (const needle of [
  'LAB_MANAGER_PORT = 8799',
  'startChildProcess',
  'npm run dev',
  'npm run engine:dev',
  '/lab/health',
  '/lab/shutdown',
  'killPorts',
  '5173',
  '8787',
]) expectContains(labManager, needle, `Lab manager должен содержать: ${needle}`);

const labBat = readText('Run-Real-Wargame-Lab.bat');
expectContains(labBat, 'real_wargame_lab_manager.mjs', 'Общий запуск должен стартовать lab manager.');
expectContains(labBat, 'WindowStyle Hidden', 'Общий запуск должен быть тихим/скрытым.');
expectContains(labBat, 'lab-launch.html', 'Общий запуск должен открыть страницу, которая открывает игру и редактор.');

const gameBridge = readText('src/core/ai/AiGameBridge.ts');
expectContains(gameBridge, 'GRAPH_STORAGE_KEY', 'Мост должен читать тот же graph storage v6, что редактор.');
expectContains(gameBridge, 'real-wargame.ai-node-editor.graph.v6', 'Мост должен брать граф из localStorage v6.');
expectContains(gameBridge, 'installAiGameBridge', 'Мост должен иметь функцию установки в игру.');
expectContains(gameBridge, 'tickAiGraphForUnit', 'Мост должен прогонять граф по выбранному бойцу.');
expectContains(gameBridge, 'buildBlackboardForUnit', 'Мост должен собирать blackboard из состояния игры.');
expectContains(gameBridge, 'executeNode', 'Мост должен исполнять универсальные ноды, а не старые hard-coded ветки.');
expectContains(gameBridge, 'FlagCheck', 'Мост должен исполнять Проверку флага.');
expectContains(gameBridge, 'BlackboardValueAbove', 'Мост должен исполнять Числовой порог.');
expectContains(gameBridge, 'DistanceCheck', 'Мост должен исполнять Порог расстояния.');
expectContains(gameBridge, 'TacticalCheck', 'Мост должен исполнять Тактическую проверку.');
expectContains(gameBridge, 'SetAction', 'Мост должен исполнять Действие.');
expectContains(gameBridge, 'SetPosture', 'Мост должен исполнять Позу.');
expectContains(gameBridge, 'SetMovementMode', 'Мост должен исполнять Режим движения.');
expectContains(gameBridge, 'SayMessage', 'Мост должен исполнять Реплику бойца.');
expectContains(gameBridge, 'cooldownSeconds', 'Мост должен учитывать задержку ноды.');
expectContains(gameBridge, 'cooldownTiming', 'Мост должен учитывать режим задержки before/after.');
expectContains(gameBridge, 'aiSpeech', 'Мост должен записывать реплику в runtime бойца.');

const behaviorModel = readText('src/core/behavior/BehaviorModel.ts');
expectContains(behaviorModel, 'aiSpeech', 'UnitBehaviorRuntime должен хранить реплику бойца.');
expectContains(behaviorModel, 'aiGraphReason', 'UnitBehaviorRuntime должен хранить причину решения из AI-графа.');
expectContains(behaviorModel, 'aiGraphLastTickMs', 'UnitBehaviorRuntime должен ограничивать частоту прогона графа.');

const htmlOverlay = readText('src/rendering/HtmlOverlayRenderer.ts');
expectContains(htmlOverlay, 'renderAiSpeechLabels', 'HTML overlay должен рисовать реплики над бойцами.');
expectContains(htmlOverlay, 'unit-speech-label', 'HTML overlay должен иметь класс реплики бойца.');

const speechCss = readText('src/ai-game-bridge.css');
expectContains(speechCss, '.unit-speech-label', 'CSS должен оформлять реплику бойца над юнитом.');

const nodeTypes = readText('src/core/ai/AiNodeTypes.ts');
for (const needle of [
  'Numeric Threshold', 'Числовой порог',
  'Flag Check', 'Проверка флага',
  'Distance Threshold', 'Порог расстояния',
  'Tactical Check', 'Тактическая проверка',
  'Parameter Score', 'Оценка параметра',
  'Distance Score', 'Оценка расстояния',
  'Find Object', 'Поиск объекта',
  'Target Choice', 'Выбор цели',
  'Write Memory', 'Запись памяти',
  'Copy Memory', 'Копия памяти',
  'Action', 'Действие',
  'Movement Mode', 'Режим движения',
  'Say Message', 'Реплика бойца',
  'Stable Threshold', 'Стабильный порог',
  'Forbid Action', 'Запрет действия',
]) expectContains(nodeTypes, needle, `В чистом каталоге нод должно быть: ${needle}`);

for (const legacy of [
  'HasOrder:', 'EnemyVisible:', 'EnemyKnown:', 'UnderFire:', 'CoverNearby:',
  'ScoreDanger:', 'ScoreStress:', 'ScoreObedience:', 'ScoreCoverNeed:', 'ScoreCurrentActionInertia:',
  'FindBestCover:', 'MoveToCover:', 'ContinueOrder:', 'Observe:', 'DangerAbove:', 'StressAbove:',
]) expectNotContains(nodeTypes, legacy, `Legacy-нода не должна быть в палитре: ${legacy}`);

const humanUi = readText('src/ai-node-editor/human-node-ui.ts');
expectContains(humanUi, 'COMMON_COOLDOWN_FIELDS', 'Human UI должен иметь общие поля задержки для нод.');
expectContains(humanUi, 'cooldownSeconds', 'Human UI должен сохранять cooldownSeconds.');
expectContains(humanUi, 'cooldownTiming', 'Human UI должен сохранять cooldownTiming.');
expectContains(humanUi, 'fieldSelect(\'from\'', 'Порог расстояния должен выбирать from из списка.');
expectContains(humanUi, 'fieldSelect(\'to\'', 'Порог расстояния должен выбирать to из списка.');
expectContains(humanUi, 'SayMessage', 'Human UI должен иметь панель реплики бойца.');
expectContains(humanUi, 'TOOLTIP_DELAY_MS = 2000', 'Подсказки должны появляться после задержки 2 секунды.');

const engineCore = readText('scripts/ai_engine_core.mjs');
for (const needle of ['FlagCheck', 'DistanceCheck', 'ParameterScore', 'DistanceScore', 'FindBestObject', 'WriteMemory', 'CopyMemory', 'SetAction', 'SetMovementMode', 'SayMessage', 'DecisionInertia', 'StableThreshold', 'ForbidAction']) {
  expectContains(engineCore, needle, `Local engine должен знать тип ${needle}.`);
}
expectContains(engineCore, 'validateCommonCooldownParameters', 'Local engine должен проверять общие параметры задержки.');
for (const legacy of ['HasOrder', 'EnemyVisible', 'EnemyKnown', 'UnderFire', 'CoverNearby', 'ScoreDanger', 'ScoreStress', 'FindBestCover', 'MoveToCover', 'ContinueOrder', 'Observe']) {
  expectNotContains(engineCore, `'${legacy}'`, `Local engine не должен знать legacy тип ${legacy}.`);
}

const graphText = readText('src/data/ai/soldier_default_survival_graph.json');
for (const legacy of ['HasOrder', 'EnemyVisible', 'EnemyKnown', 'UnderFire', 'CoverNearby', 'ScoreDanger', 'ScoreStress', 'FindBestCover', 'MoveToCover', 'ContinueOrder', 'Observe', 'BlackboardValueAbove']) {
  expectNotContains(graphText, `"type": "${legacy}"`, `Bundled clean graph не должен содержать ${legacy}.`);
}
const graph = JSON.parse(graphText);
if (graph.id !== 'soldier_clean_workspace_graph') fail('Bundled graph должен быть новым чистым graph id soldier_clean_workspace_graph.');
if (!Array.isArray(graph.nodes) || graph.nodes.length !== 1) fail('Bundled graph должен начинаться с чистого canvas: только root-нода.');
const [rootNode] = graph.nodes;
if (rootNode.id !== 'root' || rootNode.type !== 'Root') fail('Единственная стартовая нода должна быть Root/root.');
if (Array.isArray(rootNode.children) && rootNode.children.length !== 0) fail('Root в чистом canvas не должен иметь children.');
if (!rootNode.displayName || !rootNode.displayNameRu) fail('Root должен иметь EN/RU название.');

console.log('[GOTOVO] AI Node Editor static smoke passed.');

function readText(filePath) {
  return readFileSync(path.join(repoRoot, filePath), 'utf8');
}

function expectContains(content, needle, message) {
  if (!content.includes(needle)) fail(message);
  console.log(`[OK] contains: ${needle}`);
}

function expectNotContains(content, needle, message) {
  if (content.includes(needle)) fail(message);
  console.log(`[OK] does not contain: ${needle}`);
}

function fail(message) {
  console.error(`[OSHIBKA] ${message}`);
  process.exit(1);
}
