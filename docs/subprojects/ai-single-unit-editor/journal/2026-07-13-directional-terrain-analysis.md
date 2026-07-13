# Directional Terrain Analysis — 2026-07-13

## Branch boundary

Implemented on `tmp/directional-terrain-analysis-20260713` from `real-wargame-preview`. Draft PR #88 is intentionally not merged. `main` and `real-wargame-preview` remain unchanged.

## Delivered

- cached typed-array terrain derivatives based on the shared visibility height grid;
- eight-sector subjective threat directions with confidence and uncertainty attenuation;
- versioned navigation-profile weights for forward/reverse slopes, crests, silhouette risk, valleys and critical sectors;
- directional terrain as a separate route-cost channel consumed by the existing deterministic A*;
- route diagnostics and a third two-raster overlay mode named `Направленный рельеф`;
- no-code directional-terrain profile controls;
- reusable exact terrain/object/forest visibility raycast;
- cached bounded local queries for reverse-slope, subcrest and hidden-retreat positions;
- focused smoke, migration, cache, pathfinding, renderer-contract and production-build coverage;
- prepared Playwright visual scenarios for the game layer and editor panel.

## Performance decisions

- static derivatives rebuild only on map revision;
- subjective route fields rebuild only on knowledge/profile/map/origin-bucket changes;
- tactical-position search is local and selected-unit scoped;
- only top candidates receive exact raycasts;
- a maximum of three strongest known threat observers participate in exact candidate checks;
- hover reads ready arrays and does not rebuild;
- rendering remains two raster sprites rather than per-cell display objects.

## Knowledge boundary

Only the selected soldier's tactical knowledge is used. The system does not inspect hidden objective enemy positions. Directional route cost and exact local visibility remain separate from unrestricted world state.

## Verification state

Pull-request checks passed on implementation commits, including the dedicated Directional Terrain Core workflow, route/profile regressions, production TypeScript build, documentation integrity and preview policy. Final exact-SHA checks must be read again after documentation commits before any completion claim.

The manual browser workflow contains `tests/directional-terrain-visual.spec.ts`, but it has not yet been dispatched; no PNG inspection is claimed.

## Deferred

- canonical Blackboard keys and AI authoring nodes for the three tactical positions;
- exact whole-map LOS exposure cost;
- edge-transition crest crossing penalty;
- squad/group reverse-slope behavior;
- transfer to `real-wargame-preview`.
