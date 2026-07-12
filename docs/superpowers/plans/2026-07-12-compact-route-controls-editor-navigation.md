# Compact Route Controls and Editor Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a compact in-game soldier control bar with real movement-profile selection and an obvious route-cost toggle, clear terminal route graphics, and replace the AI editor's stacked menus with one unobstructed navigation bar.

**Architecture:** The tactical workspace owns stable compact route-control slots. Existing command/route UI adapters update those slots instead of inserting unbounded rows. Exact player profile IDs flow through `UnitModel → PlayerCommand → NavigationProfileResolver`. The AI editor uses one navigation owner, while dictionary modules populate a stable global-action slot.

**Tech Stack:** TypeScript 5, Vite 5, PixiJS 7, browser DOM, Node smoke scripts, Playwright with system Chrome.

## Global Constraints

- Work only on `tmp/ui-compact-route-controls-20260712`.
- Do not modify `real-wargame-preview` or `main`.
- Russian is the default human interface; development identifiers and tests use English.
- Do not run A* from UI or renderer code.
- Preserve player-command IDs, AI owner tokens and `SimulationTick` as the only coordinate integrator.
- Visual QA is already approved and must use the real Vite application, fresh PNGs and exact-SHA evidence.

---

### Task 1: Add focused failing contracts

**Files:**
- Create: `scripts/ui_compact_route_controls_smoke.mjs`
- Create: `scripts/ui_compact_route_controls_smoke.ts`
- Modify: `package.json`
- Create: `.github/workflows/ui-compact-route-controls.yml`

**Interfaces:**
- Consumes: repository source files as text plus pure route/profile modules.
- Produces: `npm run ui-compact-route-controls:smoke` and PR CI status.

- [ ] **Step 1: Write failing source-contract assertions**

Assert the desired stable selectors, exact profile contract, terminal-plan visibility rule, unified navigation slot and complete removal of `run-check-45` / `runSimpleCheck45`.

- [ ] **Step 2: Run the test in PR CI and verify RED**

Expected: the new focused job fails because production code still has the old toolbar, old six-row diagnostics and no exact command profile ID.

- [ ] **Step 3: Keep existing baseline checks visible**

Run existing editor/workspace/route/navigation/build checks in the same workflow so unrelated baseline failures are distinguishable.

- [ ] **Step 4: Commit**

Commit message: `test: define compact route controls and editor navigation`.

---

### Task 2: Add exact player navigation-profile selection

**Files:**
- Modify: `src/core/units/UnitModel.ts`
- Modify: `src/core/orders/PlayerCommand.ts`
- Modify: `src/core/orders/RoutedMoveOrders.ts`
- Modify: `src/core/navigation/NavigationProfileResolver.ts`
- Modify: `src/core/navigation/NavigationRuntime.ts`
- Modify: `scripts/navigation_profiles_smoke.ts`
- Modify: `scripts/navigation_replan_profile_switch_smoke.ts`

**Interfaces:**
- Produces: `UnitModel.playerNavigationProfileId?: string`, `PlayerCommand.navigationProfileId?: string`, `updatePlayerCommandNavigationProfile(command, profileId)` and `NavigationProfileResolutionInput.playerCommandProfileId`.

- [ ] **Step 1: Add failing behavioral assertions**

Verify that a custom profile ID wins over movement mode and that changing an active command profile preserves command ID/target/status while incrementing revision.

- [ ] **Step 2: Verify RED**

Expected: missing fields/helper or wrong resolver result.

- [ ] **Step 3: Implement the minimal profile flow**

Initialize selected profile, store it on new player commands, resolve the explicit ID before semantic mode and retain fallback to `normal` for missing profiles.

- [ ] **Step 4: Verify GREEN**

Run navigation profile and profile-switch smokes.

- [ ] **Step 5: Commit**

Commit message: `feat: select exact player navigation profiles`.

---

### Task 3: Compact the game route controls

**Files:**
- Modify: `src/ui/TacticalWorkspace.ts`
- Modify: `src/ui/RouteCostOverlayUi.ts`
- Modify: `src/ui/CommandPlanRouteUi.ts`
- Modify: `src/tactical-workspace.css`
- Modify: `src/tactical-workspace-stage8.css`
- Modify: `src/route-cost-overlay.css`
- Modify: `scripts/tactical_workspace_smoke.mjs`
- Modify: `scripts/navigation_overlay_contract_smoke.ts`
- Modify: `scripts/command_plan_route_smoke.ts`

**Interfaces:**
- Produces stable DOM hooks:
  - `[data-action="unit-navigation-profile"]`
  - `[data-action="route-cost-quick-toggle"]`
  - `[data-role="route-summary"]`
  - `[data-role="route-details-command"]`
  - `[data-role="route-details-plan"]`
  - `[data-role="route-details-route"]`
  - `[data-role="route-details-profile"]`
  - `[data-role="route-details-cost"]`
  - `[data-role="route-details-reason"]`

- [ ] **Step 1: Add failing DOM/source assertions**

Verify the stable controls exist and adapters no longer append diagnostic rows to `.unit-bar-current`.

- [ ] **Step 2: Verify RED**

Expected: selectors absent and old append calls present.

- [ ] **Step 3: Implement stable compact markup**

Add a profile select, quick map-cost button, concise summary and absolute details popover. Keep condition values and control buttons visible.

- [ ] **Step 4: Connect actual profile selection**

Refresh options from `NavigationProfileRegistry`, update the selected unit, update an outstanding player command through `updatePlayerCommandNavigationProfile`, and request a normal render without direct path search.

- [ ] **Step 5: Rebind route/cost adapters**

Update existing slots at 300 ms intervals. Keep base/final mode in `Вид`; remove the misleading diagnostic profile override.

