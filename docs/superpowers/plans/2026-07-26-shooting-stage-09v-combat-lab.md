# Stage 9V Combat Lab Implementation Plan

> **Executor note:** implement only Stage 9V on `feature/20260726-shooting-stage-09v-combat-lab` from exact base `90043f503d7615f296118abf8f11cd4a85a8df6d`. Do not deploy, open an early PR, or modify `real-wargame-preview` / `main`.

**Goal:** add a third standalone Vite application at `/combat-lab.html` that exposes the accepted Stage 3–9 infantry-combat production runtime for deterministic headless single runs and owner-controlled visual inspection.

**Architecture:** versioned serializable scenario definitions live under `src/core/testing/combat-lab/` and contain no DOM or PixiJS. One registry maps stable factory IDs to pure initial-state factories. The headless runner and visual session both obtain state through that registry and advance only the canonical `SimulationTick`. A production-command adapter is the only path from lab controls to FireTask, physical posture, movement, reload, deploy/undeploy, explicit assistant, ammo transfer and first aid. PixiJS belongs only to `src/combat-lab/rendering/`; diagnostic history is visual-only, bounded and cleared on restart. The visual checkpoint stores the canonical scene-export payload and restores through the existing production scene-load/reconciliation route.

**Performance design:**

- hot path: one canonical `SimulationTick` plus O(units + active projectiles + bounded recent impacts) visual drawing while the Combat Lab page is open;
- worst-case visual work: O(units + active projectiles + 4096 bounded trail points + bounded event history);
- full-map work: only normal map construction and explicit canonical checkpoint export; no per-frame or per-projectile full-map scan;
- shared result: authoritative `SimulationState`; renderer consumes it and never writes combat truth;
- queues/workers: none added in Stage 9V;
- cache/buffer ownership: visual session, fixed limits, explicit clear/destroy;
- teardown: Pixi ticker/listeners/application and visual buffers are released symmetrically;
- ordinary game/editor cost: zero imports or recurring work from Combat Lab shell.

## Task 1 — Contract-first smoke checks

**Files:**
- Create `scripts/combat_lab_contract_smoke.mjs`
- Create `scripts/combat_lab_scenarios_smoke.ts`
- Create `scripts/combat_lab_scenarios_smoke.mjs`
- Create `scripts/combat_lab_runner_smoke.ts`
- Create `scripts/combat_lab_runner_smoke.mjs`
- Create `scripts/combat_lab_ui_contract_smoke.mjs`

1. Specify the third Vite entry, Russian shell labels, unique/versioned scenario IDs, pure headless imports, shared factory, deterministic digests, seed propagation, bounded buffers, production command markers and forbidden direct projectile/UI simulation mutations.
2. Verify the checks fail because the Combat Lab files do not exist yet.

## Task 2 — Pure scenario and runner core

**Files:**
- Create `src/core/testing/combat-lab/CombatLabContracts.ts`
- Create `src/core/testing/combat-lab/CombatLabScenarioRegistry.ts`
- Create `src/core/testing/combat-lab/CombatLabScenarioFactories.ts`
- Create `src/core/testing/combat-lab/CombatLabCommands.ts`
- Create `src/core/testing/combat-lab/CombatLabMetrics.ts`
- Create `src/core/testing/combat-lab/CombatLabDigest.ts`
- Create `src/core/testing/combat-lab/CombatLabRunner.ts`
- Create `src/core/testing/combat-lab/index.ts`

1. Add schema-versioned definitions, requests, stop conditions, metrics, compact results and serializable scripted command steps.
2. Register eight Stage 9V scenarios with stable IDs/revisions, explicit seed, real metre distances, published loadout revisions and one initial-state factory path.
3. Execute scripted commands only through production APIs.
4. Run a fixed-step canonical `SimulationTick` loop; return sorted compact metrics plus deterministic event/final-state digests.
5. Keep all files free of DOM/PixiJS/browser timers.

## Task 3 — Visual session and canonical checkpoint

**Files:**
- Create `src/combat-lab/runtime/CombatLabVisualSession.ts`
- Create `src/combat-lab/runtime/CombatLabCheckpoint.ts`
- Modify `src/ui/SceneExport.ts`

1. Create/reset visual state through the same scenario registry and seed.
2. Support pause, one step and allowed speed multipliers without a second gameplay integrator.
3. Mark any user production command as interactive.
4. Add one checkpoint slot using `buildExportedScene` and a reusable production restore function extracted from the existing file-load path.
5. Clear visual-only history after restart/restore while preserving authoritative production state exactly once.

## Task 4 — Dedicated rendering and shell

**Files:**
- Create `combat-lab.html`
- Create `src/combat-lab/main.ts`
- Create `src/combat-lab/combat-lab.css`
- Create `src/combat-lab/rendering/CombatLabRenderer.ts`
- Create `src/combat-lab/ui/CombatLabShell.ts`

1. Build a 1440×900-friendly standalone layout with map as the main area.
2. Provide explicit scenario, seed, shooter, target/point, helper, first-aid recipient and ammo-transfer source/recipient controls.
3. Route fire/posture/reload/deploy/undeploy/transfer/first-aid/cancel controls to the production adapter and show Russian success/failure reasons.
4. Draw map, units, active bullets, bounded trails, impacts, last hit zone, aim direction/target, DP-27 anchor/sector, suppression markers, distances and IDs.
5. Publish weapon/action/wound/suppression/projectile/run diagnostics and metrics without mutating simulation state.
6. Destroy the application, ticker and listeners on teardown.

## Task 5 — Build entries, documentation and checks

**Files:**
- Modify `vite.config.ts`
- Modify `package.json`
- Modify `scripts/deployment_pages_smoke.mjs`
- Create `docs/subprojects/infantry-combat-prototype-v1/SHOOTING_STAGE_9V_COMBAT_LAB.md`

1. Add `combatLab` as the third Rollup input and require `combat-lab.html` in production-page checks.
2. Add the four requested focused commands.
3. Document URL, boundaries, registry, runner, visual session, clean/interactive distinction, scenarios, metrics, layers, checkpoint, limitations and manual verification steps.
4. Do not alter the generated subproject status.

## Final verification

Run, when an executable clone is available:

```bash
npm run docs:smoke
npm run lab:smoke
npm run combat-lab:smoke
npm run combat-lab-scenarios:smoke
npm run combat-lab-runner:smoke
npm run infantry-combat-stage9:verify
npx tsc --noEmit
npm run build
git diff --check 90043f503d7615f296118abf8f11cd4a85a8df6d...HEAD
git status --short
```

Confirm `dist/index.html`, `dist/ai-node-editor.html`, and `dist/combat-lab.html`. Do not run Chromium, Playwright, deployment or temporary GitHub Actions without separate permission.