import { readFile, writeFile } from 'node:fs/promises';

const metadataPath = 'docs/subprojects/ai-single-unit-editor/subproject.json';
const journalPath = 'docs/subprojects/ai-single-unit-editor/journal/2026-07-13-attention-profiles-motion-flicker.md';
const codeSha = '02a43f233d1618b7b8b2331869d34e9b12bbec9e';
const fullRun = '29216834976';

const metadata = JSON.parse(await readFile(metadataPath, 'utf8'));
metadata.updated_at = '2026-07-13';
metadata.current_focus = 'Завершён пакет стабилизации отображения угроз и управления вниманием: геометрия пулемётной угрозы отделена от текущей метки подтверждения и больше не пересоздаётся при visibleNow, подпись «Пулемёт» имеет переход к тактической памяти, боец поворачивается по каждому отрезку маршрута, добавлен сохраняемый реестр именованных профилей внимания с редактором, а нижняя карточка собрана в адаптивную компактную сетку без переполнения.';
metadata.next_step = 'Провести пользовательскую проверку в real-wargame-preview. После подтверждения развивать восприятие нескольких бойцов и обмен субъективными контактами по командной цепочке; main не менять без отдельного явного GO пользователя.';
metadata.last_verified_commit = codeSha;
metadata.last_verified_runs = {
  ...metadata.last_verified_runs,
  attention_profiles_motion_core: `${fullRun}: threat display stability, movement facing, attention profile registry, compact layout, workspace, routed move, perception, runtime scene, editor, docs and production build succeeded on ${codeSha}`,
  attention_profiles_motion_visual: `${fullRun}: full system-Chrome Playwright regression succeeded on ${codeSha}`,
  attention_profiles_motion_screenshots_digest: 'sha256:560318b43952214498a3ce6f0bfbd4e60641888a3e5bdaf6e8e1813855bfb2d6',
  attention_profiles_motion_playwright_log_digest: 'sha256:a0d1af29e7ec4e4f83cb351bcb257fc2cf49d9236fa342514123eb656be14632',
  threat_display_policy: 'stable geometry key excludes volatile visibleNow; confirmation markers update independently; live contacts and tactical memory are deduplicated by threat id',
  movement_facing_policy: 'unit faces the active route waypoint before each movement step; explicit final facing overrides the last segment at completion',
  attention_profile_policy: 'built-in and custom profiles persist in localStorage; concrete settings remain in scene export for backward compatibility',
};
metadata.main_files = Array.from(new Set([
  ...(metadata.main_files ?? []),
  'src/core/knowledge/ThreatDisplayModel.ts',
  'src/core/perception/AttentionProfiles.ts',
  'src/core/perception/AttentionProfileStorage.ts',
  'src/ai-node-editor/AttentionProfileEditorPanel.ts',
]));
metadata.test_files = Array.from(new Set([
  ...(metadata.test_files ?? []),
  'scripts/threat_display_stability_smoke.ts',
  'scripts/movement_facing_smoke.ts',
  'scripts/attention_profiles_smoke.ts',
  'scripts/bottom_panel_layout_contract_smoke.mjs',
  'tests/attention-profiles-motion-stability.spec.ts',
]));
metadata.manual_docs = Array.from(new Set([...(metadata.manual_docs ?? []), journalPath]));
metadata.suggested_verification = Array.from(new Set([
  'npm run threat-display-stability:smoke',
  'npm run movement-facing:smoke',
  'npm run attention-profiles:smoke',
  'node scripts/bottom_panel_layout_contract_smoke.mjs',
  ...(metadata.suggested_verification ?? []),
]));
await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');

const journal = `# Attention profiles, movement facing, and threat stability — 2026-07-13

## Delivered

- machine-gun and directional-fire geometry is held in a persistent PixiJS container;
- volatile current confirmation is drawn by a separate marker layer;
- the stable geometry key excludes \`visibleNow\`, so seeing and losing sight of the source does not destroy and recreate the whole threat graphic;
- the «Обзор и память» list is the union of live perception contacts and tactical threat memory, deduplicated by threat id, so the «Пулемёт» label does not disappear during the live-to-memory transition;
- a moving unit faces the active route waypoint before every movement step, while the explicitly requested final facing still wins after arrival;
- named attention profiles are available in the selected-unit card and in a dedicated editor tab;
- built-in profiles: Balanced, Cautious, Observer, Searcher, Combat;
- custom profiles support create, copy, rename, delete, reset, import, export, and browser persistence;
- manual raw attention edits switch the unit to an Individual profile state;
- the bottom selected-unit card uses contained responsive layouts at desktop and narrow desktop widths.

## Compatibility

Scene export keeps the optional selected attention-profile id and also exports the concrete attention settings. Old scenes without profile ids continue to load as individual settings. Route lifecycle events remain authoritative; turning during movement does not overwrite route completion or blocked events.

## Performance

The threat geometry layer is rebuilt only when stable geometry or bucketed confidence changes. Current confirmation updates only a small Graphics marker. The bottom-panel changes are CSS layout changes and do not add per-frame simulation work.

## Verification

Code SHA: \`${codeSha}\`.

- run \`${fullRun}\`: all focused behavioral smokes, workspace, routed movement, perception, runtime scene, node editor, documentation and production build passed;
- the same run completed the full system-Chrome regression covering the new scenarios plus existing turn, final-facing and compact-route controls;
- manually inspected PNGs:
  - \`attention-fix-stable-machine-gun-and-label.png\`;
  - \`attention-fix-moving-unit-faces-route.png\`;
  - \`attention-fix-profile-editor.png\`;
  - \`attention-fix-compact-unit-bar-1440.png\`;
  - \`attention-fix-compact-unit-bar-1180.png\`;
  - existing visibility and route-control regression screenshots.

## Honest limits

- attention profiles are global browser profiles, not yet shared through an in-game commander chain;
- movement rotation is immediate toward the active segment rather than animated with a finite body-turn rate;
- the machine-gun source remains a pressure-zone/threat representation, not a full projectile weapon simulation.
`;
await writeFile(journalPath, journal, 'utf8');
