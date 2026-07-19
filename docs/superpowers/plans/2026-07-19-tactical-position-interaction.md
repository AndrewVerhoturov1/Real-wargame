# Tactical Position Interaction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make B2 tactical-position diamonds selectable and commandable on the danger layer, with automatic recommended posture after arrival.

**Architecture:** A bounded transient selection registry owns the visible candidate list and hit-testing. A capture-phase input controller intercepts only marker clicks. The existing routed player command carries an optional arrival posture, and a post-tick wrapper applies it once after the linked command completes.

**Tech Stack:** TypeScript, PixiJS 8, Vite SSR smoke tests, Vercel preview builds.

## Global Constraints

- Keep `DISPLAY_MAX_CANDIDATES = 12`.
- Keep all markers in one Pixi `Graphics` object and one reused `Text` label.
- Hit-testing must remain bounded to the already visible candidates.
- Do not call tactical search, worker preparation, map scans, or pathfinding from pointer handlers.
- Do not use wall-clock timing to change gameplay behavior.
- Do not run GitHub Actions.

---

### Task 1: Failing interaction and arrival-posture smoke

**Files:**
- Create: `scripts/tactical_position_interaction_smoke.ts`
- Modify: `scripts/tactical_position_search_smoke.mjs`

**Interfaces:**
- Consumes: future selection registry and arrival-posture command API.
- Produces: executable red/green contract in the existing tactical-position smoke chain.

- [ ] **Step 1: Write the failing test**

Test a three-candidate visible snapshot, bounded hit-testing, left-selection state, `createPlayerMoveCommand(..., arrivalPosture)`, and one-time completed-command posture application.

- [ ] **Step 2: Run test to verify it fails**

Run through the automatic Vercel preview build.

Expected: FAIL because the new selection and arrival-posture modules/exports do not exist.

- [ ] **Step 3: Commit the red test**

Commit message: `test: define tactical position interaction contract`.

### Task 2: Bounded transient selection registry

**Files:**
- Create: `src/core/tactical/SimulationTacticalPositionSelection.ts`

**Interfaces:**
- Produces:
  - `publishVisibleTacticalPositions(state, unitId, candidates)`
  - `clearVisibleTacticalPositions(state)`
  - `findVisibleTacticalPositionAt(state, position)`
  - `selectVisibleTacticalPositionAt(state, position)`
  - `syncHoveredTacticalPosition(state)`
  - `getTacticalPositionPresentation(state)`

- [ ] **Step 1: Implement a WeakMap-owned registry**

Store only the active unit id, at most the published bounded candidate array, selected id, and hovered id.

- [ ] **Step 2: Implement bounded nearest-hit selection**

Use a hit radius derived from `map.cellSize`, clamped to 0.55–1.25 cells. Iterate only the published candidates.

- [ ] **Step 3: Keep selection stable across identical snapshots**

Clear selected/hovered ids only when their candidate no longer exists or the owner unit changes.

- [ ] **Step 4: Commit**

Commit message: `feat: add bounded tactical position selection`.

### Task 3: Routed command with arrival posture

**Files:**
- Modify: `src/core/orders/PlayerCommand.ts`
- Modify: `src/core/orders/RoutedMoveOrders.ts`
- Create: `src/core/tactical/TacticalPositionArrival.ts`
- Move: `src/core/simulation/SimulationTick.ts` to `src/core/simulation/SimulationTickLegacy.ts`
- Create: `src/core/simulation/SimulationTick.ts`

**Interfaces:**
- `PlayerCommand.arrivalPosture?: UnitPosture`
- `PlayerCommand.arrivalPostureApplied?: boolean`
- `issueTacticalPositionMoveOrderToSelectedUnit(state, target, posture)`
- `reconcileCompletedTacticalPositionArrivals(state)`

- [ ] **Step 1: Extend player-command creation and normalization**

Normalize only `standing`, `crouched`, and `prone`. Ordinary commands leave the field undefined.

- [ ] **Step 2: Add a single-unit tactical-position routed command**

Resolve only `state.selectedUnitId`, use the existing normal routed movement intent and route planner, and store the recommended arrival posture on the command.

- [ ] **Step 3: Apply posture once after completion**

After the legacy simulation tick, scan units and apply posture only when the command is completed, has no active order, carries an arrival posture, and is not already marked applied. Update `previousPosture`, `postureChangedBecause`, event, and reason.

- [ ] **Step 4: Preserve normal movement behavior**

Blocked/cancelled commands and commands without arrival posture must not alter posture.

- [ ] **Step 5: Commit**

Commit message: `feat: apply tactical posture after arrival`.

### Task 4: Marker input controller

**Files:**
- Create: `src/input/TacticalPositionInputController.ts`

**Interfaces:**
- Consumes the selection registry and `issueTacticalPositionMoveOrderToSelectedUnit`.
- Produces `attach()` and `destroy()` lifecycle methods.

- [ ] **Step 1: Add capture-phase pointer listeners**

Listen on `window` for pointer down/up/cancel. Ignore non-canvas targets, editor mode, non-danger layers, and misses.

- [ ] **Step 2: Intercept only confirmed marker gestures**

On pointer down, store pointer id/button/candidate id and stop propagation. On matching pointer up, left-select or right-select-and-command.

- [ ] **Step 3: Commit**

Commit message: `feat: control tactical positions from danger layer`.

### Task 5: B2 rendering and label

**Files:**
- Modify: `src/rendering/PixiAwarenessHeatmapRenderer.ts`

**Interfaces:**
- Publishes visible candidates to the registry.
- Owns one `TacticalPositionInputController` and one reusable marker label.

- [ ] **Step 1: Replace posture bars with B2 glyphs**

Draw the same outer diamond for every marker. Draw vertical, shallow-angle, or horizontal internal strokes for standing, crouched, or prone.

- [ ] **Step 2: Draw hover and selection state**

Use a larger white diamond for selection. Include selected/hovered ids in the tactical render key.

- [ ] **Step 3: Add one reusable label**

Show `СТОЯ`, `СИДЯ`, or `ЛЁЖА` beside the hovered candidate, falling back to the selected candidate. Do not allocate text per marker.

- [ ] **Step 4: Wire lifecycle and cleanup**

Attach/destroy the input controller with state ownership and clear the selection registry when the layer becomes inactive.

- [ ] **Step 5: Commit**

Commit message: `feat: render interactive B2 tactical markers`.

### Task 6: Green verification and preview deployment

**Files:**
- Modify: `scripts/tactical_workspace_smoke_incremental_directional.mjs` if source-contract assertions need migration-aware updates.

- [ ] **Step 1: Run the Vercel preview build**

Expected passing sequence: TypeScript, perception smoke, tactical-position search smoke, interaction smoke, Graph v2 smoke, workspace migration smoke, Pixi vector smoke, radial-menu smoke, Vite production build, deployment-pages smoke.

- [ ] **Step 2: Inspect build logs**

Confirm no TypeScript errors, no failed smoke contracts, and successful Vite output.

- [ ] **Step 3: Provide the protected preview link**

Do not run GitHub Actions.