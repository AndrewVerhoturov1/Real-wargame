# 2026-07-12 — Navigation Profiles and Route Cost v1

## Development history

The feature was implemented and verified first on the isolated branch:

```text
tmp/navigation-profiles-route-cost-20260712
```

Starting preview commit:

```text
dc46706ade1af4c60ab6e2ca82f8b83c95f1da27
```

Verified isolated source head:

```text
3a4a185999f287ebdafd600a88d11d7b4760af27
```

## Transfer to preview

By explicit user instruction, PR #63 was reopened and merged into `real-wargame-preview`.

Preview merge commit:

```text
1477d378d0c2c11fb3b50ab3e846a69f43ae41af
```

The two newer preview commits contained only the Soldier Perception and Attention design and implementation-plan documents, so both bodies of work were preserved. `main` was not modified.

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

Final isolated-branch checks passed:

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
docs:check
Preview Core Checks
Agent Docs Integrity
Preview Policy
```

Performance contract evidence:

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
- Visual QA is prepared but has not been run after the preview merge.
