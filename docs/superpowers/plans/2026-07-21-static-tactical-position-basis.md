# Static Tactical Position Basis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build three reusable objective tactical-position fields and a generalized bounded subjective search for observation, defense and firing positions without breaking existing cover graphs.

**Architecture:** A simulation-owned static-basis service publishes immutable typed-array snapshots and a chunked candidate index. The existing tactical-query service remains the single subjective request owner and is generalized to consume that basis, one bounded reachability field and legal per-soldier knowledge.

**Tech Stack:** TypeScript 5, Vite 5, PixiJS 8, browser Web Workers, deterministic smoke scripts.

## Global Constraints

- Work only on `feature/20260721-tactical-position-basis`, created from current `real-wargame-preview`.
- Core simulation and AI must not import PixiJS or DOM.
- Renderer and UI read ready snapshots only and never start full-map work.
- Static identity includes only geometry/material/settings inputs.
- Subjective queries use only legal soldier knowledge.
- Use typed arrays and bounded queues; no per-cell object graphs.
- No candidate-times-A* and no full visibility map per candidate.
- Existing `CreateCoverCandidates` graphs must remain valid.
- Static initial construction may be long; repeated search and UI work must remain bounded.
- Do not run GitHub Actions, Playwright or deployment without separate approval.

---

### Task 1: Static contracts, identity and settings

**Files:**
- Create: `src/core/tactical/static/StaticTacticalPositionBasis.ts`
- Create: `src/core/tactical/static/StaticTacticalPositionIdentity.ts`
- Create: `src/core/tactical/static/StaticTacticalPositionSettings.ts`
- Create: `scripts/static_tactical_position_contract_smoke.ts`
- Create: `scripts/static_tactical_position_contract_smoke.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `MapRevisionSnapshot`, `EnvironmentProfileRuntimeSnapshot`, `UnitPosture`.
- Produces: `StaticTacticalPositionKind`, `StaticTacticalPositionBasisIdentity`, `StaticTacticalPositionBasisSnapshot`, `StaticTacticalPositionSettings`, posture/sector readers and a stable settings digest.

- [ ] **Step 1: Write the contract smoke**

Create assertions for `cellCount`, `sectorCount=8`, array lengths, posture bits, stable settings digest and exact identity equality. The smoke must reject a changed visibility key and ignore a presentation-only key.

```ts
const snapshot = createEmptyStaticTacticalPositionBasis(identity, settings, 4, 3);
assert.equal(snapshot.observationPotential.length, 12);
assert.equal(snapshot.protectionByDirection.length, 96);
assert.equal(snapshot.staticProtectionByPosture.length, 36);
assert.equal(STATIC_TACTICAL_POSTURE_STANDING, 1);
assert.equal(STATIC_TACTICAL_POSTURE_CROUCHED, 2);
assert.equal(STATIC_TACTICAL_POSTURE_PRONE, 4);
assert.equal(sameStaticTacticalPositionIdentity(identity, { ...identity }), true);
assert.equal(sameStaticTacticalPositionIdentity(identity, { ...identity, visibilityKey: 'changed' }), false);
```

- [ ] **Step 2: Run the smoke and verify failure**

Run: `npm run tactical-static-contract:smoke`
Expected: FAIL because the static tactical modules do not exist.

- [ ] **Step 3: Implement contracts and structured settings**

Define:

```ts
export type StaticTacticalPositionKind = 'observation' | 'defense' | 'firing';
export const STATIC_TACTICAL_SECTOR_COUNT = 8;
export const STATIC_TACTICAL_POSTURE_STANDING = 1;
export const STATIC_TACTICAL_POSTURE_CROUCHED = 2;
export const STATIC_TACTICAL_POSTURE_PRONE = 4;

