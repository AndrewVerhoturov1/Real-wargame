# Unified Posture-Aware Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace duplicate field/point line-of-sight math with one exact-position, posture-aware visibility kernel, add three-sample target silhouettes, and avoid heatmap LOS evaluation outside active attention zones.

**Architecture:** `VisibilityRayKernel` becomes the sole owner of terrain, object and vegetation tracing. `VisibilityTargetProbe` aggregates three canonical rays for concrete targets, while `VisibilityCandidateMask` restricts selected-unit heatmap geometry to cells permitted by the attention model. UI posture selection remains display-only; perception continues to use actual target posture and exact coordinates.

**Tech Stack:** TypeScript 5, Vite SSR smoke tests, PixiJS 8, existing map revision/static-grid/perception/attention systems.

## Global Constraints

- Work only on `feature/20260720-posture-aware-visibility`, based on `real-wargame-preview` commit `5070ce210862c1e997dada4a22c53866676f3bcc`.
- Keep the already committed posture regression and approved design intact.
- Do not merge or transfer into `real-wargame-preview` or `main` without separate explicit user approval.
- Do not deploy, run GitHub Actions, Chromium or Playwright without separate explicit user approval.
- Core visibility and perception code must not import PixiJS or DOM APIs.
- `PerceptionSystem` remains authoritative for subjective perception; renderers display prepared state only.
- Heatmap cells must never inspect hidden enemy units.
- Point perception remains bounded to two logical cold probes per simulation step.
- One logical concrete-target probe may execute exactly three physical silhouette rays.
- No full visibility field may be built per perception target.
- Hidden overlay, pointer movement and camera movement must trigger zero heatmap geometry work.
- Field and point caches must reject stale map/profile revisions and must not reuse results across materially different exact positions.
- Heatmap rendering remains one raster texture/sprite, not one display object per cell.
- Russian text remains the default human-facing UI and diagnostic language.

---

## File Structure

**Create**

- `src/core/visibility/VisibilityRayKernel.ts` — exact DDA traversal and canonical terrain/object/vegetation math.
- `src/core/visibility/VisibilityTargetProbe.ts` — three-height silhouette aggregation for concrete targets.
- `src/core/visibility/VisibilityCandidateMask.ts` — cheap attention-only cell eligibility mask.

**Modify**

- `src/core/visibility/VisibilityGeometryField.ts` — use the kernel, accept candidate filtering, expose evaluated cells.
- `src/core/visibility/LineOfSight.ts` — retain compatibility result shape as a thin kernel wrapper only.
- `src/core/visibility/PointVisibility.ts` — cache and budget logical three-ray target probes.
- `src/core/visibility/SelectedUnitVisibilityField.ts` — build mask first, use preview posture height, skip non-candidates.
- `src/core/ui/RuntimeUiState.ts` — store display-only heatmap target posture.
- `src/ui/AttentionRuntimePanel.ts` — add posture selector and explicit diagnostics.
- `scripts/point_visibility_differential_smoke.ts` — canonical parity, exact-position and silhouette tests.
- `scripts/view_memory_heatmap_smoke.ts` — candidate mask and preview posture behavior.
- `scripts/view_memory_heatmap_performance_smoke.ts` — masked-work and ray/cell reduction assertions.
- `scripts/perception_system_smoke.ts` — real target posture propagation and partial exposure behavior.
- `scripts/perception_performance_smoke.ts` — two logical probe budget and three physical rays per probe.
- `scripts/visibility_probe_cache_smoke.ts` — compatibility wrapper and exact-position cache invalidation.
- `docs/subprojects/ai-single-unit-editor/VIEW_AND_MEMORY_HEATMAP_V1.md` — canonical system semantics and limits.

---

### Task 1: Canonical Exact-Position Ray Kernel

**Files:**
- Create: `src/core/visibility/VisibilityRayKernel.ts`
- Modify: `scripts/point_visibility_differential_smoke.ts`

**Interfaces:**
- Consumes: `TacticalMap`, `GridPosition`, `VisibilityStaticGrid`, environment visibility/fire material profiles.
- Produces:

```ts
export type VisibilityTraceChannel = 'visual' | 'fire' | 'combined';
export type VisibilityTraceBlockerKind = 'none' | 'terrain' | 'object' | 'vegetation' | 'boundary';

export interface VisibilityTraceRequest {
  origin: GridPosition;
  target: GridPosition;
  originHeightAboveGroundMeters: number;
  targetHeightAboveGroundMeters: number;
  channel?: VisibilityTraceChannel;
}

export interface VisibilityTraceResult {
  origin: GridPosition;
  target: GridPosition;
  totalDistanceMeters: number;
  traversedCellCount: number;
  hardBlocked: boolean;
  blockerKind: VisibilityTraceBlockerKind;
  blockerPosition: GridPosition | null;
  blockerDistanceMeters: number | null;
  visualTransmission: number;
  fireTransmission: number;
  accumulatedVegetationMeters: number;
  reasonRu: string;
}

export function traceVisibilityRay(
  map: TacticalMap,
  request: VisibilityTraceRequest,
): VisibilityTraceResult;
```

