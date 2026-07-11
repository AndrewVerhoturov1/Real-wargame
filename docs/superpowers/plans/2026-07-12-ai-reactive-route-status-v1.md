# Reactive Abort + Route Status v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add measurable route progress, blocked-route detection and immediate reactive cancellation around `MoveToBlackboardPosition` while keeping all work on a temporary branch.

**Architecture:** A new pure `AiRouteStatus` module evaluates progress snapshots and emits route status plus abort requests. `AiStatefulMoveGameBridge` integrates that result with the selected soldier, stores route state separately from Blackboard, publishes human-readable memory/debug fields and forces the existing runtime only on significant events. `SimulationTick` remains the only position integrator.

**Tech Stack:** TypeScript, Vite, existing AI Graph runtime/bridge, Node smoke tests, Playwright, GitHub Actions.

## Global Constraints

- Work only on `feature/ai-reactive-route-status-v1`.
- Do not update `real-wargame-preview` or `main`.
- Do not claim pathfinding; movement remains straight-line.
- Do not remove any order without the existing owner-token check.
- Pause/editor time must not create false blocked-route events.
- Graph version remains `1`; localStorage graph key remains v6.
- Russian UI remains the default visible interface.
- Only the selected soldier is tracked automatically.
- UI completion requires a real browser run and an opened exact-SHA PNG.

---

### Task 1: RED route-status contract

**Files:**
- Create: `scripts/ai_route_status_smoke.ts`
- Create: `scripts/ai_route_status_smoke.mjs`
- Modify: `package.json`
- Modify: `.github/workflows/preview-core-checks.yml`

**Interfaces:**
- Consumes: planned `updateAiRouteStatus(input)` from `src/core/ai/AiRouteStatus.ts`.
- Produces: failing behavioral requirements for status, progress timing and reactive aborts.

- [ ] **Step 1: Write the failing TypeScript smoke test**

Create scenarios that import:

```ts
import {
  createAiRouteStatusState,
  updateAiRouteStatus,
  type AiRouteStatusSettings,
} from '../src/core/ai/AiRouteStatus';
```

Use settings:

```ts
const settings: AiRouteStatusSettings = {
  stuckTimeoutMs: 2500,
  minimumProgressCells: 0.05,
  abortOnTargetLost: true,
};
```

Assert:

```ts
assert.equal(start.status, 'moving');
assert.equal(progress.status, 'moving');
assert.equal(stalled.status, 'stalled');
assert.equal(blocked.status, 'blocked');
assert.equal(blocked.shouldCancelRuntime, true);
assert.equal(playerOverride.status, 'player_override');
assert.equal(playerOverride.shouldForceRuntimeTick, true);
assert.equal(targetLost.status, 'target_lost');
assert.equal(orderMissing.status, 'order_missing');
assert.equal(arrived.status, 'arrived');
assert.equal(paused.state.lastProgressAtMs, previous.state.lastProgressAtMs);
```

- [ ] **Step 2: Add a Vite SSR runner**

Follow `scripts/ai_stateful_move_bridge_smoke.mjs`: build `ai_route_status_smoke.ts` into a temporary SSR entry, import it and remove the temporary directory.

- [ ] **Step 3: Register the command**

Add:

```json
"route-status:smoke": "node scripts/ai_route_status_smoke.mjs"
```

- [ ] **Step 4: Add the command to Preview Core Checks**

Add a `Reactive route status smoke` step, publish its outcome and include it in the final failure gate.

- [ ] **Step 5: Run GitHub Actions on the feature SHA**

Expected: `route-status:smoke` fails because `AiRouteStatus.ts` does not exist; old checks remain green.

- [ ] **Step 6: Commit the RED contract**

Commit message:

```text
Test reactive route status contract
```

---

### Task 2: Pure progress tracker

**Files:**
- Create: `src/core/ai/AiRouteStatus.ts`
- Test: `scripts/ai_route_status_smoke.ts`

**Interfaces:**
- Produces:
  - `AiRouteStatus`
  - `AiRouteAbortCode`
  - `AiRouteStatusSettings`
  - `AiRouteStatusState`
  - `AiRouteStatusInput`
  - `AiRouteStatusResult`
  - `createAiRouteStatusState()`
  - `updateAiRouteStatus()`

- [ ] **Step 1: Define the status contract**

```ts
export type AiRouteStatus =
  | 'idle'
  | 'moving'
  | 'stalled'
  | 'blocked'
  | 'arrived'
  | 'player_override'
  | 'target_lost'
  | 'order_missing'
  | 'cancelled';

export type AiRouteAbortCode =
  | 'route_blocked'
  | 'player_order_replaced'
  | 'target_lost'
  | 'owned_order_missing';
```

- [ ] **Step 2: Define serializable state**

