# Performance regression root-cause audit

Status: **implementation complete; exact browser CPU contract, live-movement semantics and strict long-task attribution accepted**.

The original representative report is `real-wargame-performance-2026-07-16_18-52-03-589.json`, produced by exact commit `5f097f79e2150764d5dc4ac8cb0c4db6ba90aa74` in YaBrowser 26.6 (Chromium 148).

Final production-code evidence:

```text
exact base:             5f097f79e2150764d5dc4ac8cb0c4db6ba90aa74
measured production:    80acca6fe029938d456a8e426ca315643aeb7ffc
GitHub Actions run:      29575064504
browser artifact:        danger-layer-browser-performance
```

Later commits may update this document or other non-production metadata. Performance claims remain pinned to the measured production commit and artifact above.

## Root cause

The problematic preview repeatedly recreated observer-relative route/UI contexts for moving contacts and independently requested complete tactical fields. That caused avoidable 64,000-cell scans, typed-array churn, cache eviction and main-thread route/perception bursts.

Baseline diagnostics included:

- `DirectionalTacticalField`: 647 builds/full-map scans;
- `SoldierDangerField`: 444 geometry builds and 631 score builds;
- `ThreatRelativeCoverField`: 125 full-map builds, 24,000,000 object checks and 7,999,875 forest reads;
- a grid toggle that rebuilt the static map for 536 ms inside a 624.9 ms long animation frame.

The causal chain was:

```text
moving or updated hostile contact
  → exact observer-relative route/UI contexts recreated repeatedly
  → independent field keys and complete tactical raster requests
  → repeated full-map work, allocation churn and cache eviction
  → route/perception stalls and likely GC pressure on the main thread
```

## Implemented changes

### Published tactical snapshots and invalidation

- Route consumers have explicit `immediate` and `coalesced` context freshness.
- New orders and threat-topology changes remain exact and immediate.
- Continuous monitoring and route overlays share immutable snapshots for at most 0.5 simulation seconds.
- Route-local score drift below 20 strength, 15 suppression or 20 confidence points accumulates instead of rebuilding immediately.
- Routing and awareness consume the same canonical world-threat boundary.
- Observer-relative contact direction/range and sub-cell animation no longer invalidate world fields.

### Background route preparation

- Directional and combined route projections are prepared in a fused pass.
- Reactive route fields are built in a dedicated gameplay worker rather than blocking `SimulationTick`.
- Worker queueing is bounded latest-per-owner FIFO with deterministic fairness, stale-result rejection and map/profile/revision identity checks.
- Blocked units stop safely while exact replacement fields are pending; their orders are retained.
- Synchronous fallback is reserved for genuine worker unavailability.

### Static cover and vegetation

- Threat-relative cover uses a map-revision-keyed static grid.
- Object descriptors and forest density weights rebuild only on relevant map revisions.
- Dynamic forest propagation reads a prepared typed density layer instead of repeatedly resolving `map.cells` definitions.
- Object work is restricted to conservative angular/range candidates while preserving exact scoring inside the bound.

### Bounded perception geometry

- At most one new full `VisibilityGeometryField` is built per simulation step.
- Deferred checks do not use stale geometry or repeatedly grant visual evidence.
- Observer scheduling is deterministic and independent of UI selection.
- Active visual tracks receive gameplay priority.
- Focused/tracked stimuli are evaluated before ambient pressure sources, preventing mixed target heights from starving a moving hostile contact.
- Per-unit stimulus cursors preserve fairness for remaining stimuli.

### Renderer-local and lifecycle work

- Static terrain/relief/vegetation, grid and objects have independent containers and invalidation keys.
- Grid visibility changes do not rebuild static terrain or simulation fields.
- Generated textures and application-owned workers/listeners/timers are destroyed on teardown.
- The safe-position top-8 scan uses fixed typed buffers, rejects impossible candidates before `sqrt`, and allocates only the final result objects.
- Worker response, raster swap, local safe-position scan and route sampling have separate diagnostics.

