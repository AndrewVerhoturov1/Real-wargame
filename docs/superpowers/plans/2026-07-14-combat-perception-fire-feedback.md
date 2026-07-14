# Combat Perception and Fire Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make combat detection use the existing visibility system, expose global fire permission, support continued single-shot engagement, and present real shots visibly and audibly.

**Architecture:** Perception receives a shared point visibility-quality sample built from the current attention, line-of-sight and visibility-quality modules. A state-scoped combat rule gates both manual and automatic fire, while a small engagement coordinator starts one stateful shot at a time. A PixiJS 7 renderer and Web Audio helper consume real combat-event history for presentation only.

**Tech Stack:** TypeScript 5, Vite 5, PixiJS 7.4, existing smoke-test harness, GitHub Actions.

## Global Constraints

- Work only on `tmp/combat-perception-fire-feedback-20260714`.
- Do not modify AI nodes or subgraphs.
- Do not add a new perception or threat layer.
- Russian is the default user-facing language; identifiers and commit messages are English.
- Renderers display state and never become simulation sources of truth.
- Do not merge into `real-wargame-preview` or modify `main` without a separate explicit user command.
- Prepare visual QA but do not run a browser workflow without explicit approval.

---

### Task 1: Lock the detection regression with failing tests

**Files:**
- Modify: `scripts/perception_system_smoke.ts`

**Interfaces:**
- Consumes: `tickSelectedSoldierPerception`, existing attention runtime fields and personal contacts.
- Produces: regression assertions for rear cadence and shared visibility-quality diagnostics.

- [ ] Add a rear-target scenario with `nextRearCheckSeconds` in the future and all ordinary zone checks due.
- [ ] Assert that the rear target creates no visual contact and performs no line-of-sight calculation before the rear check is due.
- [ ] Set the rear check due, tick once, and assert that the existing perception pipeline begins accumulating evidence.
- [ ] Add an assertion that visual explanations include the existing view-zone quality component.
- [ ] Run `npm run perception:smoke`; expected result before implementation: failure on rear gating or missing visibility-quality explanation.

### Task 2: Route detection through existing visibility quality

**Files:**
- Create: `src/core/visibility/PointVisibility.ts`
- Modify: `src/core/perception/VisualSignal.ts`
- Modify: `src/core/perception/PerceptionSystem.ts`

**Interfaces:**
- Produces: `evaluatePointVisibility(state, observer, target, targetHeightMeters, attention): PointVisibilityResult`.
- `PointVisibilityResult` contains `lineOfSight`, `quality`, `distanceMeters` and Russian explanations.
- `evaluateVisualSignal` consumes the supplied visibility-quality factors and only adds target-specific noticeability factors.

- [ ] Implement point visibility by calling `computeLineOfSight`, `observerVisibilityCondition` and `evaluateCellVisibilityQuality`.
- [ ] Replace duplicate distance/attention/transmission/condition calculations in `VisualSignal` with the supplied quality factors.
- [ ] Use the existing rear interval for the back 90-degree sector in `PerceptionSystem` and schedule `nextRearCheckSeconds` independently.
- [ ] Keep angle checks before expensive line-of-sight work.
- [ ] Run `npm run perception:smoke`; expected result: pass.
- [ ] Run `npm run perception-performance:smoke`; expected result: pass.

### Task 3: Lock fire permission and repeated engagement with failing tests

**Files:**
- Modify: `scripts/combat_foundation_smoke.ts`

**Interfaces:**
- Consumes: planned `getFireAllowed`, `setFireAllowed`, and automatic engagement through `tickSimulation`.
- Produces: regression assertions for default deny, enabled repeated fire and disabled stop.

- [ ] Assert fire permission is disabled by default.
- [ ] Build a valid personal identified contact and assert `requestFireAction` is denied while disabled.
- [ ] Enable fire, run the real simulation and assert at least two rounds are consumed when the target remains combat-capable.
- [ ] Disable fire after a completed shot and assert no additional round is consumed.
- [ ] Run `npm run combat-foundation:smoke`; expected result before implementation: failure because combat rules do not exist.

