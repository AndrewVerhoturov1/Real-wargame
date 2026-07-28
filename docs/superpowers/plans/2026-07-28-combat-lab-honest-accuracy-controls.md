# Combat Lab Honest Accuracy Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Combat Lab fire only from production perception data and expose transparent controls for dispersion, aiming time, fire threshold, shooting skill, weapon-class proficiency, perception threshold, forced fire, and seeded randomness.

**Architecture:** Keep the production projectile, collision, wound, recoil, and aim-tracking pipelines authoritative. Add an optional test-owner-only override snapshot to each fire task; Combat Lab passes it explicitly, while player and AI fire tasks remain byte-for-byte on their existing defaults. Unit targets must resolve through a real perception contact; forced fire bypasses only the decision threshold and never substitutes the target unit’s true XY position.

**Tech Stack:** TypeScript, DOM controls, deterministic infantry-combat runtime, Node smoke tests, GitHub Actions preview gate, Vite production build.

## Global Constraints

- Work only on `feature/20260726-shooting-stage-09v-combat-lab` and keep PR #176 draft/unmerged.
- Preserve the production physical projectile and body-hit geometry; do not introduce a hit/miss dice roll.
- Test overrides are accepted only for `PhysicalActionOwner.source === 'test'`.
- Unit-target fire requires a real matching perception contact, including forced fire.
- Forced fire bypasses only `minimumPerceptionQuality`; it still requires physical alignment and the configured aim threshold.
- Existing non-test save/load and deterministic shot output remain compatible.
- Combat Lab controls are session-local; no named preset persistence in this change.

---

### Task 1: RED regression for honest targeting and laboratory controls

**Files:**
- Create: `scripts/combat_lab_accuracy_controls_regression_smoke.ts`
- Create: `scripts/combat_lab_accuracy_controls_regression_smoke.mjs`
- Modify: `scripts/verify_preview.mjs`

**Interfaces:**
- Consumes: `executeCombatLabCommand`, production perception contacts, fire-task runtime, source files for the Combat Lab shell.
- Produces: a gate that fails until exact-target fallback is removed and all requested controls are wired.

- [ ] **Step 1: Write the failing runtime assertions**

```ts
assert.equal(executeCombatLabCommand(state, fireCommand, context).reasonCode, 'combat_lab_target_contact_missing');
assert.equal(executeCombatLabCommand(stateWithWeakContact, fireCommand, context).reasonCode, 'combat_lab_perception_below_threshold');
assert.equal(executeCombatLabCommand(stateWithWeakContact, { ...fireCommand, forceFire: true }, context).accepted, true);
assert.deepEqual(shooter.infantryCombatRuntime.activeFireTask?.target, contactDerivedPoint);
```

- [ ] **Step 2: Write the failing override assertions**

```ts
assert.equal(task.testOverrides?.dispersionMultiplier, 2);
assert.equal(task.testOverrides?.aimTimeSeconds, 4);
assert.equal(task.testOverrides?.shootingSkill, 0.25);
assert.equal(task.testOverrides?.weaponProficiency, 'untrained');
assert.equal(task.testOverrides?.randomnessMultiplier, 0);
```

- [ ] **Step 3: Write the failing UI contract assertions**

```ts
for (const label of ['Уровень разброса', 'Время прицеливания', 'Порог прицеливания', 'Навык стрельбы', 'Владение классом оружия', 'Порог восприятия', 'Уровень случайности', 'Принудительная стрельба']) {
  assert.ok(shellSource.includes(label));
}
```

- [ ] **Step 4: Run the isolated smoke and confirm RED**

Run: `npx tsx scripts/combat_lab_accuracy_controls_regression_smoke.ts`
Expected: FAIL because the current command falls back to `unitAimPointMetres`, fire contracts lack the new fields, and the UI lacks sliders.

- [ ] **Step 5: Commit the RED test**

```bash
git add scripts/combat_lab_accuracy_controls_regression_smoke.* scripts/verify_preview.mjs
git commit -m "test: define honest Combat Lab accuracy controls"
```

