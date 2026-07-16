# Environment Material Profiles and Chunked Vegetation Raster v1

## Status

This contract is implemented on draft PR #130 from exact preview base `4adb42650f0fb6ad61b31f9521cec4508a5a40ec`. It extends the accepted shared visibility and vegetation foundation without making rendering authoritative.

## Source-of-truth boundary

A normalized map cell has canonical material references:

```text
surfaceMaterialId
vegetationMaterialId
```

The compatibility fields `terrain` and `forest` remain derived projections while old scenes are migrated. They are not a second independent source of physical properties.

```text
legacy terrain / forest: 0 | 1 | 2
              ↓ normalization
surfaceMaterialId + vegetationMaterialId
              ↓
immutable EnvironmentMaterialProfile snapshot
       ↙ gameplay                     ↘ presentation
visibility / fire / movement        chunked vegetation raster
```

Simulation never samples canvas pixels, texture colors, procedural noise or Pixi display objects. The renderer reads the same active profile but only its `presentation` group.

## Registry and runtime

`EnvironmentMaterialProfile.ts` owns versioned surface and vegetation definitions. Browser persistence is isolated in `src/ui/EnvironmentProfileStorage.ts`; core consumers read an immutable snapshot from `EnvironmentProfileRuntime.ts` and never import DOM or localStorage APIs.

The built-in profile defines:

- surfaces: field, road, rough ground, swamp and water;
- vegetation: none, sparse forest and dense forest.

The visible **Профили местности** workbench supports selecting, copying, renaming, resetting, importing, exporting and deleting custom profiles. Russian material names are editable without exposing technical IDs. Every numeric field is clamped by the registry. A broken or old storage payload falls back to the built-in profile.

## Revision domains

Each profile carries independent revisions:

- `presentation` — colors, texture identifiers, coverage, opacity, scale, noise and edge softness;
- `visibility` — visual transmission and concealment;
- `fire` — fire transmission and vegetation protection;
- `movement` — passability, physical resistance and tactical concealment.

Every cache key includes the active profile ID and a stable hash of the relevant material-domain content. Switching profiles or importing changed values with unchanged external revision numbers therefore still invalidates the correct data.

Expected invalidation:

```text
presentation edit → surface/vegetation renderer only
visibility edit   → visual geometry/perception only
fire edit         → line-of-fire/danger geometry only
movement edit     → navigation and route costs only
```

Route calculation keeps physical material resistance separate from tactical movement-profile preference. The existing navigation profile value is interpreted as a tactical delta from the built-in physical baseline, so default routes remain compatible while a changed surface or vegetation resistance still changes the actual route cost.

## Continuous vegetation renderer

`VegetationChunkRaster` replaces the old ellipse-and-dot drawing loop. It:

- divides the map into 32 × 32-cell chunks;
- stores one long-lived canvas texture and Sprite per chunk;
- evaluates a continuous material mask with deterministic procedural variation;
- smooths occupancy across neighboring cells and chunk borders;
- updates only chunks intersecting the map dirty region;
- reuses the Texture identity and refreshes only its source;
- creates no Pixi display object for each cell or tree.

A global presentation edit rebuilds the vegetation layer once. A single-cell edit rebuilds only the intersecting chunk and the minimal border-neighbor set needed for edge continuity.

The raster exposes bounded chunk lifecycle diagnostics for focused tests and future profiling, but performance attribution and browser-stall investigation are intentionally outside this PR.

## Compatibility

Normalization maps legacy data as follows:

```text
forest 0 → vegetationMaterialId: none
forest 1 → vegetationMaterialId: sparse_forest
forest 2 → vegetationMaterialId: dense_forest
terrain: forest with no explicit forest layer → sparse_forest
```

Scene export writes canonical surface and vegetation material maps and retains `forestMap` for older readers. The awareness worker receives the active immutable profile plus compact `Uint16` material-code rasters; it no longer reconstructs gameplay from legacy terrain/forest codes or silently falls back to built-in values.

Observer-only movement verification compares the remembered world-space threat position (`x/y`). Observer-relative bearing and range may legitimately change as the observer follows a material-aware route; they are excluded from the canonical unit-threat worker key and must not trigger a world-raster rebuild.

## Verification

Focused contracts:

```text
npm run environment-materials:smoke
npm run environment-material-migration:smoke
npm run environment-profile-revisions:smoke
npm run vegetation-chunk-raster:smoke
```

`tests/environment-materials-visual.spec.ts` is prepared under `test.skip` according to the visual-QA policy. Its expected PNG set covers sparse/dense forest at zoom 0.7, 1.0 and 1.3, danger overlay on/off, live coverage/opacity edits and the visible profile editor. It must not run without explicit user approval.
