# Compact Route Controls and Editor Navigation Design

## Goal

Make the tactical game controls compact and obvious, remove stale route graphics after completion, and replace the AI editor's stacked toolbars with one clear human-facing navigation bar.

## Scope

### Tactical game

- Reduce the selected-soldier bottom bar to a stable compact height.
- Keep identity, six core condition values, posture controls, simulation controls and speed controls visible.
- Add a selected-unit movement-profile selector directly to the bottom bar.
- Add an obvious quick `Карта стоимости` toggle directly to the bottom bar.
- Keep full command, plan, route and cost diagnostics in a popover that opens above the bar and does not change its height.
- Keep base/final cost mode in the `Вид` menu.
- Remove the old diagnostic-only profile selector from `Вид`; the bottom selector controls the real profile used by player commands.

### Route lifecycle

- A player command stores the exact selected navigation profile ID, including custom profiles.
- Changing the selected profile updates the active player command without replacing its ownership identity and permits the existing replan policy to rebuild the route.
- Completed, cancelled or failed plans do not expose blue plan markers to the renderer.
- Active and blocked command information remains available in the diagnostics popover.

### AI editor

- Replace the stacked `AppShellMenu` plus `NavigationProfileEditor` tabs with one unified editor navigation bar.
- Main tabs: `Граф поведения`, `Профили движения`, `Данные бойца`.
- Global actions in the same bar: `Словарь ИИ`, `Инструменты ИИ`, `Обновить`, `Открыть игру`, `Выход`.
- Remove the standalone route `Диагностика` tab. Route explanations remain in documentation and the in-game diagnostics popover.
- Completely remove the obsolete `Auto 4–5` button, handler and test expectations.
- The graph-local toolbar keeps only graph operations: engine status, add node, inspector, validate, evaluate, export, import and reset.
- Fix the profile form layout so its heading starts directly below the unified menu, never overlaps fields and remains readable at 1440×900 and 1920×1080.

## Architecture

### Selected player profile

`UnitModel.playerNavigationProfileId` stores the profile chosen in the game UI. `PlayerCommand.navigationProfileId` freezes the exact profile for an issued command. `NavigationProfileResolver` accepts this explicit ID before the semantic movement mode. This preserves the existing priority model while supporting custom profiles.

Changing the selector updates `playerNavigationProfileId`. If the selected unit has an outstanding player command, `updatePlayerCommandNavigationProfile` keeps the command ID and target, increments its revision and changes only the profile ID/reason. The existing simulation replan path then sees a profile mismatch and applies cooldown/hysteresis rules.

### Compact route UI

`TacticalWorkspace` owns stable DOM slots for:

- profile selector;
- quick cost-overlay toggle;
- one-line route summary;
- a details popover containing command/plan/route/profile/cost/reason rows.

`CommandPlanRouteUi` and `RouteCostOverlayUi` update those existing slots rather than appending rows to `.unit-bar-current`. The popover is absolutely positioned above the bar, so opening it does not resize the map.

### Unified editor navigation

`NavigationProfileEditor` owns the single editor navigation bar and stable global-action slot. Dictionary modules install their buttons into that slot. It calls the shared `openGameTab` and `exitLab` helpers directly. The editor no longer installs a separate `AppShellMenu`, while game and launcher behavior remain unchanged.

### Terminal plan visibility

`CommandPlanRouteOverlayModel` emits plan stages only while `unit.plan.status === 'active'`. This fixes the stale blue target at the model boundary without adding renderer-specific lifecycle state.

## Error handling

- Missing/deleted custom profile IDs fall back to `normal` through the registry/resolver.
- The game selector refreshes when the profile registry changes.
- No selected unit disables the profile selector and displays `—` diagnostics.
- Route controls remain functional if the optional `Вид` panel is unavailable.
- Existing player-command ownership and AI owner tokens are not modified.

## Performance constraints

- No A* call from UI handlers or renderers.
- Profile changes request state updates; replanning remains in the existing simulation route-current check.
- UI refresh remains on the existing 300 ms interval and only updates text/value changes.
- Route-cost raster caches and visibility toggle remain long-lived.
- The compact popover is one persistent DOM subtree, not rebuilt on pointer movement.

## Automated verification

Focused smoke coverage must prove:

1. the obsolete `Auto 4–5` code is absent;
2. the unified editor navigation and global action slot exist;
3. dictionary/tool buttons target the unified slot;
4. no standalone diagnostics tab exists;
5. the bottom bar owns profile/cost/details controls;
6. route status modules update stable slots instead of appending six visible lines;
7. exact profile IDs flow from selected unit to player command and resolver;
8. terminal plans produce no blue plan stages;
9. relevant legacy smokes, production build and documentation checks remain green.

## Visual verification

The approved real-browser scenario captures fresh screenshots from the exact temporary-branch SHA:

1. `01-game-compact-route-controls.png` — compact soldier bar and visible profile/cost controls.
2. `02-game-cost-overlay-quick-toggle.png` — cost layer enabled from the bottom bar.
3. `03-game-completed-route-no-blue-target.png` — completed command with no stale blue target.
4. `04-editor-unified-navigation.png` — one editor menu, no blank strip, no `Auto 4–5`.
5. `05-editor-profile-layout.png` — profile heading and first controls unobscured.
6. `06-editor-data-and-global-tools.png` — `Данные бойца`, `Словарь ИИ` and `Инструменты ИИ` accessible from the unified bar.

Visual success requires Playwright success, matching workflow/artifact SHA and manual inspection of every key PNG.

## Branch boundary

All implementation and QA remain on `tmp/ui-compact-route-controls-20260712`. `real-wargame-preview` and `main` are not modified until a later explicit user instruction.