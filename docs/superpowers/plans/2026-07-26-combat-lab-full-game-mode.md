# Combat Lab Full Game Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/combat-lab.html` launch the complete game application and add laboratory tooling as an extension instead of maintaining a partial parallel shell.

**Architecture:** Extract the entire bootstrap from `src/main.ts` into reusable `GameApplication`. Both game and Combat Lab provide an initial `SimulationState` to that runtime. Combat Lab preserves state object identity during scenario replacement, restarts only state-bound services, and mounts a laboratory drawer plus diagnostics over the full game UI.

**Tech Stack:** TypeScript, PixiJS 8, Vite 5, DOM installers, existing simulation/runtime APIs, Node source-contract and smoke scripts.

## Global Constraints

- Do not change Stage 3–9 physical coefficients or combat semantics.
- Do not create a second Pixi `Application`, canvas, camera or ticker.
- Do not duplicate the game installer list in Combat Lab.
- Keep the ordinary game independent from Combat Lab runtime imports.
- Keep the headless Combat Lab core free of DOM, PixiJS and browser timers.
- Preserve one stable `SimulationState` object for all game UI installers during laboratory scenario replacement.
- Keep diagnostics, trails, impacts and journals bounded.
- Do not modify `real-wargame-preview` or `main`.
- Exact deployment must use one verified feature-branch SHA.

---

## File Structure

### Create

- `src/game/GameApplication.ts` — reusable owner of the complete game bootstrap and teardown.
- `src/game/GameApplicationTypes.ts` — public elements, pause, extension and context contracts.
- `src/game/GameStyles.ts` — shared side-effect imports for all game styles.
- `src/combat-lab/CombatLabExtension.ts` — laboratory drawer, session ticker and diagnostic overlay.
- `scripts/combat_lab_full_game_contract_smoke.mjs` — source contract for complete composition and stable state identity.

### Modify

- `src/main.ts` — thin ordinary-game entry.
- `combat-lab.html` — copy the game DOM shell and add only the extension root.
- `src/combat-lab/main.ts` — create visual session, full `GameApplication`, and extension.
- `src/combat-lab/runtime/CombatLabVisualSession.ts` — replace scenario contents in place.
- `src/combat-lab/ui/CombatLabShell.ts` — reduce to reusable drawer controls or migrate its logic into `CombatLabExtension`.
- `src/combat-lab/combat-lab.css` — overlay/drawer styles over the normal game UI.
- `src/combat-lab/rendering/CombatLabRenderer.ts` — remove board ownership; retain only diagnostics compatibility if needed.
- `src/rendering/PixiTacticalBoardAdapter.ts` — expose world container and existing ticker only; remove state replacement responsibility.
- `scripts/combat_lab_shared_renderer_contract_smoke.mjs` — require shared full application instead of partial board host.
- `scripts/combat_lab_ui_contract_smoke.mjs` — require full game DOM and extension boundary.
- `scripts/combat_lab_contract_smoke.mjs` — require common bootstrap and forbid direct board creation from Combat Lab.
- `scripts/verify_preview.mjs` and `package.json` — include the new contract.
- `docs/subprojects/infantry-combat-prototype-v1/SHOOTING_STAGE_9V_COMBAT_LAB.md` — describe full-game composition.

---

### Task 1: Full Game Composition Contract

**Files:**
- Create: `scripts/combat_lab_full_game_contract_smoke.mjs`
- Modify: `package.json`
- Modify: `scripts/verify_preview.mjs`

**Interfaces:**
- Consumes: current `src/main.ts`, `combat-lab.html`, `src/combat-lab/main.ts`.
- Produces: blocking contract for `GameApplication`, complete game DOM and stable state replacement.

- [ ] **Step 1: Write the failing contract**

Require these markers:

```js
assert.ok(exists('src/game/GameApplication.ts'));
assert.match(read('src/main.ts'), /GameApplication\.create/);
assert.match(read('src/combat-lab/main.ts'), /GameApplication\.create/);
assert.doesNotMatch(read('src/combat-lab/main.ts'), /PixiTacticalBoardApp\.create/);
for (const id of ['app', 'hud', 'language-toggle', 'grid-toggle', 'vision-toggle', 'height-toggle', 'pause-toggle', 'ai-editor-open', 'debug-panel', 'combat-lab-extension-root']) {
  assert.match(read('combat-lab.html'), new RegExp(`id="${id}"`));
}
for (const marker of ['installGameEditorWorkbench', 'installTacticalWorkspace', 'installCombatControls', 'installRouteCostOverlayUi', 'installSceneExportControls']) {
  assert.match(read('src/game/GameApplication.ts'), new RegExp(marker));
}
assert.match(read('src/combat-lab/runtime/CombatLabVisualSession.ts'), /replaceCombatLabStateInPlace/);
```

- [ ] **Step 2: Run the contract and confirm RED**

Run:

```bash
node scripts/combat_lab_full_game_contract_smoke.mjs
```

Expected: fail because `src/game/GameApplication.ts` is absent.

- [ ] **Step 3: Register the contract**

Add:

```json
"combat-lab-full-game-contract:smoke": "node scripts/combat_lab_full_game_contract_smoke.mjs"
```

Add the same script to `verify:preview` checks.

- [ ] **Step 4: Commit the red contract**

```bash
git add scripts/combat_lab_full_game_contract_smoke.mjs scripts/verify_preview.mjs package.json
git commit -m "test: require Combat Lab to use full game application"
```

---

### Task 2: Extract Reusable `GameApplication`

**Files:**
- Create: `src/game/GameApplicationTypes.ts`
- Create: `src/game/GameApplication.ts`
- Create: `src/game/GameStyles.ts`
- Modify: `src/main.ts`
- Test: `scripts/combat_lab_full_game_contract_smoke.mjs`

**Interfaces:**
- Produces:

```ts
export interface GameApplicationElements {
  readonly root: HTMLElement;
  readonly debugPanel: HTMLElement;
  readonly languageToggle: HTMLButtonElement;
  readonly gridToggle: HTMLButtonElement;
  readonly visionToggle: HTMLButtonElement;
  readonly heightToggle: HTMLButtonElement;
  readonly pauseToggle: HTMLButtonElement;
  readonly aiEditorOpenButton: HTMLButtonElement;
}

export interface GamePauseController {
  isPaused(): boolean;
  toggle(): void;
  setPaused(value: boolean): void;
}

export interface GameApplicationContext {
  readonly state: SimulationState;
  readonly board: PixiTacticalBoardApp;
  readonly forceRender: () => void;
  readonly addTickerListener: (listener: (ticker: Ticker) => void) => () => void;
  readonly getWorldContainer: () => Container;
  readonly restartStateBoundServices: () => void;
}

export interface GameApplicationExtension {
  destroy(): void;
}

export interface GameApplicationOptions {
  readonly mode: 'game' | 'combat-lab';
  readonly state: SimulationState;
  readonly elements: GameApplicationElements;
  readonly pauseController?: GamePauseController;
  readonly installExtension?: (context: GameApplicationContext) => GameApplicationExtension | Promise<GameApplicationExtension>;
}
```

- [ ] **Step 1: Create types and shared style imports**

Move every CSS side-effect import from `src/main.ts` into `src/game/GameStyles.ts` without changing order.

- [ ] **Step 2: Copy the entire bootstrap into `GameApplication.ts`**

Convert global variables to class fields. Keep the existing creation order, installer list, Russian control setup, native-map-quality logic and reverse-order teardown.

- [ ] **Step 3: Add state-bound service lifecycle**

Implement private methods:

```ts
private installStateBoundServices(): void;
private destroyStateBoundServices(): void;
restartStateBoundServices(): void;
```

The methods own environment material provider, `AwarenessWorldRuntime`, `TacticalPositionSearchService`, awareness field controller, combat effects, attention overlay and adaptive grid. `restartStateBoundServices` destroys then reinstalls them and forces render.

- [ ] **Step 4: Add mode-specific pause controller**

Default controller reads/writes `state.paused`. The pause button and `P` shortcut use only the selected controller. Debug pause text reads the same controller.

- [ ] **Step 5: Add extension installation**

After all normal game UI installers and board input are installed, call `options.installExtension?.(context)`. Destroy the returned extension before common installers and board teardown.

- [ ] **Step 6: Replace `src/main.ts` with a thin entry**

It must:

1. import `./game/GameStyles`;
2. load map/unit/pressure JSON;
3. create normal state;
4. collect the existing DOM IDs;
5. install `AppShellMenu` in game mode;
6. call `GameApplication.create({ mode: 'game', state, elements })`;
7. destroy the app on `beforeunload`.

- [ ] **Step 7: Run checks**

```bash
node scripts/combat_lab_full_game_contract_smoke.mjs
npm run typecheck
npm run game-editor:smoke
npm run workspace:smoke
```

Expected: contract still fails only on Combat Lab entry/HTML; ordinary game checks pass.

- [ ] **Step 8: Commit**

```bash
git add src/game src/main.ts
git commit -m "refactor: extract reusable full game application"
```

---

### Task 3: Preserve State Identity Across Scenarios

**Files:**
- Modify: `src/combat-lab/runtime/CombatLabVisualSession.ts`
- Test: `scripts/combat_lab_scenarios_smoke.ts`
- Test: `scripts/combat_lab_full_game_contract_smoke.mjs`

**Interfaces:**
- Produces:

```ts
export function replaceCombatLabStateInPlace(target: SimulationState, source: SimulationState): void;
```

`startNewRun` must preserve `const stableState = this.built.state` and set `this.built = { ...next, state: stableState }` after replacement.

- [ ] **Step 1: Add a failing identity assertion**

In `combat_lab_scenarios_smoke.ts`:

```ts
const session = new CombatLabVisualSession('rifle-distance-baseline', 9041);
const stableState = session.state;
session.startNewRun('ppsh-burst-recoil', 9043);
assert.equal(session.state, stableState);
assert.equal(session.definition.scenarioId, 'ppsh-burst-recoil');
assert.ok(session.state.units.some((unit) => unit.id === 'ppsh-shooter'));
```

- [ ] **Step 2: Run and confirm RED**

```bash
npm run combat-lab-scenarios:smoke
```

Expected: identity assertion fails.

- [ ] **Step 3: Implement in-place replacement**

Use explicit top-level assignment for every `SimulationState` field present in the source object. Do not clone workers, renderers or DOM references. The source is a newly created clean scenario state.

- [ ] **Step 4: Reset visual-session bookkeeping**

Keep the existing reset of metrics, program, pause, speed, interactive flag, checkpoint, journal and counters.

- [ ] **Step 5: Run GREEN checks**

```bash
npm run combat-lab-scenarios:smoke
npm run combat-lab-runner:smoke
npm run typecheck
```

- [ ] **Step 6: Commit**

```bash
git add src/combat-lab/runtime/CombatLabVisualSession.ts scripts/combat_lab_scenarios_smoke.ts
git commit -m "refactor: preserve laboratory state identity across scenarios"
```

---

### Task 4: Mount Combat Lab as a Full-Game Extension

**Files:**
- Modify: `combat-lab.html`
- Create: `src/combat-lab/CombatLabExtension.ts`
- Modify: `src/combat-lab/main.ts`
- Modify: `src/combat-lab/ui/CombatLabShell.ts`
- Modify: `src/combat-lab/combat-lab.css`
- Modify: `src/combat-lab/rendering/CombatLabRenderer.ts`
- Modify: `src/rendering/PixiTacticalBoardAdapter.ts`
- Test: `scripts/combat_lab_full_game_contract_smoke.mjs`
- Test: `scripts/combat_lab_ui_contract_smoke.mjs`

**Interfaces:**
- Consumes: `GameApplicationContext`, stable `CombatLabVisualSession`.
- Produces:

```ts
export class CombatLabExtension implements GameApplicationExtension {
  static create(root: HTMLElement, session: CombatLabVisualSession, context: GameApplicationContext): CombatLabExtension;
  destroy(): void;
}
```

- [ ] **Step 1: Replace Combat Lab HTML with the full game shell**

Copy the DOM from `index.html`, change title/description, change script to `/src/combat-lab/main.ts`, and append:

```html
<div id="combat-lab-extension-root" aria-label="Инструменты испытательного полигона"></div>
```

- [ ] **Step 2: Write extension boundary assertions**

Require `CombatLabExtension.create`, `context.addTickerListener`, `context.getWorldContainer`, `context.restartStateBoundServices`, and forbid `PixiTacticalBoardApp.create` in all `src/combat-lab/**` files.

