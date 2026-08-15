# Polygon LIVE Unit Complete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Подключить к shell АРКИ полную LIVE-вкладку `Юнит` с настоящим selection, полным принятым read-scope, штатной сменой позы, readback и linked authoritative profiles.

**Architecture:** Интеграционная ветка начинается от точного `real-wargame-preview` `1246e1d612e648e7d7378db1c02be3bbf3d2a16a`, затем получает проверенный shell АРКИ `59a255d4e4fca86a6b1fb8c8765e3b979e28f7fc`. Новый pure presentation adapter читает `UnitModel`, а DOM inspector монтируется в typed right-panel host и пишет только через `CombatLabVisualSession.executeInteractive`. Никакого нового gameplay store/event bus нет.

**Tech Stack:** TypeScript, DOM, Vite SSR smoke tests, существующие Combat Lab/Simulation APIs.

## Global Constraints

- Не менять `real-wargame-preview`, `main` или deployment.
- Не создавать второй `selectedUnit` store или UI-копию `UnitModel`.
- Не писать `unit.behaviorRuntime.posture = ...` из нового UI.
- Не подменять HISTORY текущим LIVE `UnitModel`.
- Не добавлять fake weapon, fake wounds, fake profiles или demo values.
- Не превращать существование `fire/move/reload/...` API в новые Right Panel controls без принятого UX.
- `Инфо / Внимание / Память` остаются зоной ЛИНЗЫ.

---

### Task 1: Интеграционная база АРКИ и typed right-panel hosts

**Files:**
- Import exact ARKA tree changes from `59a255d4e4fca86a6b1fb8c8765e3b979e28f7fc`
- Modify: `src/combat-lab/ui/CombatLabWorkspaceHosts.ts`
- Modify: `src/combat-lab/ui/CombatLabWorkspaceTabs.ts`
- Test: `scripts/combat_lab_polygon_shell_contract_smoke.mjs`

**Interfaces:**
- Produces: `PolygonRightPanelTab`, `CombatLabRightPanelHosts`, `workspace.rightHosts.unit`.

- [ ] **Step 1: Import the exact ARKA shell tree into the integration branch**

Use the exact file blobs from ARKA head, preserving the integration branch parent chain from preview.

- [ ] **Step 2: Extend the host contract**

Add:

```ts
export const POLYGON_RIGHT_PANEL_DEFINITIONS = Object.freeze([
  { tabId: 'unit', labelRu: 'Юнит' },
  { tabId: 'info', labelRu: 'Инфо' },
  { tabId: 'attention', labelRu: 'Внимание' },
  { tabId: 'memory', labelRu: 'Память' },
] as const);

export type PolygonRightPanelTab = typeof POLYGON_RIGHT_PANEL_DEFINITIONS[number]['tabId'];

export interface CombatLabRightPanelHosts {
  readonly unit: HTMLElement;
  readonly info: HTMLElement;
  readonly attention: HTMLElement;
  readonly memory: HTMLElement;
}
```

`CombatLabWorkspaceTabs` must expose `readonly rightHosts: CombatLabRightPanelHosts` and put the content container, not the whole tabpanel, into this map.

- [ ] **Step 3: Keep honest empty states for tabs not yet connected**

`info/attention/memory` retain their owner-waiting messages. `unit` host is empty after construction so the PULSE inspector owns its contents.

- [ ] **Step 4: Run shell contract smoke**

Run:

```bash
node scripts/combat_lab_polygon_shell_contract_smoke.mjs
```

Expected: PASS; shell still has 4 right tabs and no duplicate runtime.

---

### Task 2: Pure LIVE Unit presentation read-model

**Files:**
- Create: `src/combat-lab/ui/CombatLabLiveUnitPresentation.ts`
- Create: `scripts/combat_lab_live_unit_presentation_smoke.ts`
- Create: `scripts/combat_lab_live_unit_presentation_smoke.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces:

```ts
export type CombatLabWeaponReadinessKind =
  | 'ready' | 'no_weapon' | 'empty' | 'reloading' | 'deploying'
  | 'undeploying' | 'engaged' | 'action_locked' | 'incapable';