export interface StaticTacticalPositionBasisIdentity {
  readonly algorithmVersion: number;
  readonly width: number;
  readonly height: number;
  readonly cellSize: number;
  readonly metersPerCell: number;
  readonly terrainRevision: number;
  readonly heightRevision: number;
  readonly vegetationRevision: number;
  readonly objectRevision: number;
  readonly visibilityKey: string;
  readonly fireKey: string;
  readonly movementKey: string;
  readonly settingsVersion: number;
  readonly settingsDigest: string;
  readonly sectorCount: number;
}
```

Use separate settings groups: `geometry`, `observation`, `defense`, `firing`, `index`, `postures`, `sectors`. Normalize every value and compute a deterministic digest.

- [ ] **Step 4: Run the smoke**

Run: `npm run tactical-static-contract:smoke`
Expected: PASS with `static tactical contracts smoke passed`.

- [ ] **Step 5: Commit**

```bash
git add src/core/tactical/static scripts/static_tactical_position_contract_smoke.* package.json
git commit -m "feat: add static tactical position contracts"
```

---

### Task 2: Pure high-quality static basis builder

**Files:**
- Create: `src/core/tactical/static/StaticTacticalPositionMapSnapshot.ts`
- Create: `src/core/tactical/static/StaticTacticalPositionBuilder.ts`
- Create: `scripts/static_tactical_position_builder_smoke.ts`
- Create: `scripts/static_tactical_position_builder_smoke.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: Task 1 settings/contracts, `DirectionalTerrainSectorBasis`, environment materials, object cover data and `VisibilityRayKernel` semantics.
- Produces: `buildStaticTacticalPositionBasis(map, identity, settings): StaticTacticalPositionBuildResult`.

- [ ] **Step 1: Write deterministic geometry fixtures**

Add fixtures for:

- open hilltop;
- reverse slope;
- east-facing wall;
- dense vegetation lane;
- clear visual but poor fire transmission;
- immediate obstacle in front of shooter;
- standing-only and prone-beneficial cover.

Assert:

```ts
assert.ok(eastWallDefenseEast > eastWallDefenseWest + 30);
assert.ok(hillObservation > flatObservation);
assert.ok(hillOverallObservation < hillViewOnlyPotential);
assert.ok(reverseSlopeDefense > exposedSlopeDefense);
assert.ok(clearVisualFirePoor.firing < clearVisualFireGood.firing);
assert.equal(immediateObstacle.immediateFireClearance, 0);
```

- [ ] **Step 2: Run the smoke and verify failure**

Run: `npm run tactical-static-builder:smoke`
Expected: FAIL because the builder does not exist.

- [ ] **Step 3: Implement compact map snapshot preparation**

Prepare one immutable snapshot with dimensions, scale, height/material code arrays, rasterized object cover/height arrays, passability and environment profile. Do not retain live map objects in worker-facing contracts.

```ts
export interface StaticTacticalPositionMapSnapshot {
  readonly width: number;
  readonly height: number;
  readonly cellSize: number;
  readonly metersPerCell: number;
  readonly heightLevels: Int8Array;
  readonly surfaceMaterialCodes: Uint16Array;
  readonly vegetationMaterialCodes: Uint16Array;
  readonly passable: Uint8Array;
  readonly objectTopHeightMeters: Float32Array;
  readonly objectProtection: Uint8Array;
  readonly objectConcealment: Uint8Array;
  readonly objectPostureMask: Uint8Array;
}
```

- [ ] **Step 4: Implement directional/posture sampling**

For each passable cell, posture and sector, sample deterministic rays at configured distances. Reuse canonical height/material semantics and keep visual and fire transmission separate. Fill all Task 1 arrays and aggregate three overall fields with normalized configurable weights.

- [ ] **Step 5: Run builder smoke**

Run: `npm run tactical-static-builder:smoke`
Expected: PASS with `static tactical builder smoke passed`.

- [ ] **Step 6: Commit**

```bash
git add src/core/tactical/static scripts/static_tactical_position_builder_smoke.* package.json
git commit -m "feat: build directional tactical position basis"
```

---

### Task 3: Chunked candidate index

