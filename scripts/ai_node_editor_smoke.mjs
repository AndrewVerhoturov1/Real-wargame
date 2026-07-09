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
expectContains(html, '/src/ai-node-editor/human-node-ui.ts', 'HTML должен подключать human node UI layer.');
expectContains(html, '/src/ai-node-editor/human-node-ui.css', 'HTML должен подключать human node UI styles.');

const main = readText('src/ai-node-editor/main.ts');
expectContains(main, 'ENGINE_BASE_URL', 'Редактор должен знать адрес local engine.');
expectContains(main, '/engine/health', 'Редактор должен проверять health endpoint.');
expectContains(main, '/ai/graph/validate', 'Редактор должен валидировать граф через engine.');
expectContains(main, 'addNodeFromPalette', 'Этап 4 должен уметь добавлять ноды из палитры.');
expectContains(main, 'startDrag', 'Этап 4 должен уметь перетаскивать ноды.');
expectContains(main, 'startConnectionDrag', 'Связи должны создаваться протягиванием из порта.');
expectContains(main, 'togglePalette', 'Левая панель должна сворачиваться.');
expectContains(main, 'toggleInspector', 'Правая панель должна сворачиваться.');
expectContains(main, 'toggleBottomPanel', 'Нижняя консоль должна сворачиваться.');
expectContains(main, 'localStorage', 'Этап 4 должен сохранять рабочий граф/позиции в браузере.');

const nodeTypes = readText('src/core/ai/AiNodeTypes.ts');
for (const needle of [
  'Numeric Threshold',
  'Числовой порог',
  'Flag Check',
  'Проверка флага',
  'Distance Threshold',
  'Порог расстояния',
  'Parameter Score',
  'Оценка параметра',
  'Distance Score',
  'Оценка расстояния',
  'Find Object',
  'Поиск объекта',
  'Write Memory',
  'Запись памяти',
  'Action',
  'Действие',
  'Movement Mode',
  'Режим движения',
  'Say Message',
  'Реплика бойца',
  'Stable Threshold',
  'Стабильный порог',
  'Forbid Action',
  'Запрет действия',
]) {
  expectContains(nodeTypes, needle, `В каталоге нод должно быть: ${needle}`);
}
expectNotContains(nodeTypes, 'DangerAbove:', 'В палитре не должно быть отдельной DangerAbove-ноды.');
expectNotContains(nodeTypes, 'StressAbove:', 'В палитре не должно быть отдельной StressAbove-ноды.');

const humanUi = readText('src/ai-node-editor/human-node-ui.ts');
expectContains(humanUi, 'COMMON_COOLDOWN_FIELDS', 'Human UI должен иметь общие cooldown-поля для нод.');
expectContains(humanUi, 'cooldownSeconds', 'Human UI должен сохранять cooldownSeconds.');
expectContains(humanUi, 'cooldownTiming', 'Human UI должен сохранять cooldownTiming.');
expectContains(humanUi, 'До ноды', 'Русская версия должна иметь вариант задержки до ноды.');
expectContains(humanUi, 'После ноды', 'Русская версия должна иметь вариант задержки после ноды.');
expectContains(humanUi, 'FlagCheck', 'Human UI должен иметь панель проверки флага.');
expectContains(humanUi, 'DistanceScore', 'Human UI должен иметь панель оценки расстояния.');
expectContains(humanUi, 'SayMessage', 'Human UI должен иметь панель реплики бойца.');
expectContains(humanUi, 'messageRu', 'Реплика бойца должна иметь русский текст.');
expectContains(humanUi, 'human-comparison-button', 'Числовой порог должен иметь кнопки выше/ниже.');
expectContains(humanUi, 'developer-json-details', 'JSON должен быть спрятан в Advanced/details.');
expectContains(humanUi, 'TOOLTIP_DELAY_MS = 2000', 'Подсказки должны появляться после задержки 2 секунды.');
expectNotContains(humanUi, 'Наведи и подожди 2 секунды', 'Не должно быть заглушки вместо подсказки.');
expectContains(humanUi, "type UiLanguage = 'ru' | 'en'", 'Интерфейс должен показывать только выбранный язык, без both.');

const engineCore = readText('scripts/ai_engine_core.mjs');
for (const needle of ['FlagCheck', 'DistanceCheck', 'ParameterScore', 'DistanceScore', 'FindBestObject', 'WriteMemory', 'CopyMemory', 'SetAction', 'SetMovementMode', 'SayMessage', 'DecisionInertia', 'StableThreshold', 'ForbidAction']) {
  expectContains(engineCore, needle, `Local engine должен знать тип ${needle}.`);
}
expectContains(engineCore, 'validateCommonCooldownParameters', 'Local engine должен проверять общие cooldown параметры.');
expectContains(engineCore, 'COOLDOWN_TIMING_INVALID', 'Validation должен ловить неправильный cooldownTiming.');
expectContains(engineCore, 'SAY_MESSAGE_TEXT_MISSING', 'Validation должен проверять текст реплики бойца.');
expectNotContains(engineCore, "'DangerAbove'", 'Local engine не должен использовать отдельный тип DangerAbove.');
expectNotContains(engineCore, "'StressAbove'", 'Local engine не должен использовать отдельный тип StressAbove.');

const graphText = readText('src/data/ai/soldier_default_survival_graph.json');
expectContains(graphText, 'BlackboardValueAbove', 'Bundled graph должен использовать универсальную пороговую ноду.');
expectContains(graphText, '"sourceKey": "danger"', 'Danger-проверка должна быть parameters.sourceKey=danger.');
expectContains(graphText, '"sourceKey": "stress"', 'Stress-проверка должна быть parameters.sourceKey=stress.');
expectContains(graphText, '"comparison": "above"', 'Bundled graph должен явно хранить режим above для текущих danger/stress условий.');
expectNotContains(graphText, '"type": "DangerAbove"', 'Bundled graph не должен использовать отдельный тип DangerAbove.');
expectNotContains(graphText, '"type": "StressAbove"', 'Bundled graph не должен использовать отдельный тип StressAbove.');

const graph = JSON.parse(graphText);
if (graph.id !== 'soldier_default_survival_graph') fail('Bundled graph должен иметь id soldier_default_survival_graph.');
if (graph.name !== 'Soldier Default Survival Graph') fail('Bundled graph должен иметь английский базовый name.');
if (!graph.nameRu) fail('Bundled graph должен иметь русский overlay nameRu.');
for (const node of graph.nodes) {
  if (!node.displayName) fail(`Нода ${node.id} должна иметь английский displayName.`);
  if (!node.displayNameRu) fail(`Нода ${node.id} должна иметь русский displayNameRu.`);
}

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
