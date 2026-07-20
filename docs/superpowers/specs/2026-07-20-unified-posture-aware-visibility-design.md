# Unified Posture-Aware Visibility — Design

**Status:** awaiting user review  
**Date:** 2026-07-20  
**Repository:** `AndrewVerhoturov1/Real-wargame`  
**Base branch:** `real-wargame-preview`  
**Feature branch:** `feature/20260720-posture-aware-visibility`

## 1. Goal

Replace the two independent visibility geometry implementations with one canonical visibility system used by:

1. the selected-unit **«Обзор и память»** heatmap;
2. actual perception checks against concrete targets;
3. the compatibility LOS probe and its diagnostics.

The unified system must:

- use the observer's exact `x/y` position;
- use the target's exact `x/y` position;
- use posture-dependent observer eye height;
- use the concrete target's real posture-dependent silhouette height;
- represent partial silhouette exposure instead of only a single yes/no target point;
- avoid expensive LOS/terrain/vegetation evaluation for heatmap cells outside active attention zones;
- leave every non-candidate heatmap cell in the default shadow;
- never reveal a hidden target through the heatmap;
- remain deterministic, bounded and renderer-independent.

## 2. Approved product behavior

### 2.1 Actual target perception

A visual stimulus for a concrete unit uses:

- the observer's exact world-grid position;
- the observer's current posture and corresponding eye height;
- the target's exact world-grid position;
- the target's current posture and corresponding silhouette height;
- the canonical terrain, object and vegetation geometry between them.

A unit is not reduced to the center of its cell.

### 2.2 Partial silhouette

Concrete-target perception traces three vertical samples through the target silhouette:

- lower body: `0.30 × targetHeightMeters`;
- torso: `0.60 × targetHeightMeters`;
- upper body/head: `0.90 × targetHeightMeters`.

Each sample has equal weight. A blocked sample contributes zero. An unblocked sample contributes its visual transmission.

```text
aggregateVisualTransmission =
  (lowerTransmission + torsoTransmission + upperTransmission) / 3
```

The result exposes:

- `visibleSampleCount` from `0` to `3`;
- `visibleFraction` from `0` to `1`;
- aggregate visual transmission;
- the best visible sample height;
- per-sample blocker diagnostics.

The target is hard-blocked only when all three samples are blocked or their aggregate transmission falls below the canonical minimum transmission threshold.

### 2.3 Heatmap target-height preview

An empty cell has no real target posture. Therefore the heatmap must not inspect hidden units in that cell.

The runtime panel receives a display-only selector:

- **Стоит** — `1.70 m`;
- **Пригнулся** — `1.10 m`;
- **Лежит** — `0.35 m`.

The selected preview posture controls only the hypothetical target height used to render the heatmap. It does not affect perception truth, unit posture or AI state.

Default: **Стоит**.

### 2.4 Cells outside attention

The complete heatmap raster starts as default shadow.

Before expensive geometry work, a lightweight candidate pass evaluates only:

- distance;
- bearing relative to focus direction;
- attention zone;
- zone weight;
- zone-specific maximum range.

A cell is a geometry candidate only when all canonical attention checks allow it.

Cells outside the candidate mask:

- receive no target LOS evaluation;
- receive no visibility-quality calculation;
- remain `quality = 0` and `zone = unseen`;
- remain default shadow in the renderer.

A ray aimed at a valid candidate may still traverse intermediate cells to read terrain, objects and vegetation. Those intermediate samples are required occluders, not visibility targets. This is the only permitted geometry work involving a non-candidate cell.

## 3. Non-goals

This change does not add:

- binoculars, optics, night vision or weather;
- anatomical animation or separate eyes;
- probabilistic ray selection;
- full visibility fields for every unit;
- persistence of the heatmap preview posture;
- hidden-enemy-aware heatmap coloring;
- new weapon-ballistics rules;
- browser or Playwright verification without separate user approval.

## 4. Canonical architecture

```text
Map revisions + visibility static grid
                 ↓
        VisibilityTraceContext
                 ↓
        VisibilityRayKernel
          exact grid traversal
                 ↓
     ┌───────────┴────────────┐
     ↓                        ↓
VisibilityTargetProbe   MaskedVisibilityField
3 silhouette samples   hypothetical posture
     ↓                        ↓
PointVisibility         SelectedUnitVisibilityField
     ↓                        ↓
PerceptionSystem        Pixi raster renderer
```

