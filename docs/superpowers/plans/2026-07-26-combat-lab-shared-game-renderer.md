# Combat Lab Shared Game Renderer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the standalone Combat Lab canvas with the production tactical board, retain the laboratory editor and diagnostics, and add consistent navigation between all three application modes.

**Architecture:** `PixiTacticalBoardApp` becomes a configurable host whose default configuration preserves the game. Combat Lab supplies its fixed-step session as the frame driver, attaches a bounded diagnostic overlay to the shared world container, and rebuilds state-bound installers transactionally when scenarios change. `AppShellMenu` becomes the shared three-mode navigation surface.

**Tech Stack:** TypeScript, PixiJS 8, Vite 5, DOM UI, Node smoke scripts, existing simulation/runtime APIs.

## Global Constraints

- Do not change Stage 3–9 physical coefficients or production combat semantics.
- Do not create a second Pixi `Application`, ticker, camera, map renderer, or unit renderer in Combat Lab.
- Preserve the default `PixiTacticalBoardApp` behavior for the main game.
- Keep the headless Combat Lab core free of DOM, PixiJS, browser timers, and `Math.random`.
- Keep trails, impacts, journal entries, and per-frame work explicitly bounded.
- Do not add full-map scans to a frame hot path.
- Do not transfer Combat Lab state into the normal game scene or browser save.
- Every state-bound installer must have deterministic teardown.
- Current mode navigation must expose `/`, `/ai-node-editor.html`, and `/combat-lab.html` with `aria-current="page"`.
- Exact deployment SHA must pass `verify:preview`, production build, and deployment page verification before publication.

---

## File Structure

### New files

- `src/rendering/PixiTacticalBoardOptions.ts` — configuration and frame-driver interfaces for the shared board.
- `src/combat-lab/rendering/CombatLabDiagnosticOverlayRenderer.ts` — laboratory-only overlay attached to the shared world.
- `src/combat-lab/runtime/CombatLabBoardRuntime.ts` — owns board, state-bound installers, scenario-state rebinding, and teardown.
- `scripts/combat_lab_shared_renderer_contract_smoke.mjs` — architecture/navigation/lifecycle source contract.

### Modified files

- `src/rendering/PixiApp.ts` — accepts optional board configuration, exposes overlay slot, supports state replacement, and preserves game defaults.
- `src/combat-lab/runtime/CombatLabVisualSession.ts` — emits state replacement notifications and exposes a frame driver without changing fixed-step semantics.
- `src/combat-lab/ui/CombatLabShell.ts` — targets a small renderer/runtime interface rather than the removed standalone renderer; refreshes standard and laboratory layers.
- `src/combat-lab/main.ts` — bootstraps the production board runtime and shared menu.
- `src/combat-lab/combat-lab.css` — layouts the real game canvas under the laboratory panels.
- `src/shared/AppShellMenu.ts` — adds `combat-lab` mode and three current-tab navigation links.
- `src/shared/app-shell-menu.css` or the existing menu stylesheet owner — current-page visual state.
- `src/main.ts` — removes redundant editor-only navigation and uses shared menu routes.
- `src/ai-node-editor/main.ts` — installs shared menu in editor mode.
- `package.json` — registers the new contract smoke.
- `scripts/combat_lab_ui_contract_smoke.mjs` — updates assertions for the shared board and overlay.
- `scripts/combat_lab_contract_smoke.mjs` — rejects a standalone Pixi application in laboratory code.
- `docs/subprojects/infantry-combat-prototype-v1/SHOOTING_STAGE_9V_COMBAT_LAB.md` — records the shared renderer architecture.

### Removed file

- `src/combat-lab/rendering/CombatLabRenderer.ts` — standalone duplicate renderer.

---

### Task 1: Shared Board Configuration and State Replacement