export interface CombatLabLiveUnitSnapshotV1 { /* immutable presentation fields */ }
export function buildCombatLabLiveUnitSnapshot(
  unit: UnitModel,
  context?: { readonly roleLabelRu?: string | null },
): CombatLabLiveUnitSnapshotV1;
```

- [ ] **Step 1: Write failing smoke for real scenario state**

The test must:

```ts
const definition = getCombatLabScenarioDefinition('rifle-distance-baseline');
const built = buildCombatLabInitialState(definition.scenarioId, definition.revision, definition.defaultSeed);
const unit = built.state.units[0]!;
const snapshot = buildCombatLabLiveUnitSnapshot(unit, { roleLabelRu: 'Стрелок' });
assert.equal(snapshot.unitId, unit.id);
assert.equal(snapshot.roleLabelRu, 'Стрелок');
assert.equal(snapshot.posture, unit.behaviorRuntime.posture);
assert.ok(snapshot.capabilityLabelRu.length > 0);
assert.ok(snapshot.currentAction.labelRu.length > 0);
```

Then start a real posture transition and assert `currentAction.kind === 'posture_transition'`. For a unit with a primary weapon assert ammo/readiness data comes from `infantryCombatRuntime`.

- [ ] **Step 2: Run smoke and confirm failure before implementation**

Run:

```bash
node scripts/combat_lab_live_unit_presentation_smoke.mjs
```

Expected: FAIL because `CombatLabLiveUnitPresentation.ts` does not exist yet.

- [ ] **Step 3: Implement snapshot builder**

Read only from:

```ts
unit.soldier.condition
unit.behaviorRuntime
unit.playerCommand
unit.order
unit.movementRuntime
unit.infantryCombatRuntime
getEffectiveCombatCapabilities(unit)
resolveCombatLabSelectedUnitProfileLinks(unit)
```

Do not call lazy legacy weapon creation when `primaryWeapon` is absent.

- [ ] **Step 4: Implement current-action priority**

Exact priority:

```text
dead/unconscious
posture transition
first aid
reload
ammo transfer
deploy/undeploy
fire task (aiming/firing/recovery/etc.)
movement
behaviorRuntime.currentAction fallback
```

- [ ] **Step 5: Implement weapon-readiness resolver**

Return a status kind and Russian reason. `primaryWeapon === null` must produce `no_weapon`, not a synthetic Mosin.

- [ ] **Step 6: Run presentation smoke**

Expected: PASS.

---

### Task 3: LIVE Unit Right Panel view and posture write-path

**Files:**
- Create: `src/combat-lab/ui/CombatLabLiveUnitInspector.ts`
- Create: `scripts/combat_lab_live_unit_ui_contract_smoke.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `CombatLabLiveUnitSnapshotV1`, `CombatLabVisualSession`, `SimulationState`, profile-link event helper.
- Produces:

```ts
export interface CombatLabLiveUnitInspectorOptions {
  readonly host: HTMLElement;
  readonly state: SimulationState;
  readonly session: CombatLabVisualSession;
  readonly getRoleLabelRu: (unitId: string) => string | null;
  readonly editorEventRoot: HTMLElement;
}

export class CombatLabLiveUnitInspector {
  static create(options: CombatLabLiveUnitInspectorOptions): CombatLabLiveUnitInspector;
  refresh(): void;
  destroy(): void;
}
```

- [ ] **Step 1: Write failing UI contract smoke**

The source-level contract must assert:

```text
buildCombatLabLiveUnitSnapshot
session.executeInteractive
kind: 'posture'
requestCombatLabGameEditorOpen
selectedUnitId
reasonRu
```

and reject:

```text
behaviorRuntime.posture =
new selectedUnit store
```

- [ ] **Step 2: Implement empty state**

No selection -> `Выберите бойца на карте`, controls disabled/absent, no stale previous card.

- [ ] **Step 3: Implement accepted read sections**

Render compact sections:

```text
identity + role/archetype
боеспособность
health/morale/suppression/fatigue
posture controls
Приказ игрока
Действие сейчас
weapon/ammo/readiness
wounds/body summary
secondary details
linked profiles
```

- [ ] **Step 4: Implement posture command**

Button handler must:

```ts
const selectedUnitId = options.state.selectedUnitId;
if (!selectedUnitId) return;
const result = options.session.executeInteractive({
  kind: 'posture',
  unitId: selectedUnitId,
  targetPosture,
});
this.lastCommandResult = result;
this.refresh(true);
```

The rendered active posture is always the readback snapshot posture.

- [ ] **Step 5: Implement linked profiles**

Each profile link dispatches:

```ts
requestCombatLabGameEditorOpen(
  options.editorEventRoot,
  {
    editorId: link.editorId,
    ...(link.profileId ? { profileId: link.profileId } : {}),
    selectedUnitId: snapshot.unitId,
    returnTo: '/combat-lab.html?rightTab=unit',
  },
  trigger,
);
```

Do not call `selectUnit` during editor navigation.

- [ ] **Step 6: Run UI contract smoke**

Expected: PASS.