### Task 2: Test-only fire-task override snapshot

**Files:**
- Modify: `src/core/infantry-combat/runtime/InfantryCombatRuntimeTypes.ts`
- Modify: `src/core/infantry-combat/runtime/FireTaskRuntimeStage8.ts`
- Modify: `src/core/infantry-combat/runtime/AimRuntime.ts`
- Modify: `src/core/infantry-combat/runtime/AimRuntimeStage5.ts`
- Modify: `src/core/infantry-combat/runtime/ShotCommitServiceStage8.ts`

**Interfaces:**
- Produces: `FireTaskTestOverridesV1`, optional `RequestFireTaskInput.testOverrides`, normalized `FireTaskRuntimeV1.testOverrides`, `getFireTaskCommitQuality(task)`, and seed-salted angular offsets.

- [ ] **Step 1: Define the optional snapshot**

```ts
export interface FireTaskTestOverridesV1 {
  readonly schemaVersion: 1;
  readonly dispersionMultiplier: number;
  readonly aimTimeSeconds: number;
  readonly shootingSkill: number;
  readonly weaponProficiency: WeaponProficiency;
  readonly randomnessMultiplier: number;
  readonly randomSeed: number;
  readonly usePhysicalAimThreshold: boolean;
}
```

- [ ] **Step 2: Accept it only from test owners and normalize it into the task**

```ts
if (input.testOverrides && input.owner.source !== 'test') return requestRejected('invalid_request', ...);
const testOverrides = normalizeFireTaskTestOverrides(input.testOverrides);
```

- [ ] **Step 3: Apply factor overrides without mutating catalog or soldier state**

```ts
const shootingSkill = overrides?.shootingSkill ?? weapon.operatorProfile.shootingSkill;
const proficiency = overrides?.weaponProficiency ?? weapon.operatorProfile.proficiencyByWeaponClass[weapon.resolved.weapon.weaponClass];
return {
  ...base,
  effectiveDispersionRadians: base.effectiveDispersionRadians * (overrides?.dispersionMultiplier ?? 1),
  aimQualityPerSecond: overrides ? 1 / overrides.aimTimeSeconds : base.aimQualityPerSecond,
};
```

- [ ] **Step 4: Separate physical aim threshold only for lab tasks**

```ts
export function getFireTaskCommitQuality(task: FireTaskRuntimeV1): number {
  return task.testOverrides?.usePhysicalAimThreshold
    ? (isAimDirectionAligned(task.aimTracking.solution) ? task.aimTracking.solution.physicalAimQuality : 0)
    : task.aimTracking.solution.usableAimQuality;
}
```

- [ ] **Step 5: Salt and scale only the random angular sample**

```ts
const dispersion = deriveSeededAngularOffsets({
  ...,
  seedSalt: task.testOverrides?.randomSeed,
  effectiveDispersionRadians: solution.effectiveDispersionRadians * (task.testOverrides?.randomnessMultiplier ?? 1),
});
```

- [ ] **Step 6: Run the regression and typecheck**

Run: `npx tsx scripts/combat_lab_accuracy_controls_regression_smoke.ts && npm run typecheck`
Expected: targeting assertions still fail; override assertions pass.

### Task 3: Honest perception gate and forced fire semantics

**Files:**
- Modify: `src/core/testing/combat-lab/CombatLabContracts.ts`
- Modify: `src/core/testing/combat-lab/CombatLabCommands.ts`
- Modify: scenario command literals as required by TypeScript.

**Interfaces:**
- Fire command adds `minimumPerceptionQuality`, `forceFire`, and `accuracyOverrides`.
- `calculatePerceptionSolutionQuality` becomes a reusable exported pure function.

- [ ] **Step 1: Extend the fire command contract**

```ts
readonly minimumPerceptionQuality: number;
readonly forceFire: boolean;
readonly accuracyOverrides: CombatLabAccuracyOverridesV1;
```

- [ ] **Step 2: Resolve a matching contact before building a unit target**

