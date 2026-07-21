# Static Tactical Position Basis and Generalized Tactical Search

Date: 2026-07-21
Status: approved implementation design
Base branch: `real-wargame-preview`
Feature branch: `feature/20260721-tactical-position-basis`

## 1. Purpose

Replace the cover-only tactical-position path with a two-level system:

1. A reusable objective basis built from map geometry and material properties.
2. A bounded subjective search for one soldier, one position kind and one tactical objective.

The system must expose three independent objective map layers:

- observation potential;
- defense potential;
- firing potential.

The static basis must never consume current enemy positions, unit knowledge, current danger, orders, weapons or routes. The subjective search must never consume hidden objective enemy state.

Initial static construction may be expensive. Quality and stable reuse have priority over short build time. UI rendering and repeated per-soldier searches remain strictly bounded.

## 2. Existing architecture retained

The implementation extends existing canonical systems instead of replacing them:

- `MapRuntimeState` revisions and dirty-region history;
- `DirectionalTerrainSectorBasis` with eight directional sectors;
- `VisibilityRayKernel` with separate `visual` and `fire` channels;
- environment-profile visibility, fire and movement domain keys;
- simulation-owned awareness fields and subjective threat snapshots;
- `TacticalPositionSearchService` request lifecycle and stale-result rejection;
- one local reachability field per query instead of one A* per candidate;
- `SimulationTacticalPositionGraphHost` and the existing graph runtime;
- raster-sprite overlay rendering and simulation-owned presentation snapshots.

## 3. Chosen architecture

### 3.1 Static basis subsystem

Add a platform-independent subsystem under `src/core/tactical/static/`:

- `StaticTacticalPositionBasis.ts` — immutable published contracts and readers;
- `StaticTacticalPositionSettings.ts` — versioned structured settings;
- `StaticTacticalPositionIdentity.ts` — exact input identity;
- `StaticTacticalPositionBuilder.ts` — pure deterministic full-map computation;
- `StaticTacticalCandidateIndex.ts` — chunked compact candidate extraction;
- `StaticTacticalPositionWorkerProtocol.ts` — transferable worker messages;
- `StaticTacticalPositionService.ts` — one shared long-lived worker, publication and stale rejection.

A `StaticTacticalPositionBasisSnapshot` is published once and never mutated. Rebuilds publish a new snapshot object. Renderer-facing code receives read-only access and does not own calculation.

### 3.2 Generalized subjective search

Generalize the existing query system instead of creating three services:

- canonical kinds: `observation`, `defense`, `firing`;
- compatibility input kind: `cover`, normalized to `defense`;
- existing objectives remain separate from kind:
  - `balanced`;
  - `advance_to_threat`;
  - `withdraw_from_threat`;
  - `continue_order`;
  - future-compatible `hold_area` may be represented in contracts but is not required for old graphs.

The existing service remains the single owner of query lifecycle and one shared subjective-search worker.

## 4. Static basis data layout

The first implementation uses eight sectors but all indexing helpers accept `sectorCount` from metadata.

For `cellCount = width * height`:

- `observationPotential: Uint8Array(cellCount)`;
- `defensePotential: Uint8Array(cellCount)`;
- `firingPotential: Uint8Array(cellCount)`;
- `observationByDirection: Uint8Array(cellCount * sectorCount)`;
- `protectionByDirection: Uint8Array(cellCount * sectorCount)`;
- `firingByDirection: Uint8Array(cellCount * sectorCount)`;
- `availablePostureMask: Uint8Array(cellCount)`;
- `concealment: Uint8Array(cellCount)`;
- `staticProtectionByPosture: Uint8Array(cellCount * 3)`;
- `observationByPosture: Uint8Array(cellCount * 3)`;
- `firingByPosture: Uint8Array(cellCount * 3)`;
- `surfaceSuitability: Uint8Array(cellCount)`;
- `reverseSlopeByDirection: Uint8Array(cellCount * sectorCount)`;
- `immediateFireClearanceByDirection: Uint8Array(cellCount * sectorCount)`.

Values are normalized to 0–255. Posture bits are standing=1, crouched=2, prone=4. The three posture planes use the canonical order standing, crouched, prone.

The published snapshot contains metadata separately:

- width, height, meters per cell;
- sector count and sector angle;
- identity and settings version;
- build timestamp and duration;
- ray/probe counters;
- candidate-index metadata.

## 5. Exact static identity

`StaticTacticalPositionBasisIdentity` contains only inputs that affect the objective basis:

- map width, height, cell size and meters per cell;
- terrain revision;
- height revision;
- forest/vegetation revision;
- object revision;
- environment visibility domain key;
- environment fire domain key;
- environment movement domain key only for surface/passability suitability;
- static-settings schema version and stable settings digest;
- sector count;
- algorithm version.

Presentation revisions, selected unit, current threats, orders, awareness revisions and camera state are excluded.

When a worker result returns, the service compares the complete identity with the latest requested identity. A mismatch publishes `stale` diagnostics and discards all buffers.

## 6. Static calculation

