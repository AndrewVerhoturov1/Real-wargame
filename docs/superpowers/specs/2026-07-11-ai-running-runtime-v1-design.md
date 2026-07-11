# Stateful AI Runtime v1 Design

Date: 2026-07-11
Status: approved for implementation
Subproject: `ai-single-unit-editor`

## Goal

Turn the current instant `pass / fail` GraphRunner into a backward-compatible first stateful execution slice that can start, resume, complete and cancel behavior across multiple AI ticks.

The first supported duration workflow is:

```text
instant nodes
→ Wait
→ instant nodes
```

inside a `SequenceWithMemory` node.

## Scope

This slice adds:

- execution statuses `success`, `failure`, `running`, `waiting`, `cancelled`;
- serializable per-unit execution state;
- `SequenceWithMemory`;
- `Wait` with a duration and optional timeout;
- lifecycle events for start, update, completion and cancellation;
- cancellation through an explicit request;
- live editor diagnostics for the active and waiting node;
- backward compatibility for all existing v1 graphs;
- one runtime smoke suite that executes the real TypeScript modules.

This slice does not add:

- parallel execution;
- StateTree;
- event subscriptions;
- reactive condition aborts;
- action-channel ownership;
- path reservation;
- multi-soldier scheduling;
- persistence in scene JSON.

## Architecture

### Existing instant evaluator remains authoritative

`AiGraphRunner.ts` remains the existing pure instant evaluator. Old graphs continue to call the same selection and scoring logic.

A new `AiGraphRuntime.ts` wraps the instant evaluator. It owns duration state and never imports DOM, PixiJS, localStorage or `SimulationState`.

For branch selection, the wrapper creates an execution-planning copy of the graph:

- every `SequenceWithMemory` is represented as a successful execution boundary;
- its children are hidden from the instant selector;
- `Wait` nodes therefore do not affect branch scoring;
- the selected original branch is then executed by the stateful layer.

This avoids rewriting the established Utility AI implementation during the first duration slice.

### Execution state

The state is a serializable data object:

```ts
interface AiGraphExecutionState {
  readonly version: 1;
  readonly graphId: string;
  readonly unitId: string;
  readonly branchNodeId: string;
  readonly sequenceNodeId: string;
  readonly childIndex: number;
  readonly activeNodeId: string;
  readonly activeNodeStartedAtMs: number;
  readonly lastUpdatedAtMs: number;
  readonly status: 'running' | 'waiting';
}
```

It contains no game objects, callbacks, DOM nodes or class instances.

### Stateful result

The wrapper returns the normal `AiGraphRunnerResult` fields plus:

```ts
status: 'success' | 'failure' | 'running' | 'waiting' | 'cancelled'
executionState?: AiGraphExecutionState
activeNodeId?: string
activeNodeName?: string
activeNodeNameRu?: string
elapsedMs?: number
lifecycle: readonly AiGraphLifecycleEvent[]
cancellationReason?: string
cancellationReasonRu?: string
```

`ok` remains compatible:

- `true` for success, running and waiting;
- `false` for failure and cancelled.

### Sequence execution

`SequenceWithMemory` executes children in their declared order.

- Instant child succeeds: advance to the next child in the same tick.
- Instant child fails: sequence fails and clears execution state.
- `Wait` starts: store the current child index and start time.
- `Wait` before its duration: return `waiting` and preserve state.
- `Wait` reaches its duration: emit completion, advance and continue in the same tick.
- End of children: return success and clear state.

An instant child is executed through the existing `runAiGraph()` using a temporary graph rooted at that child. This keeps existing action, memory, condition and scoring behavior in one implementation.

### Cancellation

The bridge can pass a bilingual cancellation request.

If state exists, cancellation:

- emits a `cancel` lifecycle event;
- returns `cancelled`;
- clears the execution state;
- does not replay the cancelled child;
- does not apply stale effects.

The first slice has no resource-owning duration action, so no path or reservation cleanup is required yet. The cancellation contract is established now so future movement actions must implement cleanup before they are accepted.

### Bridge integration

`AiGameBridge.ts` stores `aiGraphExecutionState` beside existing graph memory and simulation time in the selected unit's behavior runtime.

Each applied tick:

1. builds the current blackboard;
2. calls `runAiGraphRuntime()` with the saved state;
3. stores the returned state;
4. applies only effects returned for this tick;
5. publishes duration fields in the existing debug payload.

Preview-only evaluation does not mutate the saved execution state.

### Editor integration

The node catalog adds Russian-first visible definitions:

- `SequenceWithMemory` / `Последовательность с памятью`;
- `Wait` / `Ждать`.

Default `Wait` parameters:

```json
{
  "durationSeconds": 2,
  "timeoutSeconds": 0
}
```

The runtime overlay adds statuses and colors:

- running — yellow;
- waiting — blue;
- success/pass — green;
- failure — red;
- cancelled — orange.

The debug panel shows:

- execution status;
- active node;
- elapsed time;
- cancellation reason when present.

Russian remains the default interface language. Canonical identifiers and test names remain English.

## Error handling

The runtime returns failure and clears incompatible state when:

- the graph id changed;
- the unit id changed;
- the saved branch, sequence or active node no longer exists;
- `SequenceWithMemory` has a missing child;
- a duration is invalid after normalization;
- an instant child fails.

A graph edit therefore cannot leave an orphaned running action.

## Backward compatibility

- Graph version remains `1`.
- Existing localStorage keys remain unchanged.
- Existing graphs without `SequenceWithMemory` use the old instant result through the wrapper.
- Existing `AiGraphRunnerResult` consumers retain all current fields.
- Scene export format remains unchanged.
- `main` remains untouched.

## Verification

### Runtime smoke

The smoke suite must prove:

1. an old instant graph still succeeds;
2. `Wait` starts and returns `waiting`;
3. the same state resumes without restarting the wait;
4. the wait completes at the configured time;
5. `SequenceWithMemory` continues with the next child;
6. cancellation clears state and emits one cancel lifecycle event;
7. a changed graph invalidates stale execution state safely;
8. bilingual active-node data is returned.

### Existing checks

Run:

```text
npm run runtime:smoke
npm run workspace:smoke
npm run lab:smoke
npm run game-editor:smoke
npm run editor:smoke
npm run engine:smoke
npm run validate:ai-graph
npm run build
```

### Browser verification

Use the real Vite app and Chromium. Create a test graph containing `SequenceWithMemory → Wait`, publish a runtime payload, open the actual AI Node Editor and capture a PNG showing the waiting node and debug panel. The PNG must be downloaded and inspected before visual success is reported.
