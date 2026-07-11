# Stateful AI Movement v1 — Design

Date: 2026-07-12  
Target branch: `real-wargame-preview`  
Working branch: `feature/ai-running-move-v1`

## Goal

Add the first real multi-tick action to the single-soldier AI graph: `MoveToBlackboardPosition`.

The node must start a move exactly once, return `running` while the soldier is travelling, complete when the saved destination is reached, and clean up only its own AI order when it fails or is cancelled.

## Scope

The finished vertical slice is:

```text
Under fire
→ find cover
→ crouch
→ MoveToBlackboardPosition(best_cover_position)
→ prone
```

The current `Wait` and `SequenceWithMemory` behavior remains unchanged.

## Architecture

### Runtime responsibility

`AiGraphRuntime` remains a pure core module. It never changes `SimulationState`, PixiJS, DOM, or a unit directly.

For `MoveToBlackboardPosition` it reads:

- the configured target key from Blackboard;
- `self_position` on every tick;
- current move-order ownership fields exposed through Blackboard.

It returns explicit effects:

- `begin_move` once on start;
- `clear_move` only on completion, failure, or cancellation.

### Simulation responsibility

`SimulationTick` continues to be the only code that changes the soldier position. The runtime does not duplicate movement math.

### Bridge responsibility

`AiGameBridge` translates `begin_move` into the existing `MoveOrder`, and translates `clear_move` into safe order cleanup.

The bridge adds order ownership metadata to Blackboard so runtime can distinguish:

- the same AI move still active;
- the AI move already completed;
- a replacement order from the player;
- a different AI order.

## Move-order ownership

`MoveOrder` gains backward-compatible optional fields:

```ts
source?: 'player' | 'ai';
ownerToken?: string;
```

Manual right-click orders are created with `source: 'player'`.

The new AI node creates a deterministic action token and stores it in execution state. The bridge creates an order with:

```ts
source: 'ai';
ownerToken: actionToken;
```

`clear_move` removes the current order only when its `ownerToken` matches. Therefore a cancellation result can never erase a newer player order.

## Execution state

The existing serializable `AiGraphExecutionState` gains optional node-local data for movement:

```ts
{
  kind: 'move_to_blackboard_position';
  targetKey: string;
  target: { x: number; y: number };
  acceptanceRadiusCells: number;
  timeoutMs: number;
  actionToken: string;
}
```

The target is frozen at start. A newly recalculated `best_cover_position` does not make the soldier twitch between destinations during the same action.

## Node parameters

```text
targetKey              default best_cover_position
acceptanceRadiusCells  default 0.20
timeoutSeconds          default 15
```

The Russian human UI shows:

```text
Цель из памяти
Радиус достижения, клеток
Максимальное время, секунд
```

No JSON editing is required.

## Runtime behavior

### Start

1. Read and validate the target position.
2. If the target is already within the acceptance radius, complete immediately and continue the sequence.
3. Otherwise create an action token.
4. Return `running`, persist execution state, and emit one `begin_move` effect.

### Update

1. Read the frozen target from execution state.
2. Measure distance from current `self_position`.
3. If reached, emit `clear_move`, record `complete`, and continue to the next sequence child in the same runtime tick.
4. If the current order token still matches, return `running` without re-emitting `begin_move`.
5. If a player order or another order replaced it, return `cancelled` without clearing the replacement order.
6. If no matching order exists before the target is reached, return `failure`.
7. If timeout is reached, return `failure` and emit safe `clear_move`.

### Explicit cancellation

`cancelNow()` returns `cancelled`, emits lifecycle `cancel`, and emits `clear_move` with the saved token. The bridge clears only the matching AI order.

## Diagnostics

Runtime results and the editor debug payload add:

```text
targetKey
targetPosition
distanceRemainingCells
actionToken
```

The editor displays:

```text
Состояние: Выполняется
Активная нода: Двигаться к укрытию
Цель: best_cover_position
Осталось: 7,4 клетки
Выполняется: 3,2 сек.
```

The active node uses the existing yellow `running` style.

## Error handling

The node fails with a Russian explanation when:

- the configured Blackboard key is missing;
- the value is not a finite `{x, y}` position;
- the owned AI order disappears before arrival;
- timeout expires;
- saved execution state no longer matches the graph.

A replacement player order is treated as cancellation, not failure.

## Compatibility

- Graph version stays `1`.
- Existing localStorage graph key stays unchanged.
- Existing scene export/import stays unchanged.
- Existing `SetAction(move_to)` remains supported as an instant command.
- Existing `Wait` graphs remain valid.
- `main` is not touched.

## Deliberate v1 limits

- Movement is still straight-line movement from `SimulationTick`; there is no pathfinder yet.
- `path_exists` cannot provide real blocked-route detection yet.
- Cover identity and reservation are not implemented; the frozen destination is a position.
- Only the selected soldier runs the graph automatically.
- No parallel action channels are introduced.

## Verification

### Runtime smoke

Tests must prove:

- start emits one `begin_move`;
- update returns `running` and emits no duplicate command;
- completion emits `clear_move` and continues to the next sequence node;
- explicit cancellation emits safe cleanup;
- a replacement player order produces `cancelled` and is not cleared;
- missing target fails before an order is created;
- timeout fails and cleans the owned order;
- legacy instant and `Wait` behavior remain green.

### Browser test

A real browser scenario must show:

- `MoveToBlackboardPosition` in the palette;
- Russian parameter controls;
- a yellow running node;
- active target and remaining distance in `След ИИ`;
- saved parameter changes;
- a fresh PNG opened and visually inspected.

## Next stage after this slice

After this movement node is stable, add reactive condition aborts and real route/path status. Only then add cover reservation and wider multi-soldier scheduling.
