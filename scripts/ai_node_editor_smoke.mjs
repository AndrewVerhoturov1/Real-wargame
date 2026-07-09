import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const requiredFiles = [
  'ai-node-editor.html',
  'src/ai-node-editor/main.ts',
  'src/ai-node-editor/human-node-ui.ts',
  'src/ai-node-editor/ai-node-editor.css',
  'src/ai-node-editor/ai-node-editor-authoring.css',
  'src/ai-node-editor/human-node-ui.css',
  'src/data/ai/soldier_default_survival_graph.json',
  'scripts/local_ai_engine.mjs',
  'Run-AI-Node-Editor.bat',
];

for (const file of requiredFiles) {
  const absolutePath = path.join(repoRoot, file);
  if (!existsSync(absolutePath)) {
    fail(`Не найден обязательный файл: ${file}`);
  }
  console.log(`[OK] file exists: ${file}`);
}

const html = readText('ai-node-editor.html');
expectContains(html, '/src/ai-node-editor/main.ts', 'HTML должен подключать AI Node Editor entrypoint.');
expectContains(html, '/src/ai-node-editor/ai-node-editor-authoring.css', 'HTML должен подключать стили authoring stage 4.');
expectContains(html, '/src/ai-node-editor/human-node-ui.ts', 'HTML должен подключать human node UI layer.');
expectContains(html, '/src/ai-node-editor/human-node-ui.css', 'HTML должен подключать human node UI styles.');
expectContains(html, 'Редактор ИИ солдата', 'HTML должен иметь русский title редактора.');

const main = readText('src/ai-node-editor/main.ts');
expectContains(main, 'ENGINE_BASE_URL', 'Редактор должен знать адрес local engine.');
expectContains(main, '/engine/health', 'Редактор должен проверять health endpoint.');
expectContains(main, '/ai/graph/validate', 'Редактор должен валидировать граф через engine.');
expectContains(main, '/ai/graph/evaluate-once', 'Редактор должен выполнять evaluate-once через engine.');
expectContains(main, 'browserDoesHeavyAi', 'Редактор должен показывать, что тяжёлый AI не в браузере.');
expectContains(main, 'graph-workspace', 'Редактор должен иметь видимую область графа.');
expectContains(main, 'addNodeFromPalette', 'Этап 4 должен уметь добавлять ноды из палитры.');
expectContains(main, 'startDrag', 'Этап 4 должен уметь перетаскивать ноды.');
expectContains(main, 'startConnectionDrag', 'Связи должны создаваться протягиванием из порта.');
expectContains(main, 'node-port out', 'У нод должен быть выходной порт для протягивания связи.');
expectContains(main, 'node-context-menu', 'Нужно контекстное меню ноды.');
expectContains(main, 'fitGraphToView', 'Нужна кнопка Fit для обзора графа.');
expectContains(main, 'onWorkspaceWheel', 'Нужен zoom колесом мыши.');
expectContains(main, 'startPanIfEmpty', 'Canvas должен перетаскиваться за пустое место.');
expectContains(main, 'togglePalette', 'Левая панель должна сворачиваться.');
expectContains(main, 'toggleInspector', 'Правая панель должна сворачиваться.');
expectContains(main, 'toggleBottomPanel', 'Нижняя консоль должна сворачиваться.');
expectContains(main, 'saveSelectedNodeFromInspector', 'Этап 4 должен уметь сохранять изменения инспектора.');
expectContains(main, 'exportGraphJson', 'Этап 4 должен уметь экспортировать JSON.');
expectContains(main, 'importGraphFromFileInput', 'Этап 4 должен уметь импортировать JSON.');
expectContains(main, 'localStorage', 'Этап 4 должен сохранять рабочий граф/позиции в браузере.');

const nodeTypes = readText('src/core/ai/AiNodeTypes.ts');
expectContains(nodeTypes, 'BlackboardValueAbove', 'Должна быть универсальная пороговая нода.');
expectContains(nodeTypes, 'Blackboard Value Above Threshold', 'Универсальная нода должна иметь английский label.');
expectContains(nodeTypes, 'Параметр выше порога', 'Универсальная нода должна иметь русский overlay label.');
expectNotContains(nodeTypes, 'DangerAbove:', 'В палитре не должно быть отдельной DangerAbove-ноды.');
expectNotContains(nodeTypes, 'StressAbove:', 'В палитре не должно быть отдельной StressAbove-ноды.');

const humanUi = readText('src/ai-node-editor/human-node-ui.ts');
expectContains(humanUi, 'blackboard-value-above', 'Human UI должен иметь панель универсальной пороговой ноды.');
expectContains(humanUi, 'human-source-select', 'Универсальная нода должна выбирать параметр из списка.');
expectContains(humanUi, 'human-threshold-slider', 'Универсальная нода должна иметь ползунок порога.');
expectContains(humanUi, 'BUILTIN_NUMERIC_SOURCES', 'Универсальная нода должна иметь список числовых blackboard-параметров.');
expectContains(humanUi, 'sourceKey', 'Универсальная нода должна сохранять выбранный параметр в parameters.sourceKey.');
expectContains(humanUi, 'developer-json-details', 'JSON должен быть спрятан в Advanced/details.');
expectContains(humanUi, 'TOOLTIP_DELAY_MS = 2000', 'Подсказки должны появляться после задержки 2 секунды.');
expectContains(humanUi, 'data-help', 'Интерактивные объекты должны получать человекочитаемые подсказки.');
expectNotContains(humanUi, 'Наведи и подожди 2 секунды', 'Не должно быть заглушки вместо подсказки.');
expectNotContains(humanUi, 'Hover and wait 2 seconds', 'Не должно быть английской заглушки вместо подсказки.');
expectContains(humanUi, "type UiLanguage = 'ru' | 'en'", 'Интерфейс должен показывать только выбранный язык, без both.');

