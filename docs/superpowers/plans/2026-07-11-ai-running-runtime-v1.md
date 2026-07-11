# Stateful AI Runtime v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add backward-compatible multi-tick execution with `SequenceWithMemory`, `Wait`, lifecycle diagnostics and cancellation for the selected soldier.

**Architecture:** Keep `AiGraphRunner.ts` as the instant Utility AI evaluator. Add a pure `AiGraphRuntime.ts` wrapper that masks execution sequences during selection, resumes serializable state and delegates instant sequence children back to `runAiGraph()`.

**Tech Stack:** TypeScript, Vite, Node smoke scripts, existing DOM/CSS editor overlay, Playwright, GitHub Actions.

## Global Constraints

- Work only in `real-wargame-preview` or a task branch based on it; do not modify `main`.
- Canonical code, types, tests and commit messages are English.
- Every visible string has a complete Russian translation; Russian remains default.
- `AiGraphRuntime.ts` and `AiGraphRunner.ts` must not import DOM, PixiJS, localStorage or `SimulationState`.
- Existing graph version `1`, localStorage keys and scene export formats remain unchanged.
- Existing graphs without stateful nodes must retain their previous behavior.
- No parallelism, StateTree, event bus, path reservation or army-wide execution in this slice.

---

### Task 1: Add a real runtime smoke harness

**Files:**
- Create: `scripts/ai_graph_runtime_smoke.ts`
- Create: `scripts/ai_graph_runtime_smoke.mjs`
- Modify: `package.json`
- Modify: `.github/workflows/preview-core-checks.yml`

**Interfaces:**
- Consumes: future `runAiGraphRuntime`, `AiGraphExecutionState` and `AiGraphRuntimeResult` exports.
- Produces: `npm run runtime:smoke` and a `preview-core/runtime` status.

- [ ] **Step 1: Write failing runtime tests**

Create graphs that assert legacy success, wait start/resume/finish, sequence memory, cancellation, stale-state rejection and Russian active-node metadata.

- [ ] **Step 2: Add a Vite SSR smoke launcher**

Bundle the TypeScript smoke entry with the installed Vite dependency, execute the generated module, then remove the temporary output directory.

- [ ] **Step 3: Register the command and CI step**

Add:

```json
"runtime:smoke": "node scripts/ai_graph_runtime_smoke.mjs"
```

and run it before the production build in Preview Core Checks.

- [ ] **Step 4: Verify RED**

Run the task-branch workflow. Expected: runtime smoke or build fails because `AiGraphRuntime.ts`, stateful statuses and new node types do not exist.

- [ ] **Step 5: Commit**

```text
test: define stateful AI runtime behavior
```

### Task 2: Add node contracts and pure stateful runtime

**Files:**
- Create: `src/core/ai/AiGraphRuntime.ts`
- Modify: `src/core/ai/AiNodeTypes.ts`

**Interfaces:**
- Produces:

```ts
export type AiGraphExecutionStatus = 'success' | 'failure' | 'running' | 'waiting' | 'cancelled';
export type AiGraphLifecyclePhase = 'start' | 'update' | 'complete' | 'cancel';
export interface AiGraphExecutionState { ... }
export interface AiGraphLifecycleEvent { ... }
export interface AiGraphRuntimeInput extends AiGraphRunnerInput { executionState?: AiGraphExecutionState; cancel?: AiGraphCancellationRequest; }
export interface AiGraphRuntimeResult extends AiGraphRunnerResult { ... }
export function runAiGraphRuntime(input: AiGraphRuntimeInput): AiGraphRuntimeResult;
```

- [ ] **Step 1: Add `SequenceWithMemory` and `Wait` definitions**

Both definitions use English canonical labels and full Russian overlay text. `SequenceWithMemory` allows children; `Wait` is a leaf.

- [ ] **Step 2: Implement planning-graph masking**

Clone the graph for instant branch selection and replace each `SequenceWithMemory` with a successful childless execution boundary.

- [ ] **Step 3: Implement sequence discovery and state validation**

Find the first reachable `SequenceWithMemory` inside the selected branch. Reject saved state when graph, unit, branch, sequence or active node no longer matches.

- [ ] **Step 4: Implement instant-child delegation**

Build a temporary subgraph rooted at the current child and execute it with `runAiGraph()`. Merge its blackboard, cooldowns, effects, trace and scores into the runtime result.

- [ ] **Step 5: Implement `Wait` lifecycle**

Normalize duration and timeout values, emit `start`, `update` and `complete`, preserve the original start time, and continue to the next child after completion.

- [ ] **Step 6: Implement cancellation**

An explicit bilingual cancel request emits one cancel lifecycle event, returns `cancelled`, clears state and returns no stale action effects.

- [ ] **Step 7: Verify GREEN**

Run `npm run runtime:smoke` through CI. Expected: all runtime assertions pass.

- [ ] **Step 8: Commit**

```text
feat: add stateful AI runtime v1
```

### Task 3: Integrate state with the selected soldier bridge

**Files:**
- Modify: `src/core/ai/AiGameBridge.ts`

**Interfaces:**
- Consumes: `runAiGraphRuntime()` and `AiGraphExecutionState`.
- Stores: `aiGraphExecutionState?: AiGraphExecutionState` in the selected unit behavior runtime.
- Publishes: status, active node, elapsed time, lifecycle and cancellation fields in the existing debug payload.

- [ ] **Step 1: Replace instant bridge call with runtime call**

Pass saved execution state for applied ticks. Preview-only evaluation uses a copy and does not mutate saved state.

- [ ] **Step 2: Persist returned state**

Store the state only when effects are applied. Clear it on success, failure or cancellation.

- [ ] **Step 3: Preserve compatibility**