**Files:**
- Create: `src/core/tactical/static/StaticTacticalCandidateIndex.ts`
- Create: `scripts/static_tactical_candidate_index_smoke.ts`
- Create: `scripts/static_tactical_candidate_index_smoke.mjs`
- Modify: `src/core/tactical/static/StaticTacticalPositionBasis.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: Task 2 basis arrays and Task 1 index settings.
- Produces: `StaticTacticalCandidateIndexSnapshot`, `buildStaticTacticalCandidateIndex`, `readStaticTacticalChunkCandidates`.

- [ ] **Step 1: Write index tests**

Use a synthetic 32×16 basis. Assert local maximum suppression, three-cell separation, 12-per-kind cap, separate lists and preservation of east-facing and west-facing defense variants.

```ts
assert.ok(observation.length <= 12);
assert.ok(defense.some((item) => item.dominantSectorMask === EAST_MASK));
assert.ok(defense.some((item) => item.dominantSectorMask === WEST_MASK));
assert.equal(new Set(defense.map((item) => item.cellIndex)).size, defense.length);
```

- [ ] **Step 2: Run and verify failure**

Run: `npm run tactical-static-index:smoke`
Expected: FAIL because the candidate index does not exist.

- [ ] **Step 3: Implement packed extraction**

Store chunk offsets/counts plus packed `Uint32Array` cell indices and `Uint8Array` score, posture and directional-signature channels. Apply threshold, local maximum, distance suppression and directional diversity before the cap.

- [ ] **Step 4: Run index smoke**

Run: `npm run tactical-static-index:smoke`
Expected: PASS with `static tactical candidate index smoke passed`.

- [ ] **Step 5: Commit**

```bash
git add src/core/tactical/static scripts/static_tactical_candidate_index_smoke.* package.json
git commit -m "feat: index static tactical candidates by chunk"
```

---

### Task 4: Static worker service, revision identity and stale rejection

**Files:**
- Create: `src/core/tactical/static/StaticTacticalPositionWorkerProtocol.ts`
- Create: `src/core/tactical/static/StaticTacticalPositionService.ts`
- Create: `scripts/static_tactical_position_service_smoke.ts`
- Create: `scripts/static_tactical_position_service_smoke.mjs`
- Modify: `src/core/simulation/SimulationState.ts`
- Modify: `src/core/simulation/SimulationTick.ts`
- Modify: `src/core/map/MapRuntimeState.ts` only if a read helper is required
- Modify: `package.json`

**Interfaces:**
- Consumes: Tasks 1–3 and map/environment revision snapshots.
- Produces: `getStaticTacticalPositionService(state)`, `requestStaticTacticalPositionBasis(state)`, `readReadyStaticTacticalPositionBasis(state)`, diagnostics and subscription.

- [ ] **Step 1: Write service lifecycle tests**

Assert `idle -> queued -> calculating -> ready`, one long-lived worker, exact identity reuse, changed geometry/settings rebuild, selected-unit/movement/threat changes no rebuild, stale returned identity discarded and queue bounded to one latest static build.

- [ ] **Step 2: Run and verify failure**

Run: `npm run tactical-static-service:smoke`
Expected: FAIL because the static service does not exist.

- [ ] **Step 3: Implement transferable protocol**

Define configure/build/result/error messages. Transfer every typed-array buffer once. The service publishes a new immutable snapshot and never mutates a published one.

- [ ] **Step 4: Integrate simulation lifecycle**

Request the basis after state/map creation and when relevant map/environment/settings identity changes. Poll/apply worker responses from simulation-owned runtime code, never from the renderer. Use full rebuild in version 1 while retaining dirty-region metadata in diagnostics.

- [ ] **Step 5: Run service smoke**

Run: `npm run tactical-static-service:smoke`
Expected: PASS with `static tactical service smoke passed`.

- [ ] **Step 6: Commit**

```bash
git add src/core/tactical/static src/core/simulation src/core/map scripts/static_tactical_position_service_smoke.* package.json
git commit -m "feat: publish revision-safe static tactical basis"
```

---

### Task 5: Generalize tactical query contracts and bounded search

**Files:**
- Modify: `src/core/ai/tactical/TacticalQuery.ts`
- Modify: `src/core/tactical/TacticalPositionSearch.ts`
- Modify: `src/core/tactical/TacticalPositionSearchService.ts`
- Modify: `src/core/tactical/SimulationTacticalPositionGraphHost.ts`
- Create: `scripts/generalized_tactical_query_smoke.ts`
- Create: `scripts/generalized_tactical_query_smoke.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: ready static basis/index, existing subjective awareness payload, route/reachability data and weapon snapshot.
- Produces: generalized `TacticalPositionKind`, kind-specific target specs, score breakdown, posture/facing result and `enqueueTacticalSearch`.