---

### Task 4: Mount inspector into Combat Lab lifecycle

**Files:**
- Modify: `src/combat-lab/CombatLabExtension.ts`
- Modify: `src/combat-lab/ui/CombatLabWorkspaceTabs.ts`
- Test: `scripts/combat_lab_live_unit_ui_contract_smoke.mjs`

**Interfaces:**
- Consumes `workspace.rightHosts.unit`.
- Extension owns one `CombatLabLiveUnitInspector` instance.

- [ ] **Step 1: Create inspector after workspace services/draft exist**

Role resolver:

```ts
getRoleLabelRu: (unitId) => (
  this.draft.getExperiment().roles.find((role) => role.unitId === unitId)?.titleRu ?? null
)
```

- [ ] **Step 2: Refresh on existing lifecycle only**

Call `liveUnitInspector.refresh()` from `handleFrame`, after selection reconciliation points, and after experiment reset/change. Do not add a new timer or global event bus.

- [ ] **Step 3: Destroy with extension**

Call `liveUnitInspector.destroy()` before workspace destruction.

- [ ] **Step 4: Verify reset/new-run stale references**

The inspector must call `getSelectedUnit(state)` on refresh. It must never retain a `UnitModel` as authoritative state between revisions.

---

### Task 5: Right Panel styling

**Files:**
- Modify: `src/combat-lab/polygon-shell.css`
- Test: `scripts/combat_lab_live_unit_ui_contract_smoke.mjs`

- [ ] **Step 1: Add scoped styles under `.polygon-live-unit-*`**

Use existing shell tokens; keep readable text and compact cards. No per-frame geometry or canvas work.

- [ ] **Step 2: Add command-result states**

Provide neutral/success/error presentation via classes, but DOM state comes from `CombatLabCommandResultV1`.

- [ ] **Step 3: Preserve responsive shell**

No fixed width wider than the existing right panel; long IDs/reasons wrap.

---

### Task 6: Integrate focused verification scripts

**Files:**
- Modify: `package.json`
- Modify if needed: `scripts/combat_lab_ui_contract_smoke.mjs`

- [ ] **Step 1: Add package script**

```json
"combat-lab-live-unit:smoke": "node scripts/combat_lab_live_unit_presentation_smoke.mjs && node scripts/combat_lab_live_unit_ui_contract_smoke.mjs"
```

- [ ] **Step 2: Include it in the relevant Combat Lab UI verification path**

Do not create or modify GitHub workflow files.

- [ ] **Step 3: Run focused matrix**

```bash
npm run combat-lab-live-unit:smoke
node scripts/combat_lab_polygon_shell_contract_smoke.mjs
npm run posture-transition:smoke
npm run combat-lab-ui-contract:smoke
npx tsc --noEmit
npm run build
```

---

### Task 7: Documentation after code is proven

**Files:**
- Modify: `docs/subprojects/polygon-html-to-product/PULSE_LIVE_UNIT_CONTRACT.md`
- Modify: `docs/subprojects/polygon-html-to-product/STATUS.md` if present on the integration documentation context; otherwise add a result note only where the subproject actually tracks implementation status.
- Create: `docs/subprojects/polygon-html-to-product/PULSE_LIVE_UNIT_IMPLEMENTATION_REPORT.md`

- [ ] **Step 1: Update planned-scope matrix**

Change self-contained partial items to `готово` only when code and focused checks prove them:

```text
Действие сейчас
Готовность оружия
profile navigation continuity contract
role/archetype separation in LIVE presentation
```

- [ ] **Step 2: Keep external dependency honest**

`HISTORY Unit at viewTime` remains blocked by ХРОНИСТ history provider. Do not mark it complete.

- [ ] **Step 3: Record exact implementation SHA/checks**

The report must include exact base, ARKA source SHA, PULSE contract SHA, feature branch, current commit, changed files, checks, blockers and next merge point.

---

### Task 8: Final diff and readiness gate

- [ ] **Step 1: Compare exact base to head**

Confirm no changes to `main`, `real-wargame-preview`, workflows or deployment configuration.

- [ ] **Step 2: Inspect every changed file**

Verify no fake data, direct runtime patch or second selection owner entered the diff.

- [ ] **Step 3: Check CI/status if remote-only execution prevents local commands**

Use GitHub status/workflow results as an independent gate where available; do not claim local commands ran if they did not.

- [ ] **Step 4: Report readiness**

```text
Статус: код готов, не задеплоен
Ветка: feature/20260816-polygon-live-unit-complete
Коммит: <exact SHA>
Проверки: <exact list>
Деплой: не запускался
```
