# Field-Driven Tactical Position System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the removed object/forest cover list with a bounded tactical-position system driven by each soldier's subjective awareness fields.

**Architecture:** Full-map physical, directional-cover, terrain and danger preparation remains worker-owned. A shared application runtime publishes typed arrays for rendering and AI; local candidate extraction reads only a bounded neighborhood, performs one bounded reachability expansion, and returns distinct position-plus-posture candidates. Graph v2 consumes the same prepared snapshot through the explicit tactical-query nodes.

**Tech Stack:** TypeScript 5, PixiJS 8, Vite workers, typed arrays, Graph v2 tactical queries.

## Global Constraints

- Work only on `feature/20260719-tactical-position-system`, based on `real-wargame-preview`.
- Do not run GitHub Actions unless the user explicitly requests them.
- No renderer or UI component may own gameplay calculations.
- No synchronous full-map fallback is allowed when the worker result is unavailable.
- No candidate loop may call A* once per candidate.
- Gameplay work limits must be deterministic cell/candidate budgets, never wall-clock cutoffs.
- Every worker result must carry exact map/threat identity and be rejected when stale.
- Worker queues, ready fields, owner registries and local search caches must remain explicitly bounded.
- Subjective tactical knowledge, posture and uncertainty must remain part of field identity and scoring.

---

## Required Performance Design Review

**Hot path**

- `PixiAwarenessHeatmapRenderer.render()` performs key comparison, cached texture swap and cached local-position lookup.
- Graph v2 `CreateCoverCandidates` reads a prepared field through `AwarenessTacticalPositionAdapter`.
- `searchTacticalPositions()` scans a bounded local region and builds one bounded local route field.

**Worst-case complexity**

- Worker world preparation: `O(map cells × active threat geometry)` only after exact map/threat invalidation.
- Local tactical search: `O(maxSampledCells + maxRouteExpansions log maxRouteExpansions)`.
- Candidate deduplication: `O(maxCandidates²)` with `maxCandidates` explicitly bounded and small.
- Exact movement route: one normal route request after Graph v2 selects the winner; never one route per raw candidate.

**Main-thread work**

- Typed-array reads and at most 4,096 sampled/expanded local cells for AI requests.
- Display requests are capped at 2,048 sampled/expanded cells.
- Repeated calls in the same unit cell reuse the local search cache.
- Raster rendering updates one existing texture and does not create per-cell Pixi objects.

**Full-map work**

- Owned by `AwarenessWorldWorker` only.
- Soldier movement alone does not enter world-field identity and cannot trigger a 64,000-cell rebuild.
- Main-thread code has no full-map fallback.

**Shared prepared result**

- `AwarenessWorldRuntime` is the owner of the transferred field.
- `PixiAwarenessHeatmapRenderer` and Graph v2 read the same `AwarenessWorkerFieldPayload`.
- The payload includes passability, movement cost, danger, suppression, concealment, safety, uncertainty, threat-relative protection, directional slope and posture-specific static protection.

**Invalidation identity**

- Map identity includes dimensions, cell scale, terrain/height/forest/object revisions and visibility/fire/movement material-domain keys.
- Tactical identity includes posture and canonical subjective threat content.
- Worker results are matched against job id, map key, world key and canonical threat key.
- Local search identity additionally includes unit cell, posture, order target and deterministic search budgets.

**Worker/queue budget**

- One in-flight world job.
- Latest request per unit replaces earlier pending work.
- Pending owners capped at 12.
- Ready owners capped at 12.
- Active provider states capped at 4.

**Cache memory bound**

- Ready world fields: maximum 12.
- Local search cache: maximum 4 entries per unit.
- Tactical candidate count: request bounded, normally 8–12.
- Existing threat geometry and danger-field caches retain their own repository-defined limits.

**Teardown**

- Renderer releases the registered provider.
- Runtime terminates the worker, drops pending/ready/search caches and clears listeners.
- Compatibility render slots remove children and remain hidden.
- Removed tooltip code installs no document/window listeners.

**Measurement plan**

- Focused pure search smoke: directional side, blocked cells, posture choice, deterministic budgets.
- Focused Graph v2 smoke: registered provider, selection, teardown and unavailable result.
- Workspace source contract: no old object/forest discovery, circles/squares, tooltip listeners or object-direction calculation.
- TypeScript and production Vite build through the ordinary preview deployment.
- Existing awareness cache, danger-layer movement and scheduler checks when a local checkout is available.
- Heavy browser performance scenario only after the implementation is frozen and only with a concrete `PERFORMANCE_REASON`.

---

### Task 1: Remove Legacy Cover Discovery

**Files:**
- Delete: `src/core/cover/CoverTacticalCandidates.ts`
- Modify: `src/core/knowledge/UnitKnowledge.ts`
- Modify: `src/core/knowledge/SimulationCoverSelection.ts`
- Modify: `src/rendering/PixiCoverDirectionRenderer.ts`
- Modify: `src/ui/WorkspaceTooltipGuard.ts`
- Modify: `src/tactical-workspace-stage8.css`

**Interfaces:**
- Consumes: subjective `UnitTacticalKnowledge.threats` only.
- Produces: no old cover candidates, hit targets, tooltips or selected-object cover direction.

