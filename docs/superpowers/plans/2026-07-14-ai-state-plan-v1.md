# Hierarchical AI States and Plans V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the first complete State → Utility → Plan → Subgraph vertical slice for one selected soldier without breaking Graph v1/v2, resumable actions, movement ownership, scene restoration, perception, or navigation.

**Architecture:** Keep state selection and plan lifecycle in pure serializable core modules. Store the active hierarchical state and active plan in `AiRuntimeSessionSnapshotV1`, let `AiGameBridge` translate current orders/perception/suppression into transition triggers, and execute each plan step through the existing Graph v2 subgraph runtime. UI reads immutable diagnostics and updates persistent DOM values in place.

**Tech Stack:** TypeScript 5.5, Vite 5, PixiJS 7, existing Node smoke scripts, Playwright scenario preparation only until explicit visual-QA approval.

## Global Constraints

- Work only on `feat/ai-state-plan-v1-temp-2026-07-14`, based on `real-wargame-preview` commit `cc907ca0f48caed418cd76b0f878c8b18fbe71c7`.
- Do not modify `real-wargame-preview` or `main`.
- Canonical code/data names are English; complete Russian UI and explanations are the default.
- Core AI modules must not import PixiJS, DOM, localStorage, or `SimulationState`.
- All running subgraphs and movement orders keep the existing ownership, cancel, cleanup, snapshot, and restore guarantees.
- Do not add shooting behavior, morale, wounded/retreat/panic states, tactical queries, or parallel plans in this slice.
- Prepare visual QA, but do not run a browser without explicit approval.

---

### Task 1: State model and hierarchical runtime

**Files:**
- Create: `src/core/ai/state/AiStateMachine.ts`
- Create: `src/core/ai/state/AiStateRuntime.ts`
- Create: `scripts/ai_state_machine_smoke.ts`
- Create: `scripts/ai_state_machine_smoke.mjs`

- [ ] Write failing smoke cases for priority, deterministic ties, wildcard suppression, minimum duration, hysteresis, and sibling parent preservation.
- [ ] Implement four leaf states under `Normal` and `Combat` parents.
- [ ] Record transition reason, trigger, old/new path, and simulation time.
- [ ] Add clone/normalize helpers for scene snapshots.

### Task 2: Explicit plan model and runtime

**Files:**
- Create: `src/core/ai/state/AiPlan.ts`
- Create: `src/core/ai/state/AiPlanRuntime.ts`
- Create: `scripts/ai_plan_runtime_smoke.ts`
- Create: `scripts/ai_plan_runtime_smoke.mjs`

- [ ] Write failing smoke cases for single start, next-step success, retry, fail-plan, replan, cancellation, replacement linkage, and restore without start.
- [ ] Implement `FollowMoveOrder` and `TakeCover` plan factories.
- [ ] Delegate running steps to existing subgraph lifecycle callbacks rather than creating a second movement runtime.

### Task 3: Persist state and plan inside runtime session

**Files:**
- Modify: `src/core/ai/runtime/AiRuntimeSession.ts`
- Modify: `src/core/behavior/BehaviorModel.ts` only if the existing soldier runtime container requires a typed field.

- [ ] Add optional state/plan snapshots with safe defaults for old scenes.
- [ ] Preserve state entry time, previous state, transition reason, active plan, step index, attempts, and replaced plan id.
- [ ] Keep nested Graph v2 execution state authoritative for resume/update.

### Task 4: State → Utility → Plan bridge pipeline

**Files:**
- Modify: `src/core/ai/AiGameBridge.ts`
- Create: `scripts/ai_state_plan_scenario_smoke.ts`
- Create: `scripts/ai_state_plan_scenario_smoke.mjs`

- [ ] Detect order, contact, suppression, route completion/cancellation, and route blocking from existing subjective blackboard/event data.
- [ ] Cancel an invalid plan before selecting a new allowed plan.
- [ ] Do not reevaluate Utility while the current plan remains valid.
- [ ] Execute plan steps through `move_and_observe` and `take_cover` subgraphs with exactly one active movement owner.
- [ ] Cover save/restore mid-cover movement in the end-to-end smoke scenario.

### Task 5: Compact Russian diagnostics UI

**Files:**
- Create: `src/ai-node-editor/state-machine-ui.ts`
- Modify: `src/ui/TacticalWorkspace.ts`
- Modify: `src/ai-node-editor/runtime-debug-overlay.ts`
- Modify: existing CSS files only where required for containment.

- [ ] Create persistent DOM nodes once and update only text/classes.
- [ ] Show leaf/parent/previous state, transition reason, plan/status/current step, reasons, abort/replan conditions, and technical ids in collapsed diagnostics.
- [ ] Add `Показать активный подграф` when the editor can navigate to the current step subgraph.

### Task 6: Verification, documentation, and visual-QA preparation

**Files:**
- Modify: `package.json`
- Create: `docs/subprojects/ai-single-unit-editor/HIERARCHICAL_STATES_AND_PLANS_V1.md`
- Modify: `docs/subprojects/ai-single-unit-editor/SUBPROJECT.md`
- Modify: `docs/subprojects/ai-single-unit-editor/HANDOFF.md`
- Modify: `docs/subprojects/ai-single-unit-editor/JOURNAL.md`
- Modify: `docs/subprojects/ai-single-unit-editor/subproject.json`
- Modify: relevant Playwright spec for five required PNG names.

- [ ] Run new state/plan smoke checks.
- [ ] Run all required existing Graph v2/runtime/navigation/perception/editor/docs/build checks.
- [ ] Prepare five deterministic browser states and assertions without starting the browser.
- [ ] Update generated current-state docs through `docs:sync`, not by editing generated files directly.
