# Physical Weapon Reload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make weapon reload a deterministic, serializable physical action that consumes simulation time while `WeaponRuntimeState` remains the only owner of ammunition and weapon readiness.

**Architecture:** Extend the existing `behaviorRuntime.physicalAction` slot with a minimal discriminated union for `posture_transition` and `weapon_reload`. Keep posture logic and reload logic in focused modules, dispatch both through one physical-action clock, and pass only the unused tick remainder to legacy combat and movement. All legacy ammo and readiness fields become compatibility mirrors synchronized from `WeaponRuntimeState`; Graph v2 reload paths can request or report the physical action but cannot set ammunition.

**Tech Stack:** TypeScript 5, Vite 5 SSR smoke harnesses, deterministic simulation tick, Node assert-based smoke tests.

## Global Constraints

- Base commit is exactly `c11e7695465e4a9286690595ac8f1f30fa5c95c3`.
- Work only on `feature/20260721-physical-weapon-reload`.
- Use only `behaviorRuntime.physicalAction`; do not add a reload WeakMap or second physical-action slot.
- Do not move `FireAction` into `physicalAction`.
- Do not add new Graph v2 decision nodes or automatic reload policy.
- Do not run GitHub Actions, Chromium or Playwright.
- Do not create a PR, merge, transfer or deploy.
- `WeaponRuntimeState.roundsLoaded + roundsReserve` must remain invariant across reload start and cancellation.
- Ammunition transfer happens once, only when the physical reload completes.
- Tests are written and observed failing before production implementation.

---

## File Structure

- `src/core/actions/PhysicalAction.ts`: shared physical-action owner, status, result and discriminated-union contract; serialization and normalization dispatch.
- `src/core/actions/PostureTransition.ts`: posture-specific request, tick and diagnostics; uses shared contract and rejects running reload canonically.
- `src/core/actions/WeaponReload.ts`: reload request, ownership, cancellation, tick, completion transfer, normalization and diagnostics.
- `src/core/actions/PhysicalActionClock.ts`: one time-budget dispatcher for posture and reload; returns the unused part of a simulation tick.
- `src/core/combat/WeaponModel.ts`: canonical weapon runtime, compatibility mirrors and legacy `reloadWeapon` wrapper that requests physical reload.
- `src/core/combat/FireAction.ts`: mutual exclusion between reload and fire/pending aim.
- `src/core/simulation/SimulationTick.ts`: advances the single physical-action slot before legacy combat/movement.
- `src/core/simulation/SimulationTickLegacy.ts`: treats any running physical action as body occupancy for labels and translation.
- `src/core/units/UnitModel.ts`: restores weapon first, normalizes the physical action against that weapon, and derives legacy fields.
- `src/core/ai/AiGameBridge.ts`: redirects legacy and stateful reload effects to physical reload requests; no direct ammo/readiness writes.
- `src/core/ai/runtime/actions/ReloadAction.ts`: removes arbitrary `targetAmmo` ownership and emits compatibility lifecycle signals only.
- `src/ui/SceneExport.ts`: exports canonical weapon plus the active physical reload consistently.
- `scripts/physical_reload_smoke.mjs`: Vite SSR wrapper without top-level-await recursion hazards.
- `scripts/physical_reload_suite.ts`: deterministic physical reload scenarios.
- `scripts/ai_reload_runtime_smoke.ts`: Graph v2 compatibility assertions that no effect contains an arbitrary refill target.
- `package.json`: adds `physical-reload:smoke`.

---

### Task 1: Lock the physical reload contract with failing tests

