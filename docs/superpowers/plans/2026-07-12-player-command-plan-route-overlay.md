# Player Command, Unit Plan and Route Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separate player intent, AI plan stages and routed waypoints, then render them together as an optimized yellow/blue/green overlay.

**Architecture:** Add pure command and plan contracts above the existing `MoveOrder`, publish command facts to Blackboard, derive plan stages from the real AI runtime graph, and replace the per-frame destructive order renderer with persistent unit views. The existing A* planner and `SimulationTick` remain the movement source of truth.

**Tech Stack:** TypeScript 5, PixiJS 7.4, Vite 5, Node smoke scripts, GitHub Actions core checks, optional manual Playwright visual QA.

## Global Constraints

- Work only on `task/player-command-plan-route-overlay`.
- Do not update `real-wargame-preview` or `main`.
- Preserve the current 2 m runtime grid and 320×200 map performance foundation.
- Never scan or serialize map cells, map objects or route cells for an overlay render key.
- Never invoke A* from rendering.
- Reuse long-lived PixiJS 7 display objects; do not use PixiJS 8 APIs.
- Canonical development language is English; Russian remains the complete default UI language.
- Do not execute screenshot or visual QA workflows without explicit user approval.

---

### Task 1: Command and plan contracts

**Files:**
- Create: `src/core/orders/PlayerCommand.ts`
- Create: `src/core/ai/UnitPlan.ts`
- Modify: `src/core/units/UnitModel.ts`
- Create: `scripts/command_plan_route_smoke.ts`
- Create: `scripts/command_plan_route_smoke.mjs`
- Modify: `package.json`
- Modify: `.github/workflows/preview-core-checks.yml`

**Interfaces:**
- Produces: `PlayerCommand`, `createPlayerMoveCommand`, `updatePlayerCommandStatus`.
- Produces: `UnitPlanState`, `createDirectPlayerMovePlan`, `updateUnitPlanFromRuntime`.
- Extends `UnitModel` with `playerCommand` and `plan`.

- [ ] Write smoke assertions that command revisions are monotonic, status updates retain identity, fallback plans contain one spatial stage, runtime plans expose sequence stages and unchanged structural input retains its revision.
- [ ] Add the smoke command to `package.json` and the non-visual core workflow.
- [ ] Open a draft PR into `real-wargame-preview` and verify the new smoke fails because the production modules do not exist.
- [ ] Implement the pure contracts with cloned positions and structural signatures that ignore elapsed time.
- [ ] Update normalized units with `playerCommand: null` and `plan: null`.
- [ ] Re-run core checks and verify the focused smoke passes.

### Task 2: Player command lifecycle and route linkage

**Files:**
- Modify: `src/core/orders/MoveOrder.ts`
- Modify: `src/core/orders/MoveOrderPlanning.ts`
- Modify: `src/core/orders/RoutedMoveOrders.ts`
- Modify: `src/core/simulation/SimulationTick.ts`
- Modify: `scripts/routed_move_smoke.ts`
- Modify: `scripts/command_plan_route_smoke.ts`

**Interfaces:**
- Adds optional `playerCommandId` to `MoveOrder` and planning options.
- Player issuance creates command before route planning.
- Successful planning installs linked order and fallback plan.
- Failed planning keeps a blocked command and no order.
- Replanning preserves `playerCommandId`.
- Completion or failed replan updates only a matching command.

- [ ] Add failing tests for exact command/order linkage, blocked command retention, replan identity preservation and completed command status.
- [ ] Thread `playerCommandId` through order creation and replanning.
- [ ] Route all player movement issuance through `issueRoutedMoveOrderToSelectedUnits`.
- [ ] Update command and fallback-plan terminal state from `SimulationTick` only when ids match.
- [ ] Verify routed movement, route status and command-plan smoke suites.

### Task 3: Blackboard and node-derived plan

**Files:**
- Modify: `src/core/ai/AiBlackboard.ts`
- Modify: `src/core/ai/AiGameBridge.ts`
- Modify: `src/core/ai/AiStatefulMoveGameBridge.ts` only if synchronization requires it
- Modify: `scripts/command_plan_route_smoke.ts`
- Modify: `scripts/ai_dictionary_smoke.mjs` only if schema assertions require explicit entries

