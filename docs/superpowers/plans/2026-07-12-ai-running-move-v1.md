# Stateful AI Movement v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `MoveToBlackboardPosition`, a real multi-tick AI action that owns one move order, reports `running`, completes at its frozen destination, and safely cancels without erasing a newer player order.

**Architecture:** `AiGraphRuntime` remains pure and emits `begin_move` / `clear_move` effects. `AiGameBridge` owns translation to `MoveOrder`; `SimulationTick` remains the only position integrator. Optional order ownership metadata and a serialized action token protect manual orders from stale AI cleanup.

**Tech Stack:** TypeScript, Vite, existing GraphRunner/Runtime, Node smoke tests, Playwright, GitHub Actions.

## Global Constraints

- Work only from `real-wargame-preview`; do not touch `main`.
- Graph version remains `1` and localStorage graph v6 remains compatible.
- Core AI must not import DOM, PixiJS, localStorage, or `SimulationState`.
- The target position is frozen for the life of one action.
- `begin_move` is emitted once; update ticks must not duplicate it.
- Cleanup may remove only an AI order with the matching owner token.
- Russian UI is the default and must not require JSON editing.
- Do not claim UI verification until the exact-SHA PNG is opened.

---

### Task 1: RED runtime contract tests

**Files:**
- Modify: `scripts/ai_graph_runtime_smoke.ts`

**Interfaces:**
- Consumes: existing `runAiGraphRuntime()` and `AiGraphExecutionState`.
- Produces: failing behavioral requirements for `MoveToBlackboardPosition`.

- [ ] Add a graph containing `SequenceWithMemory → MoveToBlackboardPosition → SetPosture`.
- [ ] Add assertions that first tick returns `running`, saves a frozen target, and emits exactly one `begin_move`.
- [ ] Add assertions that the second tick with matching order token emits no duplicate move effect.
- [ ] Add assertions that arrival emits `clear_move`, completes movement, and executes the following posture node.
- [ ] Add tests for missing target, timeout, explicit cancellation, and replacement player order.
- [ ] Run the existing `runtime:smoke` workflow on the feature branch and confirm failure because the new node/effects do not exist.

### Task 2: Move-order ownership contract

**Files:**
- Modify: `src/core/orders/MoveOrder.ts`
- Modify: `src/core/simulation/SimulationState.ts`
- Modify: `src/core/ai/AiGraphRunner.ts`

**Interfaces:**
- Produces:
  - `MoveOrder.source?: 'player' | 'ai'`
  - `MoveOrder.ownerToken?: string`
  - `createMoveOrder(target, options?)`
  - effects `begin_move` and `clear_move`

- [ ] Extend `MoveOrder` with optional `source` and `ownerToken`.
- [ ] Extend `createMoveOrder()` with optional ownership options while preserving old callers.
- [ ] Mark right-click movement orders as `source: 'player'`.
- [ ] Add `begin_move` and `clear_move` to `AiGraphEffect` with explicit target/token/reasons.
- [ ] Run TypeScript build and runtime smoke; expect runtime tests still red but ownership types compile.

### Task 3: Stateful movement in pure runtime

**Files:**
- Modify: `src/core/ai/AiGraphRuntime.ts`

**Interfaces:**
- Consumes: Blackboard `self_position`, `active_move_source`, `active_move_owner_token`.
- Produces: serialized movement state and result diagnostics.

- [ ] Add movement node-local data to `AiGraphExecutionState`.
- [ ] Allow saved state to resume both `Wait` and `MoveToBlackboardPosition`.
- [ ] Implement start behavior: validate target, immediate completion when already close, otherwise emit `begin_move` and return `running`.
- [ ] Implement update behavior: calculate remaining distance from the frozen target, continue without duplicate effects, complete at acceptance radius.
- [ ] Treat a player replacement order as `cancelled` without removing it.
- [ ] Treat missing owned order and timeout as `failure` with `clear_move` cleanup.
- [ ] Implement explicit cancellation cleanup from saved movement state.
- [ ] Expose `targetKey`, `targetPosition`, `distanceRemainingCells`, and `actionToken` in runtime result.
- [ ] Extend stateful-descendant checks and stale-state validation for the new node.
- [ ] Run `npm run runtime:smoke`; expected all runtime tests green.