```ts
export interface AiRouteStatusState {
  readonly version: 1;
  readonly ownerToken: string;
  readonly target: GridPosition;
  readonly startedAtMs: number;
  readonly lastCheckedAtMs: number;
  readonly lastProgressAtMs: number;
  readonly lastDistanceCells: number;
  readonly status: AiRouteStatus;
  readonly abortCode?: AiRouteAbortCode;
  readonly abortReason?: string;
  readonly abortReasonRu?: string;
}
```

- [ ] **Step 3: Implement deterministic precedence**

Evaluation order:

```text
paused
→ arrived
→ player override
→ owned order missing
→ target lost
→ meaningful progress
→ stalled
→ blocked
```

- [ ] **Step 4: Implement safe settings normalization**

```ts
stuckTimeoutMs = max(0, finite input)
minimumProgressCells = max(0, finite input)
abortOnTargetLost = input !== false
```

- [ ] **Step 5: Run `npm run route-status:smoke`**

Expected: PASS with all start/progress/stall/block/override/loss/missing/arrival/pause scenarios.

- [ ] **Step 6: Commit**

Commit message:

```text
Add pure AI route status tracker
```

---

### Task 3: Reactive game-bridge integration

**Files:**
- Modify: `src/core/ai/AiStatefulMoveGameBridge.ts`
- Modify: `scripts/ai_stateful_move_bridge_smoke.ts`

**Interfaces:**
- Consumes: `updateAiRouteStatus()` and existing `AiGraphExecutionState` movement data.
- Produces selected-unit memory keys:
  - `active_move_route_status`
  - `active_move_no_progress_ms`
  - `active_move_last_distance`
  - `active_move_abort_code`
  - `active_move_abort_reason`

- [ ] **Step 1: Extend bridge runtime state**

```ts
type AiMoveRuntime = UnitModel['behaviorRuntime'] & {
  aiGraphMemory?: Record<string, AiBlackboardValue>;
  aiRouteStatusState?: AiRouteStatusState;
};
```

- [ ] **Step 2: Read the active movement snapshot**

Add a narrow validator that reads `aiGraphExecutionState.activeData` only when:

```text
kind === move_to_blackboard_position
owner token is non-empty
target is finite
target key is non-empty
```

- [ ] **Step 3: Read route settings from the active node**

Read graph v6 from localStorage and resolve the active node parameters. Defaults:

```ts
{
  stuckTimeoutMs: 2500,
  minimumProgressCells: 0.05,
  abortOnTargetLost: true,
}
```

Malformed JSON or values must use defaults.

- [ ] **Step 4: Evaluate route state before the normal graph tick**

Call `buildBlackboardForUnit(state, unit)` to resolve whether `targetKey` still contains a valid position. Do not retarget when the value changes; only test availability.

- [ ] **Step 5: Force only significant runtime work**

```text
player_override → force normal runtime tick
order_missing   → force normal runtime tick
target_lost     → force tick with explicit cancel reason
blocked         → force tick with explicit cancel reason
otherwise       → preserve normal 600 ms cadence
```

- [ ] **Step 6: Freeze route timers while paused/editor is active**

Pass `paused: true` to the pure tracker and do not request reactive cancellation.

- [ ] **Step 7: Publish memory fields before runtime evaluation**

Store route status, no-progress age, last distance and abort reason in `aiGraphMemory`, so the current and future graph can inspect them.

- [ ] **Step 8: Preserve terminal status after cleanup**

Do not immediately replace `blocked`, `target_lost` or `player_override` with `idle` on the same poll that clears the order. Keep it until a new action token starts.

- [ ] **Step 9: Expand bridge smoke**

Add assertions that:

```text
normal SimulationTick progress keeps status moving
player replacement is detected immediately and survives cleanup
blocked state cancels only the matching AI order
target loss produces route status and Russian reason
missing owned order requests normal runtime failure
```

- [ ] **Step 10: Run**

```text
npm run route-status:smoke
npm run move-bridge:smoke
npm run runtime:smoke
npm run build
```

Expected: all PASS.

- [ ] **Step 11: Commit**

Commit message:

```text
Integrate reactive AI route aborts
```

---

### Task 4: Russian authoring controls and defaults

**Files:**
- Modify: `src/ai-node-editor/stateful-node-ui.ts`
- Modify: `tests/ai-running-move.spec.ts`

**Interfaces:**
- Produces node parameters:
  - `stuckTimeoutSeconds`
  - `minimumProgressCells`
  - `abortOnTargetLost`

- [ ] **Step 1: Add controls**

Add labels:

```text
Считать маршрут заблокированным через, секунд
Минимальный заметный прогресс, клеток
Отменять, если цель исчезла
```

Use defaults `2.5`, `0.05`, `true`.

- [ ] **Step 2: Add checkbox synchronization**

Extend parameter sync to write a boolean from `#stateful-move-abort-target-lost`.

- [ ] **Step 3: Extend immediate-default persistence**

`needsMoveDefaults()` must require all six movement parameters.

