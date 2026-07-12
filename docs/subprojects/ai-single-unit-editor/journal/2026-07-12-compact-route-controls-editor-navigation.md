# 2026-07-12 — Compact Route Controls and Editor Navigation

## Branch boundary

Implementation was developed and visually verified on:

```text
tmp/ui-compact-route-controls-20260712
```

Starting preview commit:

```text
61d3b04f886a4f206677617a0ebb23ec7d689e7f
```

The temporary branch was transferred through PR #65 after the user explicitly authorized the merge. The branch-only visual-QA workflow was removed before transfer. `main` was not modified.

Preview merge commit:

```text
f99c0b810b06cd326063f94e688004635c3b2466
```

## Implemented

- Rebuilt the selected-soldier bottom card into a compact two-row control surface.
- Kept identity, six condition values, posture, simulation and speed controls visible.
- Added a real selected-unit movement-profile selector to the game card.
- Added an obvious `Карта стоимости` quick toggle beside the profile selector.
- Moved command, plan, route, profile, cost and reason details into an above-card disclosure panel that does not resize the map.
- Removed the misleading diagnostic-only profile override from the `Вид` menu; base/final cost mode remains there.
- Added exact `navigationProfileId` flow through unit selection, player command and profile resolver, including custom profile IDs.
- Preserved player command identity and target when the selected profile changes.
- Stopped completed, cancelled and failed plans from exposing blue plan stages to the overlay renderer.
- Replaced stacked AI-editor menus with one unified top navigation bar.
- Renamed `Чёрная доска` to `Данные бойца`.
- Moved `Словарь ИИ` and `Инструменты ИИ` into the unified top menu.
- Removed the standalone `Диагностика` tab.
- Completely removed the obsolete `Auto 4–5` button, event binding, handler and stale smoke expectations.
- Repaired the movement-profile layout: no negative sticky offset, no blank strip, independent scrolling and visible heading/fields.
- Moved the route-cost legend below front-zone labels after visual review found an overlap.

## Automated verification

Final transfer-branch head after removing the temporary workflow:

```text
0a3b77bf1d3fe26598c5de430a1021404ab125dc
```

Successful runs on that exact SHA:

- Compact Route Controls Core: `29198411948`;
- Preview Core Checks: `29198411921`;
- Navigation Profiles Core: `29198411929`;
- Command Plan Route Core: `29198411949`;
- Agent Docs Integrity: `29198411928`;
- Preview Policy: `29198415192`.

The verified branch was merged into `real-wargame-preview` as `f99c0b810b06cd326063f94e688004635c3b2466`.

## Visual inspection

The last exact-SHA approved browser run before transfer was `29198043701`.

The focused scenario reported `3/3 passed` using system Chrome. All six PNGs were downloaded and opened:

1. `01-game-compact-route-controls.png` — compact card, in-game profile selector and readable controls.
2. `02-game-cost-overlay-quick-toggle.png` — quick toggle enabled, raster overlay visible, legend clear of front labels.
3. `03-game-completed-route-no-blue-target.png` — route reports completion and no stale blue target remains.
4. `04-editor-unified-navigation.png` — one menu, no blank strip, no Auto 4–5.
5. `05-editor-profile-layout.png` — profile heading and fields are fully visible without overlap.
6. `06-editor-data-and-global-tools.png` — `Данные бойца`, `Словарь ИИ` and `Инструменты ИИ` remain accessible.

## Known limits

- Navigation v1 still has the previously documented zero-valued contracts for enemy-observation exposure, exact known enemy distance and territory route cost.
- Movement-profile state remains in localStorage/JSON and is not yet embedded into scene JSON.
- Group path reservation, flow fields and shared formation corridors are not implemented.
