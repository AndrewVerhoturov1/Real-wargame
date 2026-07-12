# AI Single-Unit Editor — Stateful Tactical Awareness Lab

This file describes stable purpose, architecture and boundaries. Current implementation status belongs in:

```text
docs/subprojects/ai-single-unit-editor/STATUS.md
docs/subprojects/ai-single-unit-editor/subproject.json
```

Immediate continuation context, when needed, belongs in `HANDOFF.md`.

## Goal

Create a human-understandable laboratory for the behavior of one selected soldier inside the existing Real-Wargame tactical foundation.

The user should be able to:

- assemble behavior from reusable AI nodes;
- understand Blackboard concepts in normal Russian language;
- inspect Utility scores, chosen branches and explanations;
- execute the graph for a real selected soldier on the tactical map;
- see subjective threat memory, danger, concealment and known cover;
- use territorial context without turning it into omniscient enemy detection;
- observe multi-tick actions through explicit runtime state;
- configure normal behavior without editing JSON or source code.

Canonical code/data names are English. Human-facing Russian overlays are complete and Russian opens by default.

## Architectural flow

```text
AI Node Editor
→ graph data contract
→ Blackboard built for selected soldier
→ AiGraphRunner immediate evaluation
→ AiGraphRuntime resumable lifecycle
→ AiGameBridge game adapter
→ SimulationState effects
→ runtime trace and human explanation
```

## Main components

### Graph contract

```text
src/core/ai/AiGraph.ts
src/core/ai/AiNodeTypes.ts
src/core/ai/AiBlackboard.ts
src/core/ai/AiGraphValidation.ts
```

The graph and Blackboard use serializable, headless data.

### Immediate evaluation

```text
src/core/ai/AiGraphRunner.ts
```

`AiGraphRunner` evaluates conditions and Utility branches and returns effects, scores, trace, explanation and cooldown changes.

It remains independent of PixiJS, DOM, localStorage and `SimulationState`.

### Stateful execution

```text
src/core/ai/AiGraphRuntime.ts
```

`AiGraphRuntime` adds serializable multi-tick execution state and explicit lifecycle:

```text
start → update → complete
               ↘ cancel
```

Execution state is separate from Blackboard. A duration/running node must define ownership and safe cleanup before it is connected to live behavior.

### Game adapter

```text
src/core/ai/AiGameBridge.ts
```

The Bridge:

- builds the current selected-soldier Blackboard;
- invokes Runner and Runtime;
- stores execution state in the soldier behavior runtime;
- applies returned effects to the live game;
- writes runtime trace and explanation for diagnostics.

The Bridge is allowed to know `SimulationState`; the pure Runner and Runtime are not.

### Human authoring and diagnostics

```text
ai-node-editor.html
src/ai-node-editor/
src/data/ai/
```

The editor provides reusable nodes, human parameter panels, validation, import/export and live runtime trace. Normal use must not require manual JSON.

### Tactical awareness

```text
src/core/knowledge/SoldierThreatMemory.ts
src/core/knowledge/SoldierAwarenessGrid.ts
src/core/cover/SmallArmsCoverEvaluation.ts
src/core/pressure/
src/rendering/PixiAwarenessHeatmapRenderer.ts
```

Awareness is subjective. It is built from what the soldier has sensed or remembered, not from unrestricted world state.

### Territorial context

```text
src/core/front/FrontZoneState.ts
src/ui/FrontZoneControls.ts
src/front-zones.css
```

The simple front model provides friendly, neutral and enemy territory as strategic background context. It does not reveal enemies, block movement or replace immediate danger.

## Stable decisions

- Begin with one selected soldier; squad-level AI comes later.
- The game has exactly two user modes: Simulation and Editing.
- Editing pauses normal simulation.
- Legacy one-off nodes do not return when reusable nodes express the same meaning.
- Heavy awareness calculations are cached and invalidated; they do not run every frame.
- Persistent interface controls are updated in place rather than recreated on each live-state change.
- A running action cleans only resources and orders it owns.
- A newer player/commander order always survives cleanup of an older AI action.
- Front visualization uses a small fixed overlay, not per-cell rendering.
- Scene export compatibility must not be broken silently.
- `main` is never changed without explicit human GO.

## Data responsibilities

### Permanent soldier data

Traits, equipment and stable identity.

### Initial/reset state

Scenario starting condition used by reset and editor workflows.

### Live runtime state

Current health, stress, suppression, posture, action, movement and AI execution state.

### Blackboard

A decision input assembled for the current evaluation. It may contain sensed values, remembered values, current order context and tactical/territorial derived values.

### Execution state

Temporary serializable lifecycle state for the active multi-tick graph step. It is not a general memory store.

## Boundaries

Do not:

- rewrite the complete RTS simulation for an AI-node feature;
- run the graph for the whole army before one-soldier behavior is stable;
- treat the objective world as automatically known;
- couple Runner/Runtime to PixiJS or DOM;
- recompute awareness every frame;
- make territory safety identical to current danger;
- turn the front into a continuously recalculated influence map in the simple version;
- introduce a duration/running action without cancel cleanup and ownership tests;
- delete a replacement player order during AI cleanup;
- claim a planned mechanic is implemented;
- claim browser/visual verification without fresh inspected evidence.

## Verification families

Core and AI changes use focused combinations of:

```text
npm run runtime:smoke
npm run dictionary:smoke
npm run workspace:smoke
npm run lab:smoke
npm run game-editor:smoke
npm run editor:smoke
npm run engine:smoke
npm run validate:ai-graph
npm run build
```

User-visible changes also use the real-browser workflow from:

```text
.agents/skills/real-wargame-local-preview/SKILL.md
```

Task-specific routes are in:

```text
.agents/skills/real-wargame-ai-runtime/SKILL.md
docs/ai/TASK_ROUTER.md
```
