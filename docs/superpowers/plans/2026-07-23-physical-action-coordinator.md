# PhysicalActionCoordinator Stage 2 Implementation Plan

**Goal:** Introduce one durable serializable owner of the `locomotion`, `posture`, and `weapon` channels, then migrate posture transition and movement weapon preparation without adding new combat mechanics.

**Architecture:** A pure type module defines the versioned contract. A bounded coordinator owns active leases and one terminal result. Serialization normalizes old or malformed saves. Reconciliation restores known posture and movement payloads after scene load and removes known orphan leases. Existing posture and movement public adapters remain available.

**Tech stack:** TypeScript 5, Vite SSR smoke scripts, existing scene save/load and simulation tick.

## Global constraints

- Branch: `feature/20260723-shooting-stage-02-physical-action-coordinator` from `3ba3ac78edd0998a8a199bba986a16dc39ffd8f0`.
- No merge, rebase, force-push, preview transfer, deployment, Graph v2 changes, or new shooting runtime.
- No queue or priority scheduler.
- New IDs are deterministic: `${unitId}:physical-action:${sequence}`.
- Coordinator state contains at most three active leases and one terminal result.
- No wall-clock or random source in coordinator/action code.
- Hot-path cost is bounded by the three fixed channels; no world scan, worker, event bus, or cache.

## Task 1: Coordinator contract and failing smoke

- Add a focused smoke that asserts atomic multi-channel acquisition, idempotency, deterministic conflicts, stale-handle rejection, exact completion, system cancellation, normalization, serialization, and reconciliation.
- Add the package script and run it in PR Risk CI; it must fail while the production modules are absent.

## Task 2: Pure coordinator core

- Create `PhysicalActionCoordinatorTypes.ts` with the versioned type-only contract and shared owner types.
- Create `PhysicalActionCoordinator.ts` with bounded request, lookup, availability, finish, system cancellation, and diagnostics operations.
- Create `PhysicalActionCoordinatorSerialization.ts` with deterministic normalization and deep serialization.
- Create `PhysicalActionCoordinatorReconciliation.ts` with idempotent known-payload restoration and known-orphan removal.
- Re-run the focused smoke until green.

## Task 3: Posture transition migration

- Re-export common owner types from `PostureTransition.ts`.
- Store the exact coordinator handle in `PostureTransitionActionV1`.
- Acquire all three channels atomically before creating the posture payload.
- Release the exact lease on completion, cancellation, failure, replacement, and scene-authoring reset.
- Preserve time-budget semantics and legacy action identity/progress during load.
- Extend posture smoke coverage for exact leases, conflicts, stale handles, and save/restore.

## Task 4: Movement weapon preparation and translation blocking

- Add `actionHandle` to `MovementWeaponPreparationState`.
- Keep the existing movement preparation adapter handle while storing the exact coordinator handle in the payload.
- Acquire `locomotion + weapon`, preserve idempotent countdowns, and release once on completion/cancellation/replacement/reset.
- Cancel safely when the exact lease is lost.
- Gate physical translation through coordinator availability without turning ordinary move orders into leases.
- Extend physical movement smoke coverage.

## Task 5: Unit lifecycle, save/load, and old fire adapter

- Add coordinator state to `UnitBehaviorRuntime` and optional serialized runtime data.
- Normalize saved coordinator first, then movement and posture payloads, reconcile them once, and synchronize effective posture.
- Export coordinator state beside posture and movement runtime without changing the scene version.
- Let the old `FireAction` acquire/release only a compatibility `weapon` lease; do not rewrite its combat phases.

## Task 6: Verification and delivery

- Run PR Risk CI on the exact feature head, including TypeScript, focused smokes, regression smokes, and production build selected by the repository classifier.
- Inspect all failed jobs and fix only Stage 2 regressions on the same branch.
- Report exact branch/head, checks, performance impact, and confirm preview/main/deployment untouched.