The renderer remains non-authoritative. `PerceptionSystem` remains the owner of subjective perception. UI state controls only display behavior.

## 5. Canonical ray kernel

### 5.1 New module

Create:

```text
src/core/visibility/VisibilityRayKernel.ts
```

The module owns all geometry rules currently duplicated between `VisibilityGeometryField.ts` and `LineOfSight.ts`.

### 5.2 Trace context

`createVisibilityTraceContext(map, channel)` prepares immutable per-map/per-revision data:

- `VisibilityStaticGrid`;
- terrain heights;
- rasterized blocking-object top heights;
- vegetation material codes;
- visual/fire transmission coefficients;
- map dimensions and `metersPerCell`;
- exact map/profile revision identity.

The context is cached by map and canonical revision identity. No renderer, DOM or PixiJS imports are allowed.

### 5.3 Exact segment traversal

Use deterministic 2-D grid DDA traversal over the exact segment from `origin` to `target`.

The traversal must provide for every crossed cell:

- entry distance;
- exit distance;
- exact path length inside the cell;
- representative segment point;
- whether the cell is the target cell;
- whether traversal is axial, diagonal or partial.

This replaces:

- the current cell-center-only terrain horizon path;
- the separate fixed `1.2 m` point-sampling loop;
- separate field vegetation step math.

### 5.4 Origin and target height

For every trace:

```text
originEye = smoothTerrainHeight(exactOrigin) + originHeightAboveGround

targetPoint = smoothTerrainHeight(exactTarget) + targetHeightAboveGround
```

Intermediate terrain uses the canonical static-grid terrain sample for the crossed cell. The origin and target are never snapped to cell centers.

### 5.5 Terrain horizon

The kernel maintains the maximum occluding slope encountered before the target.

For each intermediate cell:

```text
groundSlope = (terrainHeight - originEye) / distanceFromExactOrigin
```

The target sample is terrain-blocked when:

```text
targetSlope + 0.02 < maximumHorizonSlope
```

The current canonical horizon margin `0.02` is retained.

The occluding terrain cell itself remains observable; the shadow begins behind it.

### 5.6 Objects

Both field and point perception use the same rasterized object geometry from `VisibilityStaticGrid`:

- `blockingFlags` determines whether the cell can create a hard object horizon;
- `objectTopHeightMeters` supplies the occluding height;
- the target cell does not block itself;
- an intermediate object cell can raise the horizon for later cells.

This deliberately removes the separate point-only object intersection implementation. If finer rotated-object geometry is needed later, `VisibilityStaticGrid` must be improved once for all consumers rather than reintroducing a second LOS implementation.

### 5.7 Vegetation

Vegetation transmission uses the exact path length inside each crossed cell:

```text
transmission *= exp(-lossPerMeter × pathLengthMeters)
```

The kernel maintains independent visual and fire transmission channels. A trace may request `visual`, `fire` or `combined`.

### 5.8 Kernel output

The canonical result includes:

- exact origin and target;
- total distance;
- traversed-cell count;
- hard-blocked state;
- blocker kind: terrain, object, vegetation exhaustion, boundary or none;
- blocker position and distance;
- visual transmission;
- fire transmission;
- accumulated vegetation path length;
- Russian diagnostic reason.

## 6. Concrete-target probe

Create:

```text
src/core/visibility/VisibilityTargetProbe.ts
```

`probeTargetVisibility(...)` performs the three silhouette traces through `VisibilityRayKernel` and returns the aggregate result.

`PointVisibility.ts` consumes this result instead of calling the old standalone `computeLineOfSight` geometry.

The existing logical point-probe budget remains:

```text
MAX_PERCEPTION_POINT_PROBES_PER_SIMULATION_STEP = 2
```

One three-sample silhouette probe consumes one logical budget slot. Diagnostics separately count three physical ray traces.

The cache key includes:

- observer ID and posture;
- observer exact position quantized to `0.05` cell;
- target exact position quantized to `0.05` cell;
- target height quantized to `0.05 m`;
- silhouette sampling version;
- terrain, height, forest and object revisions;
- active visibility-material profile key.

## 7. Compatibility LOS API

`computeLineOfSight(...)` remains available for existing tools, reports and smoke tests, but becomes a thin compatibility wrapper over the canonical ray kernel.

It must not retain:

- its own terrain-horizon traversal;
- its own fixed-distance sampling loop;
- its own object-blocking algorithm;
- its own vegetation attenuation algorithm.

No duplicate geometry formula may remain after migration.

## 8. Heatmap candidate mask

Create:

```text
src/core/visibility/VisibilityCandidateMask.ts
```

The mask builder receives the selected unit and the heatmap preview target posture.

It produces bounded arrays for the current visibility rectangle:

- `candidate: Uint8Array`;
- `attentionWeight: Uint8Array`;
- `zone: Uint8Array`;
- `candidateCellCount`;
- a stable calculation key.

The candidate pass may inspect every cell in the bounded maximum-range rectangle because it performs only arithmetic and attention-model calls. It must not read terrain, objects, vegetation or run LOS.

## 9. Masked geometry-field build

`VisibilityGeometryField` is refactored to use `VisibilityRayKernel`.

For the selected-unit heatmap it receives the candidate mask.

The field still uses perimeter rays to preserve bounded field construction, but each perimeter ray first performs a cheap mask-only walk:

1. if the ray touches no candidate cell, skip it completely;
2. otherwise find the farthest candidate cell on that ray;
3. run canonical geometry only up to that cell;
4. write results only for candidate cells encountered by the ray.

This preserves the existing radial coverage while avoiding terrain/object/vegetation evaluation for inactive sectors and excessive distance beyond the active zone.

Add an `evaluated: Uint8Array` to geometry output so tests and diagnostics can distinguish:

- not evaluated because outside attention;
- evaluated and visible;
- evaluated and blocked.

Field arrays may remain map-sized typed arrays for simple indexed access and one-sprite rendering. Non-candidate cells remain zero/default.

## 10. Selected-unit visibility field

`SelectedUnitVisibilityField` changes in the following ways:

- removes the fixed `TARGET_EYE_HEIGHT_METERS = 1.4`;
- resolves heatmap height from the display preview posture;
- builds the attention candidate mask before geometry;
- computes visibility quality only for candidate/evaluated cells;
- uses the same `evaluateCellVisibilityQuality` formula as point perception;
- includes preview posture and candidate-mask identity in the calculation key;
- preserves the `0.2 s` moving rebuild throttle;
- preserves per-unit field caching.

The final quality remains:

```text
quality =
  distanceFactor
  × visualTransmission
  × attentionWeight
  × observerCondition
```

Non-candidate cells remain zero without calling this formula.

## 11. Runtime UI

Extend `AttentionOverlayRuntimeState` with:

```text
heatmapTargetPosture: 'standing' | 'crouched' | 'prone'
```

Default: `standing`.

Add a selector in `AttentionRuntimePanel` near **«Текущий обзор»**:

```text
Высота условной цели:
[ Стоит | Пригнулся | Лежит ]
```

Changing it:

- updates runtime UI state;
- changes the visibility-field calculation key;
- rebuilds only the selected unit's heatmap;
- does not modify any unit or perception contact.

## 12. Diagnostics

Extend visibility diagnostics with:

- `candidateCellCount`;
- `evaluatedTargetCellCount`;
- `skippedOutsideAttentionCellCount`;
- `geometryTraversedCellCount`;
- `geometryRayCount`;
- `pointTargetProbeCount`;
- `pointPhysicalRayCount`.

The runtime panel replaces ambiguous **«Обработано шагов»** with explicit metrics:

- **Клеток-кандидатов**;
- **Проверено геометрией**;
- **Пройдено клеток лучами**;
- **Лучей поля**.

## 13. Performance constraints

The implementation must preserve these boundaries:

- no full geometry field per perception target;
- no LOS work outside due attention checks;
- no LOS target evaluation outside the heatmap candidate mask;
- no renderer-driven simulation work;
- no unbounded cache;
- no per-cell Pixi display objects;
- no work triggered by pointer or camera movement;
- point probes remain limited to two logical preparations per simulation step;
- heatmap field rebuilds remain throttled while the unit moves;
- field and probe caches reject stale map/profile revisions.

The three-sample target probe increases physical rays per logical target from one to three. The implementation must expose this cost in diagnostics and verify it with the focused perception performance smoke before readiness is claimed.

## 14. Error and boundary behavior

- Missing/out-of-map target: hard blocked by map boundary.
- Zero-length observer-target segment: visible, transmission `1`.
- Invalid heights: normalized to at least `0.05 m`.
- Invalid numeric positions: rejected by the public probe contract or normalized to map bounds consistently.
- Empty candidate mask: no geometry rays and a fully shadowed field.
- Missing selected unit or hidden overlay: no heatmap build.
- Editor mode: current runtime overlay remains disabled as today.

## 15. Migration sequence

1. Add failing kernel parity, exact-position, posture and candidate-mask tests.
2. Add `VisibilityRayKernel` and migrate `VisibilityGeometryField` to it.
3. Add `VisibilityTargetProbe` and migrate `PointVisibility`.
4. Convert `computeLineOfSight` into a compatibility wrapper.
5. Delete duplicate geometry code from `LineOfSight.ts`.
6. Add candidate-mask-driven field ray filtering.
7. Add heatmap posture preview runtime state and panel selector.
8. Update diagnostics and Russian explanations.
9. Update existing smoke tests and documentation.
10. Run the focused non-browser verification matrix.

## 16. Required test scenarios

### Canonical geometry

1. Field and point trace agree for the same exact origin, target and height.
2. Off-center observer and off-center target do not snap to cell centers.
3. Standing, crouched and prone observer eye heights produce the expected terrain horizon.
4. Standing, crouched and prone target heights produce different visibility behind relief.
5. Terrain ridge blocks lower samples while upper sample remains visible.
6. Object horizon behaves identically in field and point traces.
7. Vegetation transmission depends on exact path length through crossed cells.
8. Map boundary produces a deterministic hard blocker.

### Perception integration

9. `PerceptionStimulus.targetHeightMeters` from actual target posture reaches the target probe unchanged.
10. A partially exposed target receives reduced aggregate transmission rather than full visibility.
11. A fully hidden target produces no visual evidence.
12. Exact target movement within one cell can change visibility when crossing an occluding edge.
13. Cache identity changes with observer position, target position, posture, height and map revisions.
14. Two-logical-probe-per-step budget and deferral behavior remain intact.

### Heatmap masking

15. Cells outside all active attention zones remain `unseen`, `quality = 0` and `evaluated = 0`.
16. Empty candidate mask produces zero geometry rays.
17. A narrow focus profile traces fewer geometry rays/cells than a 360-degree profile.
18. Cells beyond zone-specific maximum range remain default shadow.
19. Changing preview posture changes field geometry without reading hidden units.
20. Standing/crouched/prone preview modes match canonical target heights.
21. Hidden overlay performs zero field work.
22. Pointer and camera movement do not rebuild the field.

### Regression

23. Existing near-relief posture regression remains covered.
24. Existing perception, variance, view-memory heatmap and visibility-probe scenarios continue to pass.
25. Renderer still uses one raster sprite and only uploads on field revision changes.

## 17. Focused verification matrix

Required before reporting code readiness:

```text
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

GitHub Actions, Chromium, Playwright and deployment are not run without separate explicit approval.

## 18. Acceptance criteria

The implementation is accepted when all of the following are true:

- one canonical ray kernel owns terrain, object and vegetation visibility math;
- no independent geometry algorithm remains in `LineOfSight.ts`;
- perception uses exact observer/target positions and actual target posture height;
- partial silhouette exposure affects aggregate visual transmission;
- heatmap has standing/crouched/prone hypothetical-target modes;
- heatmap never reads hidden targets;
- cells outside active attention remain default shadow and receive no target LOS evaluation;
- field and point traces agree in deterministic parity fixtures;
- focused TypeScript, smoke and build checks pass;
- no preview, `real-wargame-preview` transfer or `main` operation occurs without separate explicit user approval.