- [ ] **Step 1: Add failing exact-segment and path-length assertions**

Append fixtures to `scripts/point_visibility_differential_smoke.ts` that call the not-yet-created kernel directly:

```ts
import { traceVisibilityRay } from '../src/core/visibility/VisibilityRayKernel';

const exactOpen = traceVisibilityRay(normalizeMap(baseMap()), {
  origin: { x: 2.13, y: 2.31 },
  target: { x: 10.87, y: 4.74 },
  originHeightAboveGroundMeters: 1.7,
  targetHeightAboveGroundMeters: 1.7,
  channel: 'visual',
});
assert.equal(exactOpen.hardBlocked, false);
assert.deepEqual(exactOpen.origin, { x: 2.13, y: 2.31 });
assert.deepEqual(exactOpen.target, { x: 10.87, y: 4.74 });
assert.ok(exactOpen.traversedCellCount > 0);

const shortForest = traceVisibilityRay(normalizeMap(forestLengthMap()), {
  origin: { x: 2.1, y: 3.2 },
  target: { x: 8.1, y: 3.2 },
  originHeightAboveGroundMeters: 1.7,
  targetHeightAboveGroundMeters: 1.7,
  channel: 'visual',
});
const diagonalForest = traceVisibilityRay(normalizeMap(forestLengthMap()), {
  origin: { x: 2.1, y: 2.1 },
  target: { x: 8.1, y: 5.9 },
  originHeightAboveGroundMeters: 1.7,
  targetHeightAboveGroundMeters: 1.7,
  channel: 'visual',
});
assert.ok(diagonalForest.accumulatedVegetationMeters > shortForest.accumulatedVegetationMeters);
assert.ok(diagonalForest.visualTransmission < shortForest.visualTransmission);
```

Add `forestLengthMap()` with one rectangular vegetation band crossed at different exact lengths.

- [ ] **Step 2: Run the focused smoke and confirm failure**

Run:

```bash
npm run point-los-differential:smoke
```

Expected: FAIL during Vite compilation because `VisibilityRayKernel.ts` and `traceVisibilityRay` do not exist.

- [ ] **Step 3: Implement exact deterministic DDA traversal**

Create `VisibilityRayKernel.ts` with public validation and a cell traversal that yields exact entry/exit parameters:

```ts
interface TraversedCell {
  x: number;
  y: number;
  entryT: number;
  exitT: number;
  pathLengthMeters: number;
  representative: GridPosition;
  targetCell: boolean;
}

function traverseSegmentCells(
  map: TacticalMap,
  origin: GridPosition,
  target: GridPosition,
): TraversedCell[] {
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const totalCells = Math.hypot(dx, dy);
  if (totalCells <= 1e-9) return [];

  let cellX = Math.floor(origin.x);
  let cellY = Math.floor(origin.y);
  const targetCellX = Math.floor(target.x);
  const targetCellY = Math.floor(target.y);
  const stepX = Math.sign(dx);
  const stepY = Math.sign(dy);
  const tDeltaX = stepX === 0 ? Number.POSITIVE_INFINITY : Math.abs(1 / dx);
  const tDeltaY = stepY === 0 ? Number.POSITIVE_INFINITY : Math.abs(1 / dy);
  let tMaxX = stepX > 0
    ? (cellX + 1 - origin.x) / dx
    : stepX < 0
      ? (origin.x - cellX) / -dx
      : Number.POSITIVE_INFINITY;
  let tMaxY = stepY > 0
    ? (cellY + 1 - origin.y) / dy
    : stepY < 0
      ? (origin.y - cellY) / -dy
      : Number.POSITIVE_INFINITY;
  let entryT = 0;
  const cells: TraversedCell[] = [];

  while (entryT < 1 - 1e-9) {
    const exitT = Math.min(1, tMaxX, tMaxY);
    const midT = (entryT + exitT) / 2;
    cells.push({
      x: cellX,
      y: cellY,
      entryT,
      exitT,
      pathLengthMeters: Math.max(0, exitT - entryT) * totalCells * map.metersPerCell,
      representative: { x: origin.x + dx * midT, y: origin.y + dy * midT },
      targetCell: cellX === targetCellX && cellY === targetCellY,
    });
    if (exitT >= 1) break;
    if (Math.abs(tMaxX - tMaxY) <= 1e-12) {
      cellX += stepX;
      cellY += stepY;
      tMaxX += tDeltaX;
      tMaxY += tDeltaY;
    } else if (tMaxX < tMaxY) {
      cellX += stepX;
      tMaxX += tDeltaX;
    } else {
      cellY += stepY;
      tMaxY += tDeltaY;
    }
    entryT = exitT;
  }
  return cells;
}
```

