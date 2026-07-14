# Tactical Query System — Cover Vertical Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans and superpowers:test-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the opaque cover winner lookup with an explicit Graph v2 pipeline: candidate generation → hard filters → soft scores → explicit winner selection.

**Architecture:** Tactical query state is transient execution data owned by `AiGraphRunner`, not Blackboard memory and not a second AI layer. The game bridge exposes only low-level candidate facts (cover, route, terrain, order alignment); Graph v2 nodes decide when to generate, filter, score and select. Only `SelectBestTacticalPosition` may write `best_cover_position`.

**Tech Stack:** TypeScript 5, Vite 5 SSR smoke tests, existing Graph v2 contracts, existing grid pathfinding, cover evaluation and directional-terrain systems.

## Global Constraints

- Work only on `feat/tactical-query-system-temp-2026-07-14`, based on current `real-wargame-preview`.
- Do not modify `main` or transfer changes to `real-wargame-preview`.
- Code identifiers, serialized keys, tests and commit messages are English.
- User-facing labels, explanations and diagnostics are complete Russian, with Russian as default.
- Empty graphs remain inert; no tactical query runs outside graph node execution.
- Do not create a second hidden decision layer.
- Keep the existing cover evaluation helper as low-level compatibility mechanics, but remove it from the live AI decision path.
- Prepare browser visual QA but do not execute it without explicit approval.

---

### Task 1: Tactical query data model and pure pipeline

**Files:**
- Create: `src/core/ai/tactical/TacticalQuery.ts`
- Test: `scripts/tactical_query_system_smoke.ts`
- Test runner: `scripts/tactical_query_system_smoke.mjs`

- [ ] Define query budget, stop reason, candidate source, hard facts, score breakdown, exclusion reason and winner fields.
- [ ] Add pure functions for generation-state creation, hard filtering, weighted scoring, deterministic winner selection and deep cloning.
- [ ] Write failing tests first for winner selection, exclusions, weight changes and budgets.

### Task 2: Graph v2 node contracts and runner execution

**Files:**
- Modify: `src/core/ai/contracts/AiPortTypes.ts`
- Modify: `src/core/ai/contracts/AiNodeContractRegistry.ts`
- Modify: `src/core/ai/AiGraphRunner.ts`
- Modify: `src/core/ai/AiGraphRuntime.ts`

- [ ] Register `CreateCoverCandidates`, `FilterTacticalPositions`, `ScoreTacticalPositions`, and `SelectBestTacticalPosition` with Russian labels and editable budgets, filters and weights.
- [ ] Add transient `tacticalQueries` to runner/runtime results and clone it across Utility branches.
- [ ] Invoke candidate generation only from `CreateCoverCandidates`.
- [ ] Remove the implicit `best_cover_position` write from legacy `FindBestObject`.
- [ ] Write `best_cover_position` only after `SelectBestTacticalPosition` finds an eligible winner.

### Task 3: Low-level cover candidate facts in the game bridge

**Files:**
- Create: `src/core/cover/CoverTacticalCandidates.ts`
- Modify: `src/core/ai/AiGameBridge.ts`

- [ ] Generate deterministic cover positions from existing map objects and directional cover evaluation.
- [ ] For each generated position calculate map validity, exact route availability, distance, protection, concealment, route danger, direct/reverse slope and current-order alignment.
- [ ] Enforce candidate count, radius and calculation-time budgets, recording the exact early-stop reason.
- [ ] Replace the bridge call to `findBestCoverForThreat` with the new fact generator; the bridge must not choose a winner.

### Task 4: Russian diagnostics panel

**Files:**
- Modify: `src/core/ai/AiGameBridge.ts`
- Modify: `src/ai-node-editor/runtime-debug-overlay.ts`
- Create: `scripts/tactical_query_ui_smoke.mjs`

- [ ] Publish all tactical queries, candidates, component scores, exclusion reasons, budget stop reason and winner through the existing runtime debug payload.
- [ ] Render a simple Russian list in the existing «След ИИ» panel.
- [ ] Preserve the most recent query diagnostics while a selected stateful action continues.

### Task 5: Regression, documentation and prepared visual QA

**Files:**
- Modify: `package.json`
- Modify: `docs/subprojects/ai-single-unit-editor/subproject.json`
- Create: `docs/subprojects/ai-single-unit-editor/TACTICAL_QUERY_SYSTEM_COVER_V1.md`
- Create: `tests/ai-tactical-query-panel.spec.ts`

- [ ] Run the focused test in RED before production changes.
- [ ] Run `npm run tactical-query:smoke` and `npm run tactical-query-ui:smoke` after implementation.
- [ ] Run existing Graph v2, runtime, pathfinding, directional-terrain and graph-validation checks.
- [ ] Run `npm run build` and `npm run docs:sync`.
- [ ] Prepare, but do not execute, the Playwright scenario producing `artifacts/screenshots/ai-tactical-query/tactical-query-candidates.png`.
- [ ] Record exact checks and remaining visual risk in the implementation document.
