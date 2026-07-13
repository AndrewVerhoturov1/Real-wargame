# AI Plan Move and Editor Panels Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep a state-plan movement order active until arrival and replace overlapping AI diagnostics with two compact mutually exclusive collapsible panels.

**Architecture:** Route monitoring must resolve target availability in the same Blackboard scope that owns the active movement action, including nested subgraph-local memory. Editor diagnostics share one absolute dock; each diagnostic surface remains independently rendered but mounts inside a reusable `<details>` card, and opening one card closes the other.

**Tech Stack:** TypeScript, Vite, existing smoke scripts, Playwright, DOM/CSS, GitHub Actions.

## Global Constraints

- Work only in `fix/ai-plan-move-editor-panels-temp-2026-07-14` until explicit transfer approval.
- Do not modify the separate hostile-unit/combat branches.
- Keep Russian UI as the default.
- Write a failing regression test before production changes.
- Run the real Vite application in Chrome/Chromium and inspect fresh PNGs after implementation; the user explicitly approved screenshot verification.

---

### Task 1: Preserve nested movement targets

**Files:**
- Create: `scripts/ai_plan_move_scope_smoke.ts`
- Create: `scripts/ai_plan_move_scope_smoke.mjs`
- Modify: `package.json`
- Modify: `src/core/ai/AiStatefulMoveGameBridge.ts`

**Interfaces:**
- Consumes: `AiGraphExecutionState`, `AiSubgraphExecutionState.localBlackboard`, `MoveToBlackboardPositionActionState.targetKey`.
- Produces: route status input whose `targetAvailable` value is resolved from the active action's actual Blackboard scope.

- [x] **Step 1: Write the failing test**

Created a nested subgraph execution state where `destination` exists only in `AiSubgraphExecutionState.localBlackboard`, while session-level memory intentionally has no `destination`. The test calls `updateSelectedRouteStatus` and requires the route to remain `moving` without cancellation.

- [x] **Step 2: Run test to verify it fails**

The focused CI log failed with `actual: target_lost`, `expected: moving`, confirming that the bridge incorrectly read only session-level memory.

- [x] **Step 3: Write minimal implementation**

The active-move snapshot traversal now carries the current Blackboard scope. Descending through a subgraph switches to `activeData.localBlackboard`, and target availability is evaluated in the scope that owns the action.

- [x] **Step 4: Run test to verify it passes**

The one-time executor completed `move-bridge:smoke`, `state-plan-scenario:smoke`, and the production build before creating commit `426cd63e5d8bd3594ad6a00881dfbd18fe9e20de`.

- [x] **Step 5: Commit**

Commit: `fix: preserve nested plan movement targets`.

### Task 2: Put diagnostics in one collapsible dock

**Files:**
- Create: `src/ai-node-editor/debug-panel-dock.ts`
- Create: `src/ai-node-editor/debug-panel-dock.css`
- Modify: `src/ai-node-editor/state-machine-ui.ts`
- Modify: `src/ai-node-editor/runtime-debug-overlay.ts`
- Modify: `tests/ai-state-plan-visual.spec.ts`

**Interfaces:**
- Produces: `ensureAiDebugPanelCard(workspace, options)` returning a stable `<details>` element and scrollable content host.
- Behavior: only one diagnostics card may be open at once; open card identity persists in localStorage.

- [x] **Step 1: Write the failing browser assertions**

The editor scenario requires two summary buttons named `Состояние и план` and `След ИИ`, automatic sibling collapse, one expanded card, separated rectangles, and two dedicated screenshots.

- [x] **Step 2: Run test to verify it fails**

Approved system-Chrome run `29288286749` failed at `.ai-debug-panel-dock` not found on exact SHA `f6004a3ee3b3512c1dee30993ab38c24bd01aa03`, proving the old independent panels did not satisfy the requirement.

- [x] **Step 3: Write minimal implementation**

Both diagnostics now mount in a shared right-side dock using stable `<details>` cards. State/plan opens by default, opening one card closes the other, and expanded content scrolls inside the dock rather than covering the second panel.

- [x] **Step 4: Run focused verification before browser QA**

The one-time executor completed editor smoke, lab smoke, movement smoke, state-plan scenario smoke, and the production build before creating commit `f0bf614d5c373cc5fa81fa263e8de4e7ef74998c`.

- [ ] **Step 5: Inspect exact-head browser QA and PNGs**

Run the branch visual workflow on the owner-authored final candidate, verify workflow/artifact/tested SHA equality, inspect the tactical movement frames plus both editor panel states at 1440×900, and only then remove temporary executors and declare the branch ready.