### Task 4: Add global fire rules and continued single-shot engagement

**Files:**
- Create: `src/core/combat/CombatRules.ts`
- Create: `src/core/combat/CombatEngagement.ts`
- Modify: `src/core/combat/FireAction.ts`
- Modify: `src/core/simulation/SimulationTick.ts`

**Interfaces:**
- Produces: `isFireAllowed(state): boolean`, `setFireAllowed(state, allowed): void`, `tickAutomaticCombatEngagements(state): void`.
- `requestFireAction` remains one stateful shot and now requires fire permission.

- [ ] Implement state-scoped permission with disabled default.
- [ ] Deny new manual or automatic fire actions when disabled.
- [ ] Cancel pre-shot actions when permission is turned off; allow recovery to finish after a real shot.
- [ ] Start one shot per eligible unit after perception and before fire-action ticking.
- [ ] Re-evaluate contact, target capability, ammunition and safety before every subsequent shot.
- [ ] Run `npm run combat-foundation:smoke`; expected result: pass.
- [ ] Run `npm run runtime:smoke` and `npm run reload:smoke`; expected result: pass.

### Task 5: Lock event presentation data with failing tests

**Files:**
- Modify: `scripts/combat_foundation_smoke.ts`

**Interfaces:**
- Consumes: `getCombatEventHistory`.
- Produces: assertions that one shot has a recorded origin and a corresponding impact point/hit type.

- [ ] Assert each fired shot can be paired with its impact event by `shotId`.
- [ ] Assert origin and impact coordinates are finite.
- [ ] Run `npm run combat-foundation:smoke`; expected result: pass if current event data is sufficient, otherwise fail before the minimal event-data change.

### Task 6: Add visible and audible shot feedback

**Files:**
- Create: `src/rendering/PixiCombatEffectsRenderer.ts`
- Create: `src/rendering/CombatEffectsInstaller.ts`
- Create: `src/ui/CombatAudio.ts`
- Create: `src/ui/CombatControls.ts`
- Modify: `src/main.ts`
- Modify: `src/tactical-workspace-stage8.css`

**Interfaces:**
- `installCombatEffectsRenderer(board, state): () => void` consumes combat-event history.
- `installCombatControls(state, onChanged): () => void` inserts and maintains the global permission button.
- `unlockCombatAudio()` resumes the browser audio context from the button gesture.
- `playRifleShot()` produces a short synthetic rifle crack for each newly observed `shot_fired` event.

- [ ] Render one long-lived Pixi container with short muzzle flash, tracer, impact and hit-pulse effects.
- [ ] Pair `shot_fired` and `projectile_impact` events by `shotId`.
- [ ] Play one short rifle sound per new shot after audio unlock.
- [ ] Add the Russian-default global permission button to existing simulation controls.
- [ ] Keep effects purely presentational and bounded in count/lifetime.
- [ ] Add focused DOM/source contract checks to `scripts/tactical_workspace_smoke.mjs` or a new smoke script.
- [ ] Run `npm run workspace:smoke`; expected result: pass.
- [ ] Run `npm run build`; expected result: pass.

### Task 7: Prepare visual QA and documentation

**Files:**
- Modify: `tests/combat-foundation-visual.spec.ts`
- Modify: `docs/subprojects/ai-single-unit-editor/COMBAT_FOUNDATION_V1.md`
- Modify: `.github/workflows/combat-foundation-core.yml`
- Modify: `.github/workflows/combat-foundation-visual-qa.yml`
- Modify: `package.json` only if a new focused smoke command is added.

**Interfaces:**
- Produces: a SHA-bound Chromium scenario and documented screenshot expectations.

- [ ] Prepare screenshots proving fire-disabled observation, rear non-detection, enabled repeated fire, muzzle/tracer visibility and impact response.
- [ ] Do not execute the browser workflow without explicit user approval.
- [ ] Run focused smoke tests, `npm run docs:check` and `npm run build` through GitHub Actions.
- [ ] Review the implementation against this plan and the design spec.
- [ ] Report branch, commits, changed files, checks, remaining visual risk and transfer path.
