# AI Plan Move and Editor Panels Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep a state-plan movement order active until arrival and replace overlapping AI diagnostics with two compact mutually exclusive collapsible panels.

**Architecture:** Route monitoring must resolve target availability in the same Blackboard scope that owns the active movement action, including nested subgraph-local memory. Editor diagnostics will share one absolute dock; each diagnostic surface remains independently rendered but mounts inside a reusable `<details>` card, and opening one card closes the other.

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

- [ ] **Step 1: Write the failing test**

Create a nested subgraph execution state where `destination` exists only in `AiSubgraphExecutionState.localBlackboard`, while session-level memory intentionally has no `destination`. Call `updateSelectedRouteStatus` and assert that the route remains `moving`, `shouldCancelRuntime` is false, and `abortCode` is undefined.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run move-bridge:smoke`
Expected: FAIL because the current bridge reads `destination` only from session-level memory and reports `target_lost`.

- [ ] **Step 3: Write minimal implementation**

Extend the active-move snapshot traversal to carry the current Blackboard scope. When descending through `activeData.kind === 'subgraph'`, replace the scope with `activeData.localBlackboard`; when reaching `move_to_blackboard_position`, evaluate `targetAvailable` against that scope. Pass this boolean to `updateAiRouteStatus`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run move-bridge:smoke && npm run state-plan-scenario:smoke && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `fix: preserve nested plan movement targets`

### Task 2: Put diagnostics in one collapsible dock

**Files:**
- Create: `src/ai-node-editor/debug-panel-dock.ts`
- Create: `src/ai-node-editor/debug-panel-dock.css`
- Modify: `src/ai-node-editor/state-machine-ui.ts`
- Modify: `src/ai-node-editor/state-machine-ui.css`
- Modify: `src/ai-node-editor/runtime-debug-overlay.ts`
- Modify: `src/ai-node-editor/runtime-debug-overlay.css`
- Modify: `tests/ai-state-plan-visual.spec.ts`

**Interfaces:**
- Produces: `ensureAiDebugPanelCard(workspace, options)` returning a stable `<details>` element and scrollable content host.
- Behavior: only one diagnostics card may be open at once; open card identity persists in localStorage.

- [ ] **Step 1: Write the failing browser assertions**

Assert that the editor contains two summary buttons named `Состояние и план` and `След ИИ`, that opening the second closes the first, and that the expanded content rectangles do not overlap.

- [ ] **Step 2: Run test to verify it fails**

Run the approved exact-branch Playwright scenario through the branch visual-QA workflow.
Expected: FAIL because both panels are independent absolutely positioned sections.

- [ ] **Step 3: Write minimal implementation**

Mount both panels in a shared right-side dock using stable `<details>` cards. Keep state/plan open by default when no saved choice exists. Close sibling cards on `toggle`. Remove absolute positioning from the panel bodies and make each expanded body scroll inside the dock.

- [ ] **Step 4: Run focused and full verification**

Run: `npm run editor:smoke && npm run lab:smoke && npm run build`, then approved Playwright visual QA.
Expected: all checks pass; screenshots show one expanded diagnostics panel at a time and no covered graph controls.

- [ ] **Step 5: Inspect PNGs and commit**

Inspect movement and editor diagnostics frames at 1440×900, verify tested SHA equals workflow/artifact SHA, then commit message: `fix: dock collapsible AI diagnostics`.
