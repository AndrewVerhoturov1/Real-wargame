import fs from 'node:fs';

const metadataPath = 'docs/subprojects/ai-single-unit-editor/subproject.json';
const journalPath = 'docs/subprojects/ai-single-unit-editor/journal/2026-07-13-view-memory-heatmap-v1.md';

const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
metadata.updated_at = '2026-07-13';
metadata.current_focus = 'Слой «Обзор и память» полностью реализован и проверен во временной ветке feat/view-memory-heatmap-temp. Текущий обзор строится как кешируемая поклеточная тепловая карта выбранного бойца с рельефом, предметами, лесом и падением качества по расстоянию; старые знания остаются метками, а обнаружение накапливается во времени со стабильной небольшой случайностью. После синхронизации навигации нестабильная браузерная проверка была разделена на точный headless-контракт ключа растрового поля и визуальную проверку движения. В real-wargame-preview уже появились совпадающие файлы реализации из внешней работы; эта рабочая ветка туда не объединялась данным процессом.';
metadata.next_step = 'Показать пользователю проверенную временную ветку feat/view-memory-heatmap-temp. Перед любым дальнейшим переносом или удалением ветки сначала сравнить её с актуальной real-wargame-preview: preview уже содержит совпадающую реализацию, поэтому нельзя слепо выполнять повторный merge. main не менять без отдельного явного GO пользователя.';
metadata.last_verified_commit = 'd254e471ed789790123302e466ac8fd3dd5c3e11';
metadata.last_verified_runs = {
  ...metadata.last_verified_runs,
  visual_qa: '29210611840: exact-SHA system-Chrome Playwright 20/20 succeeded on d254e471ed789790123302e466ac8fd3dd5c3e11',
  playwright: '20/20 passed in 10.6 minutes',
  png_count: 29,
  screenshots_artifact_digest: 'sha256:80842bc74ae0947fb74672a68de5ee65003dd1b43344982ae462dbcb7daa96ea',
  playwright_log_digest: 'sha256:423f0cb603563c431cc7290fee0cf7e19d4083412c2d22548615c5a8f0496982',
  playwright_raw_log_digest: 'sha256:65243b16d311e8cd1f4483f0dea9ca9d43ae7c83cc6ae8fbd8c59a4062704f76',
  view_memory_core: '29210607097: full expanded regression success after the movement-stable raster-key test correction',
  view_memory_focused_browser: '29210481011: focused awareness movement scenario passed 3/3 repetitions',
  view_memory_visual: '29210611840: exact-SHA system-Chrome Playwright success on d254e471ed789790123302e466ac8fd3dd5c3e11',
  view_memory_preview_transfer: 'not performed by this workstream; real-wargame-preview changed externally and now contains matching implementation files',
  view_memory_preview_state: 'real-wargame-preview head f7cf4b2888435aab7c7dfd21068ac2fafa4fce27 contains matching core heatmap files plus ideas/GOOD_POSITIONS_AND_AMBUSH_SITES.md; compare trees before any future merge'
};
fs.writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);

let journal = fs.readFileSync(journalPath, 'utf8');
journal = journal.replace('**Preview transfer:** not performed', '**Transfer by this workstream:** not performed');
const sectionTitle = '## Final exact-SHA verification after cache-test correction';
if (!journal.includes(sectionTitle)) {
  journal = `${journal.trim()}\n\n${sectionTitle}\n\nA synchronized system-Chrome run \`29209946327\` first reported \`19/20\`: the old browser assertion counted two raster rebuilds after movement instead of at most one. Investigation showed that movement itself kept the awareness field stable, while live threat confidence and uncertainty crossed a legitimate quantization boundary during the same 2.6-second interval. The test was therefore mixing two independent causes.\n\nThe correction did not raise the limit or disable caching checks. \`awareness-field:smoke\` now proves deterministically that movement preserves both the awareness field cache key and the raster render key, while a real knowledge change invalidates them. The browser scenario continues to verify one raster sprite, bounded display-object count, actual marker movement and stable UI.\n\nVerification evidence:\n\n- full expanded validation run \`29210607097\`: success;\n- focused browser reproduction run \`29210481011\`: the formerly unstable scenario passed \`3/3\` repetitions;\n- exact system-Chrome run \`29210611840\` on SHA \`d254e471ed789790123302e466ac8fd3dd5c3e11\`: \`20/20 passed\` in \`10.6 minutes\`;\n- 29 PNG files produced and key screens reopened manually.\n\nFinal artifact digests:\n\n\`\`\`text\nscreenshots ZIP: sha256:80842bc74ae0947fb74672a68de5ee65003dd1b43344982ae462dbcb7daa96ea\nPlaywright ZIP:  sha256:423f0cb603563c431cc7290fee0cf7e19d4083412c2d22548615c5a8f0496982\nraw log:        sha256:65243b16d311e8cd1f4483f0dea9ca9d43ae7c83cc6ae8fbd8c59a4062704f76\n\`\`\`\n\nManual inspection confirmed readable march/engage/search heatmaps, no rotating focus ray, one unified \`Обзор и память\` tab, no panel overlap, readable profile and node controls, preserved legacy node-editor layout and a selectable moving newly placed fighter.\n\nRepository-state note: no merge from \`feat/view-memory-heatmap-temp\` to \`real-wargame-preview\` or \`main\` was performed by this workstream. During verification, \`real-wargame-preview\` changed externally and now contains matching heatmap implementation files. Any future action must compare both branch trees first instead of assuming that preview still lacks the feature.\n`;
  fs.writeFileSync(journalPath, journal);
}
