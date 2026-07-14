# Current Chat-Orchestration Work

## System status

Chat-only orchestration v1 is active.

```text
orchestrator
→ parallel ordinary ChatGPT workers
→ orchestrator comparison
→ one integrator
→ real-wargame-preview
```

Codex and Q/R/X/W modes are not part of this route.

## Current campaign

```text
id: stage1-nonvisual-closure-proof-a
status: awaiting-worker-1-and-worker-3-revision
base_branch: real-wargame-preview
base_commit: a7e99a955fb4ea2e5d3628119cca29ebccbd832e
active_subproject: ai-single-unit-editor
```

### Goal

Close the remaining non-visual Combat Tactical Integration Stage 1 evidence gaps:

1. live active-route replanning through normal `SimulationTick`;
2. safe-position winner and protected wall-side selection;
3. comparative reverse-slope position and route outcomes;
4. permanent CI enforcement of `combat-tactical-integration:smoke`.

Browser/PNG visual QA is outside this campaign and still requires separate explicit user approval.

## Parallel workers

### Worker 1 — live route-replan implementation and proof

Status: `ready`

Prove accepted and rejected live replans through ordinary simulation ticks while preserving order ownership, target, profile, command linkage and final facing, without per-frame A* churn.

### Worker 2 — safe-position winner and wall-side proof

Status: `accepted-with-changes`

Delivered draft PR `#109`, branch `agent/safe-position-winner-executor-2`, commit `bc62a2fbd7ea445952fc3db8804c7da2ac2254ac`.

### Worker 3 — reverse-slope comparative combat proof

Status: `changes-required`

Delivered draft PR `#111`, branch `agent/reverse-slope-comparative-stage1`, commit `6e929a73d2290db2a481a905aa029996f4f44acb`.

The implementation package is structurally coherent and existing build/regression jobs pass, but the new `reverse-slope-comparative:smoke` has not been executed. Worker 3 must connect it to an actually executed CI command, run it, correct any runtime failures and return an updated SHA and report.

### Worker 4 — CI contract and regression matrix

Status: `accepted`

Delivered draft PR `#108`, branch `agent/stage1-combat-tactical-ci`, commit `5be77b83588c73c07665e53755b2bd27cfdbbb9b`.

## Received results

### Worker 2 — safe-position winner and wall-side proof

Decision: `ACCEPT_WITH_CHANGES`

Verified facts:

- PR `#109` is open, draft, mergeable and targets `real-wargame-preview`;
- four files change, including the production `SoldierAwarenessGrid` implementation and a five-scenario deterministic smoke;
- the patch fixes side-insensitive wall protection by using threat-relative cover geometry from subjective threat memory;
- the strict smoke is connected to both awareness and combat tactical runners;
- the actual `Awareness field cache smoke` step and production build passed on the PR merge commit;
- neighboring directional terrain, navigation, pathfinding and policy workflows passed;
- the red aggregate `Preview Core Checks` result is caused only by the existing final status-publishing step.

Required integration changes:

1. Do not double-count relief protection. `evaluateCoverBetween` includes object, forest and relief contributions, while `DirectionalTacticalField.terrainProtection` already models reverse slope, valleys, crest and silhouette. The integrated implementation must separate threat-line object/forest protection from relief already represented by the directional terrain field, or otherwise provide an explicit non-duplicating composition with regression evidence.
2. Re-run the safe-position smoke after combining Worker 3, because reverse-slope scoring is directly affected by this production change.
3. Add the exact `scripts/combat_safe_position_winner_smoke.ts` path to the accepted Worker 4 CI filters.
4. Keep `combat-tactical-integration:smoke` as the canonical Stage 1 entry point. Retain the additional awareness-runner invocation only if duplicate execution is intentional.

### Worker 3 — reverse-slope comparative combat proof

Decision: `CHANGES_REQUIRED`

Verified facts:

- PR `#111` is open, draft, mergeable and targets `real-wargame-preview`;
- it adds a standalone comparative fixture, smoke launcher, assertions and npm command without changing production code;
- the scenario uses perception contact → soldier threat memory → awareness/directional field/route-cost/A* and checks direction reversal, hidden-position non-leakage and cache bounds;
- existing Directional Terrain Core, Combat Foundation Core, Preview Policy, navigation and production-build jobs passed;
- none of those jobs invokes `npm run reverse-slope-comparative:smoke`;
- therefore the new acceptance assertions remain unexecuted and their numeric margins and route assumptions are unverified.

Required worker revision:

1. Connect the scenario to an actually executed core runner, preferably the existing directional-terrain or combat-tactical integration runner.
2. Ensure the exact new fixture/smoke paths trigger the relevant workflow.
3. Produce a GitHub Actions run or equivalent real repository run that executes `reverse-slope-comparative:smoke`.
4. Correct any runtime, cache-count or route-determinism failures without weakening the comparative, reversal and bounded-work contracts to mere existence assertions.
5. Return the updated branch, exact commit SHA, actual command results, remaining risks and integration notes.

### Worker 4 — CI contract and regression matrix

Decision: `ACCEPT`

Verified against the actual PR, patch, workflow run and downloaded artifact:

- PR `#108` is open, draft, mergeable and targets `real-wargame-preview`;
- exactly one file changes: `.github/workflows/combat-foundation-core.yml`;
- existing combat, perception, runtime, reload, workspace and production-build checks remain;
- `combat-tactical-integration:smoke` is a normal failure-producing step using `set -o pipefail`;
- its log is uploaded with `if: always()`;
- relevant bounded dependency and scenario path filters are added;
- Playwright and PNG visual QA remain manual-only;
- GitHub Actions run `29370723538` succeeded, including the new smoke step and artifact upload;
- the artifact confirms both the tactical integration and source-direction regression scenarios passed;
- the PR is not merged and `main` was not changed.

Integration note: preserve the accepted gate and add exact filters for separately named scenario files introduced by Workers 1–3.

## Worker delivery rules

Workers may inspect and change any relevant files, add tests and propose architecture corrections. They must not independently combine results into the shared preview branch.

Each result must be reproducible as complete files, an applicable patch, or an isolated branch/PR with an exact commit SHA. Reports must distinguish checks run from checks not run and list risks and integration notes.

Orchestrator decisions use exactly one of:

```text
ACCEPT
ACCEPT_WITH_CHANGES
CHANGES_REQUIRED
REJECT
BLOCKED
```

## Orchestrator decision

```text
Worker 1: pending
Worker 2: ACCEPT_WITH_CHANGES
Worker 3: CHANGES_REQUIRED
Worker 4: ACCEPT
```

No integrator prompt will be issued until Worker 1 is reviewed and Worker 3 returns an executed revision.

## Integration

Not started.

The designated integrator must re-read the then-current preview branch and reproduce or apply accepted changes semantically. Draft PRs must not be merged blindly.

## Final verification

Not started.

The campaign requires an integrated commit/PR and an honest non-visual verification report. Stage 1 also remains open until separately approved visual QA is completed.