## Exact browser evidence

The GitHub runner uses software-rendered Chromium. Hosted FPS/RAF is diagnostic only and is not presented as user-device rendering performance. The accepted evidence is bounded CPU work and semantic correctness.

### CPU comparison

All acceptance predicates passed.

| Metric | Exact base | Exact measured production |
| --- | ---: | ---: |
| scene update p95 / max | 4.5 / 5.1 ms | 5.2 / 10.5 ms |
| first dynamic update | 16.2 ms | 3.8 ms |
| steady dynamic p95 / max | 2.5 / 6.6 ms | 3.8 / 43.4 ms |
| awareness raster apply max | 3.5 ms | 1.0 ms |
| renderer-local raw max | 25.1 ms | 2.1 ms |
| renderer-local post-warmup p95 | 3.1 ms | 1.5 ms |
| threat-cover map-cell forest reads | 63,999 | 0 |

The hosted comparison is an acceptance contract, not a claim that every noisy runner timing improved. The cold build fell by 71.43%, all CPU predicates passed, and no repeated application scene-update stall exceeded the contract.

### Live movement scenarios

All five exact-head scenarios passed:

1. **Selected-only:** observer movement changed only local derivation; canonical world keys and raster identity remained stable.
2. **Hostile-only:** the final exact canonical/world key and worker job were applied.
3. **Six moving units:** all units moved, subjective hostile tracking stayed current and bounded queues settled.
4. **Hidden hostile:** objective movement did not leak into subjective memory or trigger false world rebuilds.
5. **Wall crossing:** the protected-side winner flipped correctly and the final exact field was applied.

Aggregate movement evidence:

```text
scene update p95 / max:                  4.5 / 4.5 ms
main-thread raster apply max:            0.6 ms
renderer-local safe-position/route max:  2.0 ms
renderer-local post-warmup p95:          2.0 ms
maximum pending queue depth:             1
worker error:                            none
```

### Strict long-task attribution

The attribution window contained 13 global browser long tasks, all classified as hosted-runner/software-rendering diagnostics:

| Classification | Count |
| --- | ---: |
| danger-attributed | 0 |
| application-attributed | 0 |
| unattributed | 0 |
| diagnostic-only | 13 |

Relevant production maxima:

```text
simulation and scene update:                    4.5 ms
worker-response main-thread handling:            2.6 ms
typed-array raster apply/base-texture update:    0.6 ms
renderer-local safe-position/route evaluation:  2.0 ms
named application LoAF scripts:                  0
danger LoAF scripts:                             0
```

`blockingContractPassed` is `true`; `blockingFailures` is empty. Each diagnostic-only long task had at least 80% of wall time outside bounded production phases.

## Verification matrix

The measured production head passed:

- Preview Policy and Agent Docs Integrity;
- Preview Core Checks and production build;
- Combat Foundation Core;
- Directional Terrain Core;
- Navigation Profiles and Command Plan Route Core;
- AI Events and per-unit scheduler/runtime smokes;
- Tactical Order and Compact Route Controls verification;
- tactical workspace and PixiJS lifecycle contracts;
- danger parity/cache, tactical snapshot and route-status smokes;
- shared visibility/vegetation, perception, current-view/memory and visibility-cache smokes;
- reverse-slope, pathfinding, routed movement, map revision, spatial index and grid LOD checks;
- Danger Layer Browser Performance, all movement scenarios and strict attribution.

## Remaining risks and non-goals

- A genuinely new semantic threat snapshot still requires linear tactical raster computation, but it is bounded, coalesced and moved off the simulation main thread where appropriate.
- Forest attenuation remains linear in map cells for a real new projection; static extraction is no longer repeated.
- The 0.5-second continuous-monitor freshness bound and 20/15/20 route thresholds are gameplay-tuning choices.
- Cache sizes were not increased as the optimization.
- Hosted software-renderer FPS is not representative of user hardware.
- `main` was not changed; PR #131 remains draft, with no merge or auto-merge.
