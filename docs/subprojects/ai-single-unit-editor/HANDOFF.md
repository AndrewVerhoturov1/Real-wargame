# HANDOFF — Navigation Profiles and Route Cost v1

Updated: 2026-07-12  
Repository: `AndrewVerhoturov1/Real-wargame`  
Base branch: `real-wargame-preview`  
Temporary implementation branch: `tmp/navigation-profiles-route-cost-20260712`

## Transfer boundary

- Base SHA: `dc46706ade1af4c60ab6e2ca82f8b83c95f1da27`.
- Verified source SHA: `a818afa65b8cc0086c3360d27002b023e6848650`.
- Do not merge the temporary draft PR.
- Do not modify `main`.
- Do not transfer to `real-wargame-preview` until the user explicitly orders it.
- Visual QA is prepared but must not run before explicit user approval.

## Implemented

- persistent versioned navigation profile registry with seven built-ins and custom CRUD/import/export;
- Russian-default no-code profile editor outside the node canvas;
- one active-profile resolver for debug, player command, behavior mode, unit role and default;
- profile-aware deterministic A* with bilingual route reason, cost breakdown, distance and detour metadata;
- cached shortest-passable baseline and `maximumDetourRatio` enforcement;
- static typed-array cost cache keyed by map/profile revisions;
- dynamic typed-array cost cache based only on the selected soldier’s known threats;
- controlled blockage/profile/danger replanning with cooldown, revision gates and hysteresis;
- persistent two-raster Pixi route-cost overlay, stable cost bands, impassable hatch, legend and hover breakdown;
- selected-unit profile/cost/length/detour/replan diagnostics;
- focused smoke tests and prepared Playwright scenario.

## Honest prepared-only factors

- enemy-observation exposure;
- exact soldier-known enemy distance;
- friendly/neutral/enemy territory route cost.

Their contracts and UI controls exist, but their contribution remains zero and the hover tooltip explicitly says data is unavailable.

## Verification

Focused run `29193785588` passed:

```text
navigation-profiles:smoke
navigation-profile-switch:smoke
navigation-overlay:smoke
pathfinding:smoke
routed-move:smoke
runtime:smoke
route-status:smoke
move-bridge:smoke
command-plan-route:smoke
map-revision:smoke
production build
```

Documentation was then synchronized from `subproject.json` and must receive a final `docs:check` on the final branch SHA.

## Read first

1. `docs/subprojects/ai-single-unit-editor/STATUS.md`
2. `docs/subprojects/ai-single-unit-editor/NAVIGATION_PROFILES_V1.md`
3. `docs/subprojects/ai-single-unit-editor/TACTICAL_ROUTE_COST_V1.md`
4. `docs/subprojects/ai-single-unit-editor/ROUTE_COST_OVERLAY_V1.md`
5. `src/core/navigation/NavigationProfiles.ts`
6. `src/core/navigation/RouteCostField.ts`
7. `src/core/pathfinding/GridPathfinder.ts`
8. `src/core/navigation/NavigationRouteReplanner.ts`
9. `src/rendering/PixiRouteCostOverlayRenderer.ts`
10. `.agents/skills/real-wargame-local-preview/SKILL.md` before visual QA

## Next action

After all final non-visual checks are green, ask the user:

> Визуальная проверка подготовлена. Запустить её сейчас?

Do not run or claim screenshots before that approval.