- [ ] **Step 1: Write generalized query tests**

Cover:

- `cover` normalizes to `defense`;
- each kind reads only its index list;
- one reachability field is used;
- preliminary count defaults to 36, exact count to 12;
- exact rays are capped;
- observation point/sector hard gates;
- threat-relative defense directionality;
- firing range and immediate-clearance gates;
- hidden objective enemy data cannot be supplied;
- stale basis/knowledge/order/weapon identities are rejected.

- [ ] **Step 2: Run and verify failure**

Run: `npm run tactical-query-generalized:smoke`
Expected: FAIL because only cover queries are accepted.

- [ ] **Step 3: Extend contracts additively**

Define:

```ts
export type TacticalPositionKind = 'observation' | 'defense' | 'firing';
export type TacticalPositionCompatibilityKind = TacticalPositionKind | 'cover';

export interface TacticalPositionScoreBreakdown {
  readonly staticPotential: number;
  readonly directionalFit: number;
  readonly lineQuality: number;
  readonly protection: number;
  readonly concealment: number;
  readonly positionRisk: number;
  readonly routeRisk: number;
  readonly uncertainty: number;
  readonly objectiveAlignment: number;
  readonly rangeFit: number;
}
```

Add recommended facing, alternative posture mask, posture reason, request identity and kind to candidates without removing old fields.

- [ ] **Step 4: Replace full-cell sampling with indexed two-stage search**

Intersect reachable search bounds with static chunks, cheaply score indexed candidates, retain top preliminary/exact sets, then perform bounded exact checks. Reconstruct/confirm routes only for the exact/final set.

- [ ] **Step 5: Keep one shared worker and fair bounded queue**

Generalize worker messages and owner/key replacement. Schedule queued requests round-robin by owner. Preserve synchronous fallback only for environments without Worker and count fallback use in diagnostics.

- [ ] **Step 6: Run generalized query smoke and existing tactical-query smoke**

Run: `npm run tactical-query-generalized:smoke && npm run tactical-query:smoke`
Expected: both PASS.

- [ ] **Step 7: Commit**

```bash
git add src/core/ai/tactical src/core/tactical scripts/generalized_tactical_query_smoke.* package.json
git commit -m "feat: generalize tactical position queries"
```

---

### Task 6: AI graph node and legacy compatibility

