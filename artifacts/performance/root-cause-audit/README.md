# Performance regression root-cause audit

Status: **optimization implemented; exact browser CPU, live-movement semantics, and strict long-task attribution all accepted**.

The original representative report is
`real-wargame-performance-2026-07-16_18-52-03-589.json`, produced by exact commit
`5f097f79e2150764d5dc4ac8cb0c4db6ba90aa74` in YaBrowser 26.6 (Chromium 148).
The final exact production-code measurement is GitHub-hosted run `29575041848` at
`5ac79e5c89388aed26ddae97324fa68c81b8d88f`.

## Comparison states

| State | SHA | Role |
| --- | --- | --- |
| A | `4a9fd2292ee9ded682d34064a2b721feab21ec4a` | After PR #127, before shared visibility/vegetation |
| B | `4adb42650f0fb6ad61b31f9521cec4508a5a40ec` | After PR #128, before tactical orders |
| C | `5f097f79e2150764d5dc4ac8cb0c4db6ba90aa74` | Problematic preview and exact PR base |
| Measured head | `5ac79e5c89388aed26ddae97324fa68c81b8d88f` | Final exact browser-verified production head |

The branch may contain later documentation or diagnostic-cleanup commits. Performance claims in this report remain
pinned to the measured production head above and to the corresponding Actions artifact containing
`before.json`, `after.json`, `comparison.json`, `movement.json`, and `long-task-attribution.json`.

## Baseline environment and symptoms

The supplied YaBrowser report used a 1440×756 viewport, DPR 1, a 320×200 map (64,000 cells), six units and nine
objects. It recorded effective FPS 46.96, frame p95 33.1 ms, maximum 614.3 ms, and 200 long tasks with maximum
678 ms. The important signal was not the average renderer rate but repeated CPU work attributed to the application:

- DirectionalTacticalField: 647 builds/full-map scans;
- SoldierDangerField: 444 geometry builds and 631 score builds;
- ThreatRelativeCoverField: 125 full-map builds, 24,000,000 object checks and 7,999,875 forest reads;
- a grid toggle that rebuilt the static map for 536 ms inside a 624.9 ms long animation frame.

The causal chain was:

```text
moving or updated hostile contact
  → exact observer-relative route/UI contexts recreated repeatedly
  → independent field keys and full tactical raster requests
  → repeated 64,000-cell scans, typed-array churn and cache eviction
  → route/perception bursts plus likely GC pressure on the main thread
```

Knowledge already had semantic revision boundaries, but route and UI consumers recreated exact-coordinate contexts
and independently requested complete tactical fields. The dynamic route-field key also included the friendly origin
even though the world tactical field did not depend on it.

## Implemented changes

### 1. Published tactical snapshots and meaningful invalidation

- `buildUnitTacticalRouteContext` has explicit `immediate` and `coalesced` freshness.
- New orders and threat-topology changes remain exact and immediate.
- Continuous route monitoring and the route overlay share immutable published snapshots for at most 0.5 simulation
  seconds.
- Route-local score drift below 20 strength, 15 suppression, or 20 confidence points is accumulated instead of
  rebuilding a complete field immediately.
- The route and awareness systems consume the same canonical world-threat boundary.
- Observer-relative unit-contact direction/range and sub-cell animation no longer change a world-field key.

### 2. Background route-field preparation

- Directional and combined route projections are prepared in a fused pass.
- Reactive route fields are built in a dedicated gameplay worker instead of blocking `SimulationTick`.
- The worker has bounded latest-per-owner queueing, deterministic owner fairness, stale-result rejection, map/profile/
  revision identity checks, and synchronous fallback only when the worker is genuinely unavailable.
- A blocked route stops the unit safely while the exact replacement is pending; the order is retained and is not
  deleted by the asynchronous boundary.
- New player orders still use exact immediate planning.

### 3. Static cover and vegetation inputs

- Threat-relative cover owns a map-revision-keyed static grid.
- Object descriptors and forest density weights are rebuilt only when relevant map revisions change.
- Forest propagation reads a prepared typed layer instead of resolving vegetation definitions from `map.cells` for
  every dynamic projection.
- Object work is restricted to conservative angular/range candidates while preserving exact scoring inside the bound.
- Slow-only phases identify real field builds without creating per-frame diagnostic allocations.

### 4. Bounded perception geometry

- At most one new full `VisibilityGeometryField` is prepared per simulation step.
- Deferred checks do not use stale geometry and do not repeatedly grant visual evidence.
- Observer scheduling is deterministic and independent of UI selection.
- Units with active visual tracks are serviced fairly, and focused/tracked stimuli receive priority over ambient
  pressure sources so mixed target heights cannot starve a moving hostile contact.
- Existing attention cadence, target-height, terrain, object, vegetation, rear-sector and contact-memory semantics are
  covered by the perception smoke matrix.

