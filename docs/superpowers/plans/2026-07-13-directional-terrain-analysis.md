# Directional Terrain Analysis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a cached directional-terrain analysis core that converts subjective threat directions into real navigation costs while preserving the existing A*, knowledge boundaries, and overlay performance.

**Architecture:** Reuse `VisibilityStaticGrid` as the canonical height/object source, derive a cached typed-array `DirectionalTerrainStaticGrid`, build an eight-sector subjective `ThreatDirectionField`, and combine both inside `RouteCostField`. Navigation profiles receive versioned directional weights; the existing pathfinder consumes the resulting total cost without a second route engine.

**Tech Stack:** TypeScript 5.5, Vite SSR smoke tests, PixiJS-compatible typed-array data contracts, GitHub Actions.

## Global Constraints

- Work only on `tmp/directional-terrain-analysis-20260713`.
- Do not modify `real-wargame-preview` or `main`.
- Canonical code names are English; user-facing explanations remain Russian-first.
- No hidden objective enemy state may enter directional threat analysis.
- No full-map calculation may run from camera or cursor movement.
- Static work is revision-cached; dynamic work is keyed by knowledge/profile revisions.
- Preserve scene/profile migration compatibility.

---

### Task 1: Focused failing smoke contract

**Files:**
- Create: `scripts/directional_terrain_smoke.ts`
- Create: `scripts/directional_terrain_smoke.mjs`
- Modify: `package.json`
- Create: `.github/workflows/directional-terrain-core.yml`

**Interfaces:**
- Consumes: future `getDirectionalTerrainStaticGrid`, `sampleDirectionalSlope`, `buildThreatDirectionField`, and directional fields in `RouteCostField`.
- Produces: executable acceptance tests and CI entry point.

- [ ] Write tests for flat/ramp geometry, direction reversal, sector preservation, uncertainty attenuation, profile migration, route-cost differentiation and cache counters.
- [ ] Add `directional-terrain:smoke` to `package.json`.
- [ ] Add a pull-request workflow that runs the focused smoke, navigation regressions and production build.
- [ ] Open a draft PR and verify the test fails because the new modules/contracts do not exist.

### Task 2: Static terrain derivatives

**Files:**
- Create: `src/core/terrain/DirectionalTerrainStaticGrid.ts`

**Interfaces:**
- Consumes: `TacticalMap`, `getMapRevisionSnapshot`, `getVisibilityStaticGrid`.
- Produces:
  - `getDirectionalTerrainStaticGrid(map): DirectionalTerrainStaticGrid`
  - `sampleDirectionalSlope(grid, cellX, cellY, threatBearingRadians): number`
  - `clearDirectionalTerrainStaticGridCache(map): void`

- [ ] Compute central-difference gradient in metres and normalize a downhill aspect vector.
- [ ] Compute slope magnitude, Laplacian curvature, crest strength, valley strength and silhouette potential into typed arrays.
- [ ] Cache by the map visual revision using `WeakMap<TacticalMap, CacheEntry>`.
- [ ] Clamp edge samples and return stable zero values on flat cells.

### Task 3: Subjective eight-sector threat field

**Files:**
- Create: `src/core/terrain/ThreatDirectionField.ts`

**Interfaces:**
- Consumes: unit origin and subjective threat records compatible with `TacticalRouteKnownThreat`.
- Produces:
  - `buildThreatDirectionField(originX, originY, threats): ThreatDirectionField`
  - `threatSectorBearingRadians(index): number`

- [ ] Quantize threat bearings to eight sectors with adjacent-sector interpolation.
- [ ] Weight by confidence, strength/suppression and uncertainty attenuation.
- [ ] Store total sector weights, normalized weights, primary sector, primary bearing and strongest-sector share.
- [ ] Preserve multiple meaningful directions rather than averaging them to one vector.

### Task 4: Profile weights and migration

**Files:**
- Modify: `src/core/navigation/NavigationProfiles.ts`
- Modify: `src/ai-node-editor/NavigationProfileEditor.ts`

**Interfaces:**
- Produces `NavigationDirectionalTerrainWeights` under `NavigationProfile.directionalTerrain`.

- [ ] Bump profile format to version 2.
- [ ] Define built-in weights for normal, fast, stealth, attack, cautious, retreat and direct.
- [ ] Normalize old/custom profiles with fallback values.
- [ ] Clone the nested directional object safely.
- [ ] Add no-code numeric controls to the existing profile editor without changing its overall layout contract.

### Task 5: Route cost integration

**Files:**
- Modify: `src/core/navigation/RouteCostField.ts`
- Modify: `src/core/pathfinding/GridPathfinder.ts`
- Modify: `src/rendering/PixiRouteCostOverlayRenderer.ts` only if its exhaustive breakdown mapping requires the new channel.

**Interfaces:**
- Extends `RouteCostFields`, `RouteCostCellBreakdown` and `GridPathCostBreakdown` with `directionalTerrainCost`.

- [ ] Reuse the static terrain grid in `buildStaticField` without another height scan.
- [ ] Build the threat field once per dynamic field rebuild.
- [ ] Calculate weighted forward/reverse slope, crest, valley and silhouette adjustments for every passable cell.
- [ ] Add a critical-sector term based on the worst significant sector.
- [ ] Keep `exposureCost` reserved for exact LOS and add the new cost channel separately.
- [ ] Include the channel in total cost, route breakdown and route explanation.
- [ ] Keep the direct profile at zero directional cost.

### Task 6: Verification and documentation

**Files:**
- Modify: `docs/subprojects/ai-single-unit-editor/HANDOFF.md`
- Modify: `docs/subprojects/ai-single-unit-editor/JOURNAL.md`
- Modify generated status metadata only through the repository's documentation workflow when required.

**Interfaces:**
- Produces a verified temporary-branch handoff with exact SHA and honest limits.

- [ ] Run `npm run directional-terrain:smoke` in CI.
- [ ] Run `npm run navigation-profiles:smoke`.
- [ ] Run `npm run pathfinding:smoke`.
- [ ] Run `npm run navigation-overlay:smoke`.
- [ ] Run `npm run map-revision:smoke`.
- [ ] Run `npm run build` and `npm run docs:check`.
- [ ] Inspect CI logs and fix every failure before claiming completion.
- [ ] Do not merge or transfer the branch.