### 6.1 Inputs

The worker receives one immutable map snapshot containing:

- dimensions and scale;
- compact height and material-code arrays;
- environment profile;
- rasterized object geometry and cover properties;
- navigation passability/surface suitability;
- exact static identity and settings.

No PixiJS, DOM or live simulation objects cross the boundary.

### 6.2 Directional sampling

For every passable cell, posture and sector, the builder evaluates a configured deterministic set of rays/distances.

Observation samples use `VisibilityRayKernel` semantics and measure:

- visual transmission;
- visible depth;
- number of useful open directions;
- near and far occlusion;
- silhouette/exposure penalties;
- local concealment and partial protection.

Defense samples combine:

- directional terrain protection and reverse slope;
- rasterized object cover height/protection/reliability;
- posture-relative static protection;
- protected direction count;
- open-direction vulnerability;
- concealment and surface suitability.

Firing samples use the `fire` channel and measure:

- free firing depth;
- fire transmission;
- immediate muzzle clearance;
- supported firing postures;
- sector breadth;
- protection/concealment combination;
- slope and silhouette penalties.

Visual visibility, fire transmission and protection from return fire remain separate channels throughout calculation and scoring.

### 6.3 Overall static scores

Each overall field is a configured weighted aggregation, not a simple maximum.

Observation potential rewards useful view depth and sector coverage but penalizes complete exposure and lack of concealment/protection.

Defense potential rewards multi-directional protection and supported postures, while retaining specialized one-sided positions as good but not globally perfect.

Firing potential rewards useful fire sectors and transmission, but penalizes immediate blockage, excessive exposure and unsuitable slope.

## 7. Candidate index

The map is divided into configurable chunks, default 16×16 cells.

Each chunk stores separate packed lists for observation, defense and firing. The index uses struct-of-arrays buffers rather than per-cell objects:

- packed cell indices;
- static score;
- dominant-sector mask;
- posture mask;
- directional signature;
- chunk offsets and counts.

Extraction per kind performs:

1. minimum potential threshold;
2. local-maximum test;
3. non-maximum suppression by configurable cell distance;
4. directional-signature diversity preservation;
5. per-chunk candidate cap.

Default cap is 12 per kind per chunk, configurable in the range 8–16. Default minimum separation is 3 cells. Candidates with materially different dominant protection/view/fire sectors are not treated as duplicates.

The data layout and chunk offsets permit future partial rebuilding of dirty chunks. Version 1 may rebuild the full basis after significant geometry or settings changes.

## 8. Subjective query contracts

`TacticalQuery` gains:

- canonical `kind`;
- optional compatibility source kind `cover`;
- objective;
- kind-specific target specification;
- exact static-basis identity/revision;
- subjective awareness and knowledge revisions;
- order revision;
- weapon snapshot and revision only for firing queries;
- bounded reachability snapshot;
- search/risk/work limits.

Target specifications:

- observation: point or sector, desired distance, concealment/view preference;
- defense: known threats, threat sector or expected attack bearing;
- firing: known target, estimated target position, area or sector, effective/min/max range.

A result candidate contains:

- position and stable ID;
- kind and objective;
- final score;
- recommended posture;
- alternative posture mask;
- recommended facing radians and sector;
- posture reason;
- route or route reconstruction data;
- exact request identity;
- structured score breakdown;
- rejection information for inspected rejected candidates when diagnostics are enabled.

## 9. Subjective worker and bounded search

The service keeps one long-lived tactical-query worker and a bounded queue. No worker is created per request.

Lifecycle remains:

- queued;
- calculating;
- ready;
- stale;
- cancelled;
- failed.

Only one latest request is valid per `(ownerUnitId, queryKey)`. New work replaces old work for that key. Queue growth is capped and scheduling is round-robin across owners.

Search pipeline:

1. Build or consume one bounded reachability field.
2. Determine intersecting static-index chunks.
3. Read candidates for the requested kind only.
4. Hard-filter passability, posture, route/risk limits and target constraints.
5. Cheap-score all remaining candidates from static directional data, route approximation, subjective danger, uncertainty and objective alignment.
6. Keep a configurable preliminary top set, default 36.
7. Keep a configurable exact set, default 12.
8. Perform bounded exact visual/fire/protection rays and route confirmation for that set only.
9. Return a configurable final count.

There is no A* per preliminary candidate and no full visibility map per candidate.

## 10. Subjective knowledge boundary

Query snapshots may contain only:

- detected contacts;
- estimated contact/threat positions;
- subjective danger and uncertainty;
- legal shared knowledge already represented by simulation contracts;
- current order and task;
- the querying soldier's weapon snapshot.

The worker cannot read `SimulationState`, selected-unit state, objective enemy arrays, PixiJS or DOM. UI selection never changes input knowledge.

## 11. Kind-specific exact checks

### Observation

Hard gates:

- reachable;
- supported posture;
- route limit;
- minimum point visibility or sector coverage.

Ranking includes visual transmission, sector coverage, desired distance, concealment, return-fire protection, subjective danger, route danger, uncertainty and objective alignment.