**Files:**
- Create: `src/rendering/PixiTacticalBoardOptions.ts`
- Modify: `src/rendering/PixiApp.ts`
- Test: `scripts/combat_lab_shared_renderer_contract_smoke.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces:
  ```ts
  export interface PixiTacticalBoardFrameContext {
    readonly realDeltaSeconds: number;
    readonly state: SimulationState;
  }

  export interface PixiTacticalBoardOptions {
    readonly advanceFrame?: (context: PixiTacticalBoardFrameContext) => void;
    readonly attachBoardInput?: boolean;
    readonly afterRenderFrame?: () => void;
  }
  ```
- Produces on `PixiTacticalBoardApp`:
  ```ts
  replaceState(state: SimulationState): void;
  getWorldOverlayContainer(): Container;
  setGridVisible(value: boolean): void;
  setViewConesVisible(value: boolean): void;
  setHeightLabelsVisible(value: boolean): void;
  ```
- Default behavior: absent `advanceFrame` calls `tickSimulation` when state is not paused; absent `attachBoardInput` means `true`.

- [ ] **Step 1: Write the failing architecture contract**

Create `scripts/combat_lab_shared_renderer_contract_smoke.mjs` with assertions that:

```js
const options = read('src/rendering/PixiTacticalBoardOptions.ts');
assert.match(options, /interface PixiTacticalBoardOptions/);
assert.match(options, /advanceFrame\?/);
assert.match(options, /attachBoardInput\?/);