### Task 4: Game bridge and Blackboard integration

**Files:**
- Modify: `src/core/ai/AiGameBridge.ts`

**Interfaces:**
- Consumes: `begin_move` / `clear_move` effects.
- Produces Blackboard fields:
  - `active_move_source`
  - `active_move_owner_token`
  - `active_move_target`

- [ ] Add current order ownership fields to `buildBlackboardForUnit()`.
- [ ] Translate `begin_move` into an AI-owned `MoveOrder` with the supplied token.
- [ ] Translate `clear_move` into conditional cleanup only when the token matches the current order.
- [ ] Keep existing instant `SetAction(move_to)` behavior intact.
- [ ] Publish movement diagnostics into the runtime debug payload.
- [ ] Add a bridge-level smoke assertion proving a replacement player order survives stale AI cleanup.
- [ ] Run core smoke and production build.

### Task 5: Node catalog and Russian authoring UI

**Files:**
- Modify: `src/core/ai/AiNodeTypes.ts`
- Modify: `src/ai-node-editor/human-node-ui.ts`
- Modify: `src/ai-node-editor/runtime-debug-overlay.ts`
- Modify: `src/ai-node-editor/runtime-debug-overlay.css` only if spacing requires it.

**Interfaces:**
- Produces a palette node and human fields for target key, radius, and timeout.

- [ ] Register `MoveToBlackboardPosition` as an action node with English base text and Russian overlay.
- [ ] Add fixed target-key options for `best_cover_position`, `order_target_position`, and `retreat_position`.
- [ ] Add numeric controls for `acceptanceRadiusCells` and `timeoutSeconds`.
- [ ] Add default parameters when creating the node from the palette.
- [ ] Display target key, target coordinates, and remaining cells in `След ИИ`.
- [ ] Keep Russian as the default visible language.
- [ ] Run editor smoke and production build.

### Task 6: Real browser test and exact-SHA evidence

**Files:**
- Create: `tests/ai-running-move.spec.ts`
- Modify: `.github/workflows/preview-screenshots.yml`

**Interfaces:**
- Produces screenshot `27-ai-running-move-node.png`.

- [ ] Seed a graph and runtime debug payload with a running movement node.
- [ ] Verify yellow running class, Russian status, active node, target key, and remaining distance.
- [ ] Click the node, edit radius/timeout through the human UI, save, and verify localStorage persistence.
- [ ] Capture `27-ai-running-move-node.png`.
- [ ] Add the test to the screenshot workflow.
- [ ] Run the full screenshot workflow and confirm all Playwright tests pass.
- [ ] Download artifacts, verify artifact SHA equals the feature head SHA, and open the key PNG.

### Task 7: Documentation, review, and delivery

**Files:**
- Create: `docs/subprojects/ai-single-unit-editor/STATEFUL_MOVEMENT_V1.md`
- Create: `docs/subprojects/ai-single-unit-editor/journal/2026-07-12-stateful-movement-v1.md`
- Modify: `docs/subprojects/ai-single-unit-editor/subproject.json`

**Interfaces:**
- Produces an honest handoff with verified SHA, workflows, limits, and next slice.

- [ ] Document implemented lifecycle, ownership safety, UI, checks, and deliberate pathfinding limits.
- [ ] Review the complete diff for accidental scope expansion and backward-compatibility risks.
- [ ] Run fresh final core, policy, and screenshot workflows on the final documentation SHA.
- [ ] Confirm feature branch is strictly ahead of unchanged `real-wargame-preview`.
- [ ] Fast-forward `real-wargame-preview` to the verified feature SHA without force.
- [ ] Verify preview and feature refs are identical.
- [ ] Confirm `main` was not changed.