**Files:**
- Create: `scripts/physical_reload_smoke.mjs`
- Create: `scripts/physical_reload_suite.ts`
- Modify: `scripts/ai_reload_runtime_smoke.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: current `createInitialState`, `tickSimulation`, `getWeaponRuntime`, `replaceWeaponRuntime`, posture request and fire request APIs.
- Produces: executable `npm run physical-reload:smoke` covering the 28 required invariants.

- [ ] Write tests proving reload start does not transfer rounds and sets a running `weapon_reload` physical action.
- [ ] Write completion, capacity, reserve and total-round invariant tests.
- [ ] Write ownership, duplicate request and cancellation tests.
- [ ] Write combat-capability, posture, aiming, firing and pending-intent conflict tests.
- [ ] Write route pause/remainder/different-step-size determinism tests.
- [ ] Write export/import, mid-action restore, exactly-once completion and damaged-save normalization tests.
- [ ] Update Graph reload tests so `targetAmmo` is forbidden and old `SetAction(reload)` cannot create rounds.
- [ ] Run `npm run physical-reload:smoke` and confirm it fails because the physical reload API and action type do not exist.
- [ ] Commit the red tests separately.

### Task 2: Add the shared discriminated physical-action contract

**Files:**
- Create: `src/core/actions/PhysicalAction.ts`
- Modify: `src/core/actions/PostureTransition.ts`
- Modify: `src/core/actions/PostureTransitionClock.ts`

**Interfaces:**
- Produces: `UnitPhysicalAction = PostureTransitionActionV1 | WeaponReloadActionV1`, `isPhysicalActionRunning`, `normalizeUnitPhysicalAction`, `serializeUnitPhysicalAction`.
- Preserves: existing posture public APIs and result codes.

- [ ] Move only shared owner/status/result fields into the shared module without creating a generic action scheduler.
- [ ] Keep posture normalization behavior stable.
- [ ] Add canonical type-based conflict checks between posture and reload.
- [ ] Run posture and physical reload tests; keep posture tests green while reload tests advance to the next missing behavior.
- [ ] Commit the shared contract.

### Task 3: Implement canonical timed reload

**Files:**
- Create: `src/core/actions/WeaponReload.ts`
- Create: `src/core/actions/PhysicalActionClock.ts`
- Modify: `src/core/combat/WeaponModel.ts`

**Interfaces:**
- Produces: `requestWeaponReload`, `cancelWeaponReload`, `cancelWeaponReloadBySystem`, `tickWeaponReload`, `getRunningWeaponReload`, `getWeaponReloadDiagnostics`.
- `reloadWeapon` remains a compatibility wrapper and returns a stable command result rather than transferring rounds.

- [ ] Validate combat capability, weapon existence, magazine need, reserve, physical-action conflict, fire action and pending aim.
- [ ] Snapshot loaded/reserve counts and precompute `maximumTransferRounds` at start.
- [ ] Mark weapon not ready and stop physical translation without deleting the route.
- [ ] Advance progress using `WeaponDefinition.reloadTimeSeconds`.
- [ ] On completion, recalculate the safe transfer bound from current canonical runtime and apply it once.
- [ ] On cancellation/failure, transfer zero rounds and resynchronize compatibility mirrors.
- [ ] Normalize malformed reload actions deterministically with stable result/diagnostic codes.
- [ ] Run `physical-reload:smoke` and commit the canonical reload implementation.

### Task 4: Integrate time budgets, movement and fire exclusion

**Files:**
- Modify: `src/core/simulation/SimulationTick.ts`
- Modify: `src/core/simulation/SimulationTickLegacy.ts`
- Modify: `src/core/combat/FireAction.ts`

**Interfaces:**
- Consumes: `tickPhysicalActionWithTimeBudget`.
- Produces: reload consumes only its portion of a large tick; movement/fire receive only the remainder.

- [ ] Tick one physical action per unit before the legacy loop.
- [ ] Preserve route ownership while zeroing physical translation during reload.
- [ ] Reject new fire and pending aim while reload is running.
- [ ] Reject reload when a fire action or movement weapon preparation already exists.
- [ ] Ensure automatic engagement cannot create a fire intent during reload.
- [ ] Verify equal outcomes for small and large simulation steps.
- [ ] Run movement, posture, combat and reload smokes; commit integration.

### Task 5: Make weapon runtime authoritative across reset, save and load

**Files:**
- Modify: `src/core/units/UnitModel.ts`
- Modify: `src/ui/SceneExport.ts`
- Modify: `src/core/behavior/BehaviorModel.ts`

**Interfaces:**
- Produces: imported/exported canonical weapon and physical action remain consistent; legacy fields are always derived.

- [ ] Restore/normalize the weapon before validating an imported reload action.
- [ ] Cancel or fail a reload that references an unknown or different weapon without transferring ammunition.
- [ ] Make initial-state reset construct/replace canonical weapon runtime, then derive compatibility fields.
- [ ] Make `copyRuntimeToInitialState` read canonical totals/readiness.
- [ ] Export canonical weapon first and serialize the physical action without mutation.
- [ ] Verify start, midpoint, pre-completion, cancellation and completion snapshots.
- [ ] Commit save/load authority changes.

### Task 6: Redirect Graph v2 and legacy reload paths

**Files:**
- Modify: `src/core/ai/runtime/actions/ReloadAction.ts`
- Modify: `src/core/ai/AiGameBridge.ts`
- Modify: `scripts/ai_reload_runtime_smoke.ts`

**Interfaces:**
- Stateful node lifecycle may report `physical_action_started`, running, cancelled or unsupported, but never owns a target ammunition count.
- Legacy `SetAction(reload)` requests `weapon_reload` with a stable Graph owner token.

- [ ] Remove `targetAmmo` from reload state and effects.
- [ ] Redirect begin/legacy reload commands to `requestWeaponReload`.
- [ ] Make stateful complete/cancel effects diagnostic/ownership operations only; physical simulation owns actual completion.
- [ ] Remove every direct Graph write to `behaviorRuntime.ammo`, `weaponReady`, `roundsLoaded` and `roundsReserve`.
- [ ] Run Graph reload and physical reload smokes; commit compatibility routing.

### Task 7: Final audit and verification

**Files:**
- Inspect all repository matches for `behaviorRuntime.ammo`, `behaviorRuntime.weaponReady`, `roundsLoaded`, `roundsReserve`, `reloadWeapon` and `targetAmmo`.

- [ ] Confirm every remaining legacy write is inside canonical synchronization/initial migration code only.
- [ ] Run `npm run posture-transition:smoke`.
- [ ] Run `npm run reload:smoke`.
- [ ] Run `npm run physical-reload:smoke`.
- [ ] Run `npm run combat-foundation:smoke`.
- [ ] Run `npm run combat-tactical-integration:smoke`.
- [ ] Run `npm run physical-movement:smoke`.
- [ ] Run `npm run tactical-position:smoke`.
- [ ] Run `npx tsc --noEmit`.
- [ ] Run `npx vite build`.
- [ ] Review the final diff against every requirement and report any unverified limitation honestly.
- [ ] Commit the verified final state and do not deploy, merge or create a PR.
