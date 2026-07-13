# Directional Terrain Enrichment — 2026-07-13

## Branch boundary

Implemented on `tmp/directional-terrain-analysis-20260713` from `real-wargame-preview`. Draft PR #88 is intentionally not merged. `main` and `real-wargame-preview` remain unchanged.

## Product correction

The initial implementation exposed `Направленный рельеф` as a third route-cost map mode. User feedback clarified that directional terrain must enrich existing tactical maps rather than become another normal player layer.

The normal route-cost selector now exposes only:

- base terrain;
- final route cost.

The directional renderer mode remains internal for diagnostics and tests.

## Delivered

- cached typed-array terrain derivatives based on the shared visibility height grid;
- eight-sector subjective threat directions using only the selected soldier's knowledge;
- shared `DirectionalTacticalField` with per-sector protection/exposure and final terrain protection/concealment;
- danger reduction behind reverse slopes for direct-fire threats;
- forward-slope, crest, silhouette and flank penalties in the existing danger/safety calculations;
- reverse-slope, terrain-fold and valley contributions in the existing stealth and cover calculations;
- terrain-enriched explanations in existing cells and best-position cards;
- existing safe-position ranking using the enriched danger, cover and concealment values;
- the same shared field consumed by route cost and deterministic A*;
- no-code profile controls for directional-terrain weights;
- reusable exact terrain/object/forest visibility raycast;
- bounded local queries for reverse-slope, subcrest and hidden-retreat positions.

## Performance decisions

- static geometry rebuilds only on map revision;
- the full-map subjective field is shared by awareness and route systems;
- the cache key uses actual quantized threat content, not a metadata-only knowledge revision;
- origin is bucketed by a whole map cell, so small movement does not rebuild the field;
- all full-map tactical values remain typed arrays;
- awareness rendering remains one raster sprite;
- route rendering remains two persistent raster sprites;
- exact visibility is limited to rough-filtered local candidates and at most three strongest known threats.

## Test infrastructure correction

The first red TDD run revealed that the dedicated workflow piped commands through `tee` without `set -o pipefail`, allowing a failed smoke command to look successful. Every piped step in `Directional Terrain Core` now enables `pipefail`.

Focused tests now prove:

- reverse slopes increase concealment and protection;
- reverse slopes reduce danger and improve safety;
- forward slopes raise exposure and route cost;
- awareness and route systems reuse one shared directional field;
- metadata-only knowledge revisions and movement inside one origin bucket do not rebuild the full map;
- crossing a bucket creates exactly one new field;
- direct-route profile can disable directional cost;
- exact rays and tactical-position searches remain bounded.

## Visual verification

System-Chrome visual QA now checks existing maps:

- `directional-terrain-enriched-danger.png`;
- `directional-terrain-enriched-stealth.png`;
- `directional-terrain-profile-editor.png`.

The inspected screenshots showed no panel overflow or toolbar overlap. The stealth list visibly includes terrain-enriched explanations such as `складка местности + ложбина`. The standalone directional layer is absent from the normal route-cost menu.

## Deferred

- canonical Blackboard keys and generic AI nodes for tactical-position query outputs;
- exact whole-map LOS exposure;
- edge-transition crest crossing penalty;
- squad/group reverse-slope behavior;
- transfer to `real-wargame-preview`.
