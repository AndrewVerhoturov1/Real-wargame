# Tactical Position Objectives Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement the approved tactical-position objective model, comparative posture selection, movement-safe requests, dedicated Positions UI, editable AI-editor settings, and publish both applications from one verified SHA.

**Architecture:** Keep the bounded simulation-owned search. Add objective/reference snapshots and distance metrics to candidates; keep renderer presentation-only. Reuse one settings schema in the in-game editor and standalone AI editor.

**Tech Stack:** TypeScript, Vite, PixiJS 8, Node smoke tests, GitHub Actions, GitHub Pages.

## Global Constraints

- Work only on `feature/20260719-tactical-position-system`.
- Do not change `main` or `real-wargame-preview`.
- Maximum published candidates remains 12.
- No full-map pass or per-candidate A*.
- Search is explicit and must not start by opening a tab.
- Deployment must include `/` and `/ai-node-editor.html` from the same source SHA.

---

### Task 1: Comparative posture and settings schema

**Files:**
- Modify: `src/core/tactical/TacticalPositionSettings.ts`
- Create: `src/core/tactical/TacticalPositionSettingsFields.ts`
- Test: `scripts/tactical_position_tuning_smoke.mjs`

- [ ] Add crouched/prone safety-advantage thresholds and objective weights.
- [ ] Make lower posture win only when its safety advantage exceeds the configured threshold.
- [ ] Verify crouched and prone regression cases.

### Task 2: Objectives and distance metrics

**Files:**
- Modify: `src/core/tactical/TacticalPositionSearch.ts`
- Modify: `src/core/tactical/TacticalPositionSearchService.ts`
- Modify: `src/core/ai/tactical/TacticalQuery.ts`
- Modify: `src/core/ai/AiGraphRunnerLegacy.ts`
- Modify: `src/core/ai/contracts/AiNodeContractRegistry.ts`
- Test: tactical search, request-service and query smoke scripts.

- [ ] Add `balanced`, `advance_to_threat`, `withdraw_from_threat`, `continue_order`.
- [ ] Snapshot the reference threat and order target.
- [ ] Publish threat/order distances and normalized objective alignment.
- [ ] Remove live origin/posture from pending-request identity and evaluate from current unit state when the prepared field is ready.

### Task 3: Dedicated Positions interface

**Files:**
- Modify: `src/ui/TacticalWorkspaceBase.ts`
- Modify: `src/ui/TacticalPositionSearchControls.ts`
- Modify: `src/input/TacticalPositionInputController.ts`
- Modify: `src/render/PixiAwarenessHeatmapRenderer.ts`
- Test: `scripts/tactical_query_ui_smoke.mjs`, workspace smoke.

- [ ] Add the `Позиции` tab.
- [ ] Mount controls only in that tab.
- [ ] Show objective selector, request status and candidate metrics.
- [ ] Activate markers and marker clicks only in that tab.

### Task 4: Standalone AI editor settings

**Files:**
- Create: `src/core/tactical/TacticalPositionProfileStorage.ts`
- Create: `src/ai-node-editor/TacticalPositionProfileEditor.ts`
- Modify: `src/ai-node-editor/NavigationProfileEditor.ts`
- Modify: `src/ui/TacticalPositionSettingsControls.ts`
- Test: AI editor smoke scripts.

- [ ] Add top-level `Тактические позиции` editor tab.
- [ ] Edit and persist a versioned tactical-position profile.
- [ ] Render numeric fields from the same schema used by the in-game editor.

### Task 5: Verification and Pages publication

- [ ] Run TypeScript, tactical-position, tactical-query, editor and workspace smoke checks.
- [ ] Build with `/Real-wargame/` base path.
- [ ] Publish full `dist` to `gh-pages`.
- [ ] Confirm GitHub Pages system workflow succeeds and both pages are present.
