# Combat Lab Dual Sidebars and Shared Time Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Combat Lab a full simulation-mode overlay with a left laboratory dock, the untouched right game inspector, one shared time controller, Stage 9-only manual firing in Combat Lab, and no order popover in either mode.

**Architecture:** Keep `GameApplication` and `TacticalWorkspace` as the single owners of the production game UI. Add a mode-aware `GameTimeController` consumed by both top and bottom time controls. `CombatLabExtension` owns only the left laboratory dock and never reparents the production sidebar.

**Tech Stack:** TypeScript 5, Vite 5, PixiJS 8, DOM/CSS Grid/Flexbox, Node smoke contracts, GitHub Actions, Vercel.

## Global Constraints

- Work only on `feature/20260726-shooting-stage-09v-combat-lab`.
- Do not modify `real-wargame-preview` or `main`.
- Do not modify `.github/workflows/` or `src/ai-node-editor/`.
- Keep one `GameApplication`, one Pixi application, one canvas, one camera and one ticker.
- Keep all Combat Lab scenarios, headless runner, metrics, journal and checkpoint behavior.
- At 1440×900 there must be no horizontal page overflow or overlap between either sidebar, map and lower unit bar.
- Deploy only the exact final verified SHA to the permanent Vercel project `repo`.

---

### Task 1: Shared time controller contract

**Files:**
- Modify: `src/game/GameApplicationTypes.ts`
- Modify: `src/game/GameApplication.ts`
- Modify: `src/ui/TacticalWorkspaceBaseLegacy.ts`
- Modify: `src/combat-lab/main.ts`
- Modify: `src/combat-lab/CombatLabExtension.ts`
- Test: `scripts/combat_lab_full_game_contract_smoke.mjs`
- Test: `scripts/combat_lab_workspace_layout_smoke.mjs`

**Interfaces:**
- Produces: `GameTimeController` with `isPaused`, `togglePaused`, `setPaused`, `stepOnce`, `getSpeed`, `setSpeed`, `listSpeeds`.
- `GameApplicationOptions.timeController` replaces the pause-only option.
- `installTacticalWorkspace(..., timeController)` routes lower pause, step and speed controls through the same source.

- [ ] Add failing source-contract assertions for a shared mode-aware time controller.
- [ ] Run focused contracts and confirm failure.
- [ ] Extend `GameApplicationTypes.ts` and pass the controller through `GameApplication` into `installTacticalWorkspace`.
- [ ] Adapt the normal game controller to current `AiTestLabRuntime` and fixed `tickSimulation(state, 0.1)` behavior.
- [ ] Adapt Combat Lab to `CombatLabVisualSession` and keep `state.paused = true` so the production ticker never double-advances.
- [ ] Remove DOM text synchronization hacks that are no longer the source of truth.
- [ ] Re-run focused contracts.

### Task 2: Preserve right inspector and move Combat Lab dock left

**Files:**
- Modify: `src/combat-lab/CombatLabExtension.ts`
- Modify: `src/combat-lab/combat-lab.css`
- Modify: `src/combat-lab/combat-lab-workspace.css`
- Modify: `scripts/combat_lab_workspace_layout_smoke.mjs`
- Modify: `scripts/combat_lab_ui_contract_smoke.mjs`

**Interfaces:**
- `CombatLabExtension` creates only tabs `stand`, `metrics`, `log`.
- Production `.simulation-sidebar` stays in `.tactical-workspace-shell` and keeps its own collapse button.
- Body classes `combat-lab-dock-open` / `combat-lab-dock-collapsed` affect only the left laboratory width.

- [ ] Add failing assertions that the extension no longer reparents `.simulation-sidebar` and no longer creates `fighter` tab.
- [ ] Remove `adoptSimulationSidebar` and the `fighter` tab.
- [ ] Anchor `#combat-lab-extension-root` to the left edge.
- [ ] Define map and lower-bar left offsets from the laboratory dock and preserve right offsets from existing `sidebar-open` / `sidebar-collapsed` behavior.
- [ ] Make left collapse expand the map leftward without changing the right inspector state.
- [ ] Re-run UI and layout contracts.

### Task 3: Stage 9-only manual firing in Combat Lab

**Files:**
- Modify: `src/game/GameApplication.ts`
- Modify: `src/ui/TacticalWorkspaceBaseLegacy.ts`
- Modify: `src/ui/CombatControls.ts`
- Modify: `scripts/combat_lab_full_game_contract_smoke.mjs`

**Interfaces:**
- `installTacticalWorkspace` receives the application mode.
- In `combat-lab`, `[data-action="fire-contact"]` is hidden and inert.
- Production fire permission is enabled when a Combat Lab scenario starts.
- Normal game behavior is unchanged.

- [ ] Add failing source-contract assertions for mode-gated legacy firing.
- [ ] Pass `GameApplicationMode` into workspace/combat controls.
- [ ] Hide and disable the old `fire-contact` path only in `combat-lab`.
- [ ] Ensure Combat Lab starts with fire permission enabled.
- [ ] Re-run focused contracts.

### Task 4: Remove the order popover in both modes

**Files:**
- Modify: `src/ui/AiStatePlanPanel.ts`
- Modify: `src/ai-state-plan-panel.css`
- Modify: `scripts/tactical_workspace_smoke.mjs`
- Modify: `scripts/combat_lab_workspace_layout_smoke.mjs`

**Interfaces:**
- Keep compact state and plan text in the lower bar.
- Remove the expanding popover surface and its interaction.
- Keep runtime diagnostics in the right inspector and underlying data unchanged.

- [ ] Add failing contract assertions that no `.unit-state-plan-popover` is emitted.
- [ ] Replace the `<details>` popover with a non-interactive compact summary container.
- [ ] Keep binding updates for summary state and plan.
- [ ] Remove obsolete popover-only CSS.
- [ ] Re-run workspace contracts.

### Task 5: Full verification and visual QA

**Files:**
- Modify only task-related contract files if a stale expectation is found.
- Do not change workflows.

- [ ] Run TypeScript and focused Combat Lab contracts.
- [ ] Run `npm run verify:preview -- --report <report-file>` on the exact candidate SHA.
- [ ] Run production build and deployment-page verification.
- [ ] Verify the final diff contains no `.github/workflows/` or `src/ai-node-editor/` changes.
- [ ] Use real Chromium at 1440×900 against the built/deployed `combat-lab.html`.
- [ ] Capture and inspect: Stand, Metrics, Log, left collapsed/right open, left open/right collapsed, both collapsed, and normal game without the order popover.
- [ ] Programmatically assert one canvas, no page errors, no horizontal overflow, correct independent collapse behavior, and no overlaps.

### Task 6: Exact-source Vercel deployment

**Files:**
- No product files unless a verified defect is found.

- [ ] Resolve exact final branch HEAD.
- [ ] Start the repository manual Vercel workflow with exact `ref` and `expected_sha`.
- [ ] Confirm the workflow verified source identity, ran the canonical Preview gate, built production output and wrote `deployment-source.json`.
- [ ] Wait for Vercel status `READY`.
- [ ] Verify `/`, `/ai-node-editor.html`, `/combat-lab.html` and `/deployment-source.json`.
- [ ] Create a temporary share link if authentication protection requires it.
- [ ] Report final SHA, passed checks, Preview URL and screenshot evidence.