### 5. Renderer-local and lifecycle work

- Static terrain/relief/vegetation, grid and object rendering use independent containers and invalidation keys.
- Grid visibility changes do not rebuild static terrain or simulation fields.
- Generated textures and application-owned workers/listeners/timers are destroyed on teardown.
- The safe-position top-K scan uses fixed typed buffers, a safety upper bound before `sqrt`, and creates only the final
  result objects instead of allocating/splicing transient candidates.
- Main-thread worker response, raster swap, local safe-position scan and route sampling have separate measurable phases.

## Exact CI browser evidence

The hosted runner uses a software-rendered Chromium path. Its FPS/RAF values are diagnostic only and are **not** a
claim about user-device rendering performance. The CPU and semantic contracts are the accepted evidence.

Exact base: `5f097f79e2150764d5dc4ac8cb0c4db6ba90aa74`  
Exact measured head: `5ac79e5c89388aed26ddae97324fa68c81b8d88f`  
Actions run: `29575041848`

### CPU comparison

- comparison accepted; every acceptance predicate passed;
- base scene-update p95/max: 3.0 / 7.3 ms;
- head scene-update p95/max: 3.4 / 23.1 ms;
- base steady-dynamic p95/max: 1.9 / 4.5 ms;
- head steady-dynamic p95/max: 3.8 / 8.9 ms;
- head awareness raster apply maximum: 1.9 ms;
- head renderer-local update maximum: 3.3 ms;
- head renderer-local post-warmup p95: 0.2 ms.

These hosted timing differences are used only to enforce bounded CPU work; no hosted-renderer speedup is claimed.

### Live movement scenarios

All five exact-head scenarios passed:

1. **Selected-only:** observer-relative geometry changed while world-space threat memory, canonical keys and raster
   identity remained stable; zero worker/raster rebuilds were caused by observer movement.
2. **Hostile-only:** the final exact canonical/world key and job were applied through the bounded worker queue.
3. **Six moving units:** all six units moved, subjective hostile tracking remained current, and final exact state was
   applied.
4. **Hidden hostile:** the objective hostile moved while subjective memory correctly remained unchanged; no false world
   rebuild was requested.
5. **Wall crossing:** the protected-side winner flipped west-to-east and the final exact field identity was applied.

Aggregate movement evidence:

- scene-update p95/max: 4.1 / 7.0 ms;
- renderer-local maximum: 1.5 ms;
- renderer-local raw maximum: 3.2 ms;
- renderer-local post-warmup p95: 1.5 ms;
- raster apply maximum: 0.4 ms;
- maximum pending queue depth: 1;
- worker error: none.

### Strict long-task attribution

The final attribution window contained 29 global browser long tasks:

| Classification | Count |
| --- | ---: |
| danger-attributed | 0 |
| application-attributed | 0 |
| unattributed | 0 |
| hosted-runner / software-rendering diagnostic only | 29 |

All 29 diagnostic-only tasks had at least 80% of wall time outside the bounded production phases. The relevant
application phase maxima were:

- simulation plus scene update: 7.0 ms;
- route/awareness worker response handling: 1.9 ms;
- renderer-local safe-position and route evaluation: 1.5 ms;
- typed-array raster apply/base-texture update: 0.4 ms;
- named application LoAF scripts: 0;
- danger LoAF scripts: 0.

`blockingContractPassed` is `true` and `blockingFailures` is empty.

## Verification matrix

The exact branch passed the relevant GitHub-hosted production build and core workflows, including:

- Preview Core Checks;
- Combat Foundation Core;
- Directional Terrain Core;
- Navigation Profiles and Command Plan Route Core;
- AI Events and per-unit scheduler/runtime smokes;
- tactical workspace and PixiJS lifecycle contracts;
- danger parity/cache, tactical snapshot and route-status smokes;
- shared visibility/vegetation, perception, current-view/memory and visibility-cache smokes;
- reverse-slope, pathfinding, routed movement, map revision, spatial index and grid LOD checks.

No local Chromium number was fabricated; browser claims come from the exact GitHub-hosted artifact.

## Remaining risks and non-goals

- A genuinely new semantic threat snapshot still requires linear tactical raster computation, but it is bounded,
  coalesced and moved off the simulation main thread where appropriate.
- Forest attenuation remains linear in map cells for a real new projection; static extraction is no longer repeated.
- The 0.5-second continuous-monitor freshness bound and 20/15/20 route-local thresholds remain gameplay-tuning
  choices and should be reviewed under unusually fast-changing threat scenarios.
- Cache sizes were not increased as the optimization.
- Hosted software-renderer FPS is not representative of user hardware and is not presented as an improvement.
- No change was made to `main`; the work remains isolated to draft PR #131, with no merge or auto-merge enabled.