Implement `traceVisibilityRay` so that it:

- samples exact origin/target ground with `sampleSmoothHeightLevel`;
- reads intermediate terrain/object/vegetation from `getVisibilityStaticGrid`;
- accumulates vegetation with `Math.exp(-lossPerMeter * pathLengthMeters)`;
- raises one shared horizon from terrain and rasterized object tops;
- applies the canonical `0.02` horizon margin only at the target sample;
- returns deterministic boundary, terrain, object and vegetation blocker diagnostics;
- normalizes heights to at least `0.05 m`;
- returns visible transmission `1` for a zero-length segment.

- [ ] **Step 4: Run the focused smoke and TypeScript check**

Run:

```bash
npm run point-los-differential:smoke
npx tsc --noEmit
```

Expected: both PASS; the new exact-position and path-length assertions succeed.

- [ ] **Step 5: Commit the kernel**

```bash
git add src/core/visibility/VisibilityRayKernel.ts scripts/point_visibility_differential_smoke.ts
git commit -m "feat: add canonical exact visibility ray kernel"
```

---

### Task 2: Three-Sample Concrete Target Probe and Compatibility LOS

**Files:**
- Create: `src/core/visibility/VisibilityTargetProbe.ts`
- Modify: `src/core/visibility/PointVisibility.ts`
- Modify: `src/core/visibility/LineOfSight.ts`
- Modify: `scripts/point_visibility_differential_smoke.ts`
- Modify: `scripts/perception_system_smoke.ts`
- Modify: `scripts/visibility_probe_cache_smoke.ts`

**Interfaces:**
- Consumes: `traceVisibilityRay`, exact observer position/posture, exact target position, actual target silhouette height.
- Produces:

```ts
export interface VisibilitySilhouetteSample {
  heightFraction: 0.3 | 0.6 | 0.9;
  heightMeters: number;
  trace: VisibilityTraceResult;
}

export interface VisibilityTargetProbeResult {
  origin: GridPosition;
  target: GridPosition;
  targetHeightMeters: number;
  samples: readonly VisibilitySilhouetteSample[];
  visibleSampleCount: number;
  visibleFraction: number;
  bestVisibleSampleHeightMeters: number | null;
  blocked: boolean;
  visualTransmission: number;
  fireTransmission: number;
  physicalRayCount: 3;
  explanationRu: string[];
}

export function probeTargetVisibility(
  map: TacticalMap,
  observer: Pick<UnitModel, 'position' | 'behaviorRuntime'>,
  target: GridPosition,
  targetHeightMeters: number,
): VisibilityTargetProbeResult;
```

- [ ] **Step 1: Add failing partial-silhouette and exact-cache tests**

Add to `point_visibility_differential_smoke.ts`:

```ts
const partial = probeTargetVisibility(partialSilhouetteMap, partialObserver, partialTarget, 1.7);
assert.equal(partial.samples.length, 3);
assert.ok(partial.visibleSampleCount > 0 && partial.visibleSampleCount < 3);
assert.ok(partial.visualTransmission > 0 && partial.visualTransmission < 1);
assert.equal(partial.blocked, false);

const hidden = probeTargetVisibility(hiddenSilhouetteMap, partialObserver, partialTarget, 0.35);
assert.equal(hidden.visibleSampleCount, 0);
assert.equal(hidden.blocked, true);
```

Add to `visibility_probe_cache_smoke.ts` two target positions separated inside the same cell by `0.01` cells, with an occluding edge between their segments, and assert the second call performs a distinct preparation and may return a different result.

Add to `perception_system_smoke.ts` a standing hostile and a prone hostile behind the same low ridge; assert the standing target accumulates visual evidence while the prone target does not.

- [ ] **Step 2: Run focused tests and confirm failure**

Run:

```bash
npm run point-los-differential:smoke
npm run visibility-probe:smoke
npm run perception:smoke
```

Expected: FAIL because `probeTargetVisibility` and silhouette diagnostics do not exist, and the current cache still rounds exact positions to `0.05` cells.

- [ ] **Step 3: Implement silhouette aggregation**

Create `VisibilityTargetProbe.ts`:

```ts
const SAMPLE_FRACTIONS = [0.3, 0.6, 0.9] as const;

export function probeTargetVisibility(
  map: TacticalMap,
  observer: Pick<UnitModel, 'position' | 'behaviorRuntime'>,
  target: GridPosition,
  targetHeightMeters: number,
): VisibilityTargetProbeResult {
  const normalizedHeight = Math.max(0.05, Number.isFinite(targetHeightMeters) ? targetHeightMeters : 0.05);
  const originHeight = eyeHeightForPosture(observer.behaviorRuntime.posture);
  const samples = SAMPLE_FRACTIONS.map((heightFraction) => {
    const heightMeters = normalizedHeight * heightFraction;
    return {
      heightFraction,
      heightMeters,
      trace: traceVisibilityRay(map, {
        origin: observer.position,
        target,
        originHeightAboveGroundMeters: originHeight,
        targetHeightAboveGroundMeters: heightMeters,
        channel: 'visual',
      }),
    };
  });
  const visible = samples.filter((sample) => !sample.trace.hardBlocked);
  const visualTransmission = samples.reduce(
    (sum, sample) => sum + (sample.trace.hardBlocked ? 0 : sample.trace.visualTransmission),
    0,
  ) / samples.length;
  return {
    origin: { ...observer.position },
    target: { ...target },
    targetHeightMeters: normalizedHeight,
    samples,
    visibleSampleCount: visible.length,
    visibleFraction: visible.length / samples.length,
    bestVisibleSampleHeightMeters: visible.at(-1)?.heightMeters ?? null,
    blocked: visible.length === 0 || visualTransmission <= minimumVisualTransmission(),
    visualTransmission,
    fireTransmission: samples.reduce(
      (sum, sample) => sum + (sample.trace.hardBlocked ? 0 : sample.trace.fireTransmission),
      0,
    ) / samples.length,
    physicalRayCount: 3,
    explanationRu: buildSilhouetteExplanation(samples, visualTransmission),
  };
}
```

Keep `eyeHeightForPosture` in one exported visibility helper or in the new probe module; do not duplicate numeric posture heights in multiple files.

- [ ] **Step 4: Migrate point perception and cache identity**

In `PointVisibility.ts`:

- replace `LineOfSightProbeResult` cache entries with `VisibilityTargetProbeResult`;
- keep `MAX_PERCEPTION_POINT_PROBES_PER_SIMULATION_STEP = 2`;
- count one call to `probeTargetVisibility` as one logical preparation;
- add `pointTargetProbeCount` and `pointPhysicalRayCount` diagnostics;
- serialize finite exact coordinates with `Number(value).toPrecision(15)` rather than `0.05`-cell quantization;
- include posture, target height, silhouette version, all map revisions and visibility profile key.

Use:

```ts
function exactCoordinateKey(value: number): string {
  return Number.isFinite(value) ? value.toPrecision(15) : 'invalid';
}
```

Update `evaluatePointVisibility` to feed aggregate `blocked` and `visualTransmission` into `evaluateCellVisibilityQuality` and to include visible silhouette fraction in Russian explanations.

- [ ] **Step 5: Convert `computeLineOfSight` into a thin wrapper**

Delete its terrain traversal, fixed `1.2 m` sampling, spatial object intersection and vegetation math. Keep the existing public signature and map one canonical single ray to the old result:

```ts
export function computeLineOfSight(
  map: TacticalMap,
  unit: UnitModel,
  target: GridPosition,
  targetHeightMeters = 1.4,
): LineOfSightProbeResult {
  const trace = traceVisibilityRay(map, {
    origin: unit.position,
    target,
    originHeightAboveGroundMeters: eyeHeightForPosture(unit.behaviorRuntime.posture),
    targetHeightAboveGroundMeters: targetHeightMeters,
    channel: 'visual',
  });
  return {
    origin: trace.origin,
    target: trace.target,
    totalDistanceMeters: trace.totalDistanceMeters,
    visibleDistanceMeters: trace.blockerDistanceMeters ?? trace.totalDistanceMeters,
    blocked: trace.hardBlocked,
    blockedAt: trace.blockerPosition,
    blockerReasonRu: trace.reasonRu,
    visualTransmission: trace.visualTransmission,
    partialObscuration: trace.visualTransmission < 0.995,
    accumulatedForestMeters: trace.accumulatedVegetationMeters,
    obscurationReasonRu: trace.accumulatedVegetationMeters > 0
      ? `Растительность: пройдено около ${Math.round(trace.accumulatedVegetationMeters)} м.`
      : 'Препятствий растительностью нет',
  };
}
```

- [ ] **Step 6: Run focused tests**

Run:

```bash
npm run point-los-differential:smoke
npm run visibility-probe:smoke
npm run perception:smoke
npm run perception-variance:smoke
npx tsc --noEmit
```

Expected: PASS; partial silhouette reduces transmission, exact in-cell movement invalidates cache, and legacy LOS consumers still work.

- [ ] **Step 7: Commit target integration**

```bash
git add src/core/visibility/VisibilityTargetProbe.ts src/core/visibility/PointVisibility.ts src/core/visibility/LineOfSight.ts scripts/point_visibility_differential_smoke.ts scripts/perception_system_smoke.ts scripts/visibility_probe_cache_smoke.ts
git commit -m "feat: use canonical visibility for concrete target silhouettes"
```

