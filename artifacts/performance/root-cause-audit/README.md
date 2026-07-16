# Performance regression root-cause audit

Status: **optimization implemented; local semantic/contract checks passed; exact browser comparison pending CI**.

The baseline evidence is the supplied
`real-wargame-performance-2026-07-16_18-52-03-589.json`, produced by exact commit
`5f097f79e2150764d5dc4ac8cb0c4db6ba90aa74` in YaBrowser 26.6 (Chromium 148).

## Comparison states

| State | SHA | Role |
| --- | --- | --- |
| A | `4a9fd2292ee9ded682d34064a2b721feab21ec4a` | After PR #127, before shared visibility/vegetation |
| B | `4adb42650f0fb6ad61b31f9521cec4508a5a40ec` | After PR #128, before tactical orders |
| C | `5f097f79e2150764d5dc4ac8cb0c4db6ba90aa74` | Problematic preview and exact PR base |

Only C has supplied browser data. The repository workflow
`Danger Layer Browser Performance` performs an exact-base versus exact-head Chromium run after the PR head is pushed.
No FPS, frame-time, or long-task improvement is claimed before that workflow produces its raw JSON artifacts.

## Measured C environment

- viewport: 1440×756; DPR 1; map: 320×200 (64,000 cells); 6 units; 9 objects;
- report window: 76.64 s (runtime 157.5 s); effective FPS 46.96;
- frame p95 33.1 ms, maximum 614.3 ms; 200 long tasks, p95 351 ms, maximum 678 ms;
- `sceneUpdateMs` p95 is only 0.5 ms, but 185/200 LoAF scripts are `FrameRequestCallback`
  calls from the Vite/Pixi chunk, totalling 34,339 ms of script attribution;
- worker compute can be slow, but main-thread raster apply is about 0.5 ms, so moving the same work to a
  worker was not selected as the primary fix.

## Proven causal chain

```text
moving/updated hostile contact
  → exact route/UI context copied every renderer or replan tick
  → downstream field keys bucketed the threat at 0.1/0.05 cells
  → new DirectionalTacticalField / SoldierDangerField / cover keys
  → repeated 64,000-cell scans, typed-array allocation and cache eviction
  → likely GC pressure plus 200–600 ms FrameRequestCallback stalls
```

The important mismatch was that knowledge already had a semantic revision boundary, while route/UI consumers
recreated exact-coordinate contexts and independently requested complete tactical rasters. The dynamic route-field
key also contained the moving friendly unit origin even though the world tactical raster does not depend on it.

Baseline diagnostics support the chain:

- DirectionalTacticalField: 647 builds/full-map scans, 12 retained entries, last build up to 34 ms;
- SoldierDangerField: 444 geometry builds and 631 score builds, with about 19.2 MB retained typed arrays;
- ThreatRelativeCoverField: 125 full-map builds, 24,000,000 object checks, 7,999,875 forest reads and 109 evictions;
- one grid toggle rebuilt the map for 536 ms inside a 624.9 ms long animation frame.

## Implemented changes

### 1. Published tactical snapshots and meaningful replanning

- `buildUnitTacticalRouteContext` now supports explicit `immediate` and `coalesced` freshness.
- Order creation remains immediate. Route monitoring and the route-cost overlay share a published snapshot for at
  most 0.5 simulation seconds; position/scalar churn inside that window cannot demand a new family of full fields.
- Threat identity, mode, visibility/memory state and fire-threat class form a topology key. Topology changes bypass
  coalescing immediately, so a new/lost/changed threat is not hidden by the time window.
- Published contexts are immutable snapshots rather than mutable arrays owned by knowledge state.
- Route fields are reused by context identity. The dynamic world-field key no longer includes the friendly unit
  origin; route search still uses the exact current start cell.
- Performance phases distinguish `route.context`, `route.current-cost` and `route.replan-search`.

This is a local and tested precision compromise: only movement/scalar refresh used by continuous route monitoring
and UI may be delayed, and never by more than 0.5 simulation seconds. Orders and topology changes stay exact and
immediate. No coordinate rounding was made coarser.

### 2. Static cover/vegetation inputs separated from threat projection

- Threat-relative cover owns a map-revision-keyed static grid. Object descriptors and forest density weights are
  rebuilt only when object, forest, terrain or relevant map geometry revisions change.
- Dynamic forest propagation reads the prepared `Float32Array`; it no longer reads `map.cells` or resolves
  vegetation definitions for every cell on every threat update.
- Object work is restricted to a conservative angular/range shadow bound per descriptor and retains the exact
  projection, distance, posture and reliability formulas inside the bound. It no longer performs
  `cell count × every descriptor` checks.
