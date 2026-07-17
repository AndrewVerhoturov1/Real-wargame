# Real-Wargame Mandatory Performance Contract

This document is a mandatory repository contract for every implementation that can affect runtime cost, including simulation, AI, perception, navigation, tactical fields, map data, rendering, UI, editors, serialization, workers, diagnostics and browser harnesses.

Performance is designed together with functionality. A feature is not complete when it is functionally correct but still requires a later campaign to remove full-map scans, main-thread stalls, cache churn, polling or lifecycle leaks.

## Reference interactive scenario

Unless a narrower task defines a stricter scenario, performance decisions must remain safe for:

```text
map: 320 × 200 = 64,000 cells
units: at least 6 graph-controlled units
moving units: at least 4
moving or remembered threats: present
tactical layers: actively switched
measurement: at least 90 seconds after warmup
```

## 1. No heavy synchronous work in an interactive callback

Inside `requestAnimationFrame`, the Pixi ticker, `SimulationTick`, DOM event handlers, `setInterval`, workspace updates or player-command handlers, do not synchronously:

- scan the whole map;
- build a full raster for one consumer;
- run an unbounded safe-position or cover-candidate search;
- build awareness independently for every unit;
- run unbounded pathfinding or route comparison;
- rebuild every workspace section;
- create large temporary arrays or one display object per cell.

Potentially expensive work must be prepared ahead of time, bounded, shared, chunked, cached, moved to a worker, or replaced with a local query. The main thread applies a ready result; it does not own an unbounded build.

## 2. Make multiplicative complexity explicit

Before implementation, identify the worst-case cost. Treat these shapes as blocking design defects in interactive runtime:

```text
units × map cells
units × threats × map cells
frames × all map cells
units × route candidates × pathfinding
map cells × Pixi display objects
frames × all DOM sections
```

Prefer bounded forms:

```text
O(1)
O(local radius)
O(route length)
O(changed chunks)
O(changed sources)
O(fixed work budget)
```

A full-map pass is allowed only when it is genuinely required, infrequent, attributable, and reused by multiple consumers.

## 3. Compute once and share

AI, navigation, danger, visibility, tactical layers, safe-position logic, UI and renderers must not independently calculate the same gameplay quantity.

Use one canonical machine-owned prepared result or immutable snapshot. Presentation consumes that result; it does not redefine it.

Examples:

- route danger uses the canonical subjective danger source, not a UI approximation;
- LOS and vegetation transmission share one geometry contract;
- route diagnostics are published with route identity instead of rebuilt by the workspace;
- renderers display prepared state and never become gameplay truth.

Parallel formulas for one canonical gameplay value are forbidden unless an explicit compatibility test proves equivalence.

## 4. UI and renderer are never simulation owners

The selected unit, current tab, visible layer or renderer state must not change machine computation for other units.

Do not:

- use the selected unit as the scheduler owner;
- run gameplay computation from `TacticalWorkspace`;
- read gameplay truth back from Pixi textures or display objects;
- depend on whether a visual layer is enabled;
- trigger a full gameplay build from a button click.

UI reads published snapshots, updates from revision or dirty keys, batches DOM writes and skips unchanged sections.

## 5. One changed entity must not invalidate the world

Separate:

```text
static geometry
dynamic source contributions
observer-specific derivation
presentation state
```

Moving one unit or one threat must not automatically rebuild every visibility field, danger field, route and workspace panel.

Prefer:

```text
static prepared basis
+ per-source contribution
+ bounded observer derivation
+ published aggregate
```

Replace only the changed contribution when possible.

## 6. Revision-based identity is mandatory

Every cached or asynchronous result must have a precise semantic identity containing only inputs that actually affect it. Depending on the subsystem, this can include:

```text
terrain revision
height revision
vegetation revision
object revision
threat snapshot identity
subjective knowledge revision
observer position and posture
profile definition revision
profile selection revision
route identity
simulation epoch
```

Do not use one broad global revision when narrower revisions exist. Do not apply a late result to a different observer, route, map or snapshot. Every asynchronous application path requires stale-result rejection.

## 7. Workers and queues are bounded

When heavy preparation belongs off the main thread, the worker contract must include:

- a bounded number of workers;
- a bounded queue;
- latest-per-owner coalescing where appropriate;
- fairness between units;
- stale-result rejection;
- transferable or reused typed data;
- visible worker errors;
- explicit teardown.

One rapidly changing unit must not starve other units. Obsolete requests must not accumulate behind newer requests.

## 8. Use deterministic work budgets

Simulation-owned work must have a deterministic maximum per step or cycle.

Examples:

```text
point-LOS probes per step: bounded
AI unit passes per cycle: fair round-robin
route preparations: bounded
dirty chunks per frame: bounded
```

When the budget is exhausted, defer safely. Preserve the command and pending state, guarantee eventual progress, and do not make gameplay semantics depend on random wall-clock timing.

## 9. Prefer point, route and local queries

Do not build a full field when the caller needs one answer.

Use bounded queries for questions such as:

```text
is this target visible?
how dangerous is this cell?
what is the danger along this existing route?
what is the best cover in this local radius?
```

Suitable mechanisms include point LOS, bounded route sampling, spatial indices, prepared per-source contributions and chunk lookup.

## 10. A cache is an owned contract

Every cache must define:

```text
owner
key
semantic inputs
invalidation revisions
maximum entries
estimated bytes
eviction policy
expected reuse
teardown
```

Diagnostics must expose, where relevant:

```text
hits
misses
miss reason
evictions
estimated bytes
reuse before eviction
stale-result count
```

Do not fix cache churn by only increasing the entry limit. First correct ownership, keys and invalidation boundaries.

## 11. Cell layers use typed data and dirty chunks

For terrain, vegetation, visibility, danger and similar cell layers:

- keep canonical cell data outside the renderer;
- prefer typed arrays;
- update dirty chunks only;
- do not create one Pixi object per cell, tree or bush;
- do not rebuild static terrain because the grid overlay changed;
- keep terrain, vegetation, objects and grid independently invalidatable.

Forest is a cell/material raster with properties, not a collection of independent tree objects.

## 12. PixiJS lifecycle is symmetric

For PixiJS 8 work:

- await `app.init()` before using renderer, stage, canvas or ticker;
- use `app.canvas`;
- add and remove ticker callbacks symmetrically;
- make `destroy()` safe and idempotent;
- release textures, workers, listeners, timers and DOM ownership;
- invalidate cached textures correctly;
- update mutable raster sources without recreating the whole scene;
- use nearest sampling for tactical rasters where required;
- do not reintroduce PixiJS 7 compatibility APIs.

Lifecycle accumulation is a performance regression.

## 13. SimulationTick owns gameplay progression

Gameplay AI, movement, perception, combat and state transitions run through the canonical simulation pipeline.

Do not add:

- a separate gameplay `setInterval`;
- browser-timer-owned AI;
- a second coordinate integrator;
- direct AI execution from UI;
- behavior that changes with the visible browser tab.

UI can request an action; simulation-owned runtime applies it.

## 14. Do not trade correctness for speed

The following are not acceptable optimizations without an explicit product decision:

- lowering map resolution;
- disabling a feature or layer;
- reducing AI cadence only to hide a stall;
- increasing debounce to hide work;
- deleting a command while a worker result is pending;
- using objective positions for hidden threats;
- replacing route danger with current-cell danger;
- weakening LOS, terrain, vegetation or hidden-contact semantics;
- removing scheduler fairness.

Performance changes must preserve deterministic gameplay and subjective knowledge boundaries.

## 15. Attribute performance to the application owner

Potentially expensive phases must report bounded runtime diagnostics:

```text
count
total
average
p50
p95
p99
max
long-task overlap
owner or context
```

At minimum, preserve attribution for:

```text
application update
SimulationTick
AI scheduler cycle
per-unit AI pass
perception
movement events
route preparation
directional tactical build
visibility or point LOS
danger geometry
threat-relative cover
TacticalWorkspace update
static-map rebuild
```

`requestAnimationFrame` or the Pixi ticker alone is not sufficient attribution. Every LongTask must receive a finite classification. `unknown` cannot be assumed to be external noise.

## 16. Performance gates must enforce their thresholds

A pull-request performance workflow must not run with enforcement disabled.

Required evidence:

```text
enforceEnabled: true
allThresholdsPassed: true
blockingFailures: []
exact source SHA verified
```

A diagnostic-only capture must be a separate manual mode. Evidence from another SHA is not exact-head evidence.

## 17. Baseline interactive thresholds

For the reference scenario:

```text
AI scheduler:
  p95 <= 8 ms
  max <= 16 ms

per-unit AI pass:
  p95 <= 2 ms
  max <= 10 ms

SimulationTick:
  p95 <= 12 ms
  max <= 25 ms

TacticalWorkspace update:
  p95 <= 8 ms
  max <= 16 ms

application-blocking LongTasks: 0
unknown LongTasks: 0
worker errors: 0
```

A feature PR must not raise these thresholds merely to make CI green. Threshold changes require an explicit architecture decision and before/after evidence.

## 18. Definition of Done for runtime-affecting work

The final report must answer:

1. What is the worst-case complexity?
2. Does any path scan the full map?
3. Is work multiplied by units, threats or frames?
4. What is the canonical shared result?
5. Which revisions invalidate it?
6. What changes when one entity moves?
7. How are queue and work budgets bounded?
8. Where is stale-result rejection?
9. What caches were added and what is their memory bound?
10. Is teardown complete?
11. Can UI trigger heavy gameplay work?
12. Is gameplay independent of selection and visible layers?
13. What p95, p99 and max values were measured?
14. Were any application or unknown LongTasks observed?
15. Was the exact PR head verified?
16. Did an enforced browser gate pass?

Runtime-affecting work without this analysis is incomplete.

## 19. Required regression shapes

Add focused performance tests when a change touches runtime behavior:

```text
unchanged snapshot
→ repeated heavy work is absent

one changed entity
→ only its contribution is rebuilt

several units
→ fairness remains

late async result
→ stale result is rejected

UI selection or layer change
→ gameplay computation is unchanged

teardown and reinstall
→ workers, timers, listeners and textures do not accumulate

long run
→ cache size and latency remain bounded
```

Tests should assert build counts, cache reuse and bounded work, not only functional output.

## 20. Required PR section

Every runtime-affecting PR must include:

```text
Performance impact

hot path:
worst-case complexity:
main-thread work:
full-map builds:
shared prepared data:
worker and queue budget:
cache owner/key/limit:
invalidation revisions:
memory estimate:
teardown:
before metrics:
after metrics:
exact-head enforced workflow:
remaining risks:
```

The statement “the change is small and should not matter” is not evidence.