---

### Task 3: Attention Candidate Mask

**Files:**
- Create: `src/core/visibility/VisibilityCandidateMask.ts`
- Modify: `scripts/view_memory_heatmap_smoke.ts`

**Interfaces:**
- Consumes: `SimulationState`, `UnitModel`, current attention profile and focus direction.
- Produces:

```ts
export interface VisibilityCandidateMask {
  minCellX: number;
  minCellY: number;
  width: number;
  height: number;
  candidate: Uint8Array;
  attentionWeight: Uint8Array;
  zone: Uint8Array;
  distanceMeters: Float32Array;
  candidateCellCount: number;
  skippedOutsideAttentionCellCount: number;
  key: string;
}

export function buildVisibilityCandidateMask(
  state: SimulationState,
  unit: UnitModel,
): VisibilityCandidateMask;
```

- [ ] **Step 1: Add failing mask-only assertions**

Extend `view_memory_heatmap_smoke.ts`:

```ts
const narrowMask = buildVisibilityCandidateMask(state, observer);
assert.ok(narrowMask.candidateCellCount > 0);
const rearOutside = localMaskIndex(narrowMask, 2, 15);
assert.equal(narrowMask.candidate[rearOutside], 0);
assert.equal(narrowMask.zone[rearOutside], VISIBILITY_ZONE_CODE.unseen);

observer.attentionSettings.profiles.observe.directAngleDegrees = 360;
observer.attentionSettings.profiles.observe.peripheralAngleDegrees = 360;
const fullMask = buildVisibilityCandidateMask(state, observer);
assert.ok(fullMask.candidateCellCount > narrowMask.candidateCellCount);
```

Create a profile with every weight zero and assert `candidateCellCount === 0`.

- [ ] **Step 2: Run smoke and confirm failure**

Run:

```bash
npm run view-memory-heatmap:smoke
```

Expected: FAIL because `VisibilityCandidateMask.ts` does not exist.

- [ ] **Step 3: Implement cheap attention-only pass**

Build a bounded rectangle from maximum visual range. For each cell center:

```ts
const dx = x + 0.5 - unit.position.x;
const dy = y + 0.5 - unit.position.y;
const distanceMeters = Math.hypot(dx, dy) * state.map.metersPerCell;
const bearing = Math.atan2(dy, dx);
const angleDifferenceDegrees = normalizeSignedDegrees(
  radiansToDegrees(bearing - unit.attentionRuntime.focusDirectionRadians),
);
const attention = resolveAttentionSample(
  profile,
  angleDifferenceDegrees,
  distanceMeters,
  unit.attentionSettings.nearAwarenessRangeMeters,
  unit.attentionSettings.nearMinimumVisibilityQuality,
);
const allowed = attention.zone !== 'outside'
  && attention.weight > 0
  && distanceMeters <= attention.maximumRangeMeters;
```

Store attention weight as `Math.round(clamp01(attention.weight) * 255)`, zone code with the same mapping used by the selected field, and distance in the local `Float32Array`. Do not import terrain, object, vegetation or LOS modules.

- [ ] **Step 4: Run smoke and TypeScript**

Run:

```bash
npm run view-memory-heatmap:smoke
npx tsc --noEmit
```

Expected: PASS; zero-weight profiles produce empty masks and narrow sectors produce fewer candidates.

- [ ] **Step 5: Commit mask builder**

```bash
git add src/core/visibility/VisibilityCandidateMask.ts scripts/view_memory_heatmap_smoke.ts
git commit -m "feat: add attention-only visibility candidate mask"
```

---

### Task 4: Masked Heatmap Geometry Through the Canonical Kernel

**Files:**
- Modify: `src/core/visibility/VisibilityGeometryField.ts`
- Modify: `src/core/visibility/SelectedUnitVisibilityField.ts`
- Modify: `scripts/point_visibility_differential_smoke.ts`
- Modify: `scripts/view_memory_heatmap_smoke.ts`
- Modify: `scripts/view_memory_heatmap_performance_smoke.ts`

**Interfaces:**
- Consumes: `VisibilityCandidateMask`, `traceVisibilityRay`.
- Produces: `VisibilityGeometryField.evaluated`, candidate-aware diagnostics, unchanged indexed transmission/blocker reads.

- [ ] **Step 1: Add failing evaluated/masked-work assertions**

In `view_memory_heatmap_smoke.ts` assert:

```ts
assert.ok(first.evaluated instanceof Uint8Array);
const outsideIndex = localFieldIndex(first, 2, 15);
assert.equal(first.evaluated[outsideIndex], 0);
assert.equal(first.quality[outsideIndex], 0);
assert.equal(first.zone[outsideIndex], VISIBILITY_ZONE_CODE.unseen);
```

