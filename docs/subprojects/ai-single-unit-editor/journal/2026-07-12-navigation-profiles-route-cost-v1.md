# 2026-07-12 — Navigation Profiles and Route Cost v1

## Branch boundary

Implementation branch:

```text
tmp/navigation-profiles-route-cost-20260712
```

Base branch and exact starting commit:

```text
real-wargame-preview
dc46706ade1af4c60ab6e2ca82f8b83c95f1da27
```

Neither `main` nor `real-wargame-preview` was modified. A draft PR was used only as an isolated non-visual CI channel and must not be merged.

## Implemented vertical slice

- Added a versioned persistent `NavigationProfileRegistry` with seven built-in profiles: normal, fast, stealth, attack, cautious, retreat and direct.
- Added custom profile creation, copy, rename, reset, delete, JSON import/export and migration of partial legacy-like data.
- Kept profile settings outside behavior graphs. Nodes and commands may provide only a semantic movement mode.
- Added one active-profile resolver with priority: debug override, player command, behavior mode, unit role, normal.
- Split route cost into revision-cached static and soldier-relative dynamic fields stored in typed arrays.
- Implemented terrain, forest density, bridge, ditch, slope, hard passability, known threat memory and forest/ditch concealment adjustment.
- Kept exposure, exact known enemy distance and territory as explicit unavailable zero-valued contracts until truthful soldier-relative data exists.
- Extended deterministic A* with profile input, route-level cost breakdown, total cost, length, visited-cell count, bilingual reason and profile metadata.
- Added a cached shortest-passable `direct` baseline and deterministic fallback when the tactical route exceeds `maximumDetourRatio`.
- Added controlled replanning for blockage, profile id/revision changes and sufficiently large knowledge revisions, with cooldown and hysteresis.
- Preserved `playerCommandId` and AI `ownerToken` across replacement routes.
- Added a separate AI-editor tab for movement profiles with Russian default UI, draft editing, sliders, exact inputs, ranges, defaults and warnings.
- Added an independent route-cost map layer with static/final modes, two persistent raster textures, stable bands, impassable hatching, legend, hover reasons and selected-unit route summary.
- Added performance counters and a renderer contract that forbids A* imports.
- Prepared a dedicated Playwright visual QA scenario but did not run it because user approval is required first.

## Test-driven evidence

The first focused workflow run failed at the new navigation-profile smoke because the new modules did not yet exist. After implementation and targeted corrections, focused non-visual run `29193785588` passed:

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

The only failure in that run was expected stale generated documentation after changing `subproject.json`; source, tests and production build were green.

Performance contract evidence from smoke tests:

- two hover reads increase `hoverReadCount` by two;
- hover does not increase `staticCostBuildCount` or `dynamicCostBuildCount`;
- the same map/profile/knowledge revisions reuse the exact cached field object;
- a knowledge revision rebuilds only the dynamic field;
- two different map objects cannot share one cache entry merely because numeric revisions match;
- disabling the layer hides the persistent container and does not destroy/recreate canvas, texture or sprite resources;
- renderer source contains no `GridPathfinder`, `findGridPath` or `runAStar` dependency.

## Honest limits

- Exposure to enemy observation, exact soldier-known enemy distance and friendly/neutral/enemy territory cost are not simulated yet.
- Version 1 chooses the shortest passable baseline when the preferred route exceeds the detour limit; it does not yet run a multi-objective compromise search.
- Player movement commands default to `normal`; the game provides a diagnostic profile override and the runtime supports semantic movement modes.
- Profile persistence currently uses localStorage and JSON rather than scene JSON.
- Visual QA is prepared but not run, and no screenshots have been inspected for this branch.
