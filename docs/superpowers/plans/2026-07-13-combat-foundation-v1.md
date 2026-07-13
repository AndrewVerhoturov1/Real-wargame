# Combat Foundation v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a complete deterministic two-soldier rifle firefight loop using subjective contacts, timed fire actions, ballistic geometry, and minimal incapacitation.

**Architecture:** Add focused combat modules beside the existing perception and AI runtime. `SimulationTick` advances all-unit perception and combat; AI fire effects only request a stateful action; ballistics and damage are independent pure systems. The selected-unit visibility texture remains selected-only.

**Tech Stack:** TypeScript 5, Vite 5 SSR smoke scripts, PixiJS 7, existing browser/local simulation runtime.

## Global Constraints

- Work only on `tmp/combat-foundation-v1-20260713`, based on `real-wargame-preview`.
- Do not modify `main` or transfer to `real-wargame-preview` without a separate explicit user command.
- Development identifiers and code remain English; Russian UI copy remains complete and default.
- `SimulationTick` remains the only time owner.
- Perception and AI may not read hidden hostile positions as known information.
- No per-unit visibility textures and no frame-updated bullet entities.
- Visual QA is prepared but not run without explicit user permission.

---

### Task 1: Contract smoke tests and workflow

**Files:**
- Create: `scripts/combat_foundation_smoke.ts`
- Create: `scripts/combat_foundation_smoke.mjs`
- Modify: `package.json`
- Create: `.github/workflows/combat-foundation-core.yml`

**Interfaces:**
- Produces executable contracts for all later tasks.

- [ ] Write failing imports and behavioral assertions for side relations, all-unit perception, weapon runtime, hit shapes, ballistics, fire phases, and damage.
- [ ] Add `combat-foundation:smoke` to `package.json`.
- [ ] Add a PR workflow running the new smoke test, existing perception/runtime tests, and `npm run build`.
- [ ] Confirm the first PR run fails because production modules are missing.

### Task 2: Sides and real-unit stimuli

**Files:**
- Modify: `src/core/units/UnitModel.ts`
- Create: `src/core/units/SideRelations.ts`
- Modify: `src/core/perception/PerceptionStimulus.ts`
- Modify: `src/core/perception/PerceptionContact.ts`

**Interfaces:**
- Produces: `getSideRelation`, `areUnitsHostile`, unit stimuli carrying `sourceUnitId`.

- [ ] Add blue/red sides with legacy `player` migration to blue.
- [ ] Add side relation helpers.
- [ ] Emit unit stimuli for every other active unit.
- [ ] Store `sourceUnitId` on contacts while preserving last-known subjective position.
- [ ] Make active-threat filtering exclude incapacitated/dead units.

### Task 3: Perception for all active units

**Files:**
- Modify: `src/core/perception/PerceptionSystem.ts`
- Modify: `src/core/simulation/SimulationTick.ts`
- Modify: `src/core/perception/PerceptionDiagnostics.ts`

**Interfaces:**
- Produces: `tickUnitPerception`, `tickAllUnitPerception`; keeps `tickSelectedSoldierPerception` as compatibility wrapper if needed.

- [ ] Generalize the selected-unit loop to a supplied observer.
- [ ] Tick every combat-capable observer.
- [ ] Keep selected-unit diagnostics/heatmap separate from simulation perception.
- [ ] Verify selection changes do not affect contact acquisition.

### Task 4: Weapon definition and runtime

**Files:**
- Create: `src/core/combat/WeaponModel.ts`
- Modify: `src/core/units/UnitModel.ts`
- Modify: `src/core/behavior/BehaviorModel.ts`
- Modify: `src/core/ai/runtime/actions/ReloadAction.ts`
- Modify: `src/core/ai/AiGameBridge.ts`

**Interfaces:**
- Produces: `WeaponDefinition`, `WeaponRuntimeState`, `createDefaultWeaponRuntime`, `syncLegacyWeaponFields`.

- [ ] Add the v1 rifle definition.
- [ ] Normalize per-unit weapon state from scene data or legacy ammo.
- [ ] Synchronize legacy blackboard fields from weapon state.
- [ ] Reload loaded rounds from reserve over stateful simulation time.
- [ ] Ensure cancelled reloads do not create ammunition.

