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

`AiGameBridge.ts` is the adapter between pure AI code and the live game. It builds the selected soldier Blackboard, invokes Runner/Runtime, applies effects and stores diagnostics.

### Tactical knowledge

Awareness is subjective. A soldier cannot automatically use complete objective world information. Territory safety is background context and does not replace current danger, visibility or memory.

## Data and language contract

- Canonical identifiers, serialized keys, file names, code names and test names are English.
- Complete Russian `*Ru` overlays are required for human-facing content.
- Russian opens by default.
- Existing data requires safe migration rather than silent reset where practical.

## Performance rules

- Do not recompute heavy tactical maps every frame.
- Cache awareness and relief calculations with explicit invalidation.
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
