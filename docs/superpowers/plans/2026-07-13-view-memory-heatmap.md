# View and Memory Heatmap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace physical attention sweeping with a stable, optimized cell visibility heatmap while retaining old knowledge as memory markers and time-based detection with small deterministic variance.

**Architecture:** Current cell visibility is built only for the selected soldier and only while the “Обзор и память” layer is active. Static terrain/object data is cached, the field is rebuilt from a strict observer/map key, and PixiJS renders one texture rather than one object per cell. Target detection remains candidate-based and uses exact LOS, visibility quality, target salience, attention coverage, elapsed time, and a stable per-contact variance.

**Tech Stack:** TypeScript, Vite SSR smoke tests, PixiJS 7, existing simulation/LOS/perception systems.

## Global Constraints

- Work only on `feat/view-memory-heatmap-temp`, based on current `real-wargame-preview`.
- Do not merge to `real-wargame-preview` or `main` without explicit user instruction.
- No physical scan animation in march, observe, or search modes.
- No heatmap calculation while the layer is hidden or no soldier is selected.
- Camera and cursor movement must not rebuild the field.
- The heatmap describes current cell observation quality, not revealed enemy contents.
- Historical knowledge remains only as contact markers.
- Detection randomness must be deterministic, small, save-stable, and frame-rate independent.
- Render the field with one PixiJS texture/sprite, never one display object per cell.
- Preserve old scene import compatibility.
- Russian UI is the default human-facing language.

---

### Task 1: Stable attention coverage

**Files:**
- Modify: `src/core/perception/AttentionModel.ts`
- Modify: `src/core/perception/AttentionController.ts`
- Modify: `scripts/perception_system_smoke.ts`

- [ ] Add a failing smoke assertion that observe/search attention direction remains stable over time and march follows facing.
- [ ] Remove time-driven scan progression from controller behavior.
- [ ] Keep legacy scan fields import-compatible but inert.
- [ ] Run `npm run perception:smoke` and `npm run build`.

### Task 2: Visibility quality and distance model

**Files:**
- Create: `src/core/visibility/VisibilityDistanceModel.ts`
- Create: `src/core/visibility/VisibilityQuality.ts`
- Create: `scripts/view_memory_heatmap_smoke.ts`
- Create: `scripts/view_memory_heatmap_smoke.mjs`
- Modify: `package.json`

- [ ] Add failing tests for distance falloff, blocked cells, forest transmission, posture, and attention coverage.
- [ ] Implement pure quality functions returning `quality01` plus diagnostics factors.
- [ ] Run the new smoke test and build.

### Task 3: Cached selected-unit visibility field

**Files:**
- Create: `src/core/visibility/VisibilityStaticGrid.ts`
- Create: `src/core/visibility/SelectedUnitVisibilityField.ts`
- Extend: `scripts/view_memory_heatmap_smoke.ts`

- [ ] Add failing tests for hidden-layer zero work, cache hits, map-revision invalidation, camera/cursor independence, and compact `Uint8Array` storage.
- [ ] Build a static terrain/object/forest cache keyed by map visual revision.
- [ ] Build a bounded selected-unit field with strict calculation keys and throttled moving updates.
- [ ] Expose diagnostics for rebuilds, cache hits, processed cells, and reasons.

### Task 4: Time-based detection with stable variance

**Files:**
- Modify: `src/core/perception/PerceptionContact.ts`
- Modify: `src/core/perception/VisualSignal.ts`
- Modify: `src/core/perception/PerceptionSystem.ts`
- Extend: `scripts/perception_system_smoke.ts`

- [ ] Add failing tests proving variance is stable, frame-rate independent, import-safe, and only ±10%.
- [ ] Add deterministic per-contact variance seeded by observer/stimulus/episode.
- [ ] Apply current-cell quality and target salience to evidence accumulation without scanning every cell.
- [ ] Preserve existing stages, decay, uncertainty, sound, and reported contacts.

### Task 5: “Обзор и память” UI and one-texture renderer

**Files:**
- Modify: `src/core/ui/RuntimeUiState.ts`
- Modify: `src/ui/AttentionRuntimePanel.ts`
- Modify: `src/rendering/AttentionOverlayInstaller.ts`
- Replace: `src/rendering/PixiAttentionOverlayRenderer.ts`
- Create: `src/rendering/PixiVisibilityHeatmapRenderer.ts`
- Modify: `src/perception-attention.css`
- Extend: `tests/perception-attention-overlay.spec.ts`

- [ ] Add failing UI/smoke assertions for renamed labels and removed scan/fan controls.
- [ ] Add toggles for current view, memory markers, current contacts, and uncertainty.
- [ ] Upload heatmap pixels only when field revision changes.
- [ ] Draw memory/contact markers above the single heatmap sprite.
- [ ] Keep renderer inactive in editor mode and when the overlay is hidden.

### Task 6: Performance and regression verification

**Files:**
- Create: `scripts/view_memory_heatmap_performance_smoke.ts`
- Create: `scripts/view_memory_heatmap_performance_smoke.mjs`
- Modify: `package.json`
- Update: `.github/workflows/preview-core-checks.yml` only if the existing workflow explicitly lists scripts.

- [ ] Verify no hidden-layer work and no cursor/camera rebuilds.
- [ ] Verify idle cache reuse and moving rebuild throttling.
- [ ] Verify one field revision causes at most one texture upload.
- [ ] Verify exact LOS count scales with stimuli, not heatmap cell count.
- [ ] Run all existing route/editor/runtime/perception checks and production build.

### Task 7: Documentation and visual QA

**Files:**
- Create: `docs/subprojects/ai-single-unit-editor/VIEW_AND_MEMORY_HEATMAP_V1.md`
- Modify: `docs/subprojects/ai-single-unit-editor/subproject.json`
- Modify generated indexes using `npm run docs:sync`
- Create/update Playwright coverage for heatmap screenshots.

- [ ] Document current-view versus memory-marker semantics, caches, rebuild reasons, deterministic variance, and honest limits.
- [ ] Run `npm run docs:sync` and `npm run docs:check`.
- [ ] Run real system-Chrome visual QA only after code checks pass.
- [ ] Inspect open terrain, hill shadow, building shadow, forest, march, observe, search, engage, lost contact, and sound marker screenshots.
- [ ] Leave the result only in the temporary branch until explicit transfer approval.