const engineCore = readText('scripts/ai_engine_core.mjs');
expectContains(engineCore, 'BlackboardValueAbove', 'Local engine должен знать универсальную пороговую ноду.');
expectContains(engineCore, 'readBranchThreshold', 'Evaluate-once должен читать пороги из графа, а не из отдельных типов DangerAbove/StressAbove.');
expectNotContains(engineCore, "'DangerAbove'", 'Local engine не должен использовать отдельный тип DangerAbove.');
expectNotContains(engineCore, "'StressAbove'", 'Local engine не должен использовать отдельный тип StressAbove.');

const humanCss = readText('src/ai-node-editor/human-node-ui.css');
expectContains(humanCss, '.human-node-panel', 'Human CSS должен оформлять человеческую панель ноды.');
expectContains(humanCss, '.human-tooltip', 'Human CSS должен оформлять всплывающую подсказку.');
expectContains(humanCss, '.developer-json-details', 'Human CSS должен оформлять скрытый JSON-раздел.');
expectContains(humanCss, '.danger-result.pass', 'Human CSS должен показывать PASS.');
expectContains(humanCss, '.danger-result.fail', 'Human CSS должен показывать FAIL.');

const css = readText('src/ai-node-editor/ai-node-editor.css');
expectContains(css, '.graph-node', 'CSS должен оформлять видимые ноды.');
expectContains(css, '.graph-svg', 'CSS должен оформлять связи графа.');
expectContains(css, '.engine-status', 'CSS должен оформлять статус engine.');

const authoringCss = readText('src/ai-node-editor/ai-node-editor-authoring.css');
expectContains(authoringCss, '.compact-topbar', 'Authoring CSS должен делать верхнюю панель компактной.');
expectContains(authoringCss, '.ai-editor-rail', 'Authoring CSS должен поддерживать сворачивание боковых панелей.');
expectContains(authoringCss, '.collapsed-bottom', 'Authoring CSS должен поддерживать сворачивание нижней консоли.');
expectContains(authoringCss, '.graph-canvas', 'Authoring CSS должен поддерживать canvas с transform.');
expectContains(authoringCss, '.graph-toolbar', 'Authoring CSS должен оформлять zoom/pan toolbar.');
expectContains(authoringCss, '.node-port.out', 'Authoring CSS должен оформлять порт связи.');
expectContains(authoringCss, '.node-context-menu', 'Authoring CSS должен оформлять контекстное меню.');
expectContains(authoringCss, 'overflow: hidden', 'Рабочая область должна не съедаться scroll layout.');

const index = readText('index.html');
expectContains(index, 'ai-editor-open', 'Тактическая карта должна иметь кнопку открытия AI Editor.');

const tacticalMain = readText('src/main.ts');
expectContains(tacticalMain, "window.open('/ai-node-editor.html'", 'Кнопка должна открывать редактор в новой вкладке.');

const graphText = readText('src/data/ai/soldier_default_survival_graph.json');
expectContains(graphText, 'BlackboardValueAbove', 'Bundled graph должен использовать универсальную пороговую ноду.');
expectContains(graphText, '"sourceKey": "danger"', 'Danger-проверка должна быть parameters.sourceKey=danger.');
expectContains(graphText, '"sourceKey": "stress"', 'Stress-проверка должна быть parameters.sourceKey=stress.');
expectNotContains(graphText, '"type": "DangerAbove"', 'Bundled graph не должен использовать отдельный тип DangerAbove.');
expectNotContains(graphText, '"type": "StressAbove"', 'Bundled graph не должен использовать отдельный тип StressAbove.');

const graph = JSON.parse(graphText);
if (graph.id !== 'soldier_default_survival_graph') {
  fail('Bundled graph должен иметь id soldier_default_survival_graph.');
}
if (graph.name !== 'Soldier Default Survival Graph') {
  fail('Bundled graph должен иметь английский базовый name.');
}
if (!graph.nameRu) {
  fail('Bundled graph должен иметь русский overlay nameRu.');
}
if (!graph.description || !graph.descriptionRu) {
  fail('Bundled graph должен иметь description и descriptionRu.');
}

const nodeIds = new Set(graph.nodes.map((node) => node.id));
for (const nodeId of ['root', 'soldier_decision', 'critical_survival', 'continue_order', 'observe_area']) {
  if (!nodeIds.has(nodeId)) {
    fail(`В bundled graph нет ожидаемой ноды: ${nodeId}`);
  }
}

for (const node of graph.nodes) {
  if (!node.displayName) {
    fail(`Нода ${node.id} должна иметь английский displayName.`);
  }
  if (!node.displayNameRu) {
    fail(`Нода ${node.id} должна иметь русский displayNameRu.`);
  }
}

console.log('[GOTOVO] AI Node Editor static smoke passed.');

function readText(filePath) {
  return readFileSync(path.join(repoRoot, filePath), 'utf8');
}

function expectContains(content, needle, message) {
  if (!content.includes(needle)) {
    fail(message);
  }
  console.log(`[OK] contains: ${needle}`);
}

function expectNotContains(content, needle, message) {
  if (content.includes(needle)) {
    fail(message);
  }
  console.log(`[OK] does not contain: ${needle}`);
}

function fail(message) {
  console.error(`[OSHIBKA] ${message}`);
  process.exit(1);
}
