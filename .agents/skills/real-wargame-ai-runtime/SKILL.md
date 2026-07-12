---
name: real-wargame-ai-runtime
description: "Read first for Real-Wargame Soldier AI graph, Utility scoring, Blackboard, stateful Runtime, movement lifecycle, cancellation, AiGameBridge, node editor runtime diagnostics or AI Dictionary work."
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

## Current baseline

Stateful AI Movement v1 is implemented and verified in the preview baseline.

Implemented resumable nodes:

```text
SequenceWithMemory
Wait
MoveToBlackboardPosition
```

`MoveToBlackboardPosition` freezes its Blackboard target on start, emits one `begin_move`, returns `running` across ticks, completes on arrival and cleans only its token-owned `MoveOrder`. A newer player order must survive cancellation of the older AI action.

The next bounded slice is `Reactive Abort + Route Status v1`, followed by a real grid pathfinder. Straight-line movement must not be described as completed pathfinding.

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
- supports `Wait` with status `waiting`;
- supports `MoveToBlackboardPosition` with status `running`;
- freezes movement target and ownership data inside execution state;
- returns lifecycle/effects without directly moving the soldier.

Execution state is not the Blackboard. Do not mix temporary lifecycle ownership into permanent or sensed AI values.

### `AiGameBridge.ts`

General game adapter:

- builds the selected soldier Blackboard;
- invokes Runner/Runtime;
- applies normal effects to `SimulationState`;
- stores trace and explanation;
- persists execution state in the selected unit runtime.

### `AiStatefulMoveGameBridge.ts`

Movement-specific adapter:

- converts runtime `begin_move` into the existing `MoveOrder` contract;
- assigns and checks an action owner token;
- lets `SimulationTick` remain the only position integrator;
- reports arrival, missing order, replacement order and cancellation back to Runtime;
- removes movement only when ownership proves it belongs to the active execution.

The bridges may know the game. Runner and Runtime must remain pure.

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

## Reactive abort and route status

The next runtime work should introduce explicit route/action observations, for example:

```text
active
arrived
blocked
invalid
replaced
cancelled
```

Reactive cancellation or rebuild may be triggered by:

- a new player or commander order;
- disappearance or invalidation of target cover;
- a blocked route;
- critical change in known threat;
- missing token-owned order;
- timeout.

Cancellation reasons must be visible in trace and Russian diagnostics. Do not add full pathfinding, cover reservation and squad behavior in the same slice.

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
- Running movement diagnostics should expose target key, frozen position, remaining distance and owner token in a human-readable form.

## Task routes

| Task | Primary files | Focused checks |
|---|---|---|
| Utility score or branch choice | `AiGraphRunner.ts`, Blackboard, graph fixture | runtime smoke, graph validation, build |
| Wait or stateful sequence | `AiGraphRuntime.ts`, runtime smoke | runtime smoke, browser runtime test, build |
| Running movement | Runtime, `AiStatefulMoveGameBridge.ts`, `MoveOrder.ts`, `SimulationTick.ts` | runtime smoke, move-bridge smoke, movement Playwright scenario, build |
| Cancellation or replacement order | Runtime lifecycle, movement bridge, ownership token tests | runtime smoke, move-bridge smoke, explicit replacement-order test |
| Route status or reactive abort | Runtime, movement bridge, route observation contract | RED focused tests, both AI smokes, browser trace scenario, build |
| New Blackboard key | Blackboard, Bridge builder, AI catalog, editor selector | dictionary smoke, runtime smoke, editor browser test |
| Node authoring UI | node editor human UI and validation | editor smoke, fresh PNG, build |
| Runtime diagnostics | Bridge trace storage, runtime/movement overlays | browser scenario with inspected waiting/running/cancel state |

## TDD requirement

For behavior changes:

1. write a focused failing smoke/unit test;
2. run it and confirm the expected RED failure;
3. implement the smallest behavior;
4. run the focused test;
5. run relevant existing AI smoke checks;
6. run production build;
7. for user-visible behavior, run a fresh real-browser scenario.

## Minimum verification

For runtime or movement logic:

```text
npm run runtime:smoke
npm run move-bridge:smoke
npm run validate:ai-graph
npm run build
```

Add the relevant wider smoke and Playwright scenario based on the changed integration surface.

## Minimum report

State:

- graph/runtime behavior changed;
- ownership and cancellation rules;
- exact tests run;
- whether a real browser was used;
- whether PNGs were inspected;
- remaining single-soldier, route and pathfinding limitations.