- [ ] **Step 6: Compact CSS**

Use a stable bar height, ellipsis for summaries and an above-bar popover that does not affect map bounds.

- [ ] **Step 7: Verify GREEN**

Run workspace, navigation overlay, command-plan-route, routed-move and focused smokes.

- [ ] **Step 8: Commit**

Commit message: `feat: compact in-game route controls`.

---

### Task 4: Clear terminal blue plan targets

**Files:**
- Modify: `src/rendering/CommandPlanRouteOverlayModel.ts`
- Modify: `scripts/command_plan_route_smoke.ts`

**Interfaces:**
- Produces: terminal plans (`completed`, `failed`, `cancelled`) expose zero `planStages`; active plans retain stages.

- [ ] **Step 1: Write the failing terminal-plan test**

Build active and completed direct-player plans and assert only the active plan has overlay stages.

- [ ] **Step 2: Verify RED**

Expected: completed plan still contains the blue target stage.

- [ ] **Step 3: Filter plan stages at the overlay-model boundary**

Emit stages and label only for `unit.plan?.status === 'active'`.

- [ ] **Step 4: Verify GREEN**

Run command-plan-route and routed-move smokes.

- [ ] **Step 5: Commit**

Commit message: `fix: clear terminal plan targets`.

---

### Task 5: Unify the AI editor navigation

**Files:**
- Modify: `src/ai-node-editor/main.ts`
- Modify: `src/ai-node-editor/NavigationProfileEditor.ts`
- Modify: `src/ai-node-editor/navigation-profile-editor.css`
- Modify: `src/ai-node-editor/AiDictionaryEditorIntegration.ts`
- Modify: `src/ai-node-editor/AiDictionaryWorkbench.ts`
- Modify: `src/ai-node-editor/ai-node-editor-authoring.css`
- Modify: `scripts/ai_node_editor_smoke.mjs`

**Interfaces:**
- Produces one `.navigation-profile-tabs` bar with `[data-editor-global-actions]` and main tabs `graph`, `profiles`, `blackboard`.

- [ ] **Step 1: Add failing editor assertions**

Require `Данные бойца`, global action slot and shared open-game/exit helpers; forbid standalone diagnostics tab and `Auto 4–5` identifiers.

- [ ] **Step 2: Verify RED**

Expected: old menu/tab/button identifiers remain.

- [ ] **Step 3: Remove the editor AppShellMenu layer**

Do not install a second fixed menu in editor mode. Preserve game/launcher shell behavior.

- [ ] **Step 4: Build the unified bar**

Render main tabs, global action slot and refresh/open-game/exit actions in one long-lived nav.

- [ ] **Step 5: Move Dictionary and Tools buttons**

Install both buttons into `[data-editor-global-actions]`; keep their existing dialogs and behavior.

- [ ] **Step 6: Remove obsolete diagnostics and Auto 4–5**

Delete the top tab, route info placeholder, button, event binding and handler.

- [ ] **Step 7: Repair profile layout**

Use internal left/form scrolling, a compact non-overlapping heading and no negative sticky offset or blank menu padding.

- [ ] **Step 8: Verify GREEN**

Run editor and focused smokes plus build.

- [ ] **Step 9: Commit**

Commit message: `feat: unify AI editor navigation`.

---

### Task 6: Add approved real-browser QA

**Files:**
- Create: `tests/ui-compact-route-controls.spec.ts`
- Create temporarily on the isolated branch: `.github/workflows/tmp-ui-compact-visual-qa.yml`

**Interfaces:**
- Produces fresh PNGs under `artifacts/screenshots/ui-compact-route-controls/` and Playwright log artifacts for the exact branch SHA.

- [ ] **Step 1: Write deterministic Playwright scenarios**

Cover game compactness/profile/cost toggle/terminal target and editor unified navigation/profile layout/data/global tools.

- [ ] **Step 2: Add the isolated-branch QA workflow**

Run only for the temporary PR head, install system-Chrome Playwright runner, execute the focused spec and upload screenshots/log even on failure.

- [ ] **Step 3: Run non-visual checks first**

All focused smoke checks, production build and docs check must be green before interpreting screenshots.

- [ ] **Step 4: Execute approved visual QA**

The user's instruction already approves this run; no second approval question is required.

- [ ] **Step 5: Verify exact SHA**

Compare branch head, workflow head and both artifact run SHAs.

- [ ] **Step 6: Download and inspect every key PNG**

Open the six required frames and fix any overlap, clipping, excessive bar height, stale marker or missing action. Rerun within the same approval if needed.

- [ ] **Step 7: Commit**

Commit message: `test: verify compact route controls visually`.

---

### Task 7: Synchronize documentation and finish the isolated branch

**Files:**
- Modify: `docs/subprojects/ai-single-unit-editor/subproject.json`
- Modify: `docs/subprojects/ai-single-unit-editor/JOURNAL.md`
- Create: `docs/subprojects/ai-single-unit-editor/journal/2026-07-12-compact-route-controls-editor-navigation.md`
- Generated by `npm run docs:sync`: `STATUS.md`, `CURRENT_STATE.md`, indexes.

- [ ] **Step 1: Record implementation and exact verification evidence**

State that the work remains isolated and include run IDs, screenshot names and inspected results.

- [ ] **Step 2: Run documentation synchronization/check**

Expected: generated files match canonical metadata and integrity passes.

- [ ] **Step 3: Run final regression suite on exact head**

Run focused UI/navigation/route smokes and production build.

- [ ] **Step 4: Close the temporary QA PR without merge**

Leave the temporary branch for user review. Do not transfer to preview.

- [ ] **Step 5: Report**

Include branch, exact commit, closed QA PR, checks, visual artifacts/frames, manual checks, risks and `main_touched: no`.