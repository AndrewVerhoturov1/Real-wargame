import { readFile, writeFile } from 'node:fs/promises';

const metadataPath = 'docs/subprojects/ai-single-unit-editor/subproject.json';
const journalPath = 'docs/subprojects/ai-single-unit-editor/journal/2026-07-13-view-memory-heatmap-v1.md';
const metadata = JSON.parse(await readFile(metadataPath, 'utf8'));
metadata.current_focus = 'Слой «Обзор и память» полностью реализован и проверен во временной ветке feat/view-memory-heatmap-temp. Физическое вращение фокуса заменено стабильным вероятностным распределением внимания; текущий обзор показывается поклеточной тепловой картой с рельефом, предметами, лесом и падением качества по расстоянию; старые знания остаются метками; обнаружение накапливается во времени с небольшой стабильной случайностью. Поле кешируется, хранится в Uint8Array и выводится одним PixiJS-спрайтом. В real-wargame-preview изменения не переносились; после проверки preview продвинулась на 2 навигационных коммита, поэтому перед будущим переносом потребуется отдельная синхронизация и повторная проверка объединённого дерева.';
metadata.next_step = 'Показать пользователю временную ветку feat/view-memory-heatmap-temp для ручной проверки. Перед переносом сначала синхронизировать в неё актуальный real-wargame-preview и повторить затронутые проверки; переносить только по отдельной явной команде. Main не менять без отдельного явного GO пользователя.';
metadata.last_verified_runs = {
  ...metadata.last_verified_runs,
  visual_qa: '29209032782: exact-SHA system-Chrome Playwright 20/20 succeeded on 923fdde44d15d447b01178ce1430e2c68f11a215',
  view_memory_preview_base: 'bbf3d08cde1063fcbde8070793c7df6f50d23a59',
  view_memory_preview_drift: 'current real-wargame-preview is 2 commits ahead; changed files are NavigationRuntime.ts and two navigation/UI smoke tests; not synchronized after exact-SHA visual QA',
};
await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');

let journal = await readFile(journalPath, 'utf8');
if (!journal.includes('## Preview branch movement after verification')) {
  const section = `\n## Preview branch movement after verification\n\nAfter the exact-SHA visual run, \`real-wargame-preview\` advanced by two commits from merge base \`bbf3d08cde1063fcbde8070793c7df6f50d23a59\`. The changed files are \`src/core/navigation/NavigationRuntime.ts\`, \`scripts/navigation_profiles_smoke.ts\` and \`scripts/ui_compact_route_controls_smoke.ts\`.\n\nThey do not overlap the heatmap implementation files, but they were not present in visual SHA \`923fdde44d15d447b01178ce1430e2c68f11a215\`. Therefore the temporary branch remains intentionally unsynchronized for this handoff. Before any future transfer, current preview must be merged into the temporary branch and the affected regression/browser checks rerun.\n`;
  journal = `${journal.trimEnd()}\n${section}`;
  await writeFile(journalPath, journal, 'utf8');
}