const pixiApp = read('src/rendering/PixiApp.ts');
assert.match(pixiApp, /replaceState\(state: SimulationState\)/);
assert.match(pixiApp, /getWorldOverlayContainer\(\): Container/);
assert.match(pixiApp, /this\.options\.advanceFrame/);
```

The script must fail while these interfaces are absent.

- [ ] **Step 2: Run the failing test**

Run:

```bash
node scripts/combat_lab_shared_renderer_contract_smoke.mjs
```

Expected: FAIL because `PixiTacticalBoardOptions.ts` does not exist.

- [ ] **Step 3: Implement the configuration type**

Create `PixiTacticalBoardOptions.ts` with the exact interfaces above and imports for `SimulationState`.

- [ ] **Step 4: Refactor `PixiTacticalBoardApp` minimally**

Implementation requirements:

```ts
private state: SimulationState;
private readonly options: PixiTacticalBoardOptions;
private readonly externalOverlayContainer = new Container();
```

- Add `options: PixiTacticalBoardOptions = {}` to `create` and constructor.
- Insert `externalOverlayContainer` immediately before `unitRenderer.container` or immediately after standard effects according to existing layering contract; document the chosen order.
- In ticker:
  ```ts
  const realDeltaSeconds = ticker.elapsedMS / 1000;
  if (this.options.advanceFrame) {
    this.options.advanceFrame({ realDeltaSeconds, state: this.state });
  } else if (!this.getPaused()) {
    tickSimulation(this.state, realDeltaSeconds);
  }
  this.renderFrame();
  this.options.afterRenderFrame?.();
  ```
- Attach/destroy `BoardInputController` only when `attachBoardInput !== false`.
- `replaceState` assigns the new state, updates fixed-scale text, invalidates map render, clears renderer caches that retain old state-derived labels, and calls `renderNow`.
- Public visibility setters update the same private booleans used by existing buttons and call render.

- [ ] **Step 5: Run TypeScript and contract tests**

```bash
npm run typecheck
node scripts/combat_lab_shared_renderer_contract_smoke.mjs
```

Expected: both PASS.

- [ ] **Step 6: Commit**

```bash
git add src/rendering/PixiTacticalBoardOptions.ts src/rendering/PixiApp.ts scripts/combat_lab_shared_renderer_contract_smoke.mjs package.json
git commit -m "refactor: make tactical board reusable by Combat Lab"
```

---

### Task 2: Laboratory Diagnostic Overlay on the Shared World

**Files:**
- Create: `src/combat-lab/rendering/CombatLabDiagnosticOverlayRenderer.ts`
- Remove: `src/combat-lab/rendering/CombatLabRenderer.ts`
- Modify: `scripts/combat_lab_contract_smoke.mjs`
- Modify: `scripts/combat_lab_ui_contract_smoke.mjs`

**Interfaces:**
- Consumes: `Container` from `PixiTacticalBoardApp.getWorldOverlayContainer()` and `CombatLabVisualSession`.
- Produces:
  ```ts
  export interface CombatLabRenderControls {
    setLayerEnabled(layerId: CombatLabDiagnosticLayerId, enabled: boolean): void;
    isLayerEnabled(layerId: CombatLabDiagnosticLayerId): boolean;
    clearHistory(): void;
    forceRender(): void;
  }

  export class CombatLabDiagnosticOverlayRenderer implements CombatLabRenderControls {
    constructor(root: Container, session: CombatLabVisualSession);
    bindSession(session: CombatLabVisualSession): void;
    captureFrame(): void;
    destroy(): void;
  }
  ```

- [ ] **Step 1: Extend the failing contract**

Add assertions:

```js
const overlay = read('src/combat-lab/rendering/CombatLabDiagnosticOverlayRenderer.ts');
assert.doesNotMatch(overlay, /new Application\s*\(/);
assert.doesNotMatch(overlay, /app\.init\s*\(/);
assert.doesNotMatch(overlay, /drawMetreGrid|mapWidthPx|mapHeightPx/);
assert.match(overlay, /MAX_COMBAT_LAB_TRAIL_POINTS/);
assert.match(overlay, /bindSession\(/);
assert.equal(exists('src/combat-lab/rendering/CombatLabRenderer.ts'), false);
```

- [ ] **Step 2: Run and observe failure**

```bash
node scripts/combat_lab_shared_renderer_contract_smoke.mjs
npm run combat-lab-ui-contract:smoke
```

Expected: FAIL because standalone renderer still exists and new overlay is absent.

- [ ] **Step 3: Implement the overlay**

- Reuse bounded trail capture and diagnostic layer state from the old renderer.
- Render in game world coordinates using `state.map.cellSize` for units and published metre-to-world conversion for projectiles.
- Do not draw terrain, grid, ordinary unit bodies, selection rings, or the ordinary combat effect set.
- Keep only laboratory diagnostics from the design spec.
- On `bindSession`, clear trails, labels, projectile lookup maps, and replace the session reference.
- On `destroy`, remove its root container from the supplied parent and destroy only its own children.

- [ ] **Step 4: Remove the old renderer and update contracts**

Delete `CombatLabRenderer.ts`. Update import assertions and forbidden scans to require the new renderer and reject `Application` in all `src/combat-lab/**` rendering files.

- [ ] **Step 5: Run checks**

```bash
npm run typecheck
npm run combat-lab:smoke
npm run combat-lab-ui-contract:smoke
node scripts/combat_lab_shared_renderer_contract_smoke.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/combat-lab/rendering scripts/combat_lab_contract_smoke.mjs scripts/combat_lab_ui_contract_smoke.mjs
git commit -m "refactor: render Combat Lab diagnostics over game board"
```

---

### Task 3: Combat Lab Board Runtime and Scenario Rebinding

**Files:**
- Create: `src/combat-lab/runtime/CombatLabBoardRuntime.ts`
- Modify: `src/combat-lab/runtime/CombatLabVisualSession.ts`
- Modify: `src/combat-lab/main.ts`
- Modify: `src/combat-lab/ui/CombatLabShell.ts`
- Modify: `src/combat-lab/combat-lab.css`
- Test: `scripts/combat_lab_shared_renderer_contract_smoke.mjs`
- Test: `scripts/combat_lab_ui_contract_smoke.mjs`

**Interfaces:**
- Produces:
  ```ts
  export interface CombatLabBoardRuntimeView extends CombatLabRenderControls {
    replaceScenarioState(): void;
    setStandardLayerEnabled(layerId: CombatLabStandardLayerId, enabled: boolean): void;
    forceRender(): void;
    destroy(): void;
  }

  export class CombatLabBoardRuntime implements CombatLabBoardRuntimeView {
    static create(layout: CombatLabLayoutV1, session: CombatLabVisualSession, onFrame: () => void): Promise<CombatLabBoardRuntime>;
  }
  ```
- `CombatLabShell` consumes `CombatLabBoardRuntimeView`, not a concrete renderer.
- `CombatLabVisualSession.startNewRun` continues returning `void`; shell calls `runtime.replaceScenarioState()` immediately after it.

- [ ] **Step 1: Write failing lifecycle assertions**

Assert that `CombatLabBoardRuntime.ts`:

```js
assert.match(runtime, /PixiTacticalBoardApp\.create/);
assert.match(runtime, /installCombatEffectsRenderer/);
assert.match(runtime, /installAttentionOverlayRenderer/);
assert.match(runtime, /replaceScenarioState\(/);
assert.match(runtime, /destroyStateBoundServices/);
assert.match(runtime, /board\.replaceState\(this\.session\.state\)/);
```

Assert that `src/combat-lab/main.ts` calls `installAppShellMenu({ mode: 'combat-lab' })` and does not import `CombatLabRenderer`.

- [ ] **Step 2: Run failing contracts**

```bash
node scripts/combat_lab_shared_renderer_contract_smoke.mjs
npm run combat-lab-ui-contract:smoke
```

Expected: FAIL because runtime and shared bootstrap are absent.

- [ ] **Step 3: Implement `CombatLabBoardRuntime`**

Creation sequence:

1. Install environment and movement registries on `session.state`.
2. Create awareness runtime, tactical position search service, and field controller.
3. Create `PixiTacticalBoardApp` with:
   ```ts
   {
     advanceFrame: ({ realDeltaSeconds }) => {
       const changed = session.advance(realDeltaSeconds);
       if (changed) diagnosticOverlay.captureFrame();
     },
     attachBoardInput: true,
     afterRenderFrame: onFrame,
   }
   ```
4. Install common combat effects, attention overlay, and adaptive grid LOD.
5. Attach `CombatLabDiagnosticOverlayRenderer` to board overlay container.
6. Start board.

`replaceScenarioState` must destroy state-bound services first, call `board.replaceState`, bind overlay to the current session, then recreate state-bound services. It must not recreate `Application`, camera, canvas, or shell DOM.

- [ ] **Step 4: Refactor shell renderer dependency**

Replace concrete renderer import with `CombatLabBoardRuntimeView`. On new visual run:

```ts
this.session.startNewRun(scenarioId, seed);
this.runtime.replaceScenarioState();
this.refreshScenarioControls();
this.refreshLive(true);
```

Add a compact section for standard game layers. It changes existing `state.editor.layers` flags and board view-cone/grid/height setters. Keep laboratory layers in their existing separate section.

- [ ] **Step 5: Refactor entry point and layout**

`main.ts` installs the shared shell menu, creates the session/layout/runtime/shell, and destroys shell/runtime subscriptions on unload. CSS gives the shared canvas a stable central area and accounts for `.with-app-shell-menu` height.

- [ ] **Step 6: Verify**

```bash
npm run typecheck
npm run combat-lab:smoke
npm run combat-lab-scenarios:smoke
npm run combat-lab-runner:smoke
npm run combat-lab-ui-contract:smoke
node scripts/combat_lab_shared_renderer_contract_smoke.mjs
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/combat-lab src/rendering scripts/combat_lab_shared_renderer_contract_smoke.mjs scripts/combat_lab_ui_contract_smoke.mjs
git commit -m "feat: host Combat Lab on the production tactical board"
```

---

### Task 4: Three-Mode Shared Navigation

**Files:**
- Modify: `src/shared/AppShellMenu.ts`
- Modify: the stylesheet that owns `.app-shell-menu`
- Modify: `src/main.ts`
- Modify: `src/ai-node-editor/main.ts`
- Modify: `src/combat-lab/main.ts`
- Test: `scripts/combat_lab_shared_renderer_contract_smoke.mjs`
- Test: existing app-shell/menu smoke if present

**Interfaces:**
- Produces:
  ```ts
  export type AppShellMenuMode = 'game' | 'editor' | 'combat-lab' | 'launcher';
  ```
- Produces stable anchors:
  ```html
  <a href="/" data-shell-mode="game">Игра</a>
  <a href="/ai-node-editor.html" data-shell-mode="editor">Редактор ИИ</a>
  <a href="/combat-lab.html" data-shell-mode="combat-lab">Испытательный полигон</a>
  ```
- Current anchor has `aria-current="page"`.

- [ ] **Step 1: Write failing navigation assertions**

```js
assert.match(menu, /'combat-lab'/);
for (const path of ['/', '/ai-node-editor.html', '/combat-lab.html']) assert.ok(menu.includes(path));
assert.match(menu, /aria-current/);
assert.match(aiEntry, /installAppShellMenu\(\{ mode: 'editor' \}\)/);
assert.match(labEntry, /installAppShellMenu\(\{ mode: 'combat-lab' \}\)/);
```

- [ ] **Step 2: Run and observe failure**

```bash
node scripts/combat_lab_shared_renderer_contract_smoke.mjs
```

Expected: FAIL because menu lacks Combat Lab.

- [ ] **Step 3: Implement links and active state**

- Render the three mode anchors in all modes.
- Navigate in the same tab.
- Keep mode-specific secondary actions after the mode switcher.
- Style the current anchor and preserve keyboard focus visibility.
- Install menu at the earliest editor entry side effect.
- Remove or demote the redundant game `ai-editor-open` button so navigation has one canonical surface.

- [ ] **Step 4: Verify navigation contracts and typecheck**

```bash
node scripts/combat_lab_shared_renderer_contract_smoke.mjs
npm run typecheck
npm run build
```

Expected: PASS and all three HTML entries generated.

- [ ] **Step 5: Commit**

```bash
git add src/shared src/main.ts src/ai-node-editor/main.ts src/combat-lab/main.ts scripts/combat_lab_shared_renderer_contract_smoke.mjs
git commit -m "feat: add shared navigation for all application modes"
```

---

### Task 5: Documentation, Full Verification, and Preview

**Files:**
- Modify: `docs/subprojects/infantry-combat-prototype-v1/SHOOTING_STAGE_9V_COMBAT_LAB.md`
- Modify: `docs/ai/context-pack.md`
- Modify: generated repo context only through the repository's documented sync command
- Modify: `package.json` if the new smoke is not yet in aggregate scripts

**Interfaces:**
- No new runtime interface.
- Deployment source must identify exact branch and SHA.

- [ ] **Step 1: Update documentation**

Document:

- Combat Lab uses `PixiTacticalBoardApp`.
- `CombatLabDiagnosticOverlayRenderer` is additive only.
- Session owns fixed-step time.
- Scenario replacement rebinds state-bound services.
- All three modes use `AppShellMenu`.

- [ ] **Step 2: Run documentation sync and checks**

```bash
npm run docs:sync
npm run docs:smoke
```

Expected: PASS with no generated-context drift.

- [ ] **Step 3: Run focused Combat Lab gate**

```bash
npm run combat-lab:smoke
npm run combat-lab-scenarios:smoke
npm run combat-lab-runner:smoke
npm run combat-lab-ui-contract:smoke
node scripts/combat_lab_shared_renderer_contract_smoke.mjs
```

Expected: PASS.

- [ ] **Step 4: Run complete project gate**

```bash
npm run lab:smoke
npm run infantry-combat-stage9:verify
npm run typecheck
npm run build
npm run verify:preview
```

Expected: all commands exit 0. The build output includes `index.html`, `ai-node-editor.html`, and `combat-lab.html`.

- [ ] **Step 5: Inspect repository state**

```bash
git diff --check 90043f503d7615f296118abf8f11cd4a85a8df6d...HEAD
git status --short
```

Expected: no whitespace errors and no untracked or unstaged implementation files.

- [ ] **Step 6: Commit documentation**

```bash
git add docs package.json scripts
git commit -m "docs: describe shared-renderer Combat Lab"
```

- [ ] **Step 7: Deploy exact verified SHA**

Use the repository manual Vercel deployment skill. The deployment must clone and verify the exact feature branch SHA, run `verify:preview`, run `build:app`, write `deployment-source.json`, and verify all three pages before publishing.

- [ ] **Step 8: Verify live resources**

Confirm HTTP 200 for:

- `/`
- `/ai-node-editor.html`
- `/combat-lab.html`
- `/deployment-source.json`

Confirm `deployment-source.json` contains the exact verified SHA. Report the direct Combat Lab URL and exact source SHA.
