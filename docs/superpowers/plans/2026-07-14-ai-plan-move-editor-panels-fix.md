# AI Plan Move and Editor Panels Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep a state-plan movement order active until arrival and replace overlapping AI diagnostics with two compact mutually exclusive collapsible panels.

**Architecture:** Route monitoring resolves target availability in the Blackboard scope that owns the active movement action, including nested subgraph-local memory. Editor diagnostics share one absolute dock; each diagnostic surface mounts inside a reusable `<details>` card, and opening one card closes the other. The editor itself is Graph v2-only: old stored/imported values are converted at the load boundary and Graph v1 is never shown as a user mode.

**Tech Stack:** TypeScript, Vite, existing smoke scripts, Playwright, DOM/CSS, GitHub Actions.

## Global Constraints

- Work only in `fix/ai-plan-move-editor-panels-temp-2026-07-14` until explicit transfer approval.
- Do not modify the separate hostile-unit/combat branches.
- Keep Russian UI as the default.
- Write a failing regression test before production changes.
- Run the real Vite application in Chrome/Chromium and inspect fresh PNGs after implementation; the user explicitly approved screenshot verification.

---

### Task 1: Preserve nested movement targets

- [x] Added a nested subgraph regression where `destination` exists only in `AiSubgraphExecutionState.localBlackboard`.
- [x] Confirmed the old code returned `target_lost` instead of `moving`.
- [x] Carried the active Blackboard scope through nested subgraph traversal.
- [x] Passed `move-bridge:smoke`, `state-plan-scenario:smoke`, and production build.
- [x] Implementation commit: `426cd63e5d8bd3594ad6a00881dfbd18fe9e20de`.

### Task 2: Put diagnostics in one collapsible dock

- [x] Added browser assertions for `Состояние и план` and `След ИИ` cards.
- [x] Confirmed the old independent panels failed the shared-dock requirement.
- [x] Added `ensureAiDebugPanelCard`, mutual collapse, remembered open card, and internal scrolling.
- [x] Passed editor, lab, movement, state-plan, and build checks before browser QA.
- [x] Implementation commit: `f0bf614d5c373cc5fa81fa263e8de4e7ef74998c`.

### Task 3: Remove Graph v1 from the editor

- [x] Added `ai_node_editor_v2_only_smoke.mjs`; it initially failed because the bundled graph was version 1.
- [x] Removed the Graph version badge, migration button, Graph v1 warning, and `migrateGraphFromUi`.
- [x] Changed `EditableAiGraph.version` to the literal `2`.
- [x] Converted the bundled starter graph to Graph v2 with schema and subgraph references.
- [x] Stored and imported old data is converted automatically by `migrateAiGraphToV2`; Graph v1 is not exposed in the interface.
- [x] Updated the node-contract UI regression to require absence of Graph v1 controls.
- [x] Passed editor, Graph v2 contracts, node-contract UI, movement, state-plan, and production build checks.
- [x] Implementation and temporary-executor cleanup commit: `2a8f4bcbe3f29aea6cf55ad01f64a56357972722`.

### Task 4: Final exact-head visual QA

- [ ] Run the temporary branch Playwright workflow on this owner-authored commit.
- [ ] Verify workflow head SHA, artifact head SHA, and `tested-sha.txt` are identical.
- [ ] Inspect the tactical movement/state frames and both editor diagnostics states at 1440×900.
- [ ] Confirm there is no Graph v1 warning/button and the graph workspace has normal height.
- [ ] Keep the branch separate from `real-wargame-preview` until explicit transfer approval.
