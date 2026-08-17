# Polygon six-X Pixel Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring only the six-X-touched Polygon surfaces—live map, live unit tokens, map/unit/shared editors, and right-panel `Инфо`—into visual parity with the accepted Interface Linkage v1 HTML while preserving all current product owners and live data paths.

**Architecture:** Keep `GameApplication → PixiTacticalBoardApp → PixiMapRenderer`, `PixiUnitRenderer`, `CombatLabGameEditors/GameEditorRegistry`, and the PULSE/LINZA seams authoritative. Correct viewport/camera presentation and restyle/restructure the existing editor/right-panel hosts; do not copy the prototype runtime or add a second map, unit store, editor registry, selection store, or gameplay computation path.

**Tech Stack:** Vite 5, TypeScript 5, PixiJS 8.19, DOM/CSS, repository smoke contracts, GitHub Actions risk-selected CI, Vercel Preview, Playwright visual QA.

## Global Constraints

- Accepted visual source: `polygon-series-v1.1-memory-v3-interface-linkage(1).html`, SHA-256 `4f33f19578698947cd629a88c6963c325895995fdd78a5380966ae1ef2fa1cfd`.
- Work only on `feature/20260817-polygon-six-x-integration` because this is the same reviewed integration candidate/fix loop.
- Do not merge or transfer into `real-wargame-preview` without a separate explicit user GO.
- Do not touch `main`.
- Left-tab contents outside map/unit editors may remain empty.
- Right-panel tabs outside `Инфо` may remain empty/incomplete; preserve their hooks without expanding scope.
- No fake map data, fake units, fake editor data, prototype localStorage runtime, or second gameplay truth.
- No new full-map scan, per-cell DOM/Pixi object layer, polling loop, gameplay computation from UI, or selection-dependent simulation work.
- Visual acceptance uses the exact corrected deployment SHA and fresh Chromium screenshots at `1600×900`.

---

### Task 1: Add a failing pixel-parity source contract

**Files:**
- Modify: `scripts/polygon_six_x_integration_smoke.mjs`
- Test: `.github/workflows/polygon-six-x-integration-contract.yml` (existing workflow; do not modify unless the current command list cannot run the smoke)

**Interfaces:**
- Consumes: existing six-X integration source files.
- Produces: static contract failures for the known wrong square map layout, legacy editor-card catalogue presentation, and missing parity markers for `Инфо`.

- [ ] **Step 1: Extend the smoke with explicit parity assertions**

Add helpers that can assert absence as well as presence, then require:

```js
expectExcludes('src/combat-lab/polygon-map-surface.css', [
  '--polygon-map-size: min(',
  'width: var(--polygon-map-size)',
  'height: var(--polygon-map-size)',
]);
expectIncludes('src/combat-lab/polygon-map-surface.css', [
  'top: var(--polygon-chrome-h) !important;',
  'right: 0 !important;',
  'bottom: 0 !important;',
  'left: 0 !important;',
]);
expectIncludes('src/combat-lab/game-editors/CombatLabGameEditorCatalogue.ts', [
  'combat-lab-game-editor-workspace',
  'combat-lab-game-editor-nav',
  'combat-lab-game-editor-stage',
]);
expectIncludes('src/combat-lab/right-panel/polygon-right-panel-live.css', [
  'polygon-info-parity',
  'polygon-info-kv-row',
]);
expectIncludes('src/rendering/PixiApp.ts', [
  'fitMapToViewport',
]);
```

- [ ] **Step 2: Run the existing integration contract once and verify RED**

Use the existing Polygon Six-X Integration Contract workflow against this test-only head.

Expected: FAIL because the old map is still square, the catalogue is still cards, `Инфо` has not been restyled, and the renderer has no initial prototype-style map fit.

- [ ] **Step 3: Record all failures before product edits**

The RED run should be used only as the expected TDD baseline. Do not add separate one-failure commits.

---

