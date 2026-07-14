# Combat Tactical Integration Stage 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make real contacts and real shots feed the existing subjective tactical danger, suppression, terrain, safe-position and route systems.

**Architecture:** Extend the existing `KnownThreatMemory` contract, add bounded runtime-only ballistic suppression/evidence services, adapt `syncSoldierThreatMemory`, and reuse the current awareness and navigation fields. Real hidden positions never enter tactical knowledge.

**Tech Stack:** TypeScript 5, Vite 5, PixiJS 7, Node smoke tests.

## Global Constraints

- Work only on `feat/combat-systems-integration-stage1-temp` based on `real-wargame-preview`.
- Do not touch `main` or transfer to preview without explicit user instruction.
- Do not add a parallel perception or tactical field.
- Tactical systems use only subjective knowledge.
- Do not run browser visual QA without explicit user approval.

---

### Task 1: Extend the threat-memory contract

**Files:**
- Modify: `src/core/units/UnitModel.ts`
- Modify: `src/core/knowledge/SoldierThreatMemory.ts`
- Test: `scripts/combat_tactical_integration_smoke.ts`

**Interfaces:**
- Produces backward-compatible `KnownThreatMemory.kind`, `sourceUnitId`, `lastConfirmedSeconds`, `evidenceCount` and additional evidence source values.

- [ ] Write a failing persistence/contact conversion test.
- [ ] Verify the test fails because real `unit:<id>` contacts are ignored.
- [ ] Add optional metadata fields and normalization defaults.
- [ ] Convert real contacts exclusively from `PerceptionContactMemory`.
- [ ] Verify exact last-known-position use and hidden-position privacy.
- [ ] Commit.

### Task 2: Add bounded combat evidence and suppression

**Files:**
- Create: `src/core/combat/CombatThreatEvidence.ts`
- Create: `src/core/combat/CombatSuppression.ts`
- Create: `src/core/combat/CombatUnitSpatialIndex.ts`
- Modify: `src/core/combat/FireAction.ts`
- Modify: `src/core/combat/WeaponModel.ts`
- Test: `scripts/combat_tactical_integration_smoke.ts`

**Interfaces:**
- `applyBallisticCombatEffects(state, input): void`
- `readCombatSuppression(unit, nowSeconds): CombatSuppressionSnapshot`
- `drainCombatThreatEvidence(unit, nowSeconds): CombatThreatEvidence[]`

- [ ] Write failing near-miss, far-pass and cover tests.
- [ ] Verify failures before implementation.
- [ ] Add a once-per-tick spatial bucket index and bounded segment query.
- [ ] Add deterministic trajectory/impact effect calculation and accumulation.
- [ ] Add approximate incoming-fire evidence without real muzzle coordinates.
- [ ] Call the service once after `traceProjectile`.
- [ ] Verify tests pass and histories remain bounded.
- [ ] Commit.

### Task 3: Merge combat evidence into tactical memory

**Files:**
- Modify: `src/core/knowledge/SoldierThreatMemory.ts`
- Test: `scripts/combat_tactical_integration_smoke.ts`

**Interfaces:**
- Consumes `drainCombatThreatEvidence`.
- Produces one unified threat per known shooter or merged unknown direction bucket.

- [ ] Write failing tests for unknown direction memory and sound/near-miss/visual deduplication.
- [ ] Verify failures.
- [ ] Merge known-shooter evidence into the contact threat.
- [ ] Merge unknown evidence by time, direction and approximate area.
- [ ] Reconcile unknown evidence when the shooter becomes identified.
- [ ] Coarsen revision fingerprints to preserve route/field hysteresis.
- [ ] Verify decay, uncertainty growth and deduplication.
- [ ] Commit.

### Task 4: Feed runtime danger and suppression

**Files:**
- Modify: `src/core/pressure/ThreatEvaluation.ts`
- Modify: `src/core/simulation/SimulationTick.ts`
- Test: `scripts/combat_tactical_integration_smoke.ts`

**Interfaces:**
- `evaluateThreatsAtPosition` combines scenario zones and subjective remembered threats.
- Simulation combines tactical suppression with transient ballistic suppression.

- [ ] Write failing runtime danger/suppression tests.
- [ ] Verify failures.
- [ ] Evaluate remembered threat geometry at the current unit position using existing cover.
- [ ] Decay and combine transient ballistic suppression without overwriting it.
- [ ] Preserve pressure-zone contributions.
- [ ] Verify tests pass.
- [ ] Commit.

### Task 5: Verify existing tactical fields and routes

**Files:**
- Test: `scripts/combat_tactical_integration_smoke.ts`
- Modify only if required: `src/core/knowledge/SoldierAwarenessGrid.ts`
- Modify only if required: `src/core/navigation/RouteCostField.ts`

**Interfaces:**
- Unified threats remain compatible with `DirectionalTacticalField` and `TacticalRouteKnownThreat`.

- [ ] Add a safe-position change test.
- [ ] Add a route-cost and replan-policy test.
- [ ] Verify existing fields react through `tacticalKnowledge.revision` without a new map.
- [ ] Make only compatibility fixes proven necessary by tests.
- [ ] Commit.

### Task 6: Add complete regression and persistence coverage

**Files:**
- Create: `scripts/combat_tactical_integration_smoke.ts`
- Create: `scripts/combat_tactical_integration_smoke.mjs`
- Modify: `package.json`
- Modify: `src/ui/SceneExport.ts`

**Interfaces:**
- Adds `npm run combat-tactical-integration:smoke`.

- [ ] Implement all ten required end-to-end cases.
- [ ] Verify scene save/load restores threat metadata and never refreshes from objective enemy position.
- [ ] Add the package script.
- [ ] Run the dedicated smoke test.
- [ ] Commit.

### Task 7: Prepare visual QA and documentation

**Files:**
- Create: `src/testing/CombatTacticalIntegrationVisualQaHarness.ts`
- Create: `tests/combat-tactical-integration.spec.ts`
- Create: `docs/subprojects/ai-single-unit-editor/COMBAT_TACTICAL_INTEGRATION_STAGE1.md`
- Modify: `docs/subprojects/ai-single-unit-editor/subproject.json`

**Interfaces:**
- Browser scenario exposes deterministic stage-1 combat state and planned PNG assertions.

- [ ] Prepare the deterministic shooter/target/wall/reverse-slope scenario.
- [ ] Define screenshot names and assertions without running Playwright.
- [ ] Document data flow, privacy, evidence, suppression, tactical consumers, limits, checks and stage 2.
- [ ] Update subproject metadata; generated status remains generated by `docs:sync`.
- [ ] Commit.

### Task 8: Final verification

**Files:** none unless a required check reveals a task-related defect.

- [ ] Run the dedicated integration smoke.
- [ ] Run perception, combat, threat/awareness, directional terrain, navigation profiles, A*, routed movement, route status, scene persistence, production build and docs checks.
- [ ] Record exact commands and outcomes; do not claim unavailable checks.
- [ ] Inspect the branch diff and final commit SHA.
- [ ] Ask exactly: `Визуальная проверка подготовлена. Запустить её сейчас?`
- [ ] Do not transfer to preview.