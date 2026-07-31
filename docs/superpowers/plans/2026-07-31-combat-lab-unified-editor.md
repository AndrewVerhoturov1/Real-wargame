# Combat Lab Unified Participant Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build one production participant editor for Combat Lab, transactional map placement/facing, and exact per-unit Graph v2 brain binding with visual/headless parity.

**Architecture:** Keep the accepted Foundation services unchanged and compose the feature through their public contracts. Reuse one production unit-inspector implementation in live scene-editor and experiment-draft adapters; store a versioned brain binding on each unit and a deduplicated graph catalog on the scene snapshot so runtime resolution never depends on the last-opened editor graph.

**Tech Stack:** TypeScript 5, DOM, PixiJS 8, Node smoke tests, Vite.

## Global Constraints

- Branch: `worker/20260731-combat-lab-unified-editor`.
- Foundation: `fa0c59e8a5b9b06a14c965bfc4d9e4e0edc651fd`.
- Do not change Foundation public signatures.
- Do not change `main`, `real-wargame-preview`, or the acceptance branch.
- Do not deploy.
- Russian user interface; English identifiers and serialized keys.
- No full-scene rebuild from a field callback; point mutations only.
- Map previews do not mutate the experiment before confirmation.
- Graph execution uses the participant's exact `graphId`; no global last-opened fallback.

---

### Task 1: Versioned brain binding and graph catalog

**Files:**
- Create: `src/core/units/UnitAiBrainBinding.ts`
- Create: `src/core/ai/AiGraphCatalog.ts`
- Modify: `src/core/units/UnitModel.ts`
- Modify: `src/core/simulation/SimulationStateLegacy.ts`
- Modify: `src/core/simulation/SceneSnapshot.ts`
- Test: `scripts/unit_ai_brain_binding_roundtrip_smoke.mjs`

**Interfaces:**
- Produces `UnitAiBrainBindingV1`, normalization/migration helpers, `AiGraphCatalogV1`, exact graph resolver, scene round-trip.

- [ ] Write a smoke test proving legacy migration, manual/graph round-trip, deduplication, and missing-ID rejection.
- [ ] Confirm the test fails because the new contract does not exist.
- [ ] Implement the smallest versioned binding and catalog.
- [ ] Serialize and restore both through the production scene snapshot.
- [ ] Run the focused smoke test and existing scene/runtime checks.

### Task 2: Per-unit runtime graph resolution

**Files:**
- Modify: `src/core/ai/AiGameBridgeLegacy.ts`
- Modify: `src/core/ai/AiSimulationScheduler.ts`
- Modify: Combat Lab experiment validation/digest/executor modules.
- Test: `scripts/combat_lab_brain_visual_headless_parity_smoke.mjs`

**Interfaces:**
- Consumes `UnitAiBrainBindingV1` and `AiGraphCatalogV1`.
- Produces one catalog resolution per scheduler cycle and exact per-unit graph snapshots.

- [ ] Write parity and missing-graph tests.
- [ ] Confirm they fail against the global localStorage graph route.
- [ ] Resolve the scene-owned catalog once per scheduler cycle and select by each unit's exact binding.
- [ ] Include binding/catalog data in validation and deterministic digest.
- [ ] Prove visual and headless initialization select the same graph.

### Task 3: Reusable production unit inspector

**Files:**
- Create: `src/ui/ProductionUnitEditor.ts`
- Modify: `src/ui/GameEditorWorkbench.ts`
- Create: `src/combat-lab/editor/CombatLabSceneEditorAdapter.ts`
- Create: `src/combat-lab/editor/CombatLabUnifiedInspectorHost.ts`
- Test: `scripts/combat_lab_scene_editor_adapter_behavior_smoke.mjs`

**Interfaces:**
- Produces one unit-editor section factory with live-state and experiment-draft mutation adapters.

- [ ] Write an adapter contract smoke test.
- [ ] Confirm it fails while Combat Lab owns a second parameter panel.
- [ ] Extract the production unit editor without copying its field definitions.
- [ ] Implement live and experiment-draft adapters using point mutation.
- [ ] Mount the unified inspector from canonical selection and remove the nested duplicate panel.

### Task 4: Unified participant dialog

**Files:**
- Create: `src/combat-lab/editor/CombatLabParticipantDialogController.ts`
- Create: `src/combat-lab/editor/CombatLabParticipantDialogView.ts`
- Create: `src/combat-lab/editor/combat-lab-participant-dialog.css`
- Modify: `src/combat-lab/scenario-editor/CombatLabParticipantDialog.ts`
- Test: `scripts/combat_lab_participant_dialog_behavior_smoke.mjs`

**Interfaces:**
- Produces a local unsaved draft, complete Russian sections, read-only technical IDs, unarmed clearing, focus/scroll restoration, and graph selection.

- [ ] Write dialog behavior tests first.
- [ ] Confirm the legacy dialog fails unarmed editing, brain selection, and draft preservation requirements.
- [ ] Implement controller and view; leave the legacy module as a thin adapter.
- [ ] Save through the participant mutation port only after explicit confirmation.
- [ ] Verify Escape and focus restoration.

### Task 5: Transactional placement and facing

**Files:**
- Create: `src/combat-lab/editor/CombatLabParticipantMapTools.ts`
- Modify: `src/combat-lab/rendering/CombatLabRenderer.ts`
- Modify: `src/combat-lab/CombatLabExtension.ts`
- Test: `scripts/combat_lab_participant_placement_behavior_smoke.mjs`
- Test: `scripts/combat_lab_participant_facing_behavior_smoke.mjs`

**Interfaces:**
- Consumes Foundation `CombatLabMapToolContributorV1` and `CombatLabParticipantMutationPortV1`.
- Produces preview-only transactions that commit exactly once.

- [ ] Write placement and facing transaction tests.
- [ ] Confirm they fail before contributors exist.
- [ ] Implement map-coordinate conversion using actual `metersPerCell`.
- [ ] Add renderer preview state for participant marker and facing arrow.
- [ ] Pin candidate on click/drag, commit on Enter or explicit confirmation, cancel without mutation.

### Task 6: Scene list, layout, and final composition

**Files:**
- Modify: `src/combat-lab/scenario-editor/CombatLabParticipantEditor.ts`
- Modify: `src/combat-lab/scenario-editor/CombatLabRoleEditor.ts`
- Modify: `src/combat-lab/scenario-editor/CombatLabScenePanel.ts`
- Modify: `src/combat-lab/CombatLabExtension.ts`
- Modify: Combat Lab CSS/tokens.

**Interfaces:**
- Produces concise left-side participant list and one collapsible unified inspector.

- [ ] Remove technical IDs and the second full parameter editor from cards.
- [ ] Keep create/duplicate/delete/select operations and reference-safe deletion.
- [ ] Add collapsible inspector/sidebar behavior and 1440×900 dialog constraints.
- [ ] Preserve Foundation teardown and ownership.

### Task 7: Verification and handoff

- [ ] Run the six new focused smoke tests.
- [ ] Run existing Foundation, experiment, UI, TypeScript, and production-build checks.
- [ ] Review the complete Foundation-to-head diff for scope and forbidden branch/deployment changes.
- [ ] Record exact check evidence and performance analysis.
- [ ] Return `READY FOR ORCHESTRATOR`, `BLOCKED`, or `FAIL`.