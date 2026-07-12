import { readFile, writeFile } from 'node:fs/promises';

const visualSha = '923fdde44d15d447b01178ce1430e2c68f11a215';
const coreHeadSha = '45f65cfe30bc6bc85cd9bc5697ffc717f30e433a';
const coreRun = '29208942691';
const visualRun = '29209032782';
const journalPath = 'docs/subprojects/ai-single-unit-editor/journal/2026-07-13-view-memory-heatmap-v1.md';
const manualPath = 'docs/subprojects/ai-single-unit-editor/VIEW_AND_MEMORY_HEATMAP_V1.md';

const metadataPath = 'docs/subprojects/ai-single-unit-editor/subproject.json';
const metadata = JSON.parse(await readFile(metadataPath, 'utf8'));
metadata.updated_at = '2026-07-13';
metadata.current_focus = 'Слой «Обзор и память» полностью реализован и проверен во временной ветке feat/view-memory-heatmap-temp. Физическое вращение фокуса заменено стабильным вероятностным распределением внимания; текущий обзор показывается поклеточной тепловой картой с рельефом, предметами, лесом и падением качества по расстоянию; старые знания остаются метками; обнаружение накапливается во времени с небольшой стабильной случайностью. Поле кешируется, хранится в Uint8Array и выводится одним PixiJS-спрайтом. В real-wargame-preview изменения не переносились.';
metadata.next_step = 'Показать пользователю временную ветку feat/view-memory-heatmap-temp для ручной проверки. Переносить её в real-wargame-preview только по отдельной явной команде; main не менять без отдельного явного GO пользователя.';
metadata.last_verified_commit = visualSha;
metadata.last_verified_runs = {
  ...metadata.last_verified_runs,
  view_memory_core: `${coreRun}: full expanded regression success for feature head ${coreHeadSha}`,
  view_memory_visual: `${visualRun}: exact-SHA system-Chrome Playwright success on ${visualSha}`,
  playwright: '20/20 passed in 10.6 minutes',
  png_count: 29,
  screenshots_artifact_digest: 'sha256:8c95e130d0e78bedd65a6a3d3bcc8106d830fd0d10f29dfba8757f5ff3f93310',
  playwright_log_digest: 'sha256:aea297c9140b5985451653293a4a66985a467882aef80f3763dd8f29b80b41a5',
  playwright_raw_log_digest: 'sha256:a42647a2d7c8f384e260aecfd321c28865710d104448ccb26b961f3be2117782',
  inspected_png: [
    'view-memory-heatmap-march.png',
    'view-memory-heatmap-engage.png',
    'view-memory-heatmap-search.png',
    'view-memory-profile-editor.png',
    'view-memory-node-controls.png',
    '06-simulation-memory-layer.png',
    '10-node-editor-unchanged.png',
    '11-editor-spawned-fighter-playable.png',
  ],
  performance_budget: 'first field build <= 120 ms on CI test map 180x120; hidden layer zero builds; idle cache reuse; moving rebuild throttle; one byte per cell',
  view_memory_preview_transfer: 'not performed; implementation remains only in feat/view-memory-heatmap-temp',
};
metadata.manual_docs = unique([...(metadata.manual_docs ?? []), journalPath, manualPath]);
await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');

let journal = await readFile(journalPath, 'utf8');
const pendingStart = '## Pending before handoff';
const limitsStart = '## Honest v1 limits';
const pendingIndex = journal.indexOf(pendingStart);
const limitsIndex = journal.indexOf(limitsStart);
if (pendingIndex >= 0 && limitsIndex > pendingIndex) {
  journal = `${journal.slice(0, pendingIndex)}## Final verification\n\nFull expanded validation run \`${coreRun}\` succeeded after all compatibility corrections. It covered the new heatmap, performance and variance tests plus runtime sessions/snapshots/scenes, events, movement, routes, navigation profiles, map revisions and caches, workspace, game editor, dictionary, lab, production build and generated documentation.\n\nExact system-Chrome run \`${visualRun}\` succeeded on SHA \`${visualSha}\`. Playwright result: \`20/20 passed\` in \`10.6 minutes\`; 29 PNG files were produced.\n\nManually inspected:\n\n- \`view-memory-heatmap-march.png\`;\n- \`view-memory-heatmap-engage.png\`;\n- \`view-memory-heatmap-search.png\`;\n- \`view-memory-profile-editor.png\`;\n- \`view-memory-node-controls.png\`;\n- \`06-simulation-memory-layer.png\`;\n- \`10-node-editor-unchanged.png\`;\n- \`11-editor-spawned-fighter-playable.png\`.\n\nThe inspected result has a readable cell heatmap, no moving focus ray, one unified \`Обзор и память\` tab, readable editor controls, preserved node editor layout and a playable newly placed fighter. Automated browser assertions also proved that cursor and camera movement do not rebuild the field or upload a new texture.\n\nArtifact digests:\n\n\`\`\`text\nscreenshots ZIP: sha256:8c95e130d0e78bedd65a6a3d3bcc8106d830fd0d10f29dfba8757f5ff3f93310\nPlaywright ZIP:  sha256:aea297c9140b5985451653293a4a66985a467882aef80f3763dd8f29b80b41a5\nraw log:        sha256:a42647a2d7c8f384e260aecfd321c28865710d104448ccb26b961f3be2117782\n\`\`\`\n\nNo transfer to \`real-wargame-preview\` or \`main\` was performed.\n\n${journal.slice(limitsIndex)}`;
}
await writeFile(journalPath, journal, 'utf8');

let journalIndex = await readFile('docs/subprojects/ai-single-unit-editor/JOURNAL.md', 'utf8');
const journalEntry = '- **2026-07-13**: Completed View and Memory Heatmap v1 on isolated branch `feat/view-memory-heatmap-temp`. Replaced physical attention sweep with stable probabilistic coverage, added meter-based cell visibility, deterministic time-based detection variance, cached one-byte field storage and one-sprite rendering. Full regression and exact-SHA system-Chrome Playwright 20/20 passed; key PNGs were inspected. Preview and main remain untouched. See `journal/2026-07-13-view-memory-heatmap-v1.md`.';
if (!journalIndex.includes('2026-07-13-view-memory-heatmap-v1.md')) {
  journalIndex = `${journalIndex.trimEnd()}\n${journalEntry}\n`;
  await writeFile('docs/subprojects/ai-single-unit-editor/JOURNAL.md', journalIndex, 'utf8');
}

let manual = await readFile(manualPath, 'utf8');
if (!manual.includes('## Проверенная поставка временной ветки')) {
  manual += `\n## Проверенная поставка временной ветки\n\n- Ветка: \`feat/view-memory-heatmap-temp\`.\n- Точный визуальный SHA: \`${visualSha}\`.\n- Полная регрессия: run \`${coreRun}\`, success.\n- System Chrome: run \`${visualRun}\`, \`20/20 passed\`.\n- Визуально открыты основные режимы тепловой карты, единая вкладка, редактор профилей, нода сектора поиска и сохранённые старые сценарии.\n- Перенос в \`real-wargame-preview\` не выполнялся.\n`;
  await writeFile(manualPath, manual, 'utf8');
}

function unique(values) {
  return Array.from(new Set(values));
}