- [x] Delete the object-based tactical candidate generator.
- [x] Remove object, forest-cell and LOS cover discovery from unit knowledge.
- [x] Turn remaining old selection exports into inert compatibility functions.
- [x] Remove selected-object directional-cover calculation.
- [x] Remove tooltip listeners and tooltip CSS.
- [ ] Remove compatibility exports after all remaining callers are migrated from the workspace base.

### Task 2: Publish Reusable Tactical Field Inputs

**Files:**
- Modify: `src/core/knowledge/AwarenessWorldWorkerProtocol.ts`
- Modify: `src/core/knowledge/AwarenessWorldFieldBuilder.ts`
- Create: `src/runtime/AwarenessWorldRuntime.ts`

**Interfaces:**
- Consumes: `TacticalMap`, canonical subjective threats and soldier posture.
- Produces: `AwarenessWorkerFieldPayload` with typed arrays required by renderer and tactical search.

- [x] Add passability and physical movement cost arrays.
- [x] Add danger, suppression, safety, uncertainty and threat-relative protection arrays.
- [x] Add directional slope arrays.
- [x] Add standing, crouched and prone static-protection arrays.
- [x] Transfer field arrays from one worker owner.
- [x] Add latest-per-unit coalescing, fair bounded queue and stale-result rejection.
- [x] Reuse a world field when only the soldier's current cell changes.

### Task 3: Implement Bounded Tactical Position Search

**Files:**
- Create: `src/core/tactical/TacticalPositionSearch.ts`
- Create: `scripts/tactical_position_search_smoke.ts`
- Create: `scripts/tactical_position_search_smoke.mjs`

**Interfaces:**
- Consumes: `TacticalPositionFieldView` plus an origin and deterministic budgets.
- Produces: `TacticalPositionSearchResult` containing distinct `TacticalPositionCandidateSeedV2` records.

- [x] Enumerate cells in deterministic rings around the unit.
- [x] Reject blocked, out-of-radius and unreachable cells.
- [x] Build one bounded local route field for all candidates.
- [x] Evaluate standing, crouched and prone variants.
- [x] Score residual danger, safety gain, suppression, protection, concealment, uncertainty, slope, route danger and order alignment.
- [x] Merge nearby plateau points with minimum separation.
- [x] Prohibit `performance.now`, `findGridPath` and `map.objects` in candidate generation.

### Task 4: Connect Graph v2

**Files:**
- Create: `src/core/tactical/TacticalPositionProvider.ts`
- Create: `src/runtime/AwarenessTacticalPositionAdapter.ts`
- Modify: `src/core/ai/AiGraphRuntime.ts`
- Create: `src/core/ai/AiGraphRuntimeLegacy.ts`
- Create: `scripts/tactical_position_graph_runtime_smoke.ts`
- Create: `scripts/tactical_position_graph_runtime_smoke.mjs`

**Interfaces:**
- Consumes: `TacticalQueryGenerationRequest` from `CreateCoverCandidates`.
- Produces: prepared field-driven candidates or an explicit unavailable/no-candidate stop reason.

- [x] Register providers per active simulation with a bounded registry.
- [x] Ignore wall-clock `maxCalculationMs` as a gameplay stopping authority.
- [x] Return no synchronous fallback while the worker is preparing data.
- [x] Supply candidates to Graph v2 when no explicit host generator is present.
- [x] Clear provider access during teardown.
- [ ] Publish the selected candidate's recommended posture to explicit Graph v2 memory.

### Task 5: Replace Active Visualization

**Files:**
- Modify: `src/rendering/PixiAwarenessHeatmapRenderer.ts`
- Modify: `src/rendering/PixiOverlayRenderer.ts`
- Create: `src/rendering/PixiOverlayRendererBase.ts`
- Modify: `src/ui/TacticalWorkspace.ts`
- Create: `src/ui/TacticalWorkspaceBase.ts`

**Interfaces:**
- Consumes: the same `AwarenessWorldRuntime` snapshot used by Graph v2.
- Produces: raster danger/stealth layers and diamond tactical-position markers.

- [x] Draw positions as diamonds instead of legacy circles/squares.
- [x] Distinguish winner and alternatives without per-cell display objects.
- [x] Encode recommended posture with one, two or three internal lines.
- [x] Skip the old knowledge-marker render layer.
- [x] Remove old cover list, selected card and tooltip from the active workspace.
- [x] Scope compatibility cleanup to one workspace subtree and coalesce it per animation frame.
- [ ] Replace the compatibility workspace/overlay bases with physically cleaned implementations when patch-capable local checkout is available.

### Task 6: Verification and Cleanup

**Files:**
- Modify: `scripts/tactical_workspace_smoke_incremental_directional.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: source tree and focused executable scenarios.
- Produces: evidence that legacy active paths are gone and performance limits are enforced.

- [x] Add source contracts for removed discovery and marker paths.
- [x] Add bounded-search smoke command.
- [x] Add Graph v2 provider smoke scenario.
- [ ] Run focused smoke commands in a local checkout.
- [ ] Confirm TypeScript and production build.
- [ ] Run existing awareness/scheduler focused checks justified by the final diff.
- [ ] Inspect the preview UI only after build passes.
- [ ] Run heavy performance only with an explicit scenario-specific reason and user approval where required.
