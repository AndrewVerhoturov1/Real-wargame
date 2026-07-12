import { readFile, writeFile } from 'node:fs/promises';

const scenePath = 'src/ui/SceneExport.ts';
let scene = await readFile(scenePath, 'utf8');
scene = scene.replace(
  "version: 'scene-export-v7-perception-attention-ai-runtime-2m-grid',",
  "version: 'scene-export-v8-view-memory-heatmap-ai-runtime-2m-grid',",
);
scene = scene.replace(
  "noteRu: 'Экспорт полигона ИИ с профилями обзора и внимания, навигационными профилями и активным runtime. Старые сцены без новых блоков получают безопасные значения по умолчанию; сцены 10 м преобразуются в текущую сетку при загрузке.',",
  "noteRu: 'Экспорт полигона ИИ со слоем «Обзор и память», метрическими настройками зрения, навигационными профилями и активным runtime. Старые сцены без новых блоков получают безопасные значения по умолчанию; сцены 10 м преобразуются в текущую сетку при загрузке.',",
);
const oldAttention = `    attention: {\n      defaultMode: unit.attentionSettings.defaultMode,\n      profiles: Object.fromEntries(\n        Object.entries(unit.attentionSettings.profiles).map(([mode, profile]) => [mode, { ...profile }]),\n      ),\n    },`;
const newAttention = `    attention: {\n      defaultMode: unit.attentionSettings.defaultMode,\n      profiles: Object.fromEntries(\n        Object.entries(unit.attentionSettings.profiles).map(([mode, profile]) => [mode, { ...profile }]),\n      ),\n      vision: { ...unit.attentionSettings.vision },\n    },`;
if (!scene.includes(oldAttention)) throw new Error('Scene attention export block not found.');
scene = scene.replace(oldAttention, newAttention);
await writeFile(scenePath, scene, 'utf8');

const metadataPath = 'docs/subprojects/ai-single-unit-editor/subproject.json';
const metadata = JSON.parse(await readFile(metadataPath, 'utf8'));
metadata.updated_at = '2026-07-13';
metadata.current_focus = 'Слой «Обзор и память» перерабатывается во временной ветке feat/view-memory-heatmap-temp. Физическое вращение фокуса заменено стабильным вероятностным распределением внимания. Добавлены метрическая дальность зрения, поклеточная текущая видимость с тенью от рельефа и предметов, ослаблением лесом и расстоянием, память только метками, стабильная небольшая случайность обнаружения и однострайтовый PixiJS-рендер. В real-wargame-preview изменения пока не переносились.';
metadata.next_step = 'Завершить полный CI и реальную браузерную проверку временной ветки feat/view-memory-heatmap-temp. После пользовательской проверки переносить в real-wargame-preview только по отдельной команде; main не менять без отдельного явного GO пользователя.';
metadata.must_read_first = unique([
  'docs/subprojects/ai-single-unit-editor/VIEW_AND_MEMORY_HEATMAP_V1.md',
  'docs/superpowers/plans/2026-07-13-view-memory-heatmap.md',
  ...(metadata.must_read_first ?? []),
]);
metadata.main_files = unique([
  ...(metadata.main_files ?? []),
  'src/core/visibility/VisibilityQuality.ts',
  'src/core/visibility/VisibilityStaticGrid.ts',
  'src/core/visibility/SelectedUnitVisibilityField.ts',
  'src/rendering/PixiVisibilityHeatmapRenderer.ts',
]);
metadata.test_files = unique([
  ...(metadata.test_files ?? []),
  'scripts/view_memory_heatmap_smoke.ts',
  'scripts/view_memory_heatmap_performance_smoke.ts',
  'scripts/perception_variance_smoke.ts',
]);
metadata.manual_docs = unique([
  ...(metadata.manual_docs ?? []),
  'docs/subprojects/ai-single-unit-editor/VIEW_AND_MEMORY_HEATMAP_V1.md',
  'docs/superpowers/plans/2026-07-13-view-memory-heatmap.md',
]);
metadata.suggested_verification = unique([
  'npm run view-memory-heatmap:smoke',
  'npm run view-memory-heatmap-performance:smoke',
  'npm run perception-variance:smoke',
  ...(metadata.suggested_verification ?? []),
]);
metadata.safety_rules = unique([
  ...(metadata.safety_rules ?? []),
  'Тепловая карта описывает возможность наблюдать клетку и никогда не раскрывает скрытое содержимое клетки.',
  'Скрытый слой, движение камеры и движение курсора не запускают построение поля видимости.',
  'Историческая информация хранится только метками контактов; старая тепловая карта не становится памятью местности.',
  'Поле выбранного бойца хранится в Uint8Array и выводится одним растровым Sprite, а не объектом на каждую клетку.',
  'Случайность обнаружения детерминирована контактом, ограничена профилем и не зависит от FPS.',
  'Не переносить feat/view-memory-heatmap-temp в real-wargame-preview без отдельной команды пользователя.',
]);
metadata.known_limits = unique([
  ...(metadata.known_limits ?? []),
  'View and Memory Heatmap v1 рассчитывается только для выбранного бойца.',
  'Поле строится синхронно, но кешируется, квантируется и ограничивается по частоте; для карт значительно крупнее текущих может понадобиться фоновая пошаговая задача.',
]);
await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');

function unique(values) {
  return Array.from(new Set(values));
}
