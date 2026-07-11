---
name: real-wargame-ai-runtime
description: "Read first for Real-Wargame Soldier AI graph, Utility scoring, Blackboard, stateful Runtime, cancellation, AiGameBridge, node editor runtime diagnostics or AI Dictionary work."
license: MIT
---

# Real-Wargame AI Runtime

## Purpose

Use this skill for the active single-soldier AI vertical slice. It routes work without requiring the full historical HANDOFF or every AI document.

## Read order

1. `docs/ai/WEB_CHAT_START.md`.
2. `docs/subprojects/ai-single-unit-editor/STATUS.md`.
3. `docs/architecture/OVERVIEW.md`.
4. The exact AI module and focused test involved.
5. `HANDOFF.md` only when the task continues the immediately previous implementation session.
6. Historical journal and plans only when a decision cannot be understood from current code and status.

## Core roles

### `AiGraphRunner.ts`

Pure immediate evaluation:

- traverses the graph;
- evaluates conditions and scores;
- chooses a branch;
- returns effects, trace, explanation and cooldown information.

It must not import PixiJS, DOM, `localStorage` or `SimulationState`.

### `AiGraphRuntime.ts`

Pure resumable execution:

- stores serializable execution state;
- owns `start / update / complete / cancel` lifecycle;
- resumes `SequenceWithMemory`;
- currently supports `Wait` in the preview baseline;
- prepares `running` actions such as `MoveToBlackboardPosition`.

Execution state is not the Blackboard. Do not mix temporary lifecycle ownership into permanent or sensed AI values.

### `AiGameBridge.ts`

Game adapter:

- builds the selected soldier Blackboard;
- invokes Runner/Runtime;
- applies effects to `SimulationState`;
- stores trace and explanation;
- persists execution state in the selected unit runtime.

The Bridge may know the game. Runner and Runtime must remain pure.

## Running-action contract

A multi-tick action must define:

```text
start
update
complete
failure
cancel
```

It must also define ownership:

- which target was frozen at start;
- which order or route belongs to this action;
- which token identifies owned state;
- what is removed on completion or cancellation;
- how a newer player or commander order is protected.

Never clear an order only because its type resembles the AI action. Clear it only when ownership proves it belongs to that execution instance.

## Blackboard and knowledge

- Blackboard keys use canonical English names.
- Human selectors and descriptions require complete Russian overlays.
- Soldier knowledge is subjective.
- Objective world state is not automatically known.
- `territorySafety` is background context, not current danger.
- New keys should be registered in the canonical AI catalog rather than entered as invisible free-form strings in normal UI.

## Node editor rules

- Normal authoring must not require JSON.
- Keep storage migrations explicit.
- Do not resurrect legacy nodes when universal nodes express the same behavior.
- Persistent controls must not be destroyed and recreated by every live trace update.
- Runtime highlighting must represent actual Runner/Runtime trace, not a simulated animation.

## Task routes

| Task | Primary files | Focused checks |
|---|---|---|
| Utility score or branch choice | `AiGraphRunner.ts`, Blackboard, graph fixture | runtime smoke, graph validation, build |
| Wait or stateful sequence | `AiGraphRuntime.ts`, runtime smoke | runtime smoke, browser runtime test, build |
| Running movement | Runtime, Bridge, SimulationTick/order ownership | RED runtime tests, runtime smoke, browser movement scenario, build |
| Cancellation | Runtime lifecycle, Bridge cleanup, replacement order test | explicit cancel and replacement-order tests |
| New Blackboard key | Blackboard, Bridge builder, AI catalog, editor selector | dictionary smoke, runtime smoke, editor browser test |
| Node authoring UI | node editor human UI and validation | editor smoke, fresh PNG, build |
| Runtime diagnostics | Bridge trace storage, runtime overlay | browser scenario with inspected active/waiting/running state |

## TDD requirement

For behavior changes:

1. write a focused failing smoke/unit test;
2. run it and confirm the expected RED failure;
3. implement the smallest behavior;
4. run the focused test;
5. run relevant existing AI smoke checks;
6. run production build;
7. for user-visible behavior, run a fresh real-browser scenario.

## Minimum report

State:

- graph/runtime behavior changed;
- ownership and cancellation rules;
- exact tests run;
- whether a real browser was used;
- whether PNGs were inspected;
- remaining single-soldier limitations.
