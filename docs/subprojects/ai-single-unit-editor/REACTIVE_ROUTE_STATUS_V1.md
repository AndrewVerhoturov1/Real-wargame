# Reactive Abort + Route Status v1

Date: 2026-07-12

## Purpose

`MoveToBlackboardPosition` now measures whether the selected soldier is actually approaching the frozen target and wakes the stateful runtime immediately for significant movement events.

## Statuses

- `moving` — measurable progress;
- `stalled` — no meaningful progress yet, below the timeout;
- `blocked` — no progress for the configured active time;
- `arrived` — target reached;
- `player_override` — a player order replaced the AI order;
- `target_lost` — the configured Blackboard target disappeared;
- `order_missing` — the token-owned move order disappeared.

## Authoring parameters

Russian-first controls on `MoveToBlackboardPosition`:

- `Считать маршрут заблокированным через, секунд` (`stuckTimeoutSeconds`, default `2.5`);
- `Минимальный заметный прогресс, клеток` (`minimumProgressCells`, default `0.05`);
- `Отменять, если цель исчезла` (`abortOnTargetLost`, default `true`).

## Safety

- Route tracking never removes `MoveOrder` directly.
- Cleanup still requires matching `ownerToken`.
- Player replacement is preserved.
- Pause time from `AiTestLabRuntime` is excluded from the no-progress timer.
- The 60 ms tracker reads cached memory and one distance only; it does not rebuild tactical awareness.

## Blackboard memory

- `active_move_route_status`
- `active_move_no_progress_ms`
- `active_move_last_distance`
- `active_move_abort_code`
- `active_move_abort_reason`

## Limit

This status layer detects measured lack of progress. Obstacle-aware routing is supplied separately by Grid Pathfinding v1.