- [ ] **Step 4: Add browser RED/GREEN assertions**

For a newly created movement node assert:

```ts
expect(savedParameters).toMatchObject({
  stuckTimeoutSeconds: 2.5,
  minimumProgressCells: 0.05,
  abortOnTargetLost: true,
});
```

For an existing node edit values to `3.5`, `0.1`, `false`, save and verify localStorage.

- [ ] **Step 5: Run screenshot workflow on feature branch**

Expected: Playwright passes and old movement UI remains visible.

- [ ] **Step 6: Commit**

Commit message:

```text
Add route abort controls to AI editor
```

---

### Task 5: Live route diagnostics

**Files:**
- Modify: `src/core/ai/AiStatefulMoveGameBridge.ts`
- Modify: `src/ai-node-editor/stateful-move-debug.ts`
- Modify: `tests/ai-running-move.spec.ts`

**Interfaces:**
- Debug payload fields:
  - `routeStatus`
  - `routeNoProgressMs`
  - `routeAbortCode`
  - `routeAbortReasonRu`

- [ ] **Step 1: Publish route fields**

Augment the existing runtime debug payload without replacing movement target/distance fields.

- [ ] **Step 2: Add Russian labels**

Map statuses:

```text
moving          → Движение
stalled         → Нет прогресса
blocked         → Заблокирован
arrived         → Цель достигнута
player_override → Новый приказ игрока
target_lost     → Цель потеряна
order_missing   → Приказ движения исчез
cancelled       → Отменён
idle            → Нет маршрута
```

- [ ] **Step 3: Render diagnostics**

Add rows:

```text
Маршрут
Без прогресса
Причина прерывания
```

Show no-progress seconds with one decimal.

- [ ] **Step 4: Add a blocked-route browser scenario**

Seed payload:

```ts
routeStatus: 'blocked',
routeNoProgressMs: 2800,
routeAbortCode: 'route_blocked',
routeAbortReasonRu: 'Маршрут заблокирован: боец не продвигается 2,8 сек.',
```

Capture:

```text
28-ai-route-blocked.png
```

- [ ] **Step 5: Inspect exact-SHA PNG**

Verify no overlapping rows and readable Russian status/reason.

- [ ] **Step 6: Commit**

Commit message:

```text
Show reactive route status in AI trace
```

---

### Task 6: Documentation and subproject state

**Files:**
- Create: `docs/subprojects/ai-single-unit-editor/REACTIVE_ROUTE_STATUS_V1.md`
- Create: `docs/subprojects/ai-single-unit-editor/journal/2026-07-12-reactive-route-status-v1.md`
- Modify: `docs/subprojects/ai-single-unit-editor/subproject.json`

**Interfaces:**
- Produces the future handoff and verified temporary-branch state.

- [ ] **Step 1: Document the honest boundary**

Explain that blocked status is measured no-progress detection, not obstacle-aware pathfinding.

- [ ] **Step 2: Document Blackboard and UI contracts**

List exact keys, parameters, status names and Russian diagnostics.

- [ ] **Step 3: Document cancellation precedence**

```text
arrival
→ player override
→ missing order
→ target lost
→ blocked progress
→ normal movement
```

- [ ] **Step 4: Update `subproject.json`**

Set status to `reactive_route_status_v1`, add files, verification commands, limitations and next stage.

- [ ] **Step 5: Record temporary-branch rule**

State explicitly that this stage is not in preview and must not be integrated without a new user instruction.

- [ ] **Step 6: Commit**

Commit message:

```text
Document reactive route status v1
```

---

### Task 7: Final branch-only verification

**Files:**
- Review all changed files.

**Interfaces:**
- Produces a verified feature branch only; no preview ref update.

- [ ] **Step 1: Run final core checks on the exact documentation SHA**

Expected successful steps:

```text
workspace:smoke
lab:smoke
game-editor:smoke
editor:smoke
engine:smoke
validate:ai-graph
runtime:smoke
move-bridge:smoke
route-status:smoke
production build
```

- [ ] **Step 2: Run final policy and screenshot workflows**

Expected: all success.

- [ ] **Step 3: Download the final screenshot and log artifacts**

Confirm artifact `head_sha` equals feature head SHA.

- [ ] **Step 4: Open `27-ai-running-move-node.png` and `28-ai-route-blocked.png`**

Inspect Russian controls, normal route status, blocked status and abort reason.

- [ ] **Step 5: Review the complete diff**

Reject accidental pathfinding claims, preview/main changes, graph-version changes and unguarded order cleanup.

- [ ] **Step 6: Compare branches**

Expected:

```text
feature/ai-reactive-route-status-v1: ahead of real-wargame-preview
real-wargame-preview: unchanged at its original SHA
main: unchanged
```

- [ ] **Step 7: Leave the temporary branch open**

Do not fast-forward, merge or retarget preview. Report the branch name, verified SHA, checks and explicit limitations.