### Task 2: Make the real map fill the prototype map surface

**Files:**
- Modify: `src/combat-lab/polygon-map-surface.css`
- Modify: `src/rendering/PixiApp.ts`
- Modify only if required by the fit helper: `src/input/CameraController.ts`
- Test: `scripts/polygon_six_x_integration_smoke.mjs`

**Interfaces:**
- Consumes: `SimulationState.map.width`, `height`, `cellSize`, existing `worldContainer`, existing resize-to-root Pixi application.
- Produces: a full-shell live canvas and a one-time/resize-safe map fit using the same Pixi world container.

- [ ] **Step 1: Remove the framed square CSS contract**

Change the Polygon map root from centered square sizing to the prototype surface geometry:

```css
body.app-shell-mode-combat-lab #app,
body.app-shell-mode-combat-lab.workspace-simulation #app,
body.app-shell-mode-combat-lab.workspace-editor #app {
  top: var(--polygon-chrome-h) !important;
  right: 0 !important;
  bottom: 0 !important;
  left: 0 !important;
  width: auto !important;
  height: auto !important;
  margin: 0;
  overflow: hidden;
  border: 0;
  border-radius: 0;
  background: var(--polygon-map);
  box-shadow: none;
}
```

Keep the real canvas and HTML overlay attached to `#app`; do not create a second map surface.

- [ ] **Step 2: Add an initial/resize map-fit helper in `PixiTacticalBoardApp`**

Add a private method with this contract:

```ts
private fitMapToViewport(force = false): void
```

It computes the available canvas size and map pixel size from authoritative map dimensions, chooses a `cover`-style scale that avoids the old black letterbox, clamps to the camera-supported scale interval, centers the map, and updates camera diagnostics through a small camera API rather than writing gameplay state.

Use map extent:

```ts
const mapWidth = this.state.map.width * this.state.map.cellSize;
const mapHeight = this.state.map.height * this.state.map.cellSize;
```

The fit must run at startup and when the root size changes. Use a single `ResizeObserver` owned by `PixiTacticalBoardApp`; disconnect it in `destroy()`.

- [ ] **Step 3: Add the narrow camera presentation API if direct container writes would bypass diagnostics**

If needed, add:

```ts
setViewportTransform(scale: number, x: number, y: number): void
```

to `CameraController`. It only sets the existing `worldContainer` transform and publishes diagnostics. It does not own simulation state.

- [ ] **Step 4: Preserve user camera interaction after initial fit**

Do not continuously refit every frame. Refit only on startup and meaningful root resize; wheel/pan remains owned by `CameraController`.

- [ ] **Step 5: Verify the focused static contract locally/through the existing CI command**

Expected: map-related parity assertions PASS; other Task 1 assertions may still fail until Tasks 3–4 are complete.

---

### Task 3: Restyle embedded map/unit editors and replace the shared editor card catalogue with the prototype workspace shell

**Files:**
- Modify: `src/combat-lab/game-editors/CombatLabGameEditorCatalogue.ts`
- Modify: `src/combat-lab/game-editors/combat-lab-game-editor-shell.css`
- Modify only if needed for selected editor state: `src/combat-lab/game-editors/CombatLabGameEditors.ts`
- Preserve: `src/combat-lab/game-editors/CombatLabEditorShellBridge.ts`
- Test: `scripts/combat_lab_game_editors_smoke.mjs`
- Test: `scripts/polygon_six_x_integration_smoke.mjs`

**Interfaces:**
- Consumes: existing `GameEditorRegistry.listForSurface('combat-lab')`, `GameEditorDefinition`, existing `onOpen` callback and overlay/route activations.
- Produces: one prototype-style navigation/workspace presentation over the existing registry, with no duplicate editor implementation.

- [ ] **Step 1: Restructure the catalogue DOM into a workspace**

Render this stable structure:

```html
<section class="combat-lab-game-editor-workspace">
  <nav class="combat-lab-game-editor-nav">…existing grouped editor buttons…</nav>
  <section class="combat-lab-game-editor-stage">
    <header class="combat-lab-game-editor-stage-head">…selected editor title/status…</header>
    <div class="combat-lab-game-editor-stage-body">…selected editor description/open action…</div>
  </section>
</section>
```

Keep each editor button’s existing `data-game-editor-id`, activation metadata, and `onOpen` path. Selection in the catalogue is presentation state only.

- [ ] **Step 2: Make one editor selected by default without opening fake content**

Use the first registry item as the visual selection. The stage may describe the real activation mode and provide an `Открыть редактор` action wired to the same `onOpen` callback. Do not synthesize editor fields that the product editor does not expose.

- [ ] **Step 3: Match the prototype shared-editor geometry**

Use the prototype shell values:

```css
.combat-lab-game-editor-workspace {
  height: 100%;
  display: grid;
  grid-template-columns: 214px minmax(0, 1fr);
}
.combat-lab-game-editor-nav {
  padding: 8px;
  border-right: 1px solid var(--polygon-line);
  background: #e5e4dc;
}
.combat-lab-game-editor-stage {
  min-width: 0;
  background: #f8f7f1;
}
```

The top-level editors portal should behave like the prototype large editor window, not a grid of cards.

- [ ] **Step 4: Apply prototype light controls to the embedded `Редактор карты` and `Редактор юнита` hosts**

Within `.polygon-shell-editor-tab-host`, override legacy `.combat-lab-panel`, `details`, labels, inputs, selects, textareas and buttons with prototype light surfaces, compact 4–5px radii, thin neutral borders, dark text, and 9–11px control typography.

Do not alter editor write paths or registry ownership.

- [ ] **Step 5: Run editor-focused smoke checks**

Expected: existing registry/open-route contracts still PASS and the new workspace marker assertions PASS.

---

### Task 4: Match the right-panel `Инфо` presentation to the prototype

**Files:**
- Modify: `src/combat-lab/right-panel/PolygonRightPanelLiveView.ts`
- Modify: `src/combat-lab/right-panel/polygon-right-panel-live.css`
- Test: `scripts/linza_right_panel_product_smoke.ts`
- Test: `scripts/polygon_six_x_integration_smoke.mjs`

**Interfaces:**
- Consumes: `preparePolygonInfoLiveOwners`, current map point/state snapshots, existing LINZA view invalidation.
- Produces: prototype-style `Инфо` sections/key-value rows over the same real data.

- [ ] **Step 1: Add semantic parity classes without changing data ownership**

Wrap the Info body with:

```html
<div class="polygon-right-live polygon-info-parity">…</div>
```

Render individual compact rows with:

```html
<div class="polygon-info-kv-row"><span>…label…</span><strong>…value…</strong></div>
```

Reuse the exact values already produced by the live owner adapter.

- [ ] **Step 2: Match prototype section styling**

Use white/light cards, neutral separators, small muted keys, dark right-aligned values, compact 6–8px section spacing, and 4px radii. Remove legacy dark-panel visual inheritance within the right-panel host.

- [ ] **Step 3: Preserve empty/no-point behavior**

When no map point exists, show the current real empty state. Do not inject demo coordinates or synthetic map information.

- [ ] **Step 4: Run LINZA and six-X focused checks**

Expected: live-owner contract PASS and parity class assertions PASS.

---

### Task 5: Verify unit-token placement after the viewport fix; change only if visual evidence proves a mismatch

**Files:**
- Inspect: `src/rendering/PixiUnitRenderer.ts`
- Modify only if necessary: `src/rendering/PixiUnitRenderer.ts`
- Test: `scripts/unit_map_token_smoke.mjs`
- Test: `scripts/unit_map_token_smoke.ts`

**Interfaces:**
- Consumes: current PESHKA token system and authoritative unit positions.
- Produces: the same real-unit renderer aligned with the corrected camera/map viewport.