In `view_memory_heatmap_performance_smoke.ts`, build a narrow profile and a 360-degree profile from the same position/map, then assert:

```ts
assert.ok(narrowDiagnostics.candidateCellCount < fullDiagnostics.candidateCellCount);
assert.ok(narrowDiagnostics.geometryRayCount < fullDiagnostics.geometryRayCount);
assert.ok(narrowDiagnostics.geometryTraversedCellCount < fullDiagnostics.geometryTraversedCellCount);
```

Add an empty-mask scenario and assert all geometry counts are zero.

In `point_visibility_differential_smoke.ts`, compare a field candidate cell with a direct kernel trace using identical exact origin and target cell-center coordinates; require exact hard-block parity and transmission delta below one encoded byte (`1 / 255 + 1e-6`).

- [ ] **Step 2: Run tests and confirm failure**

Run:

```bash
npm run point-los-differential:smoke
npm run view-memory-heatmap:smoke
npm run view-memory-heatmap-performance:smoke
```

Expected: FAIL because fields do not expose `evaluated`, do not accept masks, and still build geometry before attention filtering.

- [ ] **Step 3: Extend the geometry field contract**

Add:

```ts
export interface VisibilityGeometryFieldOptions {
  origin: GridPosition;
  originHeightAboveGroundMeters: number;
  targetHeightAboveGroundMeters: number;
  rangeCells: number;
  channel?: 'visual' | 'fire' | 'combined';
  candidateMask?: VisibilityCandidateMask;
}

export interface VisibilityGeometryField {
  // existing fields...
  evaluated: Uint8Array;
  evaluatedTargetCellCount: number;
  geometryTraversedCellCount: number;
  geometryRayCount: number;
}
```

Include the candidate mask key in the geometry cache key. Count `evaluated.byteLength` in retained memory diagnostics.

- [ ] **Step 4: Replace field-local geometry formulas with kernel calls**

Remove field-owned horizon and vegetation formulas. For each existing perimeter direction:

1. walk only local mask indexes to find the farthest candidate on that direction;
2. skip the direction when no candidate exists;
3. trace only required candidate endpoints through `traceVisibilityRay`;
4. write only candidate cells;
5. set `evaluated[mapIndex] = 1` for each geometry-tested target cell.

For correctness-first implementation, it is acceptable to call one canonical ray per candidate cell; the performance smoke must then prove candidate masking keeps the work bounded. Do not preserve a second incremental ray algorithm merely to reuse perimeter state, because that would reintroduce duplicate geometry rules.

- [ ] **Step 5: Make `SelectedUnitVisibilityField` mask-first**

Change the build order:

```ts
const mask = buildVisibilityCandidateMask(state, unit);
const geometry = getVisibilityGeometryField(state.map, {
  origin: unit.position,
  originHeightAboveGroundMeters: eyeHeightForPosture(unit.behaviorRuntime.posture),
  targetHeightAboveGroundMeters: heatmapTargetHeightMeters(overlay.heatmapTargetPosture),
  rangeCells: radiusCells,
  channel: 'visual',
  candidateMask: mask,
});
```

Copy `mask.zone`, `mask.attentionWeight` and `geometry.evaluated` into the bounded selected field. Loop only local mask entries where `candidate === 1 && evaluated === 1`. Read distance from `mask.distanceMeters`; do not recompute attention or process non-candidates.

Remove the fixed `TARGET_EYE_HEIGHT_METERS = 1.4` constant.

- [ ] **Step 6: Run focused parity and performance tests**

Run:

```bash
npm run point-los-differential:smoke
npm run view-memory-heatmap:smoke
npm run view-memory-heatmap-performance:smoke
npx tsc --noEmit
```

Expected: PASS; empty masks generate zero rays, narrow sectors reduce target rays/cells, non-candidates remain unevaluated shadow, and field/direct traces agree.

- [ ] **Step 7: Commit masked geometry**

```bash
git add src/core/visibility/VisibilityGeometryField.ts src/core/visibility/SelectedUnitVisibilityField.ts scripts/point_visibility_differential_smoke.ts scripts/view_memory_heatmap_smoke.ts scripts/view_memory_heatmap_performance_smoke.ts
git commit -m "feat: restrict heatmap geometry to active attention cells"
```

---

### Task 5: Display-Only Heatmap Target Posture and Diagnostics

**Files:**
- Modify: `src/core/ui/RuntimeUiState.ts`
- Modify: `src/ui/AttentionRuntimePanel.ts`
- Modify: `src/core/visibility/SelectedUnitVisibilityField.ts`
- Modify: `scripts/view_memory_heatmap_smoke.ts`

**Interfaces:**
- Consumes: runtime UI state only.
- Produces:

```ts
export type HeatmapTargetPosture = 'standing' | 'crouched' | 'prone';

export interface AttentionOverlayRuntimeState {
  // existing fields...
  heatmapTargetPosture: HeatmapTargetPosture;
}

export function setAttentionHeatmapTargetPosture(
  state: SimulationState,
  posture: HeatmapTargetPosture,
): void;
```

- [ ] **Step 1: Add failing state and field-key assertions**

In `view_memory_heatmap_smoke.ts`:

```ts
assert.equal(getAttentionOverlayState(state).heatmapTargetPosture, 'standing');
const standingField = getSelectedUnitVisibilityField(state)!;
setAttentionHeatmapTargetPosture(state, 'prone');
state.simulationTimeSeconds += 0.3;
const proneField = getSelectedUnitVisibilityField(state)!;
assert.notEqual(proneField.calculationKey, standingField.calculationKey);
assert.ok(sampleSelectedUnitVisibilityField(standingField, ridgeTargetX, ridgeTargetY)
  > sampleSelectedUnitVisibilityField(proneField, ridgeTargetX, ridgeTargetY));
assert.equal(observer.behaviorRuntime.posture, originalObserverPosture);
assert.equal(observer.perceptionKnowledge.revision, originalKnowledgeRevision);
```

- [ ] **Step 2: Run smoke and confirm failure**

Run:

```bash
npm run view-memory-heatmap:smoke
```

Expected: FAIL because the runtime state and setter do not exist.

- [ ] **Step 3: Add runtime state and canonical preview heights**

Initialize `heatmapTargetPosture: 'standing'`. Add:

```ts
export function heatmapTargetHeightMeters(posture: HeatmapTargetPosture): number {
  if (posture === 'prone') return 0.35;
  if (posture === 'crouched') return 1.1;
  return 1.7;
}
```

Prefer reusing the existing soldier posture-height profile instead of duplicating constants when the import boundary remains core-only.

Include posture in `SelectedUnitVisibilityField` and geometry calculation keys so changing the selector rebuilds only the selected unit field.

- [ ] **Step 4: Add the runtime panel selector**

Render near the current-view toggle:

```html
<label class="attention-runtime-target-posture">
  <span>Высота условной цели</span>
  <select data-heatmap-target-posture>
    <option value="standing">Стоит</option>
    <option value="crouched">Пригнулся</option>
    <option value="prone">Лежит</option>
  </select>
</label>
```

Bind changes to `setAttentionHeatmapTargetPosture`. Do not change unit posture or perception contacts.

Replace ambiguous diagnostics with:

- `Клеток-кандидатов`;
- `Проверено геометрией`;
- `Пройдено клеток лучами`;
- `Лучей поля`.

- [ ] **Step 5: Run smoke and TypeScript**

Run:

```bash
npm run view-memory-heatmap:smoke
npx tsc --noEmit
```

Expected: PASS; selector state defaults to standing, changes only the heatmap key/result, and does not mutate gameplay state.

- [ ] **Step 6: Commit UI/state support**

```bash
git add src/core/ui/RuntimeUiState.ts src/ui/AttentionRuntimePanel.ts src/core/visibility/SelectedUnitVisibilityField.ts scripts/view_memory_heatmap_smoke.ts
git commit -m "feat: add heatmap target posture preview"
```

---

### Task 6: Performance Diagnostics and Regression Hardening

**Files:**
- Modify: `src/core/visibility/PointVisibility.ts`
- Modify: `src/core/visibility/VisibilityGeometryField.ts`
- Modify: `src/core/visibility/SelectedUnitVisibilityField.ts`
- Modify: `scripts/perception_performance_smoke.ts`
- Modify: `scripts/view_memory_heatmap_performance_smoke.ts`
- Modify: `scripts/point_visibility_differential_smoke.ts`

**Interfaces:**
- Produces stable diagnostics for logical/physical point rays and field candidate/evaluated/traversed counts.

- [ ] **Step 1: Add failing diagnostic assertions**

In `perception_performance_smoke.ts` assert:

```ts
assert.ok(staging.pointTargetProbeCount > 0);
assert.equal(staging.pointPhysicalRayCount, staging.pointTargetProbeCount * 3);
assert.ok(staging.maxPreparationsPerStep <= 2);
assert.ok(staging.deferredCount > 0);
```

Update the old assertion that allowed four preparations per step to the canonical limit of two.

In `view_memory_heatmap_performance_smoke.ts` assert that hidden overlay and pointer/camera-only changes leave candidate/evaluated/ray/traversal counts unchanged at zero or cached values.

- [ ] **Step 2: Run performance smokes and confirm failure**

Run:

```bash
npm run perception-performance:smoke
npm run view-memory-heatmap-performance:smoke
```

Expected: FAIL because new counters are not exposed and the existing smoke still permits four logical preparations.

- [ ] **Step 3: Implement stable diagnostics**

Extend `PerceptionGeometryPreparationDiagnostics` with:

