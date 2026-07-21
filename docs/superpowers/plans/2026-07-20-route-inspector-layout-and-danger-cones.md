# Route Inspector Layout and Danger Cones Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the route inspector a readable single-column panel and add a default-off danger-tab toggle for unit view cones.

**Architecture:** Reuse the existing migrated route controls and the existing `#vision-toggle`/`PixiTacticalBoardApp` state. CSS resets the compact bottom-bar grid placement inside the inspector. `PixiViewConeRenderer` becomes a retained, key-driven Pixi renderer and `PixiApp` gates it by the active `danger` layer.

**Tech Stack:** TypeScript, PixiJS 8, DOM/CSS, Node source smoke tests, Vite.

## Global Constraints

- Work only on `feature/20260720-route-cost-inspector`.
- The route-cost worker, route calculation and navigation-profile authority remain unchanged.
- The canonical cone toggle is the existing `#vision-toggle`; no duplicate state owner is introduced.
- Cones are disabled by default and do no draw work outside the `danger` layer.
- Do not run GitHub Actions, Chromium or Playwright unless separately authorized.

---

### Task 1: Lock the route layout and cone ownership contracts

**Files:**
- Modify: `scripts/route_cost_inspector_smoke.mjs`
- Create: `scripts/danger_view_cones_smoke.mjs`
- Modify: `scripts/tactical_workspace_smoke.mjs`

**Interfaces:**
- Consumes: existing source files and package scripts.
- Produces: focused source assertions for inspector layout, toggle relocation and danger-only rendering.

- [ ] **Step 1: Extend the route inspector smoke with failing layout assertions**

Assert that `src/tactical-workspace-compact-route.css` contains inspector-scoped resets for `grid-area`, full-width children, wrapped status text and single-column layout.

- [ ] **Step 2: Add the failing danger-cone source smoke**

Assert that:

```js
const workspace = readFileSync('src/ui/TacticalWorkspaceBase.ts', 'utf8');
const app = readFileSync('src/rendering/PixiApp.ts', 'utf8');
const renderer = readFileSync('src/rendering/PixiViewConeRenderer.ts', 'utf8');

assert.match(workspace, /Конусы угроз/);
assert.doesNotMatch(workspace, /moveExistingButton\('#vision-toggle', display\)/);
assert.match(app, /getSimulationLayerState\(this\.state\)\.mode === 'danger'/);
assert.match(renderer, /private readonly graphics = new Graphics\(\)/);
assert.match(renderer, /lastRenderKey/);
```

Also assert that `showViewCones` remains initialized to `false`.

- [ ] **Step 3: Run both focused smokes and verify failure**

Run:

```bash
node scripts/route_cost_inspector_smoke.mjs
node scripts/danger_view_cones_smoke.mjs
```

Expected: at least one assertion fails for missing layout resets and the disabled renderer.

- [ ] **Step 4: Register the cone smoke in the workspace smoke aggregator**

Add `import './danger_view_cones_smoke.mjs';` to `scripts/tactical_workspace_smoke.mjs`.

- [ ] **Step 5: Commit the red tests**

```bash
git add scripts/route_cost_inspector_smoke.mjs scripts/danger_view_cones_smoke.mjs scripts/tactical_workspace_smoke.mjs
git commit -m "test: lock route layout and danger cone contracts"
```

---

### Task 2: Repair the route inspector layout

**Files:**
- Modify: `src/tactical-workspace-compact-route.css`
- Modify: `src/route-cost-overlay.css`

**Interfaces:**
- Consumes: `.route-cost-inspector-panel`, `.route-cost-controls`, `.unit-route-profile`, `.unit-route-details`.
- Produces: one full-width vertical inspector with readable wrapping status rows.

- [ ] **Step 1: Reset migrated compact-grid placement inside the inspector**

Add inspector-scoped rules equivalent to:

```css
.route-cost-inspector-panel > *,
.route-cost-inspector-panel .unit-route-profile,
.route-cost-inspector-panel .unit-route-details {
  grid-area: auto;
  width: 100%;
  min-width: 0;
  max-width: 100%;
}
```

- [ ] **Step 2: Make the inspector one deliberate column**

Set the host to `grid-template-columns: minmax(0, 1fr)`, remove inherited top margins from its children and give each section consistent padding/borders.

- [ ] **Step 3: Make route status rows readable**

Set `.unit-route-details-panel span` to normal wrapping with `white-space: normal`, `overflow-wrap: anywhere`, at least 11 px font size and full-width block/card presentation. Apply distinct emphasis to profile, cost and reason rows through their existing `data-role` selectors.

- [ ] **Step 4: Normalize route-cost control typography**

Remove the legacy top divider/margin inside the inspector, use the workspace color tokens and make the select height consistent with the profile select.

- [ ] **Step 5: Run the route inspector smoke**

Run:

```bash
node scripts/route_cost_inspector_smoke.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit the layout fix**

```bash
git add src/tactical-workspace-compact-route.css src/route-cost-overlay.css
git commit -m "fix: make route inspector readable"
```

---

### Task 3: Restore a retained Pixi view-cone renderer

**Files:**
- Modify: `src/rendering/PixiViewConeRenderer.ts`

**Interfaces:**
- Consumes: `TacticalMap`, visible `UnitModel[]`, selected unit IDs.
- Produces: `render(map, units, selectedUnitIds)` and idempotent `clear()`/`destroy()` behavior.

- [ ] **Step 1: Implement one retained Graphics object**

Use:

```ts
readonly container = new Container();
private readonly graphics = new Graphics();
private lastRenderKey = '';
```

Add the graphics object to the container once in the constructor.

- [ ] **Step 2: Build a stable geometry key**

Include map cell size and, for every visible unit, ID, position, facing, view range, view angle and selected state. Return early when unchanged.

- [ ] **Step 3: Draw bounded cone polygons using PixiJS 8 APIs**

For each unit, draw from the unit center through a fixed 18-segment arc and back to the center. Use stronger alpha/stroke for selected units and weaker presentation for others. Reuse the same graphics object and never allocate child graphics per frame.

- [ ] **Step 4: Implement symmetric clear and destroy**

`clear()` empties graphics and resets the key. `destroy()` clears, destroys graphics and container once.

- [ ] **Step 5: Run TypeScript**

Run:

```bash
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 6: Commit the renderer**

```bash
git add src/rendering/PixiViewConeRenderer.ts
git commit -m "feat: restore retained unit view cones"
```

---

### Task 4: Gate and mount cones in the danger tab

**Files:**
- Modify: `src/rendering/PixiApp.ts`
- Modify: `src/ui/TacticalWorkspaceBase.ts`
- Modify: `src/tactical-workspace.css`

**Interfaces:**
- Consumes: existing `#vision-toggle`, `getSimulationLayerState(state)`, `PixiViewConeRenderer`.
- Produces: a danger-panel button labelled `Конусы угроз: вкл/выкл`, default off, with no rendering outside danger mode.

- [ ] **Step 1: Gate rendering by the danger layer**

Import `getSimulationLayerState` in `PixiApp.ts`. In `renderFrame()`, render cones only when `showViewCones` is true and the layer mode is `danger`; otherwise clear the renderer when it contains stale geometry.

- [ ] **Step 2: Rename the canonical toggle labels**

Change Russian labels to:

```ts
viewOn: 'Конусы угроз: вкл',
viewOff: 'Конусы угроз: выкл',
```

Keep English labels semantically equivalent.

- [ ] **Step 3: Keep the toggle default disabled**

Retain `private showViewCones = false;` and preserve `aria-pressed=false` initialization.

- [ ] **Step 4: Move the existing button from the global display menu to danger content**

In `TacticalWorkspaceBase.ts`, retain a reference to `#vision-toggle` instead of moving it to `[data-role="display"]`. Pass it to `renderDanger()` and append it to a new `<section class="workspace-panel-section danger-cone-controls">` after the danger heading/legend.

- [ ] **Step 5: Style the danger toggle**

Make it a full-width 36 px control with clear active/off states, matching other inspector controls.

- [ ] **Step 6: Run focused checks**

Run:

```bash
node scripts/danger_view_cones_smoke.mjs
node scripts/route_cost_inspector_smoke.mjs
npx tsc --noEmit
```

Expected: all PASS.

- [ ] **Step 7: Commit the integration**

```bash
git add src/rendering/PixiApp.ts src/ui/TacticalWorkspaceBase.ts src/tactical-workspace.css
git commit -m "feat: add default-off danger cone control"
```

---

### Task 5: Verify the complete exact source

**Files:**
- No source changes unless verification exposes a defect.

**Interfaces:**
- Consumes: completed implementation.
- Produces: exact-head verification evidence and a deployable `dist`.

- [ ] **Step 1: Run the focused UI matrix**

```bash
node scripts/route_cost_inspector_smoke.mjs
node scripts/danger_view_cones_smoke.mjs
npm run ui-compact-route-controls:smoke
```

Expected: all PASS.

- [ ] **Step 2: Run TypeScript and production build**

```bash
npx tsc --noEmit
npx vite build
npm run deployment-pages:smoke
```

Expected: all PASS; the existing large-chunk warning is acceptable.

- [ ] **Step 3: Compare the final head with the previous accepted head**

Confirm that changes are limited to the spec/plan, focused smokes, route CSS, view-cone renderer, Pixi gating and workspace mounting.

- [ ] **Step 4: Deploy the exact final SHA to Vercel preview**

Use the repository's exact-source bootstrap deployment, record source SHA in logs, and wait for `READY`.

- [ ] **Step 5: Report evidence and limitations**

Provide the preview URL, branch, exact commit, deployment ID and passed commands. Explicitly state that browser visual verification was not run unless it actually was.