- [ ] **Step 1: Run unit-token focused smoke after map/camera changes**

Expected: existing near/medium/far and posture symbol contracts remain PASS.

- [ ] **Step 2: Do not change token design pre-emptively**

The PESHKA renderer already owns the accepted circle/triangle/rounded-rectangle system. Only adjust a presentation constant if the fresh screenshot shows a concrete pixel-parity defect after map fit.

- [ ] **Step 3: If a token adjustment is required, add/adjust the focused smoke first**

Keep all changes in the existing `PixiUnitRenderer`; never create a second renderer or DOM token layer.

---

### Task 6: Green candidate verification

**Files:**
- No new product surface unless a focused failure identifies a regression.
- Update PR #295 body after exact-head checks with the new tested SHA and verification summary.

**Interfaces:**
- Consumes: Tasks 1–5.
- Produces: exact corrected feature SHA ready for deployment/visual QA.

- [ ] **Step 1: Run the single correction-package CI rerun**

Use the existing Polygon Six-X Integration Contract / PR risk-selected checks. Collect all failures together.

Expected matrix includes:

```text
polygon six-X integration smoke
map/grid contracts
unit token contracts
LIVE Unit contract
editor integration contract
LINZA right-panel contract
TypeScript
production build
```

- [ ] **Step 2: If the rerun fails, classify before editing**

Fix only defects caused by this correction. Do not repair unrelated inherited broad-repository failures unless they block this scope.

- [ ] **Step 3: Record performance selection**

Performance reason: map root/camera resize presentation changed, but no simulation/full-map algorithm changed. Focused renderer contracts + build are required; a broad 90-second performance matrix is not justified unless the focused checks or visual run expose a runtime regression.

---

### Task 7: Deploy the exact corrected SHA and run fresh visual QA

**Files:**
- Read before deploy: `.agents/skills/real-wargame-manual-vercel-deploy/SKILL.md`
- Read before browser run: `.agents/skills/real-wargame-screenshots/SKILL.md`
- If direct browser remains unavailable: `.agents/skills/vercel-deployment-playwright-e2e/SKILL.md`
- CI-only visual files live only on temporary `ci/**` branches.

**Interfaces:**
- Consumes: exact corrected feature SHA.
- Produces: exact-source Vercel Preview plus fresh screenshot evidence.

- [ ] **Step 1: Manually deploy the exact current feature HEAD**

Use the permanent Vercel project `repo`. Verify `/deployment-source.json` reports the exact feature branch, exact SHA, and `verificationStatus: passed`.

- [ ] **Step 2: Capture six fresh `1600×900` states**

```text
01 overview: map + shell panels
02 selected real unit
03 Редактор карты
04 Редактор юнита
05 Редакторы
06 right-panel Инфо
```

Use the real deployment in Chromium. Do not count source inspection or CI green status as visual evidence.

- [ ] **Step 3: Download and open every key PNG**

Compare each against the accepted prototype screenshots. Ignore empty left tabs and right tabs outside the agreed scope.

- [ ] **Step 4: Correct visual defects on the same feature branch if needed**

If the screenshots reveal a product defect, make one aggregated visual correction, rerun focused non-browser checks, redeploy the new exact SHA, and repeat only the affected screenshot states.

- [ ] **Step 5: Close temporary visual CI PR without merge**

Do not transfer CI harness files into product branches. Report any temp branches that cannot be deleted with available tooling.

---

## Self-review

- Spec coverage: map geometry/camera, real unit renderer, embedded map/unit editors, shared Editors surface, and `Инфо` all have explicit tasks.
- Out-of-scope tabs remain intentionally untouched.
- No task introduces fake/runtime prototype state or a second product owner.
- Visual evidence is tied to exact corrected SHA.
- Performance work is bounded to existing renderer/camera resize behavior; no new map scan or per-frame layout loop is planned.
