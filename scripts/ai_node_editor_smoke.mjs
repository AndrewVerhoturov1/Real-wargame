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
  'src/ai-node-editor/stateful-node-ui.ts',
  'src/ai-node-editor/editor-click-guard.ts',
  'src/ai-node-editor/runtime-debug-overlay.ts',
  'src/ai-node-editor/runtime-debug-overlay.css',
  'src/ai-node-editor/ai-node-editor.css',
  'src/ai-node-editor/ai-node-editor-authoring.css',
  'src/ai-node-editor/human-node-ui.css',
  'src/ai-game-bridge.css',
  'src/shared/AppShellMenu.ts',
  'src/shared/app-shell-menu.css',
  'src/core/simulation/SimulationState.ts',
  'src/rendering/PixiApp.ts',
  'src/core/ai/AiGameBridge.ts',
  'src/core/ai/AiGraphRunner.ts',
  'src/data/ai/soldier_default_survival_graph.json',
  'scripts/ai_engine_core.mjs',
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
expectContains(html, '/src/ai-node-editor/editor-click-guard.ts', 'HTML должен подключать select/click guard до main.ts.');
expectContains(html, '/src/ai-node-editor/main.ts', 'HTML должен подключать AI Node Editor entrypoint.');
expectContains(html, '/src/ai-node-editor/human-node-ui.ts', 'HTML должен подключать human node UI layer.');
expectContains(html, '/src/ai-node-editor/stateful-node-ui.ts', 'HTML должен подключать stateful node UI layer.');
expectContains(html, '/src/ai-node-editor/runtime-debug-overlay.ts', 'HTML должен подключать runtime debug overlay.');
expectContains(html, '/src/ai-node-editor/runtime-debug-overlay.css', 'HTML должен подключать стили runtime debug overlay.');
expectContains(html, 'real-wargame.ai-node-editor.graph.v6', 'HTML должен bootstrap-ить новый чистый graph storage v6.');
expectNotContains(html, 'graph.v5', 'Старый graph storage v5 не должен поднимать старый грязный canvas.');

const guard = readText('src/ai-node-editor/editor-click-guard.ts');
for (const needle of ['.human-node-panel', '.inspector-panel', '.app-shell-menu', 'select', 'input', 'textarea']) {
  expectContains(guard, needle, `Select guard должен защищать: ${needle}`);
}

const runtimeDebug = readText('src/ai-node-editor/runtime-debug-overlay.ts');
for (const needle of [
  'real-wargame.ai-node-editor.debug.v1',
  'ai-graph-runtime-debug',
  'runtime-debug-winner',
  'runtime-debug-score',
  'runtime-debug-pass',
  'runtime-debug-fail',
  'Победила',
  'След ИИ',
]) expectContains(runtimeDebug, needle, `Runtime debug overlay должен содержать: ${needle}`);

const runtimeDebugCss = readText('src/ai-node-editor/runtime-debug-overlay.css');
for (const needle of ['ai-runtime-debug-panel', 'runtime-debug-winner', 'runtime-debug-score', 'runtime-debug-badge']) {
  expectContains(runtimeDebugCss, needle, `Runtime debug CSS должен содержать: ${needle}`);
}

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
for (const needle of ["case 'Reload'", 'durationSeconds: 3', 'targetAmmo: 30', 'failIfNoWeapon: true']) {
  expectContains(main, needle, `Новая нода Reload должна получать параметр по умолчанию: ${needle}`);
}
for (const legacy of ['DangerAbove', 'StressAbove', 'ScoreDanger', 'FindBestCover']) {
  expectNotContains(main, legacy, `Редактор не должен держать legacy ${legacy}.`);
}

const indexHtml = readText('index.html');
expectContains(indexHtml, 'pause-toggle', 'HUD должен иметь кнопку паузы.');

const appMain = readText('src/main.ts');
expectContains(appMain, 'installAiGameBridge', 'Игра должна подключать мост AI-графа к SimulationState.');
expectContains(appMain, 'installAiGameBridge(state)', 'Мост должен запускаться после создания state.');
expectContains(appMain, './ai-game-bridge.css', 'Игра должна подключать стили реплик бойца.');
expectContains(appMain, 'installAppShellMenu', 'Игра должна подключать общее верхнее меню.');
expectContains(appMain, "mode: 'game'", 'Игра должна использовать game-режим общего меню.');
expectContains(appMain, 'pause-toggle', 'Игра должна подключать кнопку паузы.');
expectContains(appMain, 'setPaused(!getPaused())', 'Кнопка паузы должна менять runtime-флаг паузы.');
expectContains(appMain, 'PausableRuntimeState', 'Пауза должна быть runtime-флагом без изменения основного SimulationState.');
expectContains(appMain, 'syncPauseStateToDebugTrace', 'Пауза должна обновлять debug trace для редактора.');

const simulationState = readText('src/core/simulation/SimulationState.ts');
expectContains(simulationState, 'export interface SimulationState', 'SimulationState должен сохраниться полным исходным контрактом.');
expectContains(simulationState, 'getSelectedUnits', 'SimulationState не должен быть случайно усечён при правках паузы.');
expectContains(simulationState, 'beginEditorPointerAction', 'SimulationState должен сохранять editor pointer action API.');
expectContains(simulationState, 'spawnEditorUnit', 'SimulationState должен сохранять editor spawn unit logic.');
expectNotContains(simulationState, 'paused: boolean', 'Пауза не должна менять базовый SimulationState contract на этом этапе.');

const pixiApp = readText('src/rendering/PixiApp.ts');
expectContains(pixiApp, 'PausableSimulationState', 'PixiApp должен читать runtime pause без изменения базового SimulationState.');
expectContains(pixiApp, 'if (!this.getPaused())', 'PixiApp должен останавливать tickSimulation на паузе.');
expectContains(pixiApp, 'forceRender', 'PixiApp должен уметь принудительно обновлять HUD после паузы.');
expectContains(pixiApp, 'Пауза', 'Debug panel должен показывать статус паузы.');

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

const labManager = readText('scripts/real_wargame_lab_manager.mjs');
for (const needle of ['LAB_MANAGER_PORT = 8799', 'startChildProcess', 'npm run dev', 'npm run engine:dev', '/lab/health', '/lab/shutdown', 'killPorts', '5173', '8787']) {
  expectContains(labManager, needle, `Lab manager должен содержать: ${needle}`);
}

const labBat = readText('Run-Real-Wargame-Lab.bat');
expectContains(labBat, 'real_wargame_lab_manager.mjs', 'Общий запуск должен стартовать lab manager.');
expectContains(labBat, 'WindowStyle Hidden', 'Общий запуск должен быть тихим/скрытым.');
expectContains(labBat, 'lab-launch.html', 'Общий запуск должен открыть страницу, которая открывает игру и редактор.');

const graphRunner = readText('src/core/ai/AiGraphRunner.ts');
for (const needle of [
  'runAiGraph',
  'executeUtilitySelector',
  'evaluateBranch',
  'ParameterScore',
  'DistanceScore',
  'DecisionInertia',
  'RandomChance',
  'StableThreshold',
  'ForbidAction',
  'AiGraphEffect',
  'ScoreBreakdownItem',
]) expectContains(graphRunner, needle, `GraphRunner должен содержать: ${needle}`);
expectNotContains(graphRunner, 'SimulationState', 'GraphRunner не должен зависеть от игровой SimulationState.');
expectNotContains(graphRunner, 'pixi.js', 'GraphRunner не должен зависеть от PixiJS.');
expectNotContains(graphRunner, 'localStorage', 'GraphRunner не должен читать localStorage напрямую.');

const gameBridge = readText('src/core/ai/AiGameBridge.ts');
expectContains(gameBridge, 'runAiGraph', 'Мост должен вызывать нормальный GraphRunner.');
expectContains(gameBridge, 'createTacticalHost', 'Мост должен давать runner-у tactical callbacks.');
expectContains(gameBridge, 'applyGraphEffects', 'Мост должен применять effects runner-а к UnitModel.');
expectContains(gameBridge, 'buildBlackboardForUnit', 'Мост должен собирать blackboard из состояния игры.');
expectContains(gameBridge, 'real-wargame.ai-node-editor.graph.v6', 'Мост должен брать граф из localStorage v6.');
expectContains(gameBridge, 'real-wargame.ai-node-editor.debug.v1', 'Мост должен писать runtime debug trace для редактора.');
expectContains(gameBridge, 'publishRuntimeDebugTrace', 'Мост должен публиковать последний след решения GraphRunner.');
expectContains(gameBridge, 'isPaused(state)', 'Мост не должен пересчитывать AI во время паузы.');
expectNotContains(gameBridge, 'case \'ParameterScore\'', 'Score-ноды не должны быть заглушками внутри bridge.');
expectNotContains(gameBridge, 'is accepted by the game bridge but not used', 'Bridge больше не должен говорить, что score-ноды только допустимы.');

const behaviorModel = readText('src/core/behavior/BehaviorModel.ts');
expectContains(behaviorModel, 'aiSpeech', 'UnitBehaviorRuntime должен хранить реплику бойца.');
expectContains(behaviorModel, 'aiGraphReason', 'UnitBehaviorRuntime должен хранить причину решения из AI-графа.');
expectContains(behaviorModel, 'aiGraphLastTickMs', 'UnitBehaviorRuntime должен ограничивать частоту прогона графа.');

const htmlOverlay = readText('src/rendering/HtmlOverlayRenderer.ts');
expectContains(htmlOverlay, 'renderAiSpeechLabels', 'HTML overlay должен рисовать реплики над бойцами.');
expectContains(htmlOverlay, 'unit-speech-label', 'HTML overlay должен иметь класс реплики бойца.');

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
  'Reload', 'Перезарядить',
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

const statefulUi = readText('src/ai-node-editor/stateful-node-ui.ts');
for (const needle of [
  "node.type === 'Reload'",
  'Длительная перезарядка',
  'Длительность, секунд',
  'Патронов после завершения',
  'Провалить, если нет оружия',
  'stateful-reload-duration',
  'stateful-reload-target-ammo',
  'stateful-reload-require-weapon',
]) expectContains(statefulUi, needle, `Reload human UI должен содержать: ${needle}`);

const validationSource = readText('src/core/ai/AiGraphValidation.ts');
for (const needle of ['RELOAD_DURATION_INVALID', 'RELOAD_TARGET_AMMO_INVALID', 'RELOAD_WEAPON_FLAG_INVALID']) {
  expectContains(validationSource, needle, `Валидация Reload должна содержать: ${needle}`);
}

for (const needle of ['begin_reload', 'complete_reload']) {
  expectContains(gameBridge, needle, `Игровой мост Reload должен обрабатывать: ${needle}`);
}
expectContains(gameBridge, 'ai_graph_reload_cancelled', 'Игровой мост Reload должен явно фиксировать отмену перезарядки.');

const engineCore = readText('scripts/ai_engine_core.mjs');
for (const needle of ['GraphRunner', 'UtilitySelector', 'ParameterScore', 'DistanceScore', 'DecisionInertia', 'RandomChance', 'StableThreshold', 'ForbidAction', 'score', 'breakdown']) {
  expectContains(engineCore, needle, `Local engine должен поддерживать GraphRunner/Utility: ${needle}`);
}
for (const legacy of ['HasOrder', 'EnemyVisible', 'EnemyKnown', 'UnderFire', 'CoverNearby', 'ScoreDanger', 'ScoreStress', 'FindBestCover', 'MoveToCover', 'ContinueOrder', 'Observe']) {
  expectNotContains(engineCore, `'${legacy}'`, `Local engine не должен знать legacy тип ${legacy}.`);
}

const engineSmoke = readText('scripts/local_ai_engine_smoke.mjs');
expectContains(engineSmoke, 'createUtilitySmokeGraph', 'Engine smoke должен проверять отдельный utility graph.');
expectContains(engineSmoke, 'branch_cover', 'Engine smoke должен ждать победу utility branch_cover.');
expectContains(engineSmoke, "command.type === 'none'", 'Engine smoke должен проверять clean root-only graph без старой команды.');
expectNotContains(engineSmoke, 'critical_survival', 'Engine smoke не должен ждать старую survival-ветку.');

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
  console.error(`[FAIL] ${message}`);
  process.exit(1);
}
