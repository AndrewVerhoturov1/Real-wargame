# Soldier Tactical Awareness Lab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the existing AI test panel into an integrated soldier laboratory with explicit initial/runtime state, direct map tools, interactive threat geometry, small-arms cover from objects/forest/relief, per-soldier threat memory, and a tactical danger/safety heatmap used by AI queries.

**Architecture:** Keep objective world data in `SimulationState`, persistent soldier setup in `UnitModel.initialState`, current values in `behaviorRuntime`, and personal knowledge in `UnitModel.tacticalKnowledge`. Add an event-driven lab runtime for tools and overlays, a pure awareness calculator, and focused Pixi renderers for handles and heatmaps. The existing AI bridge consumes compact awareness queries rather than raw grid data.

**Tech Stack:** TypeScript 5.5, PixiJS 7.4, Vite 5, Playwright screenshot workflow, GitHub Actions.

## Global Constraints

- Work only in `real-wargame-preview`; do not change `main`.
- Real visual verification requires Vite + Chromium + Playwright PNGs that are downloaded and inspected.
- The test lab must not cover the usable map: opening the dock reserves layout space.
- Editor fields set persistent characteristics and initial dynamic state; the running simulation owns current dynamic state.
- Cover scope is small-arms fire only in this milestone.
- Heatmap calculation is event/cached, not rebuilt unconditionally every frame.
- Preserve compatibility with older scene JSON.

---

### Task 1: Soldier setup versus runtime state

**Files:**
- Modify: `src/core/behavior/BehaviorModel.ts`
- Modify: `src/core/units/UnitModel.ts`
- Modify: `src/core/editor/GameEditorDrafts.ts`
- Modify: `src/ui/SceneExport.ts`
- Test: `scripts/ai_test_lab_smoke.mjs`

**Interfaces:**
- Produces: `UnitInitialState`, `createUnitInitialState()`, `applyInitialStateToRuntime(unit)`, `UnitModel.initialState`.

- [ ] Add a failing smoke assertion for `initialState` and reset helpers.
- [ ] Run `npm run lab:smoke`; expect failure for missing symbols.
- [ ] Add the types and backward-compatible normalization/export.
- [ ] Update editor drafts to store initial dynamic values separately.
- [ ] Run `npm run lab:smoke` and `npm run build`; expect success.
- [ ] Commit.

### Task 2: Integrated lab layout and direct tools

**Files:**
- Replace: `src/ui/AiTestLabControls.ts`
- Replace: `src/ai-test-lab.css`
- Create: `src/core/testing/AiLabRuntime.ts`
- Create: `src/core/testing/AiLabInteraction.ts`
- Modify: `src/input/BoardInputController.ts`
- Modify: `src/main.ts`
- Test: `scripts/ai_test_lab_smoke.mjs`

**Interfaces:**
- Produces: `AiLabTool`, `getAiLabRuntime()`, pointer down/move/up handlers, cursor resolver.

- [ ] Add failing assertions for dock, top tools, cursor classes, and pointer handlers.
- [ ] Verify the smoke test fails only for the new requirements.
- [ ] Implement a top tool strip, right dock, and bottom compact test controls.
- [ ] Reserve map space with `body.ai-lab-open`; do not float over existing UI.
- [ ] Route pointer and keyboard input through the lab runtime outside editor mode.
- [ ] Run smoke/build.
- [ ] Commit.

### Task 3: Interactive threat handles

**Files:**
- Create: `src/rendering/PixiThreatEditorRenderer.ts`
- Modify: `src/core/testing/AiLabInteraction.ts`
- Modify: `src/rendering/PixiApp.ts`
- Modify: `src/core/pressure/PressureZone.ts`
- Test: `scripts/ai_test_lab_smoke.mjs`

**Interfaces:**
- Produces: handles for center, direction, range, arc-left, arc-right, minimum range, circle radius, rectangle width/height/rotation.

- [ ] Add failing smoke assertions for every handle kind and drag mode.
- [ ] Implement hit testing and geometry updates with clamped values.
- [ ] Render visible labeled handles only for the selected threat.
- [ ] Synchronize inspector numbers immediately while dragging.
- [ ] Run smoke/build.
- [ ] Commit.

### Task 4: Small-arms cover strength and reliability

**Files:**
- Modify: `src/core/map/MapModel.ts`
- Modify: `src/core/editor/GameEditorDrafts.ts`
- Create: `src/core/cover/SmallArmsCoverEvaluation.ts`
- Modify: `src/core/cover/CoverEvaluation.ts`
- Modify: `src/core/pressure/ThreatEvaluation.ts`
- Modify: `src/ui/SceneExport.ts`
- Test: `scripts/ai_test_lab_smoke.mjs`

**Interfaces:**
- Produces: `coverReliability`, `expectedProtection`, object/forest/relief cover contributions.