### Task 5: Posture-aware hit shapes

**Files:**
- Create: `src/core/combat/UnitHitShapes.ts`

**Interfaces:**
- Produces: `getUnitHitShapes(unit, map)` and `intersectRayWithUnitHitShapes(...)`.

- [ ] Define head, torso, and limb shapes in metres.
- [ ] Orient prone geometry by unit facing.
- [ ] Include vertical ranges for terrain-aware rays.
- [ ] Return the nearest zone intersection.

### Task 6: Ballistic raycast and combat events

**Files:**
- Create: `src/core/combat/CombatEvents.ts`
- Create: `src/core/combat/BallisticRaycast.ts`
- Modify: `src/core/simulation/SimulationState.ts`

**Interfaces:**
- Produces: `traceProjectile`, `queueCombatEvent`, `drainDueCombatEvents`.

- [ ] Trace smooth terrain at fixed metre intervals.
- [ ] Intersect rotated map-object bounds and unit hit shapes.
- [ ] Return the nearest hit and flight time.
- [ ] Keep forest non-blocking for v1 ballistics.
- [ ] Store events as plain deterministic data in simulation state.

### Task 7: Minimal damage and combat capability

**Files:**
- Create: `src/core/combat/CombatDamage.ts`
- Modify: `src/core/units/UnitModel.ts`
- Modify: `src/core/simulation/SimulationTick.ts`

**Interfaces:**
- Produces: `applyUnitHit`, `isUnitCombatCapable`, movement/aim modifiers.

- [ ] Add effective/wounded/severely_wounded/incapacitated/dead states.
- [ ] Apply deterministic zone outcomes from shot ID.
- [ ] Stop movement, fire, and new AI actions for incapacitated/dead units.
- [ ] Apply simple wound penalties to movement and aim.

### Task 8: Stateful fire action

**Files:**
- Create: `src/core/combat/FireAction.ts`
- Create: `src/core/combat/CombatDecision.ts`
- Modify: `src/core/units/UnitModel.ts`
- Modify: `src/core/ai/AiGameBridge.ts`
- Modify: `src/core/simulation/SimulationTick.ts`

**Interfaces:**
- Produces: `requestFireAction`, `tickFireAction`, `cancelFireAction`, `FireActionState`.

- [ ] Start fire only from a valid personal contact.
- [ ] Advance acquire, turn, ready, aim, safety, fire, and recovery phases using simulation time.
- [ ] Compute deterministic angular error from contact uncertainty, weapon, skill, posture, wounds, suppression, stress, movement, and recoil.
- [ ] Block AI fire when a friendly unit intersects the ballistic corridor.
- [ ] Consume ammunition and emit shot sound/flash only in the firing phase.
- [ ] Schedule ballistic impact and apply due hit events.

### Task 9: Blackboard and UI diagnostics

**Files:**
- Modify: `src/core/ai/AiGameBridge.ts`
- Modify: `src/ui/TacticalWorkspace.ts`
- Modify: `src/ui/AttentionRuntimePanel.ts`
- Modify: `src/rendering/PixiUnitRenderer.ts` or current unit renderer

**Interfaces:**
- Exposes weapon, fire phase, target contact, line-of-fire reason, last shot result, and capability without leaking hidden coordinates.

- [ ] Publish compatible ammo/ready fields and new combat diagnostics.
- [ ] Show compact Russian weapon/action/capability information.
- [ ] Give blue/red units distinct presentation.
- [ ] Add optional diagnostic hit-shape and shot-trace model without enabling it by default.

### Task 10: Integration, documentation, and regression

**Files:**
- Modify: `docs/subprojects/ai-single-unit-editor/subproject.json`
- Create: `docs/subprojects/ai-single-unit-editor/COMBAT_FOUNDATION_V1.md`
- Modify: generated status files via `npm run docs:generate` where required.

**Interfaces:**
- Produces a documented temporary-branch handoff and verified commit.

- [ ] Run `npm run combat-foundation:smoke`.
- [ ] Run perception, runtime, reload, movement, workspace, map-resolution, and build checks.
- [ ] Fix all regressions without weakening tests.
- [ ] Record honest limitations and manual verification steps.
- [ ] Keep the branch isolated from preview.
