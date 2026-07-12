# HANDOFF — Navigation Profiles and Route Cost v1

Updated: 2026-07-12  
Repository: `AndrewVerhoturov1/Real-wargame`  
Working branch: `real-wargame-preview`  
Merged PR: `#63`  
Preview merge commit: `1477d378d0c2c11fb3b50ab3e846a69f43ae41af`

## Current state

Navigation Profiles and Route Cost v1 are now integrated into `real-wargame-preview`. `main` was not modified.

Implemented:

- persistent bilingual navigation profiles with seven built-in modes and user profiles;
- no-code profile editor with copy, rename, reset, delete, import and export;
- one active-profile resolver for player orders, AI behavior modes, unit roles and debug override;
- profile-aware deterministic A* with terrain, slope, concealment and subjective known-danger costs;
- cached shortest-passable baseline and `maximumDetourRatio`;
- controlled replanning on blockage, profile changes and meaningful knowledge changes;
- persistent two-raster Pixi route-cost overlay with stable bands, legend and hover breakdown;
- route diagnostics: active profile, total cost, length, detour, cost components and replan reason;
- focused smoke tests, regression coverage and a prepared Playwright scenario.

## Verification recorded before transfer

The isolated source head passed:

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

The merge itself is `1477d378d0c2c11fb3b50ab3e846a69f43ae41af`. Run and inspect post-merge checks before claiming browser verification.

## Honest prepared-only factors

These contracts and UI controls exist, but their current route-cost contribution is zero because the required subjective data is not implemented yet:

- enemy-observation exposure;
- exact soldier-known enemy distance;
- friendly / neutral / enemy territory cost.

## Manual verification

1. Launch `Run-Real-Wargame-Lab.bat`.
2. Open the AI editor and verify the `Профили движения` panel.
3. Copy a built-in profile, edit it, save it, reload the page and confirm persistence.
4. Export the profile JSON, import it back and confirm the names and values survive.
5. In the game select a soldier, issue the same destination with `normal`, `fast`, `stealth` and `retreat`.
6. Confirm routes visibly differ where forest, road, swamp, slope or a known threat makes a meaningful alternative.
7. Enable `Стоимость маршрута`, switch between base terrain and final cost, inspect the legend and hover breakdown.
8. Confirm route lines remain visible above the cost layer.
9. Change the active profile while a route is running and confirm one controlled replan occurs without losing the player command.
10. Move or change a known threat and confirm replanning respects cooldown and does not oscillate.
11. Toggle the cost layer repeatedly; verify the map does not freeze and the layer returns instantly.
12. Pan, zoom and move the cursor over the layer; watch for stutter.
13. Confirm blocked water and blocking objects remain impassable regardless of profile weights.
14. Confirm Russian text is the default and no raw technical keys are required for normal editing.

## Known limits

- exposure, exact known enemy distance and territory do not yet affect route cost;
- detour overflow falls back to the shortest passable baseline rather than a separate compromise search;
- profiles are stored in localStorage / profile JSON, not scene JSON;
- there is no cell reservation, group corridor or flow field;
- visual QA and PNG inspection have not yet been run after the merge.

## Next development direction

After manual verification, continue with the already prepared `Soldier Perception and Attention v1` plan. Do not mix perception implementation with route-cost bug fixes found during manual verification.
