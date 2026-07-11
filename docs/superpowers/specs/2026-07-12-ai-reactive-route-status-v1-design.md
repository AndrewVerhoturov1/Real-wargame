# Reactive Abort + Route Status v1 — Design

Date: 2026-07-12  
Target branch: `feature/ai-reactive-route-status-v1`  
Base branch: `real-wargame-preview`

## Goal

Add an honest first route-status contract around the existing stateful movement action without pretending that straight-line movement is already pathfinding.

The selected soldier must be able to detect meaningful movement changes while `MoveToBlackboardPosition` is running and react immediately when:

- the player replaces the AI move order;
- the configured target disappears from Blackboard;
- the owned order disappears;
- the soldier stops making measurable progress for a configured time.

All work remains on the temporary feature branch. `real-wargame-preview` and `main` must not be changed by this stage.

## Approaches considered

### 1. Add full pathfinding now

Rejected for this slice. `SimulationTick` currently moves directly toward the target and does not collide movement with terrain objects. A real pathfinder would require a separate movement-obstacle contract, route following, replanning and map integration.

### 2. Add manual `path_exists` flags only

Rejected. A flag that is always supplied by tests or the editor would look complete without measuring anything in the actual simulation.

### 3. Track real progress and react to significant events

Selected. The system measures whether the remaining distance decreases, records the last meaningful progress time and declares the current straight-line route blocked only after a configurable no-progress window.

This is useful with the current simulation and becomes the stable status contract that a future pathfinder can update.

## Scope

### Implemented in v1

- serializable route-progress state for the selected soldier;
- route statuses `idle`, `moving`, `stalled`, `blocked`, `arrived`, `player_override`, `target_lost`, `order_missing`, `cancelled`;
- configurable `stuckTimeoutSeconds` and `minimumProgressCells` on `MoveToBlackboardPosition`;
- configurable `abortOnTargetLost`;
- immediate forced runtime tick when a player order replaces the AI order;
- immediate cancellation when the target disappears;
- immediate runtime failure evaluation when the owned order disappears;
- cancellation when no meaningful progress lasts longer than the configured timeout;
- Blackboard memory keys and live Russian diagnostics;
- deterministic core smoke tests, bridge smoke tests and browser verification.

### Explicitly not implemented

- A*, flow fields or any other pathfinder;
- obstacle-aware movement physics;
- route waypoint following;
- route replanning around buildings;
- cover identity or reservation;
- army-wide scheduling;
- persistence to scene JSON.

## Architecture

### `AiRouteStatus.ts`

A pure module independent of DOM, PixiJS, localStorage and `SimulationState`.

It receives a snapshot:

```ts
{
  nowMs,
  position,
  target,
  acceptanceRadiusCells,
  activeOrderSource,
  activeOrderToken,
  ownerToken,
  targetAvailable,
  settings,
  previousState,
}
```

It returns:

```ts
{
  state,
  status,
  noProgressMs,
  distanceRemainingCells,
  abortCode?,
  abortReason?,
  abortReasonRu?,
  shouldForceRuntimeTick,
  shouldCancelRuntime,
}
```

The helper never mutates the simulation.

### `AiStatefulMoveGameBridge.ts`

The game bridge owns the integration because it can see the real unit position, active `MoveOrder`, selected-unit runtime and authoring parameters.

Before the normal 600 ms graph evaluation it runs the lightweight route tracker every bridge poll:

1. read the active stateful move token and frozen target;
2. read route settings for the active node;
3. resolve whether the target key still contains a valid position;
4. update measurable route progress;
5. publish route status into AI memory;
6. force a runtime tick only when a reactive abort or immediate failure is required.

Normal movement still belongs exclusively to `SimulationTick`.

### Runtime ownership

`AiGraphRuntime` remains responsible for lifecycle and token-owned cleanup.

The route tracker does not remove orders directly. It requests a forced runtime evaluation:

- player replacement: force a normal runtime update so the existing player-order branch returns `cancelled`;
- owned order missing: force a normal runtime update so the existing missing-order branch returns `failure`;
- blocked route or lost target: pass an explicit cancellation request so runtime emits its normal `cancel` lifecycle and token-protected `clear_move`.

## Route-progress algorithm

Default settings:

```text
stuckTimeoutSeconds = 2.5
minimumProgressCells = 0.05
abortOnTargetLost = true
```

On start:

- save owner token, target, initial distance and current time;
- status becomes `moving`.

On update:

- if the target is reached, status becomes `arrived`;
- if remaining distance improved by at least `minimumProgressCells`, update the progress checkpoint and keep `moving`;
- if progress is smaller but the timeout has not elapsed, status becomes `stalled`;
- if the no-progress age reaches `stuckTimeoutSeconds`, status becomes `blocked` and requests cancellation.

The timer does not advance while the editor or simulation is paused.

## Reactive events

### Player override

When the current order no longer carries the active AI token and represents a player order:

- status becomes `player_override`;
- the bridge forces an immediate runtime tick;
- runtime returns `cancelled`;
- stale AI cleanup cannot remove the player order because cleanup remains token-protected.

### Target lost

When the active node's configured Blackboard key no longer contains a finite position and `abortOnTargetLost` is enabled:

- status becomes `target_lost`;
- the bridge requests explicit runtime cancellation;
- runtime clears only its own AI order.

A changed but still valid target does not retarget the current action. The frozen target remains authoritative.

### Owned order missing

When no active order token exists before arrival:

- status becomes `order_missing`;
- the bridge forces a normal runtime update;
- the existing runtime missing-order path returns `failure`.

### Route blocked

When no meaningful progress is measured for the configured time:

- status becomes `blocked`;
- the bridge requests explicit runtime cancellation with a Russian explanation;
- the status remains visible in the debug payload after cleanup.

## Blackboard contract

The selected soldier memory receives:

```text
active_move_route_status
active_move_no_progress_ms
active_move_last_distance
active_move_abort_code
active_move_abort_reason
```

These values are available to future conditions and Utility AI scoring without changing graph version `1`.

## Authoring UI

The Russian panel for `MoveToBlackboardPosition` adds:

```text
Считать маршрут заблокированным через, секунд
Минимальный заметный прогресс, клеток
Отменять, если цель исчезла
```

New movement nodes persist these defaults immediately, like the existing target/radius/timeout fields.

## Live diagnostics

`След ИИ` adds:

```text
Маршрут: Движение / Нет прогресса / Заблокирован / Цель потеряна / Приказ игрока
Без прогресса: 1,8 сек.
Причина прерывания: ...
```

The browser evidence must show both normal movement diagnostics and a blocked-route example.

## Error handling

- malformed saved route state is discarded and rebuilt from the active move;
- malformed node settings fall back to safe defaults;
- debug/localStorage errors never interrupt gameplay;
- no route cancellation may remove an order without owner-token matching;
- paused/editor time must not create false blocked-route events.

## Compatibility

- graph version remains `1`;
- localStorage graph key remains v6;
- existing movement graphs receive safe defaults automatically;
- `Wait`, instant actions and UtilitySelector behavior remain unchanged;
- existing `MoveToBlackboardPosition` lifecycle remains unchanged when progress is normal;
- only the selected soldier is tracked automatically;
- `main` and `real-wargame-preview` remain untouched.

## Verification

### Pure route-status smoke

Prove:

- start creates `moving` state;
- meaningful distance decrease resets the no-progress timer;
- small movement reports `stalled` but does not abort early;
- timeout produces `blocked` and cancellation request;
- player replacement produces immediate `player_override`;
- target loss respects `abortOnTargetLost`;
- missing order requests immediate failure evaluation;
- arrival reports `arrived`;
- paused updates do not age the timer.

### Bridge smoke

Prove:

- route memory keys are synchronized;
- a replacement player order forces immediate cancellation and survives cleanup;
- a blocked route clears only the matching AI order;
- missing target produces the configured Russian reason;
- normal `SimulationTick` progress prevents false blocking.

### Browser verification

Prove:

- the new Russian controls are visible and persist;
- safe defaults are stored immediately for a new node;
- normal route status and no-progress time appear in `След ИИ`;
- blocked status and Russian abort reason are readable;
- existing movement screenshot remains usable;
- exact-SHA PNG is opened before completion.

## Next stage

After this contract is stable, implement an obstacle-aware grid pathfinder that publishes waypoints and updates the same route-status fields. Only then add replanning and cover reservation.
