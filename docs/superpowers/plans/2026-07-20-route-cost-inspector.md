# Route Cost Inspector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the route-cost overlay controls into a dedicated right-inspector tab and remove duplicate controls from the bottom unit bar and the top «Вид» menu.

**Architecture:** `RouteCostOverlayState` and `PixiRouteCostOverlayRenderer` remain unchanged. `TacticalWorkspaceBase` owns the new inspector tab and emits a narrow render event after creating its host. `RouteCostOverlayUi` mounts its existing toggle and mode selector into that host, while continuing to update route diagnostics in the bottom details popover.

**Tech Stack:** TypeScript 5, DOM, PixiJS 8, Vite smoke scripts.

## Global Constraints

- Base branch is `real-wargame-preview`; implementation branch is `feature/20260720-route-cost-inspector`.
- Do not modify `main` or `real-wargame-preview`.
- Russian is required for all user-facing labels.
- Do not add a second route-cost state, renderer, field build, cache, interval, worker or full-map scan.
- Do not run Playwright, Chromium or GitHub Actions without separate approval.
- Preserve bottom route diagnostics; remove only the bottom layer-control button.

---

### Task 1: Lock the UI contract with a failing smoke test

**Files:**
- Modify: `scripts/ui_compact_route_controls_smoke.ts`

**Interfaces:**
- Consumes: raw source text from `src/ui/TacticalWorkspaceBase.ts`, `src/ui/RouteCostOverlayUi.ts`, and `src/core/ui/RuntimeUiState.ts`.
- Produces: assertions describing the new single-control location.

- [ ] **Step 1: Replace stale workspace source lookup and add the new expectations**

Use `src/ui/TacticalWorkspaceBase.ts` for workspace markup. Assert that it contains:

```ts
"type SimulationTab = 'info' | 'danger' | 'positions' | 'stealth' | 'routeCost' | 'memory'"
"['routeCost', 'Стоимость маршрута']"
'data-role="route-cost-inspector-host"'
"routeCost:'Стоимость маршрута'"
```

Assert that it does not contain:

```ts
'data-action="route-cost-quick-toggle"'
```

Assert that `RouteCostOverlayUi.ts` contains:

```ts
'ROUTE_COST_INSPECTOR_RENDERED_EVENT'
'[data-role="route-cost-inspector-host"]'
'toggleRouteCostOverlay(state)'
'setRouteCostOverlayMode(state, mode.value as RouteCostOverlayMode)'
'[data-role="route-details-profile"]'
```

Assert that it does not contain:

```ts
'.workspace-display-panel'
'[data-action="route-cost-quick-toggle"]'
```

Assert that `RuntimeUiState.ts` contains `routeCost` in `SimulationLayerMode`.

- [ ] **Step 2: Run the focused smoke test and verify RED**

Run:

```bash
npm run ui-compact-route-controls:smoke
```

Expected: failure because the route-cost inspector tab and host do not yet exist.

- [ ] **Step 3: Commit the failing contract**

```bash
git add scripts/ui_compact_route_controls_smoke.ts
git commit -m "test: define route cost inspector contract"
```

---

### Task 2: Add the right-inspector tab and remove the bottom control

**Files:**
- Modify: `src/ui/TacticalWorkspaceBase.ts`
- Modify: `src/core/ui/RuntimeUiState.ts`

**Interfaces:**
- Consumes: `setSimulationLayerMode(state, mode)` and existing sidebar rendering.
- Produces: `routeCost` as a valid `SimulationLayerMode`, a `Стоимость маршрута` tab, and `[data-role="route-cost-inspector-host"]`.

- [ ] **Step 1: Extend the layer and tab unions**

Change the two unions to include `routeCost`:

```ts
export type SimulationLayerMode = 'info' | 'danger' | 'positions' | 'stealth' | 'routeCost' | 'memory';
type SimulationTab = 'info' | 'danger' | 'positions' | 'stealth' | 'routeCost' | 'memory';
```

- [ ] **Step 2: Add the tab label and remove the bottom quick toggle**

Add:

```ts
['routeCost', 'Стоимость маршрута']
```

between `Скрытность` and `Обзор и память`.

Delete:

```html
<button type="button" data-action="route-cost-quick-toggle" aria-pressed="false">Карта стоимости: выкл</button>
```

Keep the existing `unit-route-details` block unchanged.

- [ ] **Step 3: Render the inspector host and announce it**

Add the sidebar title mapping:

```ts
routeCost: 'Стоимость маршрута'
```

Add a branch before the memory branch:

```ts
} else if (tab === 'routeCost') {
  sidebarBody.innerHTML = '<div class="workspace-panel-section route-cost-inspector-panel" data-role="route-cost-inspector-host"></div>';
  window.dispatchEvent(new CustomEvent('real-wargame:route-cost-inspector-rendered'));
```

- [ ] **Step 4: Commit the workspace change**

```bash
git add src/ui/TacticalWorkspaceBase.ts src/core/ui/RuntimeUiState.ts
git commit -m "feat: add route cost inspector tab"
```

---

### Task 3: Move the existing controls into the inspector host

**Files:**
- Modify: `src/ui/RouteCostOverlayUi.ts`

**Interfaces:**
- Consumes: existing `getRouteCostOverlayState`, `toggleRouteCostOverlay`, `setRouteCostOverlayMode` and the host event `real-wargame:route-cost-inspector-rendered`.
- Produces: one mounted controls section inside `[data-role="route-cost-inspector-host"]`.

- [ ] **Step 1: Replace the display-menu and quick-toggle bindings**

Add:

```ts
const ROUTE_COST_INSPECTOR_RENDERED_EVENT = 'real-wargame:route-cost-inspector-rendered';
```

Keep one long-lived `controls`, `menuToggle`, and `mode` element. Remove the `.workspace-display-panel` query and all `quickToggle` logic.

- [ ] **Step 2: Add explicit inspector copy**

Build controls as:

```ts
controls.className = 'route-cost-controls';
controls.innerHTML = '<h3>Слой стоимости маршрута</h3><p>Показывает цену перемещения по клеткам. Итоговая стоимость использует профиль и известные данные выбранного бойца.</p>';
```

Append the existing toggle and labelled selector after this explanation.

- [ ] **Step 3: Mount only into the current inspector host**

Implement:

```ts
const mountInspectorControls = () => {
  const host = document.querySelector<HTMLElement>('[data-role="route-cost-inspector-host"]');
  if (host && controls.parentElement !== host) host.append(controls);
};
```

Call it once during installation and from a window listener for `ROUTE_COST_INSPECTOR_RENDERED_EVENT`.

- [ ] **Step 4: Preserve state synchronisation and teardown**

The existing 300 ms interval continues to synchronise mode, toggle state and bottom route diagnostics. Teardown must clear the interval, remove the event listener and remove `controls`.

- [ ] **Step 5: Run the focused smoke test and verify GREEN**

Run:

```bash
npm run ui-compact-route-controls:smoke
```

Expected: `Compact route controls and editor navigation smoke passed.`

- [ ] **Step 6: Commit the control move**

```bash
git add src/ui/RouteCostOverlayUi.ts
git commit -m "feat: mount route cost controls in inspector"
```

---

### Task 4: Verify the focused integration matrix

**Files:**
- No production changes expected.

**Interfaces:**
- Consumes: completed feature branch.
- Produces: exact command results for the final report and deployment gate.

- [ ] **Step 1: Run TypeScript**

```bash
npx tsc --noEmit
```

Expected: exit code 0.

- [ ] **Step 2: Run focused UI and overlay checks**

```bash
npm run ui-compact-route-controls:smoke
npm run navigation-overlay:smoke
npm run workspace:smoke
```

Expected: all exit code 0.

- [ ] **Step 3: Run the production build**

```bash
npm run build
```

Expected: exit code 0 with `dist/index.html` and `dist/ai-node-editor.html` verified by `deployment-pages:smoke`.

- [ ] **Step 4: Confirm branch scope**

Compare with `real-wargame-preview` and verify that only the spec, plan, focused smoke contract and the three intended runtime files changed.

- [ ] **Step 5: Publish the exact branch head**

Record the remote feature SHA. Do not transfer it into `real-wargame-preview`.

---

### Task 5: Deploy the exact feature head to Vercel

**Files:**
- No repository changes expected unless the authorized deployment build exposes a defect.

**Interfaces:**
- Consumes: exact remote feature SHA and passed focused checks.
- Produces: one READY Vercel Preview with both required pages.

- [ ] **Step 1: Resolve exact remote identity**

Record repository, branch and current remote SHA for `feature/20260720-route-cost-inspector`.

- [ ] **Step 2: Deploy through an authenticated exact-source route**

Use the connected Vercel project or another repository-approved authenticated route. Do not enable Git automatic deployments and do not create a dummy commit.

- [ ] **Step 3: Inspect build status and logs**

Require Vercel status `READY`. If the build fails, fix only this feature branch, rerun the focused checks and redeploy the corrected exact head under the same authorization.

- [ ] **Step 4: Verify both required pages exist**

Report:

```text
<preview>/
<preview>/ai-node-editor.html
```

Do not claim browser visual QA; it was not authorized.
