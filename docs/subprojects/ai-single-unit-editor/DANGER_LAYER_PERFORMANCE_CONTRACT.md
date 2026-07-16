# Danger Layer Performance Contract

## Scope

The danger overlay describes the selected soldier's subjective **world danger field**. Moving the selected soldier across that field changes local lookups and marker ranking, but does not change the field's pixels. Moving a subjectively known hostile does change world danger geometry, but that full-map work must never block the browser main thread.

The contract applies to the production PixiJS 8 renderer on large maps, including the 320 × 200 / 64,000-cell acceptance scene.

## Movement regression root cause

PR #113 removed the original constant full-map overload, but its paused synthetic browser test changed only threat strength and confidence. It did not execute routed movement, `SimulationTick`, perception refresh or threat-memory position updates.

Two movement-sensitive paths remained:

1. Selected-unit movement changed the marker input key. The renderer then called `buildSoldierAwarenessReport` even when raster pixels were unchanged. That report called `getDirectionalTacticalField` with the soldier's current position, so a cell transition could create a new directional field and invalidate awareness geometry.
2. Visible-hostile movement changed subjective threat `x/y`. The threat-relative cover field, directional field and dynamic awareness geometry then performed legitimate 64,000-cell work synchronously on the main thread.

The user-provided `performance-report-v2` showed repeated 200–427 ms stalls, but had no `computation` section or immutable build identity. It is accepted as symptom evidence, not as proof of behavior at the PR #113 base SHA.

## Data ownership

### 1. Directional terrain sector basis

`DirectionalTerrainSectorBasis` owns map-derived directional terrain geometry. For every cell and each of eight fixed sectors it stores:

- slope;
- protection;
- exposure;
- crest, valley and silhouette contributions.

Its key depends only on:

- map width and height;
- metres per cell;
- terrain revision;
- height revision.

Unit movement, knowledge revision, threat amplitude and subjective threat movement do not rebuild this basis.

### 2. Position-independent world danger field

The full danger raster depends on:

- subjective threat content and estimated positions;
- map terrain, height, forest and object revisions;
- selected-unit posture and other tactical parameters that actually change world danger.

It does **not** depend on the selected unit's current position. The legacy `originX/originY` directional API parameters remain for compatibility, but are not world-field key inputs.

Selected-unit movement performs only:

- O(1) current-cell lookup;
- route-danger sampling from the completed field;
- bounded-radius safe-position ranking;
- marker redraw when displayed winners change.

### 3. Worker-owned full-map builds

`AwarenessWorldWorker` owns cold and moving-threat full-map computation. The browser main thread owns only scheduling, the last completed result and the Pixi texture.

The worker receives:

- a transferable map snapshot containing terrain, height and forest typed arrays plus normalized map objects;
- selected posture;
- subjective `KnownThreatMemory[]` only;
- a stable synthetic world origin used solely for compatibility with APIs whose output is now position-independent.

It never receives or reads objective hidden hostile positions.

The worker returns transferable compact arrays:

- danger;
- concealment;
- safety;
- expected protection;
- threat-relative protection;
- protected-threat indexes;
- prepacked danger and stealth RGBA words.

The worker may internally build canonical `SoldierAwarenessCell[]`; those objects remain off the main thread and are not transferred.

## Scheduling protocol

The renderer enforces:

```text
one job in flight
+ at most one latest pending snapshot
```

Rules:

- a new request while idle starts immediately;
- a new request while busy replaces the previous pending snapshot;
- replaced pending work increments cancellation/coalescing diagnostics;
- an old completed result whose map key or raster key is no longer current is dropped;
- stale results are never applied;
- the last completed raster remains visible while a new job runs;
- after movement settles for 120 ms, a final exact request is issued;
- map-key changes terminate the old worker and configure a fresh map snapshot;
- renderer destruction terminates the worker and clears timers.

The queue cannot grow beyond one pending snapshot, so fast perception updates cannot create an allocation or latency backlog.

## Raster application

The overlay remains one cached PixiJS sprite. The main thread keeps one reusable RGBA `Uint8Array` and a `Uint32Array` view. Applying a completed worker result is:

```text
Uint32Array.set
→ BaseTexture.update
```

No live update creates per-cell Pixi objects, canvas textures or `ImageData` copies.

## Threat position precision

Subjective threat position remains cell-aware rather than randomly coarsened:

- threat-relative object/forest geometry uses the established 0.1-cell content quantization;
- the directional derived-field key uses 0.1-cell subjective positions and normalized relative threat weights;
- sector basis values remain continuous through interpolation between neighboring sectors;
- the final exact request is mandatory after movement stops;
- wall-side crossing and reverse-slope semantics remain acceptance requirements.

Objective hidden movement cannot change these keys because only subjective memory is serialized to the worker.

## Safe-position movement contract

Safe ranking uses the existing 120-metre radius and score formula. It scans only the bounded local window, retains a stable top eight and allocates at most the winners. Current position and route danger read the already completed field.

Marker graphics are redrawn only when the ordered coordinates of displayed winners change.

## Cache and invalidation rules

### Static basis invalidates on

- map dimensions or metres per cell;
- terrain revision;
- height revision.

### Threat-relative cover invalidates on

- subjective threat position at its documented content resolution;
- posture;
- map object revision;
- map forest revision.

It excludes raw strength, suppression, confidence, visibility, knowledge revision and objective hidden position.

### Derived directional world field invalidates on

- static basis key;
- subjective threat position;
- normalized relative threat distribution.

Raw amplitude/revision changes that preserve normalized distribution reuse the field.

### World raster invalidates on

- the map content key;
- posture;
- subjective awareness knowledge key.

It excludes selected-unit position and active route position.

## Performance report v4

`performance-report-v4` contains:

```text
build.branch
build.commitSha
build.buildId
build.generatedAt
build.performanceContractVersion
```

Unknown development builds are explicitly identified as unknown; CI injects the exact expected branch and SHA and browser tests assert them.

`computation.awarenessMovement` includes:

- world raster builds;
- selected-unit local updates;
- safe-position scans and scanned-cell count;
- directional basis builds;
- worker jobs started, completed, cancelled and coalesced;
- stale results dropped;
- main-thread raster swaps;
- final refresh requested/applied;
- current and maximum pending depth;
- worker compute and end-to-end latency;
- main-thread apply and local-update costs;
- requested/applied raster keys;
- last worker error.

Threat-relative, directional, static-awareness and dynamic-rescore diagnostics remain in the same `computation` section.

## Deterministic regression

Run:

```bash
npm run danger-layer-performance:smoke
npm run danger-layer-movement-performance:smoke
```

The movement smoke uses a deterministic 320 × 200 scene with wall, light/dense forest and ridge content. It proves:

- selected-unit movement: zero new threat-relative geometry, zero derived directional field and zero sector-basis builds;
- objective hidden movement: zero subjective geometry invalidation;
- subjective hostile movement: one legitimate derived geometry update while the sector basis is reused.

## Real browser movement regression

`tests/danger-layer-movement-performance.spec.ts` uses the production application ticker and real routed orders. Coordinates are changed only by `SimulationTick`; visible threat positions are refreshed through perception and `syncSoldierThreatMemory`.

The scene includes six units, a selected friendly, a visible hostile, light forest, dense forest, a ridge/reverse-slope fixture and a wall. Scenarios cover:

1. selected unit moves while threats remain static;
2. visible hostile moves while the selected unit is static;
3. six units move simultaneously;
4. hidden hostile objective movement;
5. hostile wall-side crossing with final safe-winner validation.

Structural acceptance gates queue depth, stale-result handling, final-key application, local update cost, main-thread raster apply cost and exact build identity. GitHub-hosted Chromium runs through software rendering, so its RAF/FPS and worker cold latency are evidence, not hardware acceptance. The 50–60 FPS target must still be confirmed from a fresh v4 report on the user's Windows scene.

## Functional boundaries

- Core simulation and AI do not import PixiJS.
- The renderer never becomes authoritative tactical state.
- `SimulationTick` remains the only coordinate integrator.
- The worker receives subjective knowledge only.
- Wall, forest, reverse-slope, protected-side and `protectedAgainstThreatId` semantics remain intact.
- No performance threshold may replace the structural counters above.