**Files:**
- Modify: `src/core/ai/AiNodeTypes.ts`
- Modify: `src/core/ai/AiGraphRunnerLegacy.ts`
- Modify: `src/core/ai/contracts/AiNodeContractRegistry.ts`
- Modify: `src/core/ai/contracts/AiGraphMigration.ts`
- Modify: `src/core/ai/AiGameBridge.ts`
- Modify: `src/core/tactical/TacticalPositionOrders.ts`
- Modify: `src/core/tactical/TacticalPositionArrival.ts`
- Create: `scripts/tactical_position_kind_graph_smoke.ts`
- Create: `scripts/tactical_position_kind_graph_smoke.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: Task 5 generalized host/query API.
- Produces: `CreateTacticalPositionCandidates`, compatibility `CreateCoverCandidates`, persisted arrival kind/facing/request identity.

- [ ] **Step 1: Write graph compatibility tests**

Load an old graph containing `CreateCoverCandidates` and assert it executes as defense. Load a new graph for each kind and assert query properties, result field, posture/facing and owner key are preserved.

- [ ] **Step 2: Run and verify failure**

Run: `npm run tactical-position-kind-graph:smoke`
Expected: FAIL because the generalized node is unknown.

- [ ] **Step 3: Add node contract and evaluator**

Add `CreateTacticalPositionCandidates` properties and validation. Refactor shared evaluation into one function. Keep `CreateCoverCandidates` as a wrapper that supplies `kind='defense'` and preserves its legacy key/result behavior.

- [ ] **Step 4: Persist occupation metadata**

When issuing movement to a result, save destination, arrival posture, facing, kind and request identity. Do not add a second movement owner; `SimulationTick` remains the coordinate writer.

- [ ] **Step 5: Run graph tests**

Run: `npm run tactical-position-kind-graph:smoke && npm run tactical-position-graph-runtime:smoke`
Expected: both PASS.

- [ ] **Step 6: Commit**

```bash
git add src/core/ai src/core/tactical scripts/tactical_position_kind_graph_smoke.* package.json
git commit -m "feat: add generalized tactical position graph node"
```

---

### Task 7: Three static inspector layers

**Files:**
- Modify: `src/core/ui/RuntimeUiState.ts`
- Create: `src/rendering/PixiStaticTacticalPositionRenderer.ts`
- Modify: `src/rendering/PixiOverlayRenderer.ts`
- Modify: `src/ui/TacticalWorkspace.ts`
- Modify: `src/ui/TacticalWorkspaceBase.ts` only where canonical tabs are defined
- Modify: `src/tactical-workspace-stage8.css`
- Create: `scripts/static_tactical_position_layers_smoke.ts`
- Create: `scripts/static_tactical_position_layers_smoke.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: Task 4 ready basis snapshot.
- Produces: exclusive modes `observationPositions`, `defensePositions`, `firingPositions` and one raster renderer.

- [ ] **Step 1: Write layer contract tests**

Assert three independent labels/modes/gradients, exclusive activation, no basis request from tab click/render/camera/pointer, one sprite plus legend, texture replacement cleanup and unchanged danger/stealth/route modes.

- [ ] **Step 2: Run and verify failure**

Run: `npm run tactical-static-layers:smoke`
Expected: FAIL because the three layer modes do not exist.

- [ ] **Step 3: Implement raster renderer**

Use one `BufferImageSource`, one `Texture` and one `Sprite`. Convert selected 0–255 field through a per-kind lookup table only when basis identity or kind changes. Destroy replaced resources.

- [ ] **Step 4: Add inspector tabs and legends**

Add «Наблюдательные позиции», «Оборонительные позиции», «Огневые позиции» as exclusive layer tabs while preserving existing tabs. If the basis is preparing, show state text without starting work.

- [ ] **Step 5: Run layer smoke**

Run: `npm run tactical-static-layers:smoke`
Expected: PASS with `static tactical position layers smoke passed`.

- [ ] **Step 6: Commit**

```bash
git add src/core/ui src/rendering src/ui src/tactical-workspace-stage8.css scripts/static_tactical_position_layers_smoke.* package.json
git commit -m "feat: add three tactical potential layers"
```

---

### Task 8: Search controls, markers and diagnostics

