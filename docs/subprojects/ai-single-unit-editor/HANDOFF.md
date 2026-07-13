# HANDOFF — Directional Terrain Enrichment

Updated: 2026-07-13  
Repository: `AndrewVerhoturov1/Real-wargame`  
Base branch: `real-wargame-preview`  
Temporary branch: `tmp/directional-terrain-analysis-20260713`  
Draft PR: `#88`

## Transfer boundary

- Work remains isolated on the temporary branch.
- Do not merge PR #88 or move the commits to `real-wargame-preview` without an explicit user command.
- Do not modify `main`.
- The branch is based on preview commit `15d02aae194b6e4b749e076249db1fa032c0d3e1`.

## Final product decision

Directional terrain is **not** a new normal player-facing map layer. It is a shared tactical input that enriches the existing layers and systems:

- danger;
- stealth/concealment;
- cover/protection;
- safe-position ranking;
- route cost and A*;
- local reverse-slope, subcrest and hidden-retreat queries.

The old `directionalTerrain` renderer mode remains available only as an internal diagnostic. The normal route-cost menu exposes only base terrain and final cost.

## Implemented

### Cached static terrain geometry

- `DirectionalTerrainStaticGrid` derives slope magnitude, downhill aspect, curvature, crests, valleys and geometric silhouette potential from the existing cached visibility height grid.
- Data is stored in typed arrays and cached by map visual revision.
- Camera movement, pointer movement and rendering do not rebuild static geometry.

### Shared subjective tactical field

- `DirectionalTacticalField` combines the static terrain derivatives with the selected soldier's known threats.
- Threats remain distributed over eight sectors rather than being collapsed into one average direction.
- The shared field provides typed arrays for:
  - forward-slope risk;
  - reverse-slope protection;
  - crest risk;
  - valley protection;
  - silhouette risk;
  - primary and flank exposure;
  - final terrain protection;
  - final terrain concealment;
  - per-sector protection and exposure.
- Only `UnitTacticalKnowledge` / `TacticalRouteContext.knownThreats` are used. Hidden objective enemy state is not read.

### Existing danger layer

- Every known threat evaluates terrain protection from the actual bearing between that threat and the tested cell.
- Reverse slopes reduce direct-fire danger and suppression.
- Forward slopes, crests and silhouette exposure raise vulnerability.
- Area threats receive a deliberately weaker directional-terrain reduction than direct fire.
- Multiple directions remain separate, so cover from the main threat can still be weakened by an exposed flank.

### Existing stealth and cover layers

- Forest, objects and posture remain the base concealment/protection sources.
- Directional terrain is combined with those values rather than replacing them.
- Reverse slopes, folds and valleys improve concealment and protection against known directions.
- Crest and silhouette risk reduce the tactical value of exposed high ground.
- Cell explanations can report `обратный склон`, `складка рельефа`, `ложбина` or `гребень и риск силуэта` and combine them with forest/object sources.

### Existing safe-position search

- `buildBestSafePositions` consumes the enriched safety, danger, cover and concealment values.
- The existing danger/cover and stealth lists therefore rank reverse slopes and terrain folds without a second position system.

### Navigation integration

- Navigation-profile format is v2 with editable weights for forward slope, reverse slope, crest, silhouette, valley and critical sectors.
- `RouteCostField` consumes the same shared directional tactical field as the awareness maps.
- Existing deterministic A* consumes the enriched total cost; there is no second pathfinder.
- Route summaries describe the contribution as `учёт рельефа`.

### Exact local tactical queries

- `VisibilityRaycast` provides terrain/object/forest rays with blocker type, transmission and occlusion depth.
- `DirectionalTerrainPositionQuery` performs bounded local searches for reverse-slope, subcrest and hidden-retreat positions.
- Only rough-filtered top candidates receive exact rays, with at most three strongest known threat observers.
- These query results are implemented and tested but are not yet published as canonical Blackboard keys or dedicated AI nodes.

## Performance contract

- static derivatives rebuild only after relevant map revision changes;
- the shared full-map directional field is reused by awareness and route systems;
- a metadata-only knowledge revision does not invalidate the field when threat content is unchanged;
- small movement inside the same whole-cell origin bucket does not rebuild the field;
- crossing an origin bucket creates at most one new field;
- field values are typed arrays, not per-cell Pixi objects;
- cursor hover only reads cached arrays;
- rendering of awareness maps remains one raster sprite;
- route rendering remains two persistent raster sprites;
- local exact visibility remains bounded and is not run for every map cell.

## Automated verification

Final exact verified branch SHA:

```text
f2e2bd5a15fa4e98856fbb1a1f57997e659e68a3
```

All pull-request workflows passed on that SHA:

```text
Directional Terrain Core
Navigation Profiles Core
Command Plan Route Core
AI Events Core
Compact Route Controls Core
Preview Core Checks
Agent Docs Integrity
Preview Policy
Directional Terrain Visual QA
```

The focused tests cover:

- flat, ramp, hill, crest and valley geometry;
- threat-direction reversal and eight-sector preservation;
- uncertainty attenuation;
- profile v1 → v2 migration;
- reverse-slope concealment/protection gains;
- forward-slope and silhouette penalties;
- lower danger and higher safety behind reverse slopes;
- shared cache reuse between awareness and route systems;
- movement-stable and metadata-revision-stable full-map caching;
- direct-profile zero directional contribution;
- exact terrain visibility;
- bounded tactical-position search;
- raster renderer and hidden-diagnostic UI contracts.

The `Directional Terrain Core` workflow uses `set -o pipefail` for every piped check, so a failed command can no longer be hidden by `tee`.

## Visual verification

System Chrome run `29240167647` verified the exact final SHA through the real Vite application. Production build and Playwright passed.

Inspected screenshots:

```text
directional-terrain-enriched-danger.png
directional-terrain-enriched-stealth.png
directional-terrain-profile-editor.png
```

The stealth screenshot shows terrain-enriched explanations such as `складка местности + ложбина`. The normal route-cost selector contains only two modes and does not expose `Направленный рельеф`. No panel overflow, toolbar overlap or raster-object growth was found.

## Honest limits

- exact LOS is used by bounded local tactical-position queries, not by every whole-map danger cell;
- tactical-position query outputs are not yet canonical Blackboard keys or AI nodes;
- silhouette analysis is geometric rather than a full sky/background image test;
- crest crossing is currently represented by cell cost, not a separate edge-transition penalty;
- squad/group reverse-slope behavior is not implemented;
- the branch has not been transferred to preview.

## Recommended continuation

1. Publish the three tactical-position query outputs into the Blackboard through one generic terrain-evaluation bridge.
2. Let existing threshold, score and move-to-position nodes consume those values instead of adding many specialized nodes.
3. Add edge-transition crest-crossing cost as a small separate pathfinding slice.
4. Transfer to `real-wargame-preview` only after an explicit user command.
