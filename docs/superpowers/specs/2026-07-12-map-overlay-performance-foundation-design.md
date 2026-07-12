# Map and Overlay Performance Foundation Design

## Status

Approved by the user on 2026-07-12. Work must stay on `perf/map-overlay-foundation-2026-07-12` until an explicit transfer request. `real-wargame-preview` and `main` must not be changed.

## Goal

Remove the current overlay and editor stalls without reducing visual quality, while preparing the current 10-metre grid architecture for a later 2-metre grid migration.

## Scope

This slice keeps `metersPerCell = 10`, current map dimensions, current rendering scale, current PixiJS 7 version and existing user-visible behaviour.

The implementation covers:

1. explicit map revisions instead of full-map string fingerprints;
2. bounded dirty regions for terrain, height, forest and objects;
3. constant-time smooth-height cache validation;
4. shared line-of-sight probe caching;
5. spatial indexing for map-object queries;
6. awareness-field reuse of indexed static protection;
7. long-lived overlay and unit display objects where safe;
8. visible-area culling for HTML map labels;
9. expanded performance diagnostics and regression tests;
10. chunk-ready data boundaries without changing the current map scale.

Web Workers and a full chunk-texture renderer are deliberately deferred until profiling proves that the main-thread work remaining after these changes still requires them. The architecture introduced here must allow those additions without another data-model rewrite.

## Architecture

### Map change tracking

`TacticalMap` owns monotonic revision counters for terrain, height, forest, objects and combined visuals. Mutation helpers are the only supported way to change authoritative map layers. Each helper increments only the relevant revisions and records a dirty rectangle.

Renderers and caches compare revision numbers. They must never build a cache key by mapping every cell or every object on every frame.

### Dirty regions

Dirty rectangles are merged per layer. Consumers may take and clear the accumulated region after updating their own cache. Height changes expand by one cell because the smoothing kernel samples neighbouring cells.

### Smooth terrain

The smoothed height field is stored as a flat `Float32Array`. Cache validation compares the map identity and `heightRevision`. A full rebuild remains available for map loading; incremental updates rebuild only the dirty region plus the smoothing border.

### Spatial index

A uniform object index divides the map into fixed-size logical buckets. Static and moved objects are registered by their rotated bounds. Point, rectangle, circle and segment queries return candidate objects. Callers still perform exact geometry checks.

### Visibility probe

A shared service caches the latest probe result by unit position/posture, target, and terrain/forest/object revisions. Pixi and HTML renderers consume the same result. Object blocker checks query the spatial index instead of iterating over every map object for every ray sample.

### Awareness

Static protection and concealment are cached separately from threat-dependent values. Static cells are invalidated by terrain, height, forest and object revisions. Dynamic threat fields are invalidated by tactical-knowledge revisions. Typed arrays store numeric fields; human-readable explanations are resolved only for selected or inspected cells.

### Rendering lifecycle

Static and semi-static renderers reuse their containers and display objects. Dynamic pointer/selection graphics remain fixed objects. Unit views are stored by unit id and updated in place. Disabled layers become invisible rather than being destroyed when safe.

### HTML overlay

Only cells and labels intersecting current visible world bounds are considered. Height labels are hidden below a zoom threshold and capped to prevent large DOM counts. Existing labels are reused.

## Performance acceptance criteria

1. Pointer movement does not scan every map cell or object.
2. Camera movement and zoom do not invalidate terrain, relief, awareness or visibility calculations.
3. A single height edit invalidates only the affected height region and smoothing border.
4. One visibility-probe state change produces at most one line-of-sight calculation consumed by both renderers.
5. Unit rendering does not recreate every unit display object each frame.
6. Existing visual screenshots remain materially unchanged.
7. Current Playwright performance tests pass and gain revision/full-scan assertions.
8. Production TypeScript build passes.

## Compatibility

Existing JSON maps remain valid. Runtime revision, dirty and index state is created during `normalizeMap` and is not serialized. No PixiJS 8 APIs or new runtime dependencies are introduced.

## Risks and mitigations

- Direct mutation outside helpers could skip invalidation. Add development assertions, focused smoke tests and route all known editor mutations through helpers.
- Spatial-index bounds for rotated objects can omit candidates. Register conservative axis-aligned rotated bounds and keep exact tests at the caller.
- Incremental smoothing can create seams. Expand updates by the full smoothing radius and compare against full rebuilds in tests.
- Caches can return stale data after loading. Map normalization starts all revisions at one and creates fresh runtime state.
