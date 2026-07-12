import { readFile, writeFile } from 'node:fs/promises';

const metadataPath = 'docs/subprojects/ai-single-unit-editor/subproject.json';
const journalPath = 'docs/subprojects/ai-single-unit-editor/journal/2026-07-13-visibility-controls-facing.md';
const codeSha = '4bd7b3a4f52c1654c8e1440799e6a91059b55402';

const metadata = JSON.parse(await readFile(metadataPath, 'utf8'));
metadata.updated_at = '2026-07-13';
metadata.current_focus = 'Завершён пакет доработок слоя «Обзор и память» и управления выбранным бойцом: невидимая местность затемняется одной растровой текстурой, добавлена компактная легенда, кеш явно показывает хранение только одного текущего поля, пулемётная угроза больше не меняет основной цвет при обновлении контакта, режим внимания можно выбирать вручную, одноразовый инструмент «Повернуть» задаёт направление правым кликом, а протягивание правой кнопкой у конечной точки маршрута задаёт направление после прибытия.';
metadata.next_step = 'Провести пользовательскую проверку доработок в real-wargame-preview. После подтверждения развивать восприятие нескольких бойцов и обмен субъективными контактами по командной цепочке; main не менять без отдельного явного GO пользователя.';
metadata.last_verified_commit = codeSha;
metadata.last_verified_runs = {
  ...metadata.last_verified_runs,
  view_memory_preview_transfer: 'PR #80 merged into real-wargame-preview as 0b21861a84ebfbe386b5621f5e02e5ded718c9d3',
  visibility_controls_core: `29213161725: workspace, routed movement, view-memory cache contract and production build succeeded on ${codeSha}`,
  visibility_controls_visual: `29213161725: system-Chrome Playwright 3/3 succeeded on ${codeSha}`,
  visibility_controls_screenshots_digest: 'sha256:7d07602c62f418db6eb26b0882433ccb5f64cdf0e878c7ccc4f48b7af9e9ba3f',
  visibility_controls_playwright_log_digest: 'sha256:9e013bcc12baefa9c26fde782443f15516238f4ae739751f8553178598aa622e',
  visibility_field_cache_policy: 'one current SelectedUnitVisibilityField per SimulationState; cacheHitCount is cumulative reuse diagnostics, not retained history',
};
metadata.manual_docs = Array.from(new Set([...(metadata.manual_docs ?? []), journalPath]));
await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');

const journal = `# Visibility controls and final facing — 2026-07-13

## Scope

This package refines the already merged View and Memory Heatmap v1 without changing the core subjective-memory model.

Delivered behavior:

- unseen map cells receive a dark semi-transparent raster overlay while terrain remains readable;
- the «Обзор и память» panel contains a compact heatmap and contact-marker legend;
- diagnostics now separate «Полей в кеше: 1» from cumulative reuse hits;
- directional machine-gun fire keeps a stable base color while current visual confirmation uses a small separate marker;
- the bottom soldier card exposes manual attention modes: automatic, march, observe, search and engage;
- «Повернуть» is a one-shot tool: activate, right-click a direction, then return to the normal cursor;
- right-button dragging from a movement destination stores and previews the requested final facing;
- route replanning preserves final facing and SimulationTick applies it before completing the linked player command.

## Performance and memory

The visibility system still retains only one current field per SimulationState through a WeakMap runtime. A rebuild replaces the previous Uint8Array; old heatmaps are not stored. Historical knowledge remains only as contact and threat-memory markers.

The unseen mask reuses the existing one-texture PixiJS path. It does not create a Graphics or Sprite object per cell. Camera and cursor movement remain outside the visibility-field cache key.

## Root cause of directional-fire flicker

The remembered-threat renderer previously selected the whole threat color from the frequently changing visibleNow flag. Perception updates could therefore alternate the complete directional-fire graphic between two colors. The base directional-fire color is now stable; visibleNow only controls a small confirmation marker.

## Verification

Code SHA: \`${codeSha}\`.

- focused core run \`29213161725\`: workspace contract, routed movement, one-field cache contract and production build succeeded;
- system-Chrome run \`29213161725\`: 3/3 focused Playwright scenarios passed;
- inspected screenshots:
  - \`visibility-controls-dark-unseen-and-legend.png\`;
  - \`visibility-controls-manual-search-mode.png\`;
  - \`visibility-controls-one-shot-turn.png\`;
  - \`visibility-controls-route-facing-draft.png\`;
  - \`visibility-controls-route-facing-command.png\`.

Visual QA found one real issue: the turn tool deactivated correctly but the shared normal-game cursor resolver returned crosshair. The resolver now returns the ordinary default cursor outside the editor and AI lab, and the repeated Chrome run passed.

## Honest limits

- final facing currently applies to movement orders issued by the player UI; there is no formation-facing command for groups yet;
- the manual engage mode selects the attention profile but does not create a new enemy target;
- the heatmap remains selected-soldier-only;
- the machine-gun representation is still a pressure/threat visualization rather than a full projectile simulation.
`;
await writeFile(journalPath, journal, 'utf8');
