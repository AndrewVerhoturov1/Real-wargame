# Polygon Global Editor Inner Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every individual editor inside Polygon `Редакторы` use the accepted HTML prototype layout and visual language while preserving the real product editor owners and write paths.

**Architecture:** Keep `GameEditorRegistry` and each existing `definition.mount()` authoritative. Add a Polygon-only visible navigation projection and one scoped presentation adapter that decorates/moves existing live DOM nodes after mount and after owner re-renders. Add one dedicated CSS layer for the common prototype geometry and editor-specific variants; missing `Типы поверхностей` stays visible but disabled.

**Tech Stack:** TypeScript, DOM APIs, MutationObserver, CSS, existing Vite/TypeScript build, GitHub Actions, Playwright Chromium via the repository visual-QA skill.

## Global Constraints

- Work only on `feature/20260817-polygon-editor-inner-parity`.
- Base is `feature/20260817-polygon-six-x-integration @ ebf61178cfc777d63896eb9f56eaeb54e3ed1c32`.
- Accepted prototype is `polygon-series-v1.1-memory-v3-interface-linkage(1).html`, SHA-256 `4f33f19578698947cd629a88c6963c325895995fdd78a5380966ae1ef2fa1cfd`.
- Visible shared-editor order must be: `routeProfiles`, `tacticalPositions`, `soldierArchetypes`, `attentionProfiles`, `perceptionProfiles`, `movementProfiles`, `weapons`, `conditionProfiles`, unavailable `surfaceTypes`, `environmentProfiles`, `directionalTerrain`.
- `behaviorGraph` and `soldierData` remain valid product editors but are not visible in this Polygon shared-editor navigation.
- No fake editor data, second registry/store/runtime, or replacement write path.
- Existing live input/button nodes must be retained; presentation may move/wrap but not clone functional controls.
- Do not merge to `real-wargame-preview` or `main` without a separate explicit user command.

---

### Task 1: Lock the Polygon shared-editor contract RED

**Files:**
- Modify: `scripts/polygon_six_x_integration_smoke.mjs`
- Test: `.github/workflows/polygon-six-x-integration-contract.yml`

**Interfaces:**
- Consumes: current `CombatLabGameEditorCatalogue.ts` source and `createDefaultGameEditorRegistry.ts` source.
- Produces: static contract checks that require the prototype visible projection and a common parity adapter before implementation exists.

- [ ] **Step 1: Add failing source-contract assertions**

Add checks equivalent to:

```js
const catalogue = read('src/combat-lab/game-editors/CombatLabGameEditorCatalogue.ts');
const parity = read('src/combat-lab/game-editors/PolygonGlobalEditorParity.ts');

assert.match(catalogue, /POLYGON_GLOBAL_EDITOR_GROUPS/);
assert.match(catalogue, /surfaceTypes/);
assert.match(catalogue, /installPolygonGlobalEditorParity/);
assert.doesNotMatch(catalogue, /for \(const definition of registry\.listForSurface\('combat-lab'\)\)/);
assert.match(parity, /routeProfiles/);
assert.match(parity, /tacticalPositions/);
assert.match(parity, /soldierArchetypes/);
assert.match(parity, /attentionProfiles/);
assert.match(parity, /perceptionProfiles/);
assert.match(parity, /movementProfiles/);
assert.match(parity, /weapons/);
assert.match(parity, /conditionProfiles/);
assert.match(parity, /environmentProfiles/);
assert.match(parity, /directionalTerrain/);
```

Also assert that `createDefaultGameEditorRegistry.ts` still contains the existing authoritative mounts and does not add a fake `surfaceTypes` editor.

- [ ] **Step 2: Commit the RED contract**

```bash
git add scripts/polygon_six_x_integration_smoke.mjs
git commit -m "test: require Polygon inner editor parity"
```

- [ ] **Step 3: Run the Polygon Six-X Integration Contract**

Expected: FAIL because `PolygonGlobalEditorParity.ts` and the navigation projection do not yet exist.

---

### Task 2: Add the prototype navigation projection

**Files:**
- Modify: `src/combat-lab/game-editors/CombatLabGameEditorCatalogue.ts`
- Test: `scripts/polygon_six_x_integration_smoke.mjs`

**Interfaces:**
- Consumes: `GameEditorRegistry`, `GameEditorDefinition`, `GameEditorGroup`.
- Produces: `POLYGON_GLOBAL_EDITOR_GROUPS`, a projected `listCombatLabGameEditorGroups()` result, and disabled `surfaceTypes` navigation item.

- [ ] **Step 1: Define exact visible order**

Use a local immutable contract:

```ts
const POLYGON_GLOBAL_EDITOR_GROUPS = [
  { group: 'behavior', ids: ['routeProfiles', 'tacticalPositions'] },
  { group: 'soldier', ids: ['soldierArchetypes', 'attentionProfiles', 'perceptionProfiles', 'movementProfiles'] },
  { group: 'combat', ids: ['weapons', 'conditionProfiles'] },
  { group: 'world', ids: ['surfaceTypes', 'environmentProfiles', 'directionalTerrain'] },
] as const;
```

Build the visible list by resolving real IDs from `registry.listForSurface('combat-lab')`. Do not modify the registry itself.

- [ ] **Step 2: Render `Типы поверхностей` as disabled**

Append a disabled navigation button at the exact World-group position:

```ts
control.dataset.gameEditorId = 'surfaceTypes';
control.disabled = true;
control.setAttribute('aria-disabled', 'true');
control.title = 'Product-owner для отдельного редактора типов поверхностей пока отсутствует.';
```

The disabled item must not participate in `allItems` selection or mount logic.

- [ ] **Step 3: Remove legacy mode subtitle from visible hierarchy**

Keep the DOM node if useful for compatibility but make the editor name the only primary visible navigation label. Styling in Task 4 hides the mode subtitle.

- [ ] **Step 4: Commit the navigation projection**

```bash
git add src/combat-lab/game-editors/CombatLabGameEditorCatalogue.ts
git commit -m "fix: match Polygon global editor navigation"
```

---

### Task 3: Apply prototype presentation to every live editor

**Files:**
- Create: `src/combat-lab/game-editors/PolygonGlobalEditorParity.ts`
- Modify: `src/combat-lab/game-editors/CombatLabGameEditorCatalogue.ts`
- Test: `scripts/polygon_six_x_integration_smoke.mjs`

**Interfaces:**
- Consumes: a mounted live editor host and editor ID.
- Produces:

```ts
export type PolygonGlobalEditorId =
  | 'routeProfiles'
  | 'tacticalPositions'
  | 'soldierArchetypes'
  | 'attentionProfiles'
  | 'perceptionProfiles'
  | 'movementProfiles'
  | 'weapons'
  | 'conditionProfiles'
  | 'environmentProfiles'
  | 'directionalTerrain';

export interface PolygonGlobalEditorParityInstallation {
  destroy(): void;
}

export function installPolygonGlobalEditorParity(
  editorId: PolygonGlobalEditorId,
  host: HTMLElement,
): PolygonGlobalEditorParityInstallation;
```

- [ ] **Step 1: Create a guarded re-render adapter**

The installer must add:

```ts
host.dataset.polygonGlobalEditor = editorId;
host.classList.add('polygon-global-editor-host', `polygon-global-editor--${editorId}`);
```

Use one `MutationObserver` with a `scheduled` boolean and `queueMicrotask` to avoid observer recursion. The decorator must be idempotent and skip when its current owner DOM already has `data-polygon-parity-applied="true"`.

- [ ] **Step 2: Generalize the existing route-profile decorator**

Move the existing `decorateRouteProfileEditor`, feature cards, metadata rows, and route tab logic from `CombatLabGameEditorCatalogue.ts` into the new module. Preserve real `[data-profile-*]` controls and current feature-card live reads.

- [ ] **Step 3: Decorate standard navigation-profile editors**

For `attentionProfiles`, `movementProfiles`, `environmentProfiles`, and `directionalTerrain`:

- retain `.navigation-profile-layout`, list panel, list, actions, form panel, form header, and live fields;
- add `polygon-profile-editor` and editor-specific class;
- add a compact prototype breadcrumb/kicker derived from the live heading;
- add presentation tabs only when a meaningful real section set exists;
- tabs hide/show existing section elements; they never create editable values;
- preserve owner action buttons and inputs.

For attention use section tabs such as `Основное`, `Зрение`, `Ближний обзор`, `Режим внимания`; for movement use `Основное` plus existing group titles; for directional terrain use its existing slope group and explanation; for environment preserve its profile/material selectors and vegetation/surface group switch.

- [ ] **Step 4: Decorate gameplay-tuning editors**

For `soldierArchetypes`, `perceptionProfiles`, and `conditionProfiles`:

- mark `.gameplay-tuning-editor` as the parity root;
- retain `.gameplay-tuning-editor-list-panel` and `.gameplay-tuning-editor-form-panel`;
- style the live heading as prototype route header;
- keep `.gameplay-tuning-editor-fields` as the live field source;
- keep `.gameplay-tuning-editor-save-bar` as the bottom save bar;
- for archetypes, keep live reference selects at the beginning of the main content;
- do not unlock disabled built-in controls or alter owner validation.

- [ ] **Step 5: Decorate tactical positions**

Map the live `.tactical-position-profile-layout`, list, form, identity, group, fields, and action controls to parity classes. Preserve all `[data-tactical-*]` controls.

- [ ] **Step 6: Decorate the combat catalogue**

Map `.combat-catalog-editor`, toolbar, subtabs, list panel, form panel, groups, validation output, and live actions to parity classes. Do not alter ammo/weapon/loadout selection or draft/publish behavior.

- [ ] **Step 7: Integrate installer lifecycle**

After every successful embedded mount in `CombatLabGameEditorCatalogue.mountEmbedded`, install the parity adapter. Wrap teardown so parity destroys before/alongside the authoritative installation:

```ts
const parity = installPolygonGlobalEditorParity(selected.definition.id as PolygonGlobalEditorId, host);
this.installation = {
  beforeClose: installation.beforeClose ? () => installation.beforeClose!() : undefined,
  destroy(): void {
    parity.destroy();
    installation.destroy();
  },
};
```

- [ ] **Step 8: Commit the adapter**

```bash
git add src/combat-lab/game-editors/PolygonGlobalEditorParity.ts src/combat-lab/game-editors/CombatLabGameEditorCatalogue.ts
git commit -m "fix: adapt every Polygon global editor"
```

---

### Task 4: Match the prototype visual language for all inner editors

**Files:**
- Create: `src/combat-lab/game-editors/polygon-global-editor-inner-parity.css`
- Modify: `src/combat-lab/main.ts`
- Modify only if necessary: `src/combat-lab/game-editors/polygon-global-editor-parity.css`
- Test: `scripts/polygon_six_x_integration_smoke.mjs`

**Interfaces:**
- Consumes: stable parity classes/data attributes from Task 3.
- Produces: common prototype geometry and per-owner selectors without modifying owner logic.

- [ ] **Step 1: Import the new CSS from Combat Lab**

```ts
import './game-editors/polygon-global-editor-inner-parity.css';
```

- [ ] **Step 2: Add common geometry**

Use the prototype contract:

```css
.polygon-shell-editors-portal .combat-lab-game-editor-workspace {
  grid-template-columns: 214px minmax(0, 1fr);
}
.polygon-global-editor-host .navigation-profile-layout,
.polygon-global-editor-host .gameplay-tuning-editor,
.polygon-global-editor-host .tactical-position-profile-layout {
  grid-template-columns: 238px minmax(0, 1fr);
}
```

Use light neutral surfaces, thin borders, compact typography, fixed list column, scrollable main body, and no old dark card backgrounds.

- [ ] **Step 3: Style shared list/header/actions**

Normalize standard navigation, gameplay tuning, tactical position, environment, directional, and combat catalogue list/header/action controls to the prototype list-column treatment.

- [ ] **Step 4: Style main editor sections**

Normalize headings, tabs, field cards, text fields, ranges, numbers, selects, checkboxes, revision/status badges, validation alerts, and save bars. Retain disabled state opacity and pointer behavior.

- [ ] **Step 5: Style missing `Типы поверхностей` item**

Keep it visible in World group with subdued text, unavailable badge/tooltip affordance, and `cursor: not-allowed`; it must never look active or editable.

- [ ] **Step 6: Commit the CSS**

```bash
git add src/combat-lab/main.ts src/combat-lab/game-editors/polygon-global-editor-inner-parity.css src/combat-lab/game-editors/polygon-global-editor-parity.css
git commit -m "style: match Polygon inner editor layouts"
```

---

### Task 5: Make programmatic verification GREEN

**Files:**
- Modify if needed: `scripts/polygon_six_x_integration_smoke.mjs`
- No product file changes unless a failing contract identifies a real defect.

**Interfaces:**
- Consumes: tasks 2–4.
- Produces: exact-head CI evidence.

- [ ] **Step 1: Run Polygon Six-X Integration Contract**

Expected: PASS including the new editor parity assertions, TypeScript, and production build steps already present in the workflow.

- [ ] **Step 2: Check exact HEAD status workflows**

Confirm Preview Policy and Agent Docs Integrity remain successful; unrelated visual workflows may remain skipped.

- [ ] **Step 3: Fix only parity-related failures and rerun**

Do not weaken assertions merely to obtain green CI.

- [ ] **Step 4: Commit any verification-only correction**

Use a narrow commit such as:

```bash
git commit -am "test: lock Polygon inner editor parity"
```

---

### Task 6: Fresh deployed visual QA for every editor

**Files:**
- Temporary CI-only visual spec/branch as required by `.agents/skills/vercel-deployment-playwright-e2e/SKILL.md`.
- Product feature branch must not be modified by the visual harness.

**Interfaces:**
- Consumes: exact verified feature SHA and its Vercel Preview deployment.
- Produces: fresh PNG evidence for all 11 prototype navigation states plus exact observed SHA, console/page/network report, and cleanup.

- [ ] **Step 1: Read the visual execution skill**

Read `.agents/skills/real-wargame-screenshots/SKILL.md`, then the routed Vercel Playwright skill if direct controlled Chromium cannot access the target.

- [ ] **Step 2: Deploy only the exact feature SHA if no suitable deployment exists**

Use the repository manual Vercel deployment skill and permanent project `repo`; do not deploy `preview` or `main` implicitly.

- [ ] **Step 3: Capture each editor at 1600×900**

Open `Редакторы`, then capture:

```text
01-routeProfiles.png
02-tacticalPositions.png
03-soldierArchetypes.png
04-attentionProfiles.png
05-perceptionProfiles.png
06-movementProfiles.png
07-weapons.png
08-conditionProfiles.png
09-surfaceTypes-disabled.png
10-environmentProfiles.png
11-directionalTerrain.png
```

For the disabled entry, capture the visible World navigation showing `Типы поверхностей` unavailable; do not force-click a disabled control.

- [ ] **Step 4: Record exact identity and browser errors**

Evidence must include expected SHA, observed deployment SHA, `productShaMatch`, console errors, page errors, and failed requests.

- [ ] **Step 5: Open and inspect every key PNG**

Compare each against the accepted prototype layout. The old dark editor presentation is a visual failure. Missing capability is accepted only when represented disabled/unavailable without fake data.

- [ ] **Step 6: Iterate on visual defects**

If a screenshot fails, change the feature branch, rerun programmatic CI, redeploy the exact new SHA, and recapture the affected editor until the state is acceptable.

- [ ] **Step 7: Clean up temporary CI resources**

Close the temporary visual PR without merge and delete temporary CI branches when tooling permits. Never merge the visual harness.

- [ ] **Step 8: Final verification checkpoint**

Report exact feature SHA, CI run, deployment URL, screenshot artifact, inspected states, browser errors, visual findings, and explicitly state that no transfer to `real-wargame-preview` or `main` occurred.