Continue applying returned effects, cooldowns, blackboard memory and explanation through the existing bridge paths.

- [ ] **Step 4: Publish runtime diagnostics**

Add the new duration fields without changing the debug storage key or payload version.

- [ ] **Step 5: Run build and smoke checks**

Expected: TypeScript build and all core smoke checks pass.

- [ ] **Step 6: Commit**

```text
feat: persist selected soldier AI execution
```

### Task 4: Add human authoring and runtime diagnostics

**Files:**
- Modify: `src/ai-node-editor/main.ts`
- Modify: `src/ai-node-editor/runtime-debug-overlay.ts`
- Modify: `src/ai-node-editor/runtime-debug-overlay.css`

**Interfaces:**
- Produces palette entries and defaults for the two new nodes.
- Consumes new debug payload fields from `AiGameBridge.ts`.

- [ ] **Step 1: Add default parameters**

`Wait` defaults to `durationSeconds: 2` and `timeoutSeconds: 0`. `SequenceWithMemory` uses only common parameters.

- [ ] **Step 2: Extend overlay payload types and validation**

Accept `running`, `waiting`, `cancelled` and `complete` trace statuses plus runtime status, active node, elapsed time and cancellation reason.

- [ ] **Step 3: Render Russian-first status details**

Show `Состояние`, `Активная нода`, `Выполняется` and cancellation reason where available.

- [ ] **Step 4: Add stable node classes and colors**

Use yellow for running, blue for waiting and orange for cancelled. Ensure cleanup removes all new classes before the next payload.

- [ ] **Step 5: Run editor smoke and build**

Expected: existing editor interactions and TypeScript build pass.

- [ ] **Step 6: Commit**

```text
feat: show running AI nodes in editor
```

### Task 5: Keep the local engine and diagnostics honest

**Files:**
- Modify: `scripts/ai_engine_core.mjs`
- Modify: `src/ai-node-editor/AiDictionaryWorkbench.ts`
- Modify: `scripts/ai_dictionary_smoke.mjs`

**Interfaces:**
- Local engine validates the new node types.
- Evaluate-once treats duration execution as a preview boundary rather than pretending time advanced.
- Human diagnostics explain that live duration progress is available through the game bridge.

- [ ] **Step 1: Register new node types and parameters**

Accept `SequenceWithMemory`, `Wait`, non-negative `durationSeconds` and non-negative `timeoutSeconds`.

- [ ] **Step 2: Make evaluate-once safe**

Do not descend into a stateful sequence during instant preview. Return a trace/explanation that the sequence requires live runtime ticks.

- [ ] **Step 3: Update human diagnostics**

Do not label the new nodes as unknown. Explain the difference between instant editor evaluation and live duration execution.

- [ ] **Step 4: Extend dictionary smoke assertions**

Verify the workbench recognizes the stateful nodes and bilingual duration explanation.

- [ ] **Step 5: Run engine and dictionary smoke checks**

Expected: both pass.

- [ ] **Step 6: Commit**

```text
feat: validate stateful AI nodes in local engine
```

### Task 6: Add real-browser verification

**Files:**
- Modify: `tests/ai-dictionary-workbench.spec.ts` or create `tests/ai-running-runtime.spec.ts`
- Modify: `.github/workflows/preview-screenshots.yml`

**Interfaces:**
- Produces one fresh PNG of the actual AI Node Editor with a waiting node and runtime panel.

- [ ] **Step 1: Add independent Playwright scenario**

Open the real editor route, seed a graph with `SequenceWithMemory → Wait`, seed a matching live debug payload, verify translated runtime labels and capture `26-ai-running-waiting-node.png`.

- [ ] **Step 2: Add the scenario to screenshot CI**

Keep it independent so existing screenshots remain available if this scenario fails.

- [ ] **Step 3: Run the exact task-branch browser workflow**

Expected: Playwright passes and uploads fresh screenshots and log artifacts for the task-branch head SHA.

- [ ] **Step 4: Download and inspect artifacts**

Check the workflow SHA, Playwright log, screenshot count and open `26-ai-running-waiting-node.png`.

- [ ] **Step 5: Commit**

```text
test: cover running AI node diagnostics
```

### Task 7: Documentation, full verification and preview delivery

**Files:**
- Modify: `docs/subprojects/ai-single-unit-editor/SUBPROJECT.md`
- Modify: `docs/subprojects/ai-single-unit-editor/HANDOFF.md`
- Modify: `docs/subprojects/ai-single-unit-editor/JOURNAL.md`
- Modify: `docs/subprojects/ai-single-unit-editor/subproject.json`
- Modify: `docs/superpowers/plans/2026-07-11-ai-running-runtime-v1.md`

**Interfaces:**
- Records exact implemented scope, limitations, commit SHA, checks, workflow runs and manual test steps.

- [ ] **Step 1: Update project truth**

Document the new runtime, storage location, statuses, editor diagnostics and explicit limitations.

- [ ] **Step 2: Run all core checks on the final task-branch commit**

Confirm `runtime`, workspace, lab, game editor, editor, engine, graph validation and production build statuses are all successful.

- [ ] **Step 3: Run final screenshot verification**

Confirm the final screenshot workflow head SHA matches the final task-branch commit and inspect the changed PNG.

- [ ] **Step 4: Transfer to `real-wargame-preview`**

Fast-forward/direct transfer only after all checks pass. Do not modify `main`.

- [ ] **Step 5: Verify the preview commit again**

Read combined statuses for the exact preview SHA and report any checks still running or failed.

- [ ] **Step 6: Mark plan delivery facts**

Record the final preview SHA, workflow run ids, Playwright count, inspected PNG and known risks.

- [ ] **Step 7: Commit**

```text
docs: record stateful AI runtime delivery
```