**Files:**
- Modify: `src/ui/TacticalPositionSearchControls.ts`
- Modify: `src/core/tactical/SimulationTacticalPositionSelection.ts`
- Modify: `src/rendering/PixiAwarenessHeatmapRenderer.ts`
- Modify: `src/input/TacticalPositionInputController.ts`
- Modify: `src/tactical-workspace-stage8.css`
- Create: `scripts/tactical_position_search_ui_smoke.ts`
- Create: `scripts/tactical_position_search_ui_smoke.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: Tasks 5–7 query/presentation contracts.
- Produces: kind selector, kind-specific target inputs, request-only button, distinct markers and score/rejection diagnostics.

- [ ] **Step 1: Write UI smoke**

Assert the selector contains observation/defense/firing, clicking enqueues exactly one request, no gameplay scoring function is imported, markers differ by kind, and details expose state, kind, posture, facing and score breakdown.

- [ ] **Step 2: Run and verify failure**

Run: `npm run tactical-position-search-ui:smoke`
Expected: FAIL because the UI is cover-only.

- [ ] **Step 3: Implement request controls**

Keep objective separate from kind. Show only relevant target/sector/range fields. Build a serializable request snapshot and call `enqueueTacticalSearch`; do not run rays, pathfinding or scoring in DOM handlers.

- [ ] **Step 4: Implement marker and details presentation**

Retain posture orientation, add kind-specific marker shape/accent, draw recommended facing, and list structured score components. Surface rejection reason only from returned diagnostics.

- [ ] **Step 5: Run UI smoke and existing workspace smoke**

Run: `npm run tactical-position-search-ui:smoke && npm run workspace:smoke`
Expected: both PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ui src/core/tactical src/rendering src/input src/tactical-workspace-stage8.css scripts/tactical_position_search_ui_smoke.* package.json
git commit -m "feat: expose tactical position kinds in workspace"
```

---

### Task 9: Diagnostics, docs and focused verification

**Files:**
- Modify: `src/core/tactical/static/StaticTacticalPositionService.ts`
- Modify: `src/core/tactical/TacticalPositionSearchService.ts`
- Modify: `src/rendering/PixiStaticTacticalPositionRenderer.ts`
- Modify: `src/rendering/PixiAwarenessHeatmapRenderer.ts`
- Modify: `docs/subprojects/ai-single-unit-editor/subproject.json`
- Create: `docs/subprojects/ai-single-unit-editor/STATIC_TACTICAL_POSITION_BASIS_V1.md`
- Modify generated docs via `npm run docs:sync`

**Interfaces:**
- Consumes: all earlier tasks.
- Produces: stable diagnostic snapshots and canonical project documentation.

- [ ] **Step 1: Add diagnostic assertions**

Extend smokes to assert build milliseconds, processed cells/rays, per-kind raw/index counts, stale discards, query queue/replacements, preliminary/exact counts, route expansions, fallback use, renderer rebuild count and display-object count.

- [ ] **Step 2: Run TypeScript and focused smokes**

Run:

```bash
npx tsc --noEmit
npm run tactical-static-contract:smoke
npm run tactical-static-builder:smoke
npm run tactical-static-index:smoke
npm run tactical-static-service:smoke
npm run tactical-query-generalized:smoke
npm run tactical-query:smoke
npm run tactical-position-kind-graph:smoke
npm run tactical-position-graph-runtime:smoke
npm run tactical-static-layers:smoke
npm run tactical-position-search-ui:smoke
npm run visibility-probe:smoke
npm run workspace:smoke
```

Expected: every command exits 0.

- [ ] **Step 3: Write canonical documentation and sync generated status**

Document the objective/subjective boundary, identities, arrays, index, worker ownership, knowledge restrictions, UI ownership and tuning settings. Update the active subproject source JSON and run `npm run docs:sync`.

- [ ] **Step 4: Build production output**

Run: `npm run build`
Expected: PASS and both `/` and `/ai-node-editor.html` are present.

- [ ] **Step 5: Review the diff for architectural boundaries**

Verify no core tactical/static file imports PixiJS/DOM, no renderer imports pathfinding/ray builders, no query snapshot contains hidden objective enemy arrays, and no UI event starts a static build.

- [ ] **Step 6: Commit**

```bash
git add src scripts package.json docs
git commit -m "docs: finalize tactical position basis v1"
```
