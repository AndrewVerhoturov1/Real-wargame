# Player Command, Unit Plan and Route Overlay v1

Date: 2026-07-12

Branch: `task/player-command-plan-route-overlay`

Transfer status: isolated temporary branch only. This work has not been transferred to `real-wargame-preview` or `main`.

## Result

The selected soldier now has three separate movement concepts:

1. `PlayerCommand` — the result requested by the player;
2. `UnitPlanState` — the current AI-selected branch and its real runtime stages;
3. `MoveOrder` — the technical routed movement currently executed by `SimulationTick`.

All three appear in one map overlay:

- yellow dashed intent line and target: player command;
- blue dashed stages and active-stage label: soldier plan;
- green solid polyline and waypoint markers: current route.

Colour is not the only distinction: command, plan and route also use different line styles and marker shapes.

## Player command

Current v1 command type:

```text
move_to_position
```

Lifecycle:

```text
active
blocked
completed
cancelled
```

The command stores a stable id, requested target, issue time, bilingual reason and monotonic revision. A successful route stores the exact `playerCommandId`. Replanning preserves that id. Completion or failure changes a command only when the current route still owns the same id.

A blocked route does not erase the player's desired result. The yellow target remains visible with a failure mark and the command status becomes `blocked`.

## Plan from graph nodes

The AI plan is not invented by the renderer. It is derived from the real `AiGraphRuntimeResult`:

- the selected branch becomes the plan name;
- `SequenceWithMemory.children` become ordered stages;
- `executionState.childIndex` becomes the active stage;
- completed children are marked completed;
- the current child is active, failed or cancelled according to runtime state;
- later children remain pending;
- `MoveToBlackboardPosition.parameters.targetKey` resolves a spatial stage target from the returned Blackboard.

Until the runtime has selected a meaningful graph branch, a one-stage `player_fallback` plan represents direct execution of the movement command. Once the graph produces a real branch and sequence, the blue plan changes to that real node-derived plan while the yellow command remains separate.

## Blackboard contract

Canonical keys:

```text
player_command_active
player_command_type
player_command_status
player_command_target_position
player_command_revision
```

Legacy compatibility remains:

```text
hasOrder
order_target_position
```

The graph reads the player command but does not own or silently delete it.

## Route contract

The existing shared deterministic A* remains unchanged as the pathfinding source. Player and AI movement still use the same `planMoveOrder` adapter. `MoveOrder` continues to own:

- requested and resolved target;
- simplified waypoints and current waypoint index;
- route cells for simulation lookahead;
- route status and revision;
- pathfinding reason and diagnostics;
- AI owner token when applicable;
- optional player command id for player-owned routes.

`SimulationTick` remains the only coordinate mutator.

## Rendering and performance

`PixiOrderRenderer` no longer deletes and recreates all order graphics every frame. It now keeps one persistent view per relevant unit:

```text
Map<unitId, UnitOverlayView>
```

Each view reuses:

- one command `Graphics`;
- one plan `Graphics`;
- one route `Graphics`;
- one active-stage `Text`.

A view redraws only when its bounded overlay key changes. The key contains only:

- unit position;
- selection state;
- command revision and status;
- plan revision and status;
- route issue time and revision;
- current waypoint index and waypoint count;
- final target.

The key does not scan or serialize:

- map cells;
- map objects;
- route cells;
- awareness fields;
- visibility fields.

The renderer never invokes A*. Detailed blue and green data are built only for selected units. Unselected units may show only a faint yellow active player command.

Turning the overlay off sets the persistent container invisible and performs no redraw or destruction.

## Human interface

The View menu contains:

```text
Приказ · план · маршрут: вкл / выкл
```

The selected-unit status block shows separate lines:

```text
Приказ: ...
План: ...
Маршрут: ...
```

The existing action line remains separate. `Отменить приказ` changes the player command to `cancelled` and removes only its matching player-owned route.

Right-click movement uses the routed player-command path directly. Existing cover and stealth movement buttons are converted to the same routed command after their legacy target selection, so they no longer leave an unlinked direct order.

## Verification

Non-visual focused checks:

```text
npm run command-plan-route:smoke
npm run routed-move:smoke
npm run runtime:smoke
npm run build
```

The focused smoke verifies:

- command identity and revision rules;
- direct fallback plan;
- real sequence stage extraction;
- spatial Blackboard target resolution;
- player command Blackboard entries and Russian descriptions;
- selected-only detailed plan and route data;
- bounded render key independent of a 1000-cell technical route.

Routed movement smoke additionally verifies:

- command/order identity linkage;
- blocked command retention;
- replan identity preservation;
- command completion;
- AI route failure not inventing a player command.

Prepared but not executed without explicit user approval:

```text
tests/command-plan-route-overlay.spec.ts
```

Expected screenshot:

```text
artifacts/screenshots/31-command-plan-route-overlay.png
```

## Current limits

- v1 implements only movement commands; occupy, defend, observe and attack need separate command contracts later.
- Only selected soldiers show detailed blue plans and green routes.
- The automatic AI graph still runs only for the selected soldier.
- A plan shows actual currently selected runtime stages, not speculative future Utility choices.
- Full A* route cells remain technical data and are intentionally not drawn in normal mode.
- Visual QA is pending explicit user approval and therefore no PNG inspection is claimed for this branch yet.