- [ ] Add failing assertions for reliability and forest/relief evaluators.
- [ ] Extend object defaults and scene compatibility.
- [ ] Evaluate object, forest, and terrain-profile cover against a threat direction and posture.
- [ ] Use expected protection in threat reduction while retaining diagnostic components.
- [ ] Run smoke/build.
- [ ] Commit.

### Task 5: Personal threat memory

**Files:**
- Modify: `src/core/units/UnitModel.ts`
- Create: `src/core/knowledge/SoldierThreatMemory.ts`
- Modify: `src/core/simulation/SimulationState.ts`
- Modify: `src/core/simulation/SimulationTick.ts`
- Modify: `src/core/pressure/PressureZone.ts`
- Modify: `src/ui/SceneExport.ts`
- Test: `scripts/ai_test_lab_smoke.mjs`

**Interfaces:**
- Produces: `KnownThreatMemory`, `UnitTacticalKnowledge`, `syncSoldierThreatMemory(state, unit, deltaSeconds)`.

- [ ] Add failing assertions for confidence, uncertainty, timestamp, and per-unit storage.
- [ ] Initialize knowledge from scene data and known/visible objective zones.
- [ ] Refresh visible threats, decay stale confidence, and expand uncertainty.
- [ ] Preserve memories per soldier in scene export/import.
- [ ] Run smoke/build.
- [ ] Commit.

### Task 6: Tactical awareness grid

**Files:**
- Create: `src/core/knowledge/SoldierAwarenessGrid.ts`
- Create: `src/rendering/PixiAwarenessHeatmapRenderer.ts`
- Modify: `src/core/ui/RuntimeUiState.ts`
- Modify: `src/rendering/PixiApp.ts`
- Modify: `src/ui/AiTestLabControls.ts`
- Test: `scripts/ai_test_lab_smoke.mjs`

**Interfaces:**
- Produces: awareness modes `all`, `danger`, `cover`, `safe`, `uncertainty`, `objective`; cached `SoldierAwarenessReport` with cells and best positions.

- [ ] Add failing assertions for modes, cell metrics, cache key, and renderer.
- [ ] Calculate danger, suppression, expected protection, concealment, uncertainty, and safety per cell from the selected soldier's memory.
- [ ] Cache by map/cover/knowledge/posture revision key.
- [ ] Render heat colors and best-position markers.
- [ ] Add mode controls and legend to the dock.
- [ ] Run smoke/build.
- [ ] Commit.

### Task 7: AI bridge awareness queries

**Files:**
- Modify: `src/core/ai/AiGameBridge.ts`
- Modify: `src/ai-node-editor/ai-test-lab-node-options.ts`
- Test: `scripts/ai_test_lab_smoke.mjs`

**Interfaces:**
- Produces blackboard values: `currentPositionDanger`, `currentExpectedProtection`, `bestSafePositionScore`, `distanceToBestSafePosition`, `routeDanger`, `threatConfidence`.

- [ ] Add failing assertions for the new blackboard keys.
- [ ] Feed compact awareness values from the cached report into the bridge.
- [ ] Expose selectors in the node editor without passing the full grid.
- [ ] Run lab/editor/engine/graph/build checks.
- [ ] Commit.

### Task 8: Scenario controls, keyboard behavior, and repeatability

**Files:**
- Modify: `src/ui/AiTestLabControls.ts`
- Modify: `src/core/testing/AiTestLabRuntime.ts`
- Modify: `src/core/testing/AiLabInteraction.ts`
- Modify: `docs/manual-test/AI_TEST_LAB_STAGE_5.md`
- Test: `scripts/ai_test_lab_smoke.mjs`

**Interfaces:**
- Produces: Escape cancel, Delete, Ctrl+D, repeat placement, save/reset scene, copy current state to initial state.

- [ ] Add failing assertions for keyboard commands and reset behavior.
- [ ] Implement commands with input-focus guards.
- [ ] Document exact user workflow.
- [ ] Run smoke/build.
- [ ] Commit.

### Task 9: Real browser screenshot QA

**Files:**
- Modify: `tests/preview-screenshots.spec.ts`
- Modify: `docs/manual-test/PREVIEW_SCREENSHOTS.md`

**Interfaces:**
- Produces PNGs proving integrated layout, cursor/tool state, threat rotation/range/arc editing, separated soldier state, forest/relief cover, and awareness modes.

- [ ] Add Playwright actions and named screenshots for each required visual state.
- [ ] Push to `real-wargame-preview` and wait for `Preview screenshots`.
- [ ] Download `real-wargame-preview-screenshots`.
- [ ] Inspect every new PNG; record concrete visible findings.
- [ ] Fix any visual defects and repeat until acceptable.
- [ ] Run final core checks and screenshot workflow.
- [ ] Commit final documentation and handoff.
