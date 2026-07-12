import { readFile, writeFile } from 'node:fs/promises';

const coreSha = 'd9f0c1ca7bc649de46eba473fd6784ab1c93237b';
const coreRun = '29209735946';
const visualSha = 'c0e790553f6d048f8bf8391260c833ae258b78cd';
const visualRun = '29209822972';
const metadataPath = 'docs/subprojects/ai-single-unit-editor/subproject.json';
const journalPath = 'docs/subprojects/ai-single-unit-editor/journal/2026-07-13-view-memory-heatmap-v1.md';
const manualPath = 'docs/subprojects/ai-single-unit-editor/VIEW_AND_MEMORY_HEATMAP_V1.md';

const metadata = JSON.parse(await readFile(metadataPath, 'utf8'));
metadata.current_focus = 'Слой «Обзор и память» полностью реализован и проверен во временной ветке feat/view-memory-heatmap-temp. Физическое вращение фокуса заменено стабильным вероятностным распределением внимания; текущий обзор показывается поклеточной тепловой картой с рельефом, предметами, лесом и падением качества по расстоянию; старые знания остаются метками; обнаружение накапливается во времени с небольшой стабильной случайностью. Поле кешируется, хранится в Uint8Array и выводится одним PixiJS-спрайтом. Актуальные навигационные изменения preview синхронизированы и повторно проверены. В real-wargame-preview реализация не переносилась; preview позже получила только один новый документ ideas/GOOD_POSITIONS_AND_AMBUSH_SITES.md без изменений кода.';
metadata.next_step = 'Показать пользователю временную ветку feat/view-memory-heatmap-temp для ручной проверки. Перед будущим переносом подтянуть последний docs-only коммит preview и повторить обычный transfer CI; системный Chrome требуется заново только если при синхронизации изменится код или интерфейс. Переносить только по отдельной явной команде, main не менять без отдельного GO.';
metadata.last_verified_commit = visualSha;
metadata.last_verified_runs = {
  ...metadata.last_verified_runs,
  view_memory_core: `${coreRun}: full expanded regression success on synchronized feature merge ${coreSha}`,
  view_memory_visual: `${visualRun}: exact-SHA system-Chrome Playwright success on ${visualSha}`,
  visual_qa: `${visualRun}: exact-SHA system-Chrome Playwright 20/20 succeeded on ${visualSha}`,
  playwright: '20/20 passed in 10.5 minutes',
  png_count: 29,
  screenshots_artifact_digest: 'sha256:604f405f7de1ec8b2c1d57dc563ef65fd5d5bcc94b478d13ef676fd7ce91df46',
  playwright_log_digest: 'sha256:1b7231d65ad8edf9340d46c26e908b4df78d957907b5bc8c21758540b09ba8b5',
  playwright_raw_log_digest: 'sha256:97ef4cd304a446fd414a1a3dcbcb6b99bd340bf7cb0b15805ecc02fef769b777',
  view_memory_preview_base: 'd6f754856f3b5d05b3f466a7316ceb2db701dc2d',
  view_memory_preview_drift: 'current preview is 1 docs-only commit ahead: ideas/GOOD_POSITIONS_AND_AMBUSH_SITES.md; no runtime, UI or test code differs',
  view_memory_preview_transfer: 'not performed; implementation remains only in feat/view-memory-heatmap-temp',
};
await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');

let journal = await readFile(journalPath, 'utf8');
const oldMovementHeading = '## Preview branch movement after verification';
const oldMovementIndex = journal.indexOf(oldMovementHeading);
if (oldMovementIndex >= 0) journal = journal.slice(0, oldMovementIndex).trimEnd();
if (!journal.includes('## Final synchronized verification')) {
  journal += `\n\n## Final synchronized verification\n\nCurrent preview navigation changes were merged into the temporary branch as \`${coreSha}\`. Full expanded validation run \`${coreRun}\` succeeded on that synchronized tree.\n\nThe final system-Chrome run \`${visualRun}\` then succeeded on exact SHA \`${visualSha}\`: \`20/20 passed\` in \`10.5 minutes\`, with 29 PNG files. The same key views were reopened manually and remained readable after synchronization.\n\nFinal artifact digests:\n\n\`\`\`text\nscreenshots ZIP: sha256:604f405f7de1ec8b2c1d57dc563ef65fd5d5bcc94b478d13ef676fd7ce91df46\nPlaywright ZIP:  sha256:1b7231d65ad8edf9340d46c26e908b4df78d957907b5bc8c21758540b09ba8b5\nraw log:        sha256:97ef4cd304a446fd414a1a3dcbcb6b99bd340bf7cb0b15805ecc02fef769b777\n\`\`\`\n\nAfter this run, \`real-wargame-preview\` advanced by one documentation-only commit adding \`ideas/GOOD_POSITIONS_AND_AMBUSH_SITES.md\`. No game, UI, runtime or test code changed, so the exact-SHA browser result remains valid for the implementation. That document should be pulled before a future transfer.\n\nNo transfer to \`real-wargame-preview\` or \`main\` was performed.\n`;
}
await writeFile(journalPath, journal, 'utf8');

let manual = await readFile(manualPath, 'utf8');
manual = manual.replace(/- Точный визуальный SHA: `[^`]+`\./, `- Точный визуальный SHA: \`${visualSha}\`.`);
manual = manual.replace(/- Полная регрессия: run `[^`]+`, success\./, `- Полная регрессия: run \`${coreRun}\`, success on synchronized tree.`);
manual = manual.replace(/- System Chrome: run `[^`]+`, `20\/20 passed`\./, `- System Chrome: run \`${visualRun}\`, \`20/20 passed\`.`);
await writeFile(manualPath, manual, 'utf8');
