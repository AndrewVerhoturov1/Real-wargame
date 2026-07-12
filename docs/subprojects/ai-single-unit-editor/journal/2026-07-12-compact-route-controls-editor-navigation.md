# 2026-07-12 — Compact Route Controls and Editor Navigation

## Branch boundary

Work was completed only on:

```text
tmp/ui-compact-route-controls-20260712
```

Starting preview commit:

```text
61d3b04f886a4f206677617a0ebb23ec7d689e7f
```

Draft PR #65 is an isolated `DO NOT MERGE` CI and visual-QA channel. Neither `real-wargame-preview` nor `main` was modified.

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

Verified product commit:

```text
93268bb6a89db8a2508f2d8576d955c0b15fe89f
```

Successful runs on that exact SHA:

- Compact Route Controls Core: `29197827160`;
- Preview Core Checks: `29197827195`;
- Navigation Profiles Core: `29197827184`;
- Command Plan Route Core: `29197827209`;
- Agent Docs Integrity: `29197827158`;
- Preview Policy: `29197827154`;
- Temporary Compact UI Visual QA: `29197827165`.

The focused browser scenario reported `3/3 passed` using system Chrome.

Canonical generated documentation and the subproject journal were then synchronized in commit:

```text
31f47383b2281fc51f0edefa7e785b37c8ba68ad
```

The final documentation-only head must repeat all checks and the approved screenshot scenario before the temporary PR is closed.

## Visual inspection

The workflow and both artifacts identify the exact product head SHA `93268bb6a89db8a2508f2d8576d955c0b15fe89f`.

All six PNGs were downloaded and opened:

1. `01-game-compact-route-controls.png` — compact card, in-game profile selector and readable controls.
2. `02-game-cost-overlay-quick-toggle.png` — quick toggle enabled, raster overlay visible, legend clear of front labels.
3. `03-game-completed-route-no-blue-target.png` — route reports completion and no stale blue target remains.
4. `04-editor-unified-navigation.png` — one menu, no blank strip, no Auto 4–5.
5. `05-editor-profile-layout.png` — profile heading and fields are fully visible without overlap.
6. `06-editor-data-and-global-tools.png` — `Данные бойца`, `Словарь ИИ` and `Инструменты ИИ` remain accessible.

## Known limits

- This work is not transferred to `real-wargame-preview`.
- The branch-only workflow `.github/workflows/tmp-ui-compact-visual-qa.yml` must be removed before a later transfer.
- Navigation v1 still has the previously documented zero-valued contracts for enemy-observation exposure, exact known enemy distance and territory route cost.