### Defense

Hard gates:

- reachable;
- supported posture;
- minimum directional protection against primary known threat/sector;
- route risk limit;
- optional critical-vulnerability prohibition.

Ranking includes threat-relative protection, static protection, reverse slope, concealment, open dangerous directions, position/route danger, retained observation/fire capability, uncertainty and objective alignment.

### Firing

Hard gates:

- reachable;
- supported firing posture;
- exact fire line or required sector clearance;
- immediate muzzle clearance;
- weapon range for a known/estimated target;
- danger limit.

Ranking includes fire transmission, effective-range fit, visual quality, return-fire protection, exposed silhouette, concealment, position/route danger, withdrawal possibility and objective alignment.

Version 1 uses the existing small-arms weapon model. It does not introduce a separate machine-gun emplacement model.

## 12. AI graph compatibility

Add `CreateTacticalPositionCandidates` with properties:

- kind;
- objective;
- search radius;
- maximum route cost;
- returned candidate count;
- risk limits;
- request key;
- result field;
- target/sector parameters.

`CreateCoverCandidates` remains loadable and executable. Migration/adapter behavior maps it to `kind=defense`, preserving its existing properties, key generation and blackboard result shape.

Saved graphs are not rewritten destructively. New result fields are additive. Existing `SelectTacticalPosition` and movement ownership remain intact.

Orders created from a selected result preserve:

- destination cell;
- arrival posture;
- facing;
- position kind;
- originating request identity.

`SimulationTick` remains the only owner of coordinate changes.

## 13. UI and rendering

### Inspector layers

Add three exclusive positional layer modes:

- Observation positions / «Наблюдательные позиции»;
- Defense positions / «Оборонительные позиции»;
- Firing positions / «Огневые позиции».

Each mode reads one ready static field and displays it as one raster sprite with a separate gradient and legend. Opening/closing a layer, camera movement, pointer movement and frame rendering never trigger a basis build.

Existing danger, stealth, route-cost and memory layers remain unchanged.

### Position-search tab

Add a kind selector and kind-specific target controls. The search button only enqueues a request.

Candidate markers use distinct shapes/accents by kind while retaining posture orientation. The details panel shows:

- request state;
- kind and objective;
- score;
- recommended and alternative postures;
- facing;
- score components;
- rejection reason when available.

Renderer code consumes published basis and query snapshots only and releases replaced Pixi textures/sprites.

## 14. Settings

Settings are separated into structured groups:

- static basis geometry/ray settings;
- observation static weights;
- defense static weights;
- firing static weights;
- candidate-index settings;
- common subjective budgets;
- observation subjective settings;
- defense subjective settings;
- firing subjective settings;
- posture settings;
- directional-sector settings.

Minimum configurable values include chunk size, per-chunk cap, separation, thresholds, static weights, preliminary/exact counts, ray limit, route limit, danger limit and subjective weights.

All settings have a version and stable digest. No tactical constants are hidden inside renderers or UI handlers.

## 15. Diagnostics

Publish safe counters and timings:

- static build state and exact identity;
- total/static-stage/chunk-index build milliseconds;
- cells, rays and posture probes processed;
- candidate counts before and after suppression by kind;
- cache hits, rebuilds and stale results;
- query queue depth and replacements;
- cheap/exact candidates and exact rays per query;
- route expansions;
- worker failures and synchronous-fallback use;
- renderer rebuild and display-object counts.

Diagnostics contain no hidden enemy coordinates beyond what is legal for the inspected subjective request.

## 16. Verification strategy

Add deterministic smoke tests for:

- static identity and stale rejection;
- typed-array dimensions and posture masks;
- three distinct static fields;
- one-sided defense directionality;
- observation quality versus exposed hilltop penalty;
- visual/fire channel separation;
- candidate local maxima, spacing, cap and directional diversity;
- no rebuild from layer opening/camera/pointer/render;
- `cover` compatibility normalization;
- queue replacement, fairness and bounded growth;
- subjective hidden-state denial;
- one reachability field and no candidate-times-A* behavior;
- observation, defense and firing hard gates;
- posture/facing/result identity persistence;
- old graph loading and `CreateCoverCandidates` execution;
- three inspector layers and marker distinction;
- texture/display-object cleanup.

Focused verification target after implementation:

- `npx tsc --noEmit`;
- new static-basis smoke;
- generalized tactical-query smoke;
- tactical-position graph/runtime smoke;
- tactical workspace smoke;
- visibility/fire regression smokes;
- `npm run build`.

GitHub Actions, Playwright and deployment remain outside this task unless separately authorized.

## 17. Implementation order

1. Contracts, identity, settings and pure static builder.
2. Candidate index and static service/worker.
3. Simulation lifecycle integration and basis publication.
4. Generalized query contracts and worker search.
5. Defense/cover compatibility path.
6. Observation and firing exact checks.
7. Graph node, contracts and migration.
8. Inspector raster layers.
9. Search tab and candidate diagnostics.
10. Focused smoke tests, documentation sync and build verification.
