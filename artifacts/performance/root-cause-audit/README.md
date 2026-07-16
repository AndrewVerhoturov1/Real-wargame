# Performance regression root-cause audit

Status: **partial implementation + measured root-cause evidence**. The report below analyses the supplied raw
`real-wargame-performance-2026-07-16_18-52-03-589.json`, produced by exact C
`5f097f79e2150764d5dc4ac8cb0c4db6ba90aa74` in YaBrowser 26.6 (Chromium 148).

## Comparison states

| State | SHA | Role |
| --- | --- | --- |
| A | `4a9fd2292ee9ded682d34064a2b721feab21ec4a` | After PR #127, before shared visibility/vegetation |
| B | `4adb42650f0fb6ad61b31f9521cec4508a5a40ec` | After PR #128, before tactical orders |
| C | `5f097f79e2150764d5dc4ac8cb0c4db6ba90aa74` | Problematic preview and source report |

Only C has raw browser data. No A/B/C delta is claimed until identical repeated runs are made.

## Measured C environment

- viewport: 1440×756; DPR 1; map: 320×200 (64,000 cells); 6 units; 9 objects;
- report window: 76.64 s (runtime 157.5 s); effective FPS 46.96;
- frame p95 33.1 ms, maximum 614.3 ms; 200 long tasks, p95 351 ms, maximum 678 ms;
- `sceneUpdateMs` p95 is only 0.5 ms, but 185/200 LoAF scripts are `FrameRequestCallback` from the Vite/Pixi chunk, totalling 34,339 ms of script attribution;
- the report had no project phase measures. This branch adds slow-phase instrumentation for the next run.

## Root causes

| Rank | Cause | Regression / pre-existing | Trigger and code path | Measured evidence | Status | Recommended fix |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Full-map directional tactical rebuild storm | **Introduced by PR #128** | Moving known threats → `getDirectionalTacticalField` key buckets x/y at 0.1 cells → `buildField` scans 64,000 cells for every new key | 647 builds, 647 full-map scans, 12-entry cache, 1,273 hits, last build 34 ms. This is the only reported computation with hundreds of full-map directional scans and matches the recurring `FrameRequestCallback` group. | PROVEN | Keep correctness but coalesce/reuse world threat snapshots; route replanning must not demand a new full field on each sub-cell enemy movement. Validate semantics with focused route tests and A/B browser runs. |
| 2 | Main-thread SoldierDangerField rebuild/scoring storm | Existing danger machinery, **amplified by PR #128** shared directional inputs | Movement/key changes → `getSoldierDangerField` → visibility geometry + cover geometry + `scoreDangerField` | 444 geometry builds/full-map scans, 631 field scores, 1,289 field hits, only 12 score fields retained; 19.2 MB typed arrays retained. | PROVEN | Separate immutable geometry from dynamic scalar scoring and stop all consumers from requesting an independent full score at each knowledge tick. |
| 3 | Threat-relative cover cache thrashing | **Introduced/exposed by PR #128 path** | Directional threat crosses 0.1-cell origin bucket → `getThreatRelativeCoverField` | 125 full-map builds; 24,000,000 object checks; 7,999,875 forest reads; 109 evictions from a 16-entry cache. | PROVEN | Use bounded/range-aware geometry or a spatial representation; do not make every map cell test every cover object for a tiny origin move. |
| 4 | Explicit grid toggle rebuilds map | Pre-existing before A | `PixiApp.handleGridToggle → renderEditableMapLayerIfNeeded → PixiMapRenderer` | One direct `handleGridToggle` LoAF was 624.9 ms, including 536 ms in that function. The map rebuild recreates two 3072×1920 canvas raster layers and textures. | PROVEN | Split persistent terrain/relief/forest rasters from the separately toggled grid. |
| 5 | TacticalWorkspace poll and action work | Pre-existing | 300 ms interval calls `update`; UI buttons can rebuild sidebar/report state | 9 interval LoAFs: 489 ms total, max 88 ms; 4 workspace-button LoAFs: 483 ms total, max 359 ms; forced style/layout total 27 ms. | PROVEN | Implemented lifecycle fix: polling stops when editor/hidden, listeners and interval are disposed on teardown. Further tab-specific timing remains required. |
| 6 | PR #129 tactical-order refresh rebuilt unchanged map | **Introduced by PR #129** | `TacticalOrderRadialInput.notifyChanged → main callback → forceRender → map invalidation` | 3 `handlePointerUp` LoAFs total 285 ms, max 214 ms. Source path proves every order UI refresh requested the expensive map rebuild. | PROVEN | Implemented: tactical order updates call `renderNow()` and retain immutable map cache. |
| 7 | Worker compute | PR #128 worker path | Awareness-world worker build | Worker compute max 406.4 ms and latency max 571.8 ms, but main-thread raster apply max 0.5 ms and local update p95 1.1 ms. | DISPROVEN as the direct cause of the recorded main-thread long frames | Keep worker job coalescing; track worker latency separately from UI jank. |
| 8 | TacticalOrderStatusCard interval | PR #129 | 250 ms key-guarded status refresh | No LoAF script was attributed to this interval; its code skips DOM replacement when the key is unchanged. | NOT MEASURABLE | Test enabled/disabled with new phase instrumentation; do not optimise blindly. |
| 9 | Per-unit AI scheduler | PR #127, already present in A | Simulation tick scheduler pass | The raw report cannot isolate scheduler from perception, memory, route replan and movement because phase measures were absent. | NOT MEASURABLE | New `simulation.ai-scheduler` phase will measure it independently. |

## Causal chain for recurring 200–600 ms stalls

```text
moving hostile contact / knowledge revision
  → directional tactical key changes at 0.1 cells
  → full 64,000-cell DirectionalTacticalField build
  → danger geometry/score requests
  → visibility rays + threat-relative cover full-map checks
  → typed-array allocation, cache eviction and possible GC
  → long FrameRequestCallback
```

## Changes on this branch

1. `src/main.ts`, `src/rendering/PixiApp.ts`
   - order-menu refresh is dynamic-only; it no longer invalidates the static map;
   - map-mutating callers still use `forceRender()`.
2. `src/ui/TacticalWorkspace.ts`
   - poll does not run while editor mode or document is hidden;
   - poll and canvas listeners are torn down.
3. `src/core/debug/PerformancePhases.ts`, `SimulationTick.ts`, `PixiApp.ts`
   - records only synchronous phases ≥8 ms, avoiding per-frame diagnostic allocation;
   - next report will identify simulation metrics, perception, threat memory, scheduler, combat, movement/events, collisions, map, each renderer and DOM/debug work.

## Required completion evidence

1. Run the identical repeated scenario on A, B, C and this final branch, including manual/graph units, paused/running, grid, tabs, camera/pointer and tactical-order cases.
2. Use the new phase report to attribute each remaining long frame.
3. Run `npm run build`, `workspace:smoke`, `ai-scheduler:smoke`, `danger-route-cost-parity:smoke`, visibility/awareness/navigation smokes, then browser performance scenarios.
4. Only after those data exist, tune keys/cache bounds or move work without weakening route and danger semantics.