```ts
readonly pointTargetProbeCount: number;
readonly pointPhysicalRayCount: number;
```

Increment both only on cold logical probes. Cache hits must not increment physical rays.

Extend field diagnostics with:

```ts
candidateCellCount: number;
evaluatedTargetCellCount: number;
skippedOutsideAttentionCellCount: number;
geometryTraversedCellCount: number;
geometryRayCount: number;
```

Report per-current-field values in `SelectedUnitVisibilityField` diagnostics rather than cumulative values from unrelated cached geometry fields.

- [ ] **Step 4: Run the non-browser regression matrix**

Run:

```bash
npx tsc --noEmit
npm run point-los-differential:smoke
npm run visibility-probe:smoke
npm run view-memory-heatmap:smoke
npm run view-memory-heatmap-performance:smoke
npm run perception:smoke
npm run perception-variance:smoke
npm run perception-performance:smoke
```

Expected: all PASS.

- [ ] **Step 5: Commit diagnostics and regression coverage**

```bash
git add src/core/visibility/PointVisibility.ts src/core/visibility/VisibilityGeometryField.ts src/core/visibility/SelectedUnitVisibilityField.ts scripts/perception_performance_smoke.ts scripts/view_memory_heatmap_performance_smoke.ts scripts/point_visibility_differential_smoke.ts
git commit -m "test: verify unified visibility budgets and masking"
```

---

### Task 7: Documentation and Final Build Verification

**Files:**
- Modify: `docs/subprojects/ai-single-unit-editor/VIEW_AND_MEMORY_HEATMAP_V1.md`
- Modify only if canonical current-state text changes: `docs/subprojects/ai-single-unit-editor/subproject.json`
- Regenerate only if source JSON changes: `docs/subprojects/ai-single-unit-editor/STATUS.md`, `docs/subprojects/index.json`

**Interfaces:**
- Documents the implemented contracts; no gameplay API changes.

- [ ] **Step 1: Update canonical documentation**

Document these exact facts:

```text
- VisibilityRayKernel is the only terrain/object/vegetation LOS implementation.
- Concrete targets use exact positions and three posture-dependent silhouette samples.
- Heatmap target posture is hypothetical and never reads hidden units.
- Cells outside active attention remain default shadow and receive no target LOS probe.
- Point probes are limited to two logical preparations per simulation step; each cold target probe uses three physical rays.
- The renderer remains one raster sprite and is non-authoritative.
```

Do not claim browser, live-game or deployment verification.

- [ ] **Step 2: Run documentation checks when generated sources changed**

When `subproject.json` changed, run:

```bash
npm run docs:sync
npm run docs:smoke
```

Expected: PASS and generated files match canonical JSON.

When only `VIEW_AND_MEMORY_HEATMAP_V1.md` changed, run:

```bash
npm run docs:check
```

Expected: PASS.

- [ ] **Step 3: Run final focused build matrix**

Run:

```bash
npx tsc --noEmit
npm run point-los-differential:smoke
npm run visibility-probe:smoke
npm run view-memory-heatmap:smoke
npm run view-memory-heatmap-performance:smoke
npm run perception:smoke
npm run perception-variance:smoke
npm run perception-performance:smoke
npm run build
```

Expected: all commands PASS. Do not run GitHub Actions, Chromium, Playwright or deployment.

- [ ] **Step 4: Verify final branch scope**

Run:

```bash
git diff --stat real-wargame-preview...HEAD
git diff --name-only real-wargame-preview...HEAD
```

Expected: only the approved visibility, perception smoke, runtime UI and documentation files are changed; no `main`, deployment workflow or unrelated gameplay files appear.

- [ ] **Step 5: Commit documentation**

```bash
git add docs/subprojects/ai-single-unit-editor/VIEW_AND_MEMORY_HEATMAP_V1.md docs/subprojects/ai-single-unit-editor/subproject.json docs/subprojects/ai-single-unit-editor/STATUS.md docs/subprojects/index.json
git commit -m "docs: describe unified posture-aware visibility"
```

Skip unchanged generated files from `git add`.

---

## Plan Self-Review Result

- **Spec coverage:** all approved requirements map to Tasks 1–7: canonical math, exact positions, actual posture height, partial silhouette, candidate masking, display posture modes, diagnostics, budgets, regression and documentation.
- **Placeholder scan:** no `TBD`, `TODO`, unspecified test request or deferred implementation remains.
- **Type consistency:** `VisibilityTraceResult` feeds both `VisibilityTargetProbeResult` and the compatibility LOS wrapper; candidate-mask arrays use the same local rectangle consumed by the selected-unit field; point diagnostics distinguish logical probes from three physical rays.
- **Scope:** one cohesive visibility subsystem migration; no unrelated cover, ballistics, deployment or renderer redesign is included.
