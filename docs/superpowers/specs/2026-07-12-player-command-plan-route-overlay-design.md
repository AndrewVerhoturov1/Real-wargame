# Player Command, Unit Plan and Route Overlay Design

## Status

Approved for implementation on the isolated branch `task/player-command-plan-route-overlay`.

The branch starts from the current `real-wargame-preview`. Nothing from this task may be transferred to `real-wargame-preview` or `main` without a later explicit user instruction.

## Goal

Separate the player's desired result, the soldier AI plan and the technical navigation route while showing all three in one readable map overlay:

- yellow: player command;
- blue: soldier plan derived from the active AI graph branch and sequence;
- green: the actual routed movement waypoints.

## Scope

The first version supports the currently implemented movement command. It establishes extensible contracts for future occupy, defend, observe and attack commands without implementing those command types now.

## Data model

### Player command

`PlayerCommand` is authoritative human intent. It stores:

- stable command id and monotonic revision;
- command type `move_to_position`;
- requested target position;
- active, completed, blocked or cancelled status;
- English and Russian reason;
- issue timestamp.

A route rebuild, AI action change or runtime cancellation must not silently delete an active player command.

### Unit plan

`UnitPlanState` is a UI-safe snapshot of the plan currently selected by the AI runtime. It stores:

- selected branch id and bilingual label;
- sequence id when a `SequenceWithMemory` is active;
- ordered stages derived from real graph nodes;
- active stage index;
- stage states: completed, active, pending, failed or cancelled;
- optional spatial target resolved from the stage Blackboard key;
- a structural revision that increments only when overlay-relevant plan structure changes.

If no stateful graph sequence is available, a direct player-movement fallback plan keeps the distinction visible without pretending that future AI choices are known.

### Navigation route

The existing routed `MoveOrder` remains the only movement execution contract. It continues to own:

- resolved movement target;
- waypoints and current waypoint index;
- route cells and route-cell index;
- route status and revision;
- pathfinding diagnostics and AI ownership token.

A new optional `playerCommandId` links a player-owned move order to the exact command that created it. Replanning must preserve this id.

## Data flow

1. A right click or a UI movement button creates or replaces `unit.playerCommand`.
2. Shared `planMoveOrder` calculates the route; no second pathfinder is introduced.
3. A successful plan installs `unit.order` linked by `playerCommandId` and creates a direct fallback `unit.plan`.
4. A failed plan keeps the player command visible as blocked and installs no route.
5. `buildBlackboardForUnit` publishes the command type, status, target and revision while preserving legacy `hasOrder` and `order_target_position` keys.
6. `tickAiGameBridge` derives `UnitPlanState` from the actual selected branch, `SequenceWithMemory`, active child index and Blackboard values.
7. `SimulationTick` completes or blocks only the matching player command when its linked route completes or becomes unavailable.

## Node connection

The graph reads human intent through canonical Blackboard keys:

- `player_command_active`;
- `player_command_type`;
- `player_command_status`;
- `player_command_target_position`;
- `player_command_revision`.

`UtilitySelector` chooses the branch. `SequenceWithMemory` supplies ordered plan stages. The active runtime node supplies the current stage. `MoveToBlackboardPosition` supplies a spatial stage target and creates only the green navigation route.

The graph may change the blue plan, but it does not rewrite the yellow command. Autonomous AI movement may produce a blue plan and green route without a yellow player command.

## Overlay behaviour

One persistent PixiJS 7 renderer owns all three visual levels.

### Player command

- yellow dashed connection from the soldier to the requested target;
- yellow target ring and cross;
- visible for active and blocked commands;
- completed and cancelled commands disappear after their terminal state is recorded in the UI.

### Soldier plan

- blue dashed connections between spatial plan stages;
- numbered blue stage markers;
- active stage is brightest, completed stages are dimmed, failed stage receives a warning outline;
- selected soldier only, to prevent visual and rendering overload;
- non-spatial current stage is shown by one reused label near the soldier.

### Route

- green solid polyline from the current soldier position through remaining `waypoints`;
- current waypoint is highlighted;
- route is rebuilt only from existing route data;
- full A* `routeCells` are not rendered in normal mode.

Unselected soldiers keep only a faint yellow active-command indication. Detailed blue and green rendering is restricted to selected soldiers.

## Performance contract

The implementation must preserve the latest map-overlay performance foundation:

- no full-map fingerprints or scans;
- no terrain, awareness or visibility rebuild caused by this overlay;
- no A* invocation from rendering;
- no `container.removeChildren()` per frame;
- one long-lived view per relevant unit, stored by unit id;
- update only when the unit overlay key changes;
- moving selected units may redraw only their own small graphics object;
- reuse Pixi `Graphics` and `Text` objects;
- destroy views only when units disappear;
- disabling the overlay uses `container.visible` and performs no redraw.

The render key may use unit position, command revision, plan revision, order route revision, waypoint index and selection state. It must not serialize map cells, route cells or map objects.

## UI

The View menu receives one toggle: `Приказ · план · маршрут`.

The selected-unit bar and Info panel display separate rows for:

- player command;
- soldier plan;
- current action;
- route progress.

`Очистить приказ` cancels the player command and removes its linked route. It must not claim that autonomous AI intent was a player command.

## Compatibility

- Legacy direct `MoveOrder` values remain valid.
- Existing AI owner-token rules remain unchanged.
- Existing route planning and simulation movement remain the source of truth.
- Development identifiers and canonical copy are English; Russian remains the complete default UI.
- PixiJS stays on 7.4 APIs.

## Verification

Automated checks must cover:

1. player command creation and exact route linkage;
2. route replanning preserving player command identity;
3. command completion and blocked status;
4. AI plan derivation from a real graph sequence and active child index;
5. Blackboard command keys;
6. overlay snapshot keys avoiding route-cell and map-cell fingerprints;
7. persistent renderer lifecycle through focused browser diagnostics;
8. production build and existing movement/runtime/performance smoke suites.

Visible browser QA is prepared but not executed until the user explicitly approves it, following `docs/workflow/VISUAL_QA_APPROVAL_POLICY.md`.
