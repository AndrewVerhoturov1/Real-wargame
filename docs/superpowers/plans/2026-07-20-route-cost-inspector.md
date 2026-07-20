# Route Inspector Consolidation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the right-inspector tab «Маршрут» the single place for enabling the route-cost layer, selecting the movement profile and reading movement execution diagnostics.

**Architecture:** Keep all route state, calculation and rendering unchanged. `TacticalWorkspace` moves the already-bound profile and diagnostics DOM nodes into the inspector and owns automatic overlay activation based on the selected tab. `RouteCostOverlayUi` keeps only the cost-view selector and cost diagnostics updates.

**Tech Stack:** TypeScript 5, DOM, PixiJS 8, Vite smoke scripts.

## Global Constraints

- Work only on `feature/20260720-route-cost-inspector`, based on `real-wargame-preview`.
- Do not modify `main` or `real-wargame-preview`.
- Use Russian labels.
- Do not duplicate route state, handlers, intervals, workers, caches or full-map calculations.
- Do not run GitHub Actions, Chromium or Playwright without separate authorization.
- Redeploy the exact final feature-branch SHA because deployment was part of the original task.

---

### Task 1: Lock the revised contract

**Files:**
- Modify: `scripts/route_cost_inspector_smoke.mjs`
- Modify: `scripts/ui_compact_route_controls_smoke.ts`

**Interfaces:**
- Consumes: source files for workspace, route-cost UI and route CSS.
- Produces: assertions for automatic activation and consolidated route UI.

- [ ] Require the tab markup `data-tab="routeCost">Маршрут`.
- [ ] Require `setRouteCostOverlayActive(state, true)` on route-tab selection.
- [ ] Require `setRouteCostOverlayActive(state, false)` when another tab or mode is selected.
- [ ] Require movement-profile and route-details nodes to be appended to `[data-role="route-cost-inspector-host"]`.
- [ ] Reject `toggleRouteCostOverlay`, `data-action="route-cost-overlay"` and the old bottom quick toggle in active UI code.
- [ ] Require inspector-specific CSS for the moved profile and always-visible route details.
- [ ] Commit the failing contract before production changes.

---

### Task 2: Make the tab own overlay visibility and move existing controls

**Files:**
- Modify: `src/ui/TacticalWorkspace.ts`

**Interfaces:**
- Consumes: `setRouteCostOverlayActive(state, active)`, existing movement-profile label and existing route-details element.
- Produces: one «Маршрут» tab, one inspector host and automatic overlay activation.

- [ ] Import `setRouteCostOverlayActive`.
- [ ] Rename the inserted tab from «Стоимость маршрута» to «Маршрут».
- [ ] Locate `.unit-route-profile`, `.unit-route-details` and `.unit-bar-route-controls` after base workspace installation.
- [ ] Append the existing profile and details nodes to the inspector host; set the details element open and change its profile label to «Профиль движения».
- [ ] Add a migrated class to the lower control container so attention and turn controls reflow without empty route slots.
- [ ] On route-tab click: set the route-cost overlay active, show the inspector and request one render.
- [ ] On other tab/mode click: deactivate the route-cost overlay, restore the normal sidebar and request one render.
- [ ] Preserve teardown and restore no duplicated listeners.

---

### Task 3: Remove the redundant layer button

**Files:**
- Modify: `src/ui/RouteCostOverlayUi.ts`

**Interfaces:**
- Consumes: `[data-role="route-cost-inspector-host"]`, `getRouteCostOverlayState`, `setRouteCostOverlayMode` and existing diagnostic fields.
- Produces: explanatory copy plus one cost-view selector.

- [ ] Remove the `toggleRouteCostOverlay` import and all button creation/listeners.
- [ ] Keep the heading, explanation and `baseTerrain`/`finalCost` selector.
- [ ] Keep the 300 ms synchronisation of mode, profile, cost and reason fields.
- [ ] Keep mount-event handling and teardown.

---

### Task 4: Restyle the moved controls

**Files:**
- Modify: `src/tactical-workspace-compact-route.css`

**Interfaces:**
- Consumes: `.route-cost-inspector-panel`, `.unit-route-profile`, `.unit-route-details`, `.unit-route-details-panel` and `.route-controls-migrated`.
- Produces: normal sidebar layout without fixed popovers or empty lower-grid slots.

- [ ] Make the moved profile a full-width grid field in the inspector.
- [ ] Make the route details panel static, always visible and width-constrained by the inspector.
- [ ] Hide the moved `<summary>` because the diagnostics are continuously visible.
- [ ] Reflow the remaining lower controls into attention profile, attention mode and turn columns.

---

### Task 5: Verify and deploy

**Files:**
- No further production changes expected.

- [ ] Run `npx tsc --noEmit`.
- [ ] Run `node scripts/route_cost_inspector_smoke.mjs`.
- [ ] Run `npm run ui-compact-route-controls:smoke`.
- [ ] Run `npx vite build`.
- [ ] Run `npm run deployment-pages:smoke`.
- [ ] Record the exact remote feature SHA.
- [ ] Deploy that exact SHA to the existing Vercel preview project without enabling Git deployment.
- [ ] Require Vercel `READY` and verify `/` plus `/ai-node-editor.html` return successfully.
- [ ] Report that broad legacy `workspace:smoke` and `navigation-overlay:smoke` remain excluded for their already-observed stale unrelated assertions.