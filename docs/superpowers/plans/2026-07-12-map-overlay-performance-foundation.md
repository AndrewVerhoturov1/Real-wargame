# Map and Overlay Performance Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove current map/overlay stalls without changing visual quality or the current 10-metre grid, and leave the code ready for a later 2-metre grid migration.

**Architecture:** Add explicit map revisions and dirty regions, replace full-content cache fingerprints with constant-time revision checks, introduce a uniform spatial index and a shared line-of-sight probe cache, then reuse long-lived renderer objects and cull HTML labels to the visible world. Preserve current JSON and PixiJS 7 behaviour.

**Tech Stack:** TypeScript 5, PixiJS 7.4, Vite 5, Playwright, Node smoke scripts.

## Global Constraints

- Work only on `perf/map-overlay-foundation-2026-07-12`.
- Do not change `real-wargame-preview` or `main`.
- Keep `metersPerCell = 10` and the current map dimensions.
- Do not reduce texture resolution, antialiasing or visual detail.
- Do not add PixiJS 8 APIs or runtime dependencies.
- Canonical development language is English; Russian remains the complete default UI language.
- Existing JSON map files must remain compatible.

---

### Task 1: Map revisions and dirty regions

**Files:**
- Modify: `src/core/map/MapModel.ts`
- Modify: `src/core/map/MapPaint.ts`
- Create: `scripts/map_revision_smoke.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `MapRevisionState`, `MapDirtyState`, `markMapCellsDirty`, `markMapObjectsDirty`, `getMapRevisionSnapshot`, `consumeMapDirtyRegion`.

- [ ] Write a smoke test that verifies independent revision increments, dirty-region merging and clean consumption.
- [ ] Run `npm run map-revision:smoke` and confirm it fails because the new API does not exist.
- [ ] Add runtime-only revisions and dirty regions to normalized maps.
- [ ] Route height/forest clear and paint mutations through the invalidation helpers.
- [ ] Run `npm run map-revision:smoke`, `npm run game-editor:smoke`, and `npm run build`.
- [ ] Commit as `perf(map): add explicit revisions and dirty regions`.

### Task 2: Constant-time smooth-height cache

**Files:**
- Modify: `src/core/terrain/SmoothTerrain.ts`
- Create: `scripts/smooth_terrain_cache_smoke.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `map.revisions.height`, height dirty regions.
- Produces: flat cached height field and diagnostics exposed through `getSmoothTerrainDiagnostics`.

- [ ] Write tests for cache hits, revision invalidation and incremental/full rebuild equivalence.
- [ ] Confirm the tests fail against the old string-key cache.
- [ ] Replace `number[][]` plus full-cell key creation with `Float32Array` plus height revision.
- [ ] Rebuild only the dirty region expanded by the smoothing radius; use full rebuild after map normalization or ambiguous invalidation.
- [ ] Run focused smoke tests and production build.
- [ ] Commit as `perf(terrain): make smooth-height cache revision driven`.

### Task 3: Remove full-map renderer fingerprints

**Files:**
- Modify: `src/rendering/PixiApp.ts`
- Modify: `src/rendering/PixiOverlayRenderer.ts`
- Modify: `src/rendering/PixiMapRenderer.ts`
- Modify: `tests/camera-grid-performance.spec.ts`

**Interfaces:**
- Consumes: map revision snapshot.
- Produces: overlay diagnostics with full-scan and rebuild counters.

- [ ] Extend the Playwright performance test to assert zero full-map fingerprint scans during pointer and camera bursts.
- [ ] Replace terrain, relief and probe keys that join all cells/objects with revision fields.
- [ ] Keep pointer interaction keys limited to the hovered cell and selection rectangle.
- [ ] Reuse disabled overlay containers through `visible` where safe.
- [ ] Run Playwright performance scenario and build.
- [ ] Commit as `perf(render): remove full-map frame fingerprints`.

### Task 4: Uniform map-object spatial index