- [ ] **Step 3: Convert the old shell to a drawer**

Keep scenario/seed, headless run, pause/step/speed/program, command controls, metrics, journal and checkpoint. Remove `createCombatLabLayout`, map ownership, left/right/bottom page columns and standard-game layer toolbar.

The drawer must have a collapse button. Collapsed state hides all laboratory controls and leaves the full game UI unobstructed.

- [ ] **Step 4: Implement `CombatLabExtension`**

Creation order:

1. create `CombatLabDiagnosticOverlayRenderer(context.getWorldContainer(), session)`;
2. create the drawer shell in extension root;
3. subscribe to the existing ticker;
4. advance `session`, capture/render diagnostics, refresh drawer;
5. keep authoritative `state.paused = true`.

After a new visual run or checkpoint restore that changes map/runtime contents:

```ts
context.restartStateBoundServices();
overlay.bindSession(session);
context.forceRender();
```

- [ ] **Step 5: Reduce `CombatLabRenderer`**

Either delete it and update imports, or keep a compatibility wrapper that owns only `CombatLabDiagnosticOverlayRenderer`; it must not create board DOM, buttons, services or `PixiTacticalBoardApp`.

- [ ] **Step 6: Replace Combat Lab entry**

`src/combat-lab/main.ts` must import shared game styles plus lab CSS, create `CombatLabVisualSession`, collect full game DOM elements, install `AppShellMenu`, and call:

```ts
GameApplication.create({
  mode: 'combat-lab',
  state: session.state,
  elements,
  pauseController: sessionPauseController(session),
  installExtension: (context) => CombatLabExtension.create(extensionRoot, session, context),
});
```

- [ ] **Step 7: Run GREEN checks**

```bash
node scripts/combat_lab_full_game_contract_smoke.mjs
npm run combat-lab:smoke
npm run combat-lab-ui-contract:smoke
npm run combat-lab-scenarios:smoke
npm run combat-lab-runner:smoke
npm run typecheck
```

- [ ] **Step 8: Commit**

```bash
git add combat-lab.html src/combat-lab src/rendering/PixiTacticalBoardAdapter.ts scripts/combat_lab_*.mjs
git commit -m "feat: run Combat Lab as a full game extension"
```

---

### Task 5: Documentation, Regression Gate and Preview

**Files:**
- Modify: `docs/subprojects/infantry-combat-prototype-v1/SHOOTING_STAGE_9V_COMBAT_LAB.md`
- Modify: existing Combat Lab shared-renderer spec references where they contradict the new architecture.
- Modify: `docs/ai/context-pack.md` only if deployment requirements change.

**Interfaces:**
- No new runtime interfaces.

- [ ] **Step 1: Update documentation**

Document `GameApplication`, complete game installer parity, stable state identity, extension drawer, shared pause controller and state-bound service restart.

- [ ] **Step 2: Run focused gate**

```bash
npm run docs:smoke
npm run lab:smoke
npm run combat-lab:smoke
npm run combat-lab-full-game-contract:smoke
npm run combat-lab-scenarios:smoke
npm run combat-lab-runner:smoke
npm run combat-lab-ui-contract:smoke
```

- [ ] **Step 3: Run project gate**

```bash
npm run infantry-combat-stage9:verify
npm run typecheck
npm run build
npm run verify:preview
```

- [ ] **Step 4: Verify repository state**

```bash
git diff --check 90043f503d7615f296118abf8f11cd4a85a8df6d...HEAD
git status --short
```

- [ ] **Step 5: Commit documentation**

```bash
git add docs package.json scripts
git commit -m "docs: describe full-game Combat Lab architecture"
```

- [ ] **Step 6: Deploy the exact verified SHA**

Use the project-pinned exact-source Vercel deployment. It must clone the feature branch, verify the SHA, run `verify:preview`, build all three pages, write `deployment-source.json`, and verify deployment pages.

- [ ] **Step 7: Verify live resources**

Confirm deployment state `READY` and HTTP access for `/`, `/ai-node-editor.html`, `/combat-lab.html`, and `/deployment-source.json`. Report the exact SHA and temporary protected share URL.