```ts
const contact = targetUnit ? resolveProductionContact(shooter, targetUnit.id) : null;
if (targetUnit && !contact) return rejected('combat_lab_target_contact_missing', ...);
```

- [ ] **Step 3: Reject weak contacts unless forced**

```ts
const quality = calculatePerceptionSolutionQuality(contactInput(contact, state));
if (!command.forceFire && quality < command.minimumPerceptionQuality) {
  return rejected('combat_lab_perception_below_threshold', ...);
}
```

- [ ] **Step 4: Build XY only from `contact.lastKnownPosition`**

```ts
const target = targetUnit
  ? { xMetres: contact.lastKnownPosition.x * metersPerCell, yMetres: contact.lastKnownPosition.y * metersPerCell, zMetres: unitAimHeightMetres(targetUnit) }
  : command.targetPointMetres;
```

- [ ] **Step 5: Pass a test-only override snapshot and real contact ID to production `requestFireTask`**

- [ ] **Step 6: Run the regression and verify GREEN for runtime behavior**

Run: `npx tsx scripts/combat_lab_accuracy_controls_regression_smoke.ts`
Expected: runtime assertions pass; UI assertions remain RED.

### Task 4: Slider UI, forced-fire button, reset, and live telemetry

**Files:**
- Modify: `src/combat-lab/ui/CombatLabShell.ts`
- Modify: `src/combat-lab/combat-lab.css`
- Modify: `src/combat-lab/CombatLabExtension.ts` only if compaction rules need adjustment.

**Interfaces:**
- Seven paired range/number controls.
- `Открыть огонь` uses the perception gate.
- `Принудительная стрельба` sends the same contact-derived shot with `forceFire: true`.
- Reset restores production-equivalent defaults for the selected shooter.

- [ ] **Step 1: Add session-local slider state**

```ts
private readonly dispersion = slider(0.25, 4, 0.05, 1);
private readonly aimTime = slider(0.1, 10, 0.1, productionAimSeconds);
private readonly aimThreshold = slider(0, 1, 0.01, 0.5);
private readonly shootingSkill = slider(0, 100, 1, 50);
private readonly proficiency = slider(0, 100, 1, 50);
private readonly perceptionThreshold = slider(0, 1, 0.01, 0.5);
private readonly randomness = slider(0, 2, 0.05, 1);
```

- [ ] **Step 2: Render human-readable current and effective values**

Show dispersion multiplier plus mrad/MOA, aiming seconds, percent thresholds, mapped proficiency class, current contact quality, uncertainty, and age.

- [ ] **Step 3: Wire normal and forced fire separately**

```ts
button('Открыть огонь', () => this.openFire(false), 'primary');
button('Принудительная стрельба', () => this.openFire(true));
```

- [ ] **Step 4: Add reset to production defaults for the selected shooter**

- [ ] **Step 5: Add compact slider CSS and keep the 1440×900 dock scrollable**

- [ ] **Step 6: Run the regression and workspace layout smoke**

Run: `npx tsx scripts/combat_lab_accuracy_controls_regression_smoke.ts && node scripts/combat_lab_workspace_layout_smoke.mjs`
Expected: PASS.

### Task 5: Full verification, PR update, and exact-SHA deployment

**Files:**
- Modify: PR #176 body/status only if needed.
- No merge to `real-wargame-preview`.

- [ ] **Step 1: Run the canonical gate**

Run: `npm run verify:preview`
Expected: all isolated checks pass, including the new accuracy regression.

- [ ] **Step 2: Run the production build**

Run: `npm run build`
Expected: Vite production build succeeds.

- [ ] **Step 3: Verify the exact branch head and GitHub Actions checks**

- [ ] **Step 4: Deploy the exact verified SHA to permanent Vercel project `repo` using the repository manual-deploy skill**

- [ ] **Step 5: Smoke `index.html`, `ai-node-editor.html`, `combat-lab.html`, and `deployment-source.json`**

- [ ] **Step 6: Report `READY FOR VERIFICATION` with branch, SHA, CI evidence, deployment ID, and Combat Lab link**