**Files:**
- Create: `src/core/spatial/MapObjectSpatialIndex.ts`
- Create: `scripts/map_object_spatial_index_smoke.mjs`
- Modify: `src/core/map/MapModel.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `getMapObjectSpatialIndex(map)`, `queryPoint`, `queryRect`, `queryCircle`, `querySegment`.

- [ ] Write tests for rotated-object conservative bounds, movement invalidation, deletion and segment queries.
- [ ] Verify test failure before implementation.
- [ ] Implement a fixed-bucket uniform index with lazy revision-based rebuild.
- [ ] Store no serialized index data in JSON.
- [ ] Run smoke tests and build.
- [ ] Commit as `perf(spatial): index map objects by uniform buckets`.

### Task 5: Shared cached line-of-sight probe

**Files:**
- Create: `src/core/visibility/VisibilityProbeService.ts`
- Modify: `src/core/visibility/LineOfSight.ts`
- Modify: `src/rendering/PixiOverlayRenderer.ts`
- Modify: `src/rendering/HtmlOverlayRenderer.ts`
- Create: `scripts/visibility_probe_cache_smoke.mjs`
- Modify: `package.json`
- Modify: `tests/camera-grid-performance.spec.ts`

**Interfaces:**
- Produces: `getVisibilityProbeResult(state)` and diagnostics for calculation/cache-hit counts.

- [ ] Write tests showing identical inputs calculate once and revision/target/posture changes invalidate.
- [ ] Replace per-ray-sample full object iteration with spatial-index candidates.
- [ ] Make Pixi and HTML overlays consume one shared result.
- [ ] Add Playwright assertion that one probe state produces one calculation.
- [ ] Run focused tests and build.
- [ ] Commit as `perf(visibility): share and index line-of-sight probes`.

### Task 6: Awareness static-field separation and typed storage

**Files:**
- Modify: `src/core/knowledge/SoldierAwarenessGrid.ts`
- Create: `src/core/knowledge/AwarenessStaticField.ts`
- Create: `scripts/awareness_field_cache_smoke.mjs`
- Modify: `package.json`
- Modify: `src/rendering/PixiAwarenessHeatmapRenderer.ts`

**Interfaces:**
- Produces: revision-keyed static protection/concealment field and typed numeric awareness arrays.

- [ ] Write tests proving movement does not rebuild the static field, object/terrain changes do, and output values remain equivalent.
- [ ] Build static protection from spatial-index candidates instead of every object.
- [ ] Store numeric fields in typed arrays and materialize cell objects only for renderer/export boundaries.
- [ ] Ensure raster texture rebuild remains event-driven.
- [ ] Run smoke tests, awareness Playwright screenshots and build.
- [ ] Commit as `perf(awareness): separate static field from threat updates`.

### Task 7: Persistent unit and object views

**Files:**
- Modify: `src/rendering/PixiUnitRenderer.ts`
- Modify: `src/rendering/PixiObjectRenderer.ts` or the current map-object owner
- Modify: `src/rendering/PixiOverlayRenderer.ts`
- Modify: `tests/camera-grid-performance.spec.ts`

**Interfaces:**
- Produces: id-keyed long-lived display views with creation/removal diagnostics.

- [ ] Add diagnostics assertions that unchanged frames create/destroy no unit/object views.
- [ ] Replace per-frame unit container rebuilds with `Map<UnitId, UnitView>` updates.
- [ ] Update object views individually by object revision/id.
- [ ] Keep current visual geometry and layering.
- [ ] Run visual Playwright suite and build.
- [ ] Commit as `perf(render): reuse unit and object display views`.

### Task 8: Visible-area HTML overlay culling

**Files:**
- Modify: `src/rendering/HtmlOverlayRenderer.ts`
- Modify: `src/rendering/PixiApp.ts`
- Modify: `tests/camera-grid-performance.spec.ts`

**Interfaces:**
- Consumes: current camera/world viewport bounds and zoom.
- Produces: bounded visible label diagnostics.

- [ ] Add Playwright assertions for maximum visible height-label count and no offscreen labels.
- [ ] Pass visible world bounds to the HTML renderer.
- [ ] Iterate only intersecting cell ranges; hide height labels below a zoom threshold and cap active DOM labels.
- [ ] Preserve selected unit, speech and visibility labels regardless of terrain-label culling.
- [ ] Run visual tests and build.
- [ ] Commit as `perf(html): cull map labels to the visible viewport`.

### Task 9: Expanded performance diagnostics

**Files:**
- Modify: `src/core/debug/PerformanceMonitor.ts`
- Modify: `src/rendering/PixiApp.ts`
- Modify: `tests/camera-grid-performance.spec.ts`
- Modify: `docs/manual-test/PREVIEW_SCREENSHOTS.md`

**Interfaces:**
- Produces: per-subsystem timing samples and revision/rebuild counters in exported reports.

- [ ] Extend test-side diagnostic types first.
- [ ] Record map, overlay, awareness, LOS, HTML and unit update timings without allocating large objects per frame.
- [ ] Include dirty/revision/cache counters in reports.
- [ ] Document the performance scenario and target thresholds.
- [ ] Run the full focused suite and build.
- [ ] Commit as `perf(debug): expose subsystem timing and invalidation diagnostics`.

### Task 10: Final CI and visual verification

**Files:**
- Modify only test/docs files if verification exposes a defect.

- [ ] Open a temporary draft/do-not-merge PR from the isolated branch into `real-wargame-preview` solely to trigger the existing workflow.
- [ ] Verify workflow head SHA equals the branch head.
- [ ] Inspect build result, Playwright log and all changed/key PNG files.
- [ ] Fix any failure on the isolated branch and rerun.
- [ ] Close the temporary PR without merging after evidence is collected.
- [ ] Compare branch against `real-wargame-preview` and report changed files, checks, remaining risks and manual checks.

## Deferred follow-up after evidence

A Web Worker and full chunk-texture renderer are not implemented automatically in this slice. They become the next isolated task only if the completed diagnostics show remaining long main-thread tasks after the revision, spatial-index, cache and lifecycle fixes. This avoids adding asynchronous complexity without evidence while preserving a chunk-ready architecture.
