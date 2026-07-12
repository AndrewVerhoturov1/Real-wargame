---
name: real-wargame-ai-runtime
description: "Read first for Real-Wargame Soldier AI graph, Utility scoring, Blackboard, stateful Runtime, reactive route status, grid pathfinding, MoveOrder lifecycle, cancellation, AiGameBridge, node editor runtime diagnostics or AI Dictionary work."
license: MIT
---

# Real-Wargame AI Runtime

## Purpose

Use this skill for the active single-soldier AI vertical slice. It routes work without requiring the full historical HANDOFF or every AI document.

## Read order

1. `docs/ai/WEB_CHAT_START.md`.
2. `docs/subprojects/ai-single-unit-editor/STATUS.md`.
3. `docs/subprojects/ai-single-unit-editor/REACTIVE_ROUTE_STATUS_V1.md` for movement cancellation/progress work.
4. `docs/subprojects/ai-single-unit-editor/GRID_PATHFINDING_V1.md` for passability, A*, waypoints or replanning.
5. `docs/architecture/OVERVIEW.md`.
6. `docs/workflow/VISUAL_QA_APPROVAL_POLICY.md` for visible behavior.
7. The exact module and focused test involved.
8. Historical journal/plans only when current code and status are insufficient.

## Current baseline

Implemented resumable nodes:

```text
SequenceWithMemory
Wait
MoveToBlackboardPosition
```

`MoveToBlackboardPosition` freezes its Blackboard target, emits one `begin_move`, returns `running`, completes on arrival and cleans only its token-owned order.

Reactive Route Status v1 is implemented:

```text
moving
stalled
blocked
arrived
player_override
target_lost
order_missing
```

Grid Pathfinding v1 is implemented for player and AI movement:

- deterministic eight-direction A*;
- no diagonal corner cutting;
- real terrain and rotated object footprints;
- shared routed `MoveOrder` planning;
- waypoint following and final-only completion;
- short lookahead route invalidation and replanning;
- exact AI goals, nearest-passable player goals;
- Russian path diagnostics.

Do not describe this as flow fields, formation pathfinding, dynamic reservation or tactical exposure-aware routing.

## Core roles

### `AiGraphRunner.ts`

Pure immediate Utility AI evaluation. It must not import PixiJS, DOM, localStorage or `SimulationState`.

### `AiGraphRuntime.ts`

Pure resumable execution. It owns serializable state and `start / update / complete / cancel`. Execution state is not Blackboard memory.

### `AiRouteStatus.ts`

Pure route-progress observation. It measures progress and produces reactive status/cancellation requests. It does not remove orders or know the game scene.

### `GridNavigation.ts`

Pure navigation-grid construction from `TacticalMap`.

Canonical geometry rule:

```text
MapObject center = object.x + 0.5, object.y + 0.5
```

Do not introduce a second coordinate interpretation.

### `GridPathfinder.ts`

Pure deterministic A*. No DOM, PixiJS, AI runtime or simulation imports.

### `MoveOrderPlanning.ts`

Shared path-to-order adapter. Player and AI must not maintain separate route systems.

### `SimulationTick.ts`

The only coordinate integrator. It follows waypoints, checks the short route lookahead and replans only on invalidation. Never run A* every frame.

### `AiGameBridge.ts`

General selected-unit game adapter: builds Blackboard, invokes Runner/Runtime, applies normal effects and stores trace/state.

### `AiStatefulMoveGameBridge.ts`

Movement adapter:

- converts `begin_move` to a token-owned routed order;
- requires exact passable targets for AI actions;
- publishes route/path memory and diagnostics;
- wakes Runtime on significant route events;
- never deletes movement without ownership proof.

## Ownership and cancellation

A running action must define target, owner token, lifecycle, cleanup and player-order precedence.

Never clear an order because its type resembles the AI action. Clear only when `ownerToken` proves ownership.

- Player replacement survives stale AI cancellation.
- `blocked` and `target_lost` request explicit cancellation.
- `player_override` and `order_missing` force a normal immediate Runtime update.
- Pause wall-clock time is excluded from route blocking.

## Pathfinding rules

### Goal policy

- Player click on a blocked cell may resolve to the nearest passable cell.
- AI action must reach the exact target cell; blocked exact target becomes `unreachable`.
- Never let an AI action report success at an adjacent adjusted cell unless its graph explicitly requested that position.

### Performance

- A* only on order creation or route invalidation.
- Simulation checks only the next six route cells.
- The 60 ms reactive poll performs no A* and no awareness rebuild.
- Navigation grid currently rebuilds per plan/replan; cache only after profiling and a map-revision contract.

### Current movement limits

- no flow fields;
- no formation corridor planning;
- no unit route reservations;
- no moving-obstacle prediction;
- no cover reservation;
- no threat/concealment route cost yet;
- automatic graph only for selected soldier.

## Blackboard and knowledge

Canonical English keys, full Russian overlays. Soldier knowledge remains subjective. Route/path runtime memory may describe the soldier's own action without revealing unknown enemies.

Path memory keys:

```text
active_move_path_status
active_move_path_waypoint_count
active_move_path_waypoint_index
active_move_path_requested_target
active_move_path_resolved_target
active_move_path_reason
```

## Node editor rules

- Normal authoring must not require JSON.
- Do not resurrect legacy nodes when universal nodes express the behavior.
- Persistent controls must not be recreated by every live trace update.
- Highlighting must represent actual Runner/Runtime trace.
- Route/path diagnostics must show status, waypoint progress, requested/resolved target and Russian reason.

## Task routes

| Task | Primary files | Focused checks |
|---|---|---|
| Utility choice | Runner, Blackboard, graph fixture | runtime smoke, graph validation, build |
| Stateful node | Runtime | runtime smoke, prepared browser runtime scenario, build |
| Route progress/cancellation | `AiRouteStatus.ts`, movement bridge | route-status smoke, move-bridge smoke, prepared browser trace |
| Passability/A* | `GridNavigation.ts`, `GridPathfinder.ts` | pathfinding smoke, build |
| Waypoints/replan | MoveOrder planning, SimulationTick | routed-move smoke, move-bridge smoke, build |
| Player right click | `RoutedMoveOrders.ts`, input controller | routed-move smoke, prepared workspace/browser scenario |
| Runtime diagnostics | bridge debug storage, editor overlay | prepared browser scenario; exact-SHA PNG only after approval |

## TDD requirement

1. Write focused failing test.
2. Confirm expected RED and old checks green.
3. Implement smallest behavior.
4. Run focused test.
5. Run relevant existing AI/path smoke checks.
6. Run production build.
7. For visible behavior, prepare/update the real-browser scenario and expected PNG list.
8. Ask `Визуальная проверка подготовлена. Запустить её сейчас?`
9. Run and inspect PNG only after explicit user approval. A prior explicit request already counts.

## Minimum verification

```text
npm run runtime:smoke
npm run route-status:smoke
npm run pathfinding:smoke
npm run routed-move:smoke
npm run move-bridge:smoke
npm run validate:ai-graph
npm run build
npm run docs:check
```

Prepare the relevant Playwright scenario for user-visible changes. Do not execute it without approval.

## Minimum report

State:

- runtime/path behavior changed;
- ownership and cancellation rules;
- exact focused tests and implementation SHA;
- `visual_qa_prepared`;
- `visual_qa_approval`;
- `visual_qa_run`;
- browser/PNG evidence only when actually approved and executed;
- remaining pathfinding/selected-soldier limits;
- preview/main branch state.