- Directional tactical, visibility geometry, danger geometry/score, and threat-relative cover builds now have
  slow-only performance phases. The instrumentation records no fast-frame samples or per-frame diagnostic objects.

The deterministic 320×200 Node smoke reported 28 dynamic cover builds, zero map-cell forest reads and 1,057,110
bounded object candidates. The old one-descriptor full-map loop would make 1,792,000 checks for those 28 builds,
so the synthetic candidate count is 41.0% lower. This is a complexity diagnostic, not a browser frame-time claim.
Forest attenuation still performs a linear pass over the prepared typed layer when a new threat projection is
actually built; the expensive static data extraction is no longer repeated.

### 3. Renderer invalidation split

- `PixiMapRenderer` owns separate static terrain/relief/forest, grid, and object containers.
- Static-map identity uses map revision counters instead of serialising 64,000 cells to build a render key.
- The normal grid is built once and toggled with container visibility. Toggling it cannot recreate elevation or
  forest canvases/textures and cannot invalidate simulation fields.
- Replaced generated raster textures are explicitly destroyed; app teardown destroys the map renderer and
  performance monitor.
- `renderer.static-map-rebuild` and allocation-free renderer counters make the next browser report verifiable.

### 4. UI isolation and lifecycle

- Tactical order radial-menu refresh remains dynamic-only and does not invalidate the static map.
- TacticalWorkspace polling remains disabled in editor mode and while the document is hidden.
- Its interval, canvas listeners, attention listener and navigation-profile listener are all released on teardown.
- Workspace work is measured only when slow as `ui.tactical-workspace.update`; the UI reads prepared snapshots and
  does not own field invalidation.

## Semantic and invalidation evidence

- tactical snapshot smoke covers within-window reuse, immutable publication, the 0.5 s bound, immediate order
  contexts, immediate topology invalidation and explicit reset;
- danger-route parity and cache smokes preserve protected/exposed danger, independent fire classes and movement
  invalidation while proving ready-field reuse;
- reverse-slope and shared vegetation smokes preserve wall side, terrain shadow and forest attenuation;
- route status, pathfinding, routed movement, live replan, perception and AI scheduler smokes remain green;
- Pixi lifecycle, navigation overlay, map revision, spatial index and grid LOD contracts remain green;
- the camera/grid browser spec now asserts that a grid toggle changes only visibility and does not rebuild either
  the static map or grid geometry.

## Verification performed locally

Passed:

- `npx tsc --noEmit`;
- `npm run build` (926 modules; only the pre-existing large-chunk warning);
- `npm run validate:ai-graph` and `npm run docs:check` (four pre-existing journal-index warnings);
- `runtime:smoke`, `route-status:smoke`, `pathfinding:smoke`, `routed-move:smoke`, `move-bridge:smoke`,
  `ai-scheduler:smoke`;
- `workspace:smoke`, `combat-tactical-integration:smoke`, `perception:smoke`, `awareness-field:smoke`;
- `tactical-snapshot:smoke`, `danger-layer-performance:smoke`, `danger-layer-movement-performance:smoke`,
  `danger-route-cost-parity:smoke`, `reverse-slope-comparative:smoke`,
  `shared-visibility-vegetation:smoke`, `navigation-profile-switch:smoke`;
- `navigation-overlay:smoke`, `map-revision:smoke`, `spatial-index:smoke`, `map-grid-lod:smoke` and the
  PixiJS 8 raster lifecycle contract.

No supported local Chromium binary is installed in the current environment, so a local Playwright performance run
was not fabricated. Exact before/after frame and long-task numbers must come from the PR workflow and its uploaded
`before.json`, `after.json`, `comparison.json`, `movement.json` and `long-task-attribution.json` files.

## Residual work and risks

- A genuinely new coalesced threat snapshot can still require linear DirectionalTacticalField and danger scoring
  passes. Their frequency is bounded and shared now, but the raster algorithms are not incremental.
- Forest shadow propagation is linear in map cells per actual cover projection. It now uses static typed data, but a
  future measured hotspot may justify an incremental or sector-based algorithm.
- The 0.5 s route/UI freshness bound needs gameplay review under unusually fast threats. The focused tests protect
  its intended boundary, but only repeated browser/gameplay scenarios can validate perception at production scale.
- Cache limits were not increased as the optimization. Remaining cache retention and GC pressure must be judged
  from the exact-head browser artifact before further tuning.
- No change was made to `main`; the work remains isolated to draft PR #131.
