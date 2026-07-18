# Architecture Overview

This document contains stable architectural boundaries. Current feature status belongs in generated `STATUS.md` files, not here.

## System flow

```text
JSON data and editor drafts
        ↓
Pure core models and simulation
        ↓
Knowledge, visibility, cover and tactical evaluation
        ↓
AiGraphRunner — immediate choice and scoring
        ↓
AiGraphRuntime — resumable lifecycle and execution state
        ↓
AiGameBridge — adapter to live SimulationState
        ↓
PixiJS rendering and input
        ↓
HTML controls, diagnostics and editors
```

## Stable boundaries

### Core

`src/core/` owns game data, calculations and pure decision logic.

Core modules must not depend on:

- PixiJS;
- browser DOM;
- `localStorage`;
- visual panel state.

### Shared vegetation and visibility fields

Vegetation is a cell material, not a renderer object. Canonical cells reference `surfaceMaterialId` and `vegetationMaterialId`; `EnvironmentMaterialProfile.ts` is the versioned physical/presentation catalog and `VegetationDefinition.ts` is the compatibility adapter for existing consumers. The serialized `forest: 0 | 1 | 2` format remains supported and normalizes to `none`, `sparse_forest` or `dense_forest`. Presentation, visibility, fire and movement revisions are independent, and every cache key includes the active profile identity. See `docs/subprojects/ai-single-unit-editor/ENVIRONMENT_MATERIAL_PROFILES_V1.md`.

`VisibilityStaticGrid` contains map-derived height, object blocker and vegetation data. `VisibilityGeometryField` builds bounded cached typed-array fields for an arbitrary origin:

```text
map revisions + origin + heights + range
        ↓
hardBlocked / visualTransmission / fireTransmission / blockerKind
       ↙                                      ↘
current unit view                         known-threat line of fire
       ↓                                      ↓
subjective observation                 SoldierDangerField
                                              ↓
                                    route cost / safe position / AI
```

The current-view adapter may add attention, viewing direction, distance falloff and observer condition. Those observer-dependent factors must not be reused as the fire mask of another unit. Directional-fire danger uses the same geometry provider with the subjective last-known threat position as origin. Unknown area threats keep area semantics and do not invent a precise point-source shadow.

Overlay visibility and selected-unit state are presentation concerns. Machine consumers may request a field for any unit or known source while every relevant overlay is hidden. Renderers read core fields and material presentation settings; they never become a simulation input. Broad vegetation is rendered as dirty 32 × 32-cell raster chunks, not one Pixi object per cell.

### Physical movement

Navigation chooses a route; physical movement executes that route. The canonical built-ins are `normal_walk`, `stealth_move`, `crouched_move`, `run`, `sprint` and `crawl`. `MovementProfile.settings` is the single editable numeric contract for runtime and the visual editor; gait code contains only structural posture invariants. `MovementRuntimeState` keeps requested authority separate from effective `hard_safety` constraints. `SimulationTick.ts` is the only coordinate integrator. Physical surface effects enter through `MovementMaterialProfileProvider`, with an explicit legacy fallback until canonical material profiles are integrated. Movement sound is distance-based, stamina threshold crossing is partition-invariant, intent-owned weapon preparation stores remaining duration rather than an absolute simulation timestamp, and fallback never deletes the active order.

### Rendering

`src/rendering/` converts current state into visible PixiJS or HTML output. A renderer is not the authoritative source of game state.

Long-lived graphics and DOM controls should be reused. Do not recreate complete overlays or permanent controls on every frame or every small state change.

### Input

`src/input/` translates pointer, keyboard and camera actions into explicit commands. Simulation input and editor input must remain distinguishable.

### User interface

`src/ui/` owns human-facing controls and workbenches. Russian is the default UI language. Normal workflows must not require manual JSON editing.

### AI evaluator

`AiGraphRunner.ts` is the pure immediate evaluator. It reads a graph and Blackboard, evaluates conditions and Utility scores, and returns effects, trace and explanation.

It does not own a multi-tick action lifecycle.

### AI runtime

`AiGraphRuntime.ts` owns serializable resumable execution state and lifecycle:

```text
start → update → complete
               ↘ cancel
```

A running action must clean up only state that it owns. It must not delete a replacement player order or another newer action.

### Game bridge

`AiGameBridge.ts` is the per-unit adapter between pure AI code and the live game. `AiSimulationScheduler.ts`, called only from `SimulationTick.ts`, resolves one immutable graph snapshot and traverses graph-controlled combat-capable units once in stable O(n) simulation order. A new/reset unit decides on its first explicit step; ordinary decisions use 600 ms simulation time and Blackboard observers use a partition-invariant 60 ms simulation-time cadence. UI selection controls only read-only diagnostics for already-computed Blackboard, runtime trace and route state.

### Tactical knowledge

Awareness is subjective. A soldier cannot automatically use complete objective world information. Territory safety is background context and does not replace current danger, visibility or memory.

## Data and language contract

- Canonical identifiers, serialized keys, file names, code names and test names are English.
- Complete Russian `*Ru` overlays are required for human-facing content.
- Russian opens by default.
- Existing data requires safe migration rather than silent reset where practical.

## Performance rules

- Do not recompute heavy tactical maps every frame.
- Cache awareness, visibility geometry and relief calculations with explicit invalidation.
- Confidence, fire class and navigation-profile changes may rescore an existing geometry field; they must not rebuild map visibility geometry.
- Do not trace LOS inside every A* neighbor evaluation. Routing consumes the already-built danger field.
- Do not draw large overlays as thousands of independent cells when a bounded texture, geometry or small fixed set of elements can represent them.
- Do not couple mouse hover updates to rebuilding static terrain.
- Diagnose with real browser evidence before changing the application for a performance issue.

## Verification boundary

Code inspection is not visual verification. A visual result requires:

- the real Vite application;
- a real browser;
- fresh PNG capture after the change;
- inspection of key PNG files;
- confirmation that artifact SHA matches the tested commit.
