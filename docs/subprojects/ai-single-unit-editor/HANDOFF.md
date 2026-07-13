# HANDOFF — Directional Terrain Analysis

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

## Implemented

### Cached static terrain geometry

- `DirectionalTerrainStaticGrid` derives slope magnitude, downhill aspect, curvature, crests, valleys and geometric silhouette potential from the existing cached visibility height grid.
- The data uses typed arrays and a `WeakMap<TacticalMap, ...>` cache keyed by map visual revision.
- Camera movement, pointer movement and rendering do not rebuild terrain geometry.

### Subjective eight-sector threat field

- Known threats are preserved as eight directional sectors instead of one averaged arrow.
- Confidence, threat strength, suppression and positional uncertainty control the sector weights.
- Only `UnitTacticalKnowledge` / `TacticalRouteContext.knownThreats` are used; hidden objective enemy state is not read.

### Navigation integration

- Navigation-profile format is now v2 with six editable directional-terrain weights:
  - forward-slope penalty;
  - reverse-slope preference;
  - crest penalty;
  - silhouette penalty;
  - valley preference;
  - critical-sector multiplier.
- Old profile JSON migrates with safe defaults.
- `RouteCostField` has a separate `directionalTerrainCost` channel. Exact verified LOS exposure remains a distinct future/independent channel.
- Existing deterministic A* consumes the new total cost; there is no second pathfinder.
- Route summaries and selected-unit diagnostics include the directional-terrain contribution.

### Diagnostic layer and no-code controls

- Existing two-raster route-cost renderer has a third mode, `Направленный рельеф`.
- Red/orange marks forward slopes, blue marks reverse slopes, yellow marks crest/silhouette risk and purple marks valleys.
- Hover diagnostics explain slope class, directional cost, crest, valley and silhouette values.
- The renderer still owns only two raster sprites plus text; it does not create one Pixi object per cell.
- The AI editor has a dedicated no-code `Направленный рельеф` tab for all six profile parameters.

### Exact local tactical queries

- `VisibilityRaycast` provides a reusable terrain/object/forest ray with visibility, blocker type, transmission and occlusion depth.
- `DirectionalTerrainPositionQuery` searches locally for:
  - best reverse-slope position;
  - best subcrest position;
  - best hidden-retreat position.
- The query scans only a bounded radius, rough-sorts cells, casts exact rays only for the best candidates and caches the final report by map, knowledge, profile, posture and quantized position revisions.
- The query is implemented and covered by focused tests, but it is not yet exposed as new Blackboard schema keys or dedicated AI nodes in this branch.

## Performance contract

- static terrain derivatives: rebuild only after relevant map revision;
- route directional field: rebuild only after profile, map, selected-unit position bucket or knowledge revision changes;
- tactical-position query: selected soldier only, bounded local radius, bounded exact candidates, maximum three strongest threat observers;
- hover: reads ready typed arrays and changes no rebuild counters;
- renderer: persistent two-raster representation;
- A*: runs only on command creation or approved replanning, as before.

## Automated verification

The latest exact branch SHA must be taken from PR #88 after documentation commits. The following pull-request workflows were green before this handoff update and must be rechecked on the final SHA:

```text
Directional Terrain Core
Navigation Profiles Core
Command Plan Route Core
AI Events Core
Compact Route Controls Core
Preview Core Checks
Agent Docs Integrity
Preview Policy
```

The focused directional suite covers:

- flat and ramp terrain;
- threat-direction reversal;
- multiple threat sectors;
- uncertainty attenuation;
- profile v1 → v2 migration;
- direct-profile zero contribution;
- static/dynamic cache separation;
- exact terrain visibility;
- bounded tactical-position search;
- tactical-query cache hits without new rays;
- two-raster directional renderer contract.

## Visual verification

Prepared browser scenario:

```text
tests/directional-terrain-visual.spec.ts
```

Prepared screenshots:

```text
directional-terrain-layer.png
directional-terrain-profile-editor.png
```

The scenario is included in the manual `Preview screenshots` workflow. At the time of this handoff it has not been dispatched through GitHub Actions, so no browser or PNG success is claimed yet.

## Honest limits

- exact LOS is used by the local tactical-position query, not yet by the whole-map route `exposureCost` channel;
- new tactical positions are not yet published into the canonical Blackboard schema;
- there is no group/squad reverse-slope behavior;
- silhouette analysis is geometric, not a full sky/background image test;
- crest crossing is currently represented by cell cost, not a separate edge-transition penalty;
- the branch has not been transferred to preview.

## Recommended continuation

1. Run and inspect the manual screenshot workflow on the exact branch SHA.
2. Fix any visual or interaction issues found in the two new screenshots.
3. Add canonical Blackboard keys and a universal tactical-position query node only after the browser layer is accepted.
4. Add edge-transition crest-crossing cost as a separate small pathfinding slice.
5. Transfer to `real-wargame-preview` only after an explicit user command.