**Interfaces:**
- Blackboard keys: `player_command_active`, `player_command_type`, `player_command_status`, `player_command_target_position`, `player_command_revision`.
- `tickAiGameBridge` writes `unit.plan = updateUnitPlanFromRuntime(...)` only when effects are applied.
- Utility branch, sequence children and active child index become blue plan data.

- [ ] Add failing assertions for all command Blackboard values and bilingual schema entries.
- [ ] Add failing assertions that a real `SequenceWithMemory` result produces completed, active and pending stages with resolved `MoveToBlackboardPosition` targets.
- [ ] Publish command facts while preserving legacy `hasOrder` and `order_target_position` compatibility.
- [ ] Derive and store the plan after a real runtime tick without mutating the source graph.
- [ ] Verify dictionary, runtime, move bridge and command-plan smoke suites.

### Task 4: Persistent combined overlay

**Files:**
- Create: `src/rendering/CommandPlanRouteOverlayModel.ts`
- Rewrite: `src/rendering/PixiOrderRenderer.ts`
- Modify: `src/rendering/PixiApp.ts`
- Modify: `src/core/ui/RuntimeUiState.ts`
- Modify: `scripts/command_plan_route_smoke.ts`

**Interfaces:**
- Produces pure `buildCommandPlanRouteOverlaySnapshot(map, unit, selected)`.
- Snapshot key contains only unit position, selection, command revision/status, plan revision, route revision, waypoint index and waypoint coordinates.
- `PixiOrderRenderer` stores persistent views in `Map<string, UnitOverlayView>`.
- The overlay has one runtime toggle and uses `container.visible` when disabled.

- [ ] Add failing snapshot tests for yellow command target, blue stage points, green remaining waypoints and a bounded key that excludes `routeCells`.
- [ ] Implement snapshot creation without map scans or pathfinding.
- [ ] Replace `removeChildren()` with id-keyed view creation, update and removal.
- [ ] Reuse `Graphics` and pooled `Text` labels; show full plan/route only for selected units and faint command intent for others.
- [ ] Add `destroy()` and call it from `PixiApp.destroy()`.
- [ ] Verify build and the focused smoke.

### Task 5: Human interface and command entry consistency

**Files:**
- Modify: `src/ui/TacticalWorkspace.ts`
- Modify: `src/tactical-workspace-stage8.css`
- Modify: `src/core/ui/RuntimeUiState.ts`
- Modify: `scripts/tactical_workspace_smoke.mjs`
- Prepare: `tests/command-plan-route-overlay.spec.ts`

**Interfaces:**
- View toggle: `Приказ · план · маршрут`.
- Separate labels: command, plan, action and route.
- Cover and stealth buttons call the same routed player-command function as right click.
- Clear command cancels the command and removes only its linked route.

- [ ] Add failing workspace source assertions for the new toggle and separate labels.
- [ ] Replace legacy direct movement calls in cover and stealth UI with routed player-command issuance.
- [ ] Add compact command, plan and route formatting helpers.
- [ ] Add responsive CSS for the expanded current-state block.
- [ ] Prepare a Playwright scenario that issues a command and checks the three overlay colours and labels, but do not execute it without approval.
- [ ] Verify workspace smoke, command-plan smoke, routed movement smoke and production build through core CI.

### Task 6: Documentation and completion evidence

**Files:**
- Create: `docs/subprojects/ai-single-unit-editor/PLAYER_COMMAND_PLAN_ROUTE_OVERLAY_V1.md`
- Modify: `docs/subprojects/ai-single-unit-editor/subproject.json`
- Regenerate: generated status/index docs through `npm run docs:sync` in CI-capable execution.

- [ ] Document the command/plan/route boundaries, Blackboard keys, renderer performance contract and current limits.
- [ ] Record the temporary branch as isolated and not transferred.
- [ ] Run core CI on the exact final branch SHA.
- [ ] Inspect build and smoke logs.
- [ ] Prepare the exact Playwright command and expected PNG list.
- [ ] Ask the user whether to execute visual QA; do not run it before approval.
- [ ] Compare the branch against `real-wargame-preview` and report changed files, checks and risks.
