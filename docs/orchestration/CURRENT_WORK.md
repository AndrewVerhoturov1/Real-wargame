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
status: ready-for-integrator
base_branch: real-wargame-preview
current_preview_commit: 9116c1238e563728d211890859219b537b0dcefb
active_subproject: ai-single-unit-editor
```

### Goal

Close the remaining non-visual Combat Tactical Integration Stage 1 evidence gaps:

1. live active-route replanning through normal `SimulationTick`;
2. safe-position winner and protected wall-side selection;
3. comparative reverse-slope position and route outcomes;
4. permanent CI enforcement of `combat-tactical-integration:smoke`.

Browser/PNG visual QA is outside this campaign and still requires separate explicit user approval.

## Worker decisions

```text
Worker 1: ACCEPT_WITH_CHANGES
Worker 2: ACCEPT_WITH_CHANGES
Worker 3: ACCEPT_WITH_CHANGES
Worker 4: ACCEPT
```

### Worker 1 — live route replan

- Draft PR: `#110`
- Branch: `agent/live-navigation-replan-tick-20260715`
- Commit: `7b2e50ebcd9c0d950ee18523c5a5a009145683be`
- Verified run: `Live Navigation Replan Core` `29372179601`

Accepted evidence:

- real ballistic near miss → subjective tactical memory → ordinary `tickSimulation`;
- accepted and rejected live replans;
- preserved owner, target, movement/profile metadata, player-command linkage and final facing;
- separate search and accepted-replacement counters;
- cooldown and stale lifecycle ownership checks.

Required integration changes:

1. Use one canonical path-cost calculation for both the active remaining route and candidate route. Do not compare `fields.totalCost` accumulation against a separately calculated `GridPathfinder` component breakdown when negative cover adjustments can make them diverge.
2. Preserve current-context hysteresis, `replanSearchCount`, accepted `replanCount`, cooldown gating and strict order identity/ownership.
3. Consolidate the focused workflow into the permanent Worker 4 gate rather than retaining a redundant permanent workflow.
4. Re-run the live scenario after combining the safe-position and reverse-slope changes.

### Worker 2 — safe-position winner

- Draft PR: `#109`
- Branch: `agent/safe-position-winner-executor-2`
- Commit: `bc62a2fbd7ea445952fc3db8804c7da2ac2254ac`

Accepted evidence:

- threat-relative protected wall-side selection;
- winner change and numerical danger reduction;
- east/west direction reversal;
- precise visual contact versus broad unknown-fire sector;
- deterministic decay, cache reuse and hidden-position non-leakage.

Required integration changes:

1. Do not double-count relief. The existing `evaluateCoverBetween` includes object, forest and relief contributions, while `DirectionalTacticalField.terrainProtection` already models reverse slope, valley, crest and silhouette. Separate line-of-fire object/forest protection from directional relief, or prove another non-duplicating composition.
2. Keep `combat-tactical-integration:smoke` as the canonical Stage 1 entry point. Avoid duplicate invocation through awareness unless it is intentional.
3. Add the exact safe-position scenario path to the permanent CI filters.
4. Re-run the scenario after combining Worker 3.

### Worker 3 — reverse-slope comparative proof

- Draft PR: `#111`
- Branch: `agent/reverse-slope-comparative-stage1`
- Final commit: `67c2487da0b75281820d6d885b3db22842a8586b`
- Verified run: `Directional Terrain Core` `29373919486`

Accepted evidence:

- `reverse-slope-comparative:smoke` was actually executed and passed;
- equivalent flat and ridge scenes use subjective perception/threat memory;
- reverse slope changes danger, safety, safe-position winner and actual retreat route;
- reversing the threat flips position and route preference;
- hidden objective movement does not leak into tactical memory;
- cache reuse, dynamic-only invalidation, local-query and exact-ray bounds pass;
- pathfinding, combat tactical integration, production build and documentation checks pass.

Required integration changes:

1. Preserve the longer deterministic corridor and the comparative route contract that respects `retreat.maximumDetourRatio`.
2. Execute the acceptance scenario once per CI job. The current PR runs it inside `directional-terrain:smoke` and again as a separate workflow step.
3. Do not retain the extra combat tactical integration step in Directional Terrain Core when Worker 4 already provides the canonical permanent gate.
4. Add exact reverse-slope fixture/runner paths to the appropriate permanent workflow filters.
5. Re-run after the Worker 2 relief-composition fix.

### Worker 4 — permanent CI

- Draft PR: `#108`
- Branch: `agent/stage1-combat-tactical-ci`
- Commit: `5be77b83588c73c07665e53755b2bd27cfdbbb9b`
- Verified run: `Combat Foundation Core` `29370723538`

Accepted evidence:

- `combat-tactical-integration:smoke` is a normal failure-producing step using `set -o pipefail`;
- log upload uses `if: always()`;
- existing combat, perception, runtime, reload, workspace and build checks remain;
- visual QA remains manual-only.

Integration requirement: extend its path filters for the exact accepted live-replan, safe-position and reverse-slope scenario files and their production dependencies.

## Integration contract

One designated integrator must start from the latest `real-wargame-preview`, inspect all four draft PRs and combine them semantically. Draft PRs must not be merged or cherry-picked blindly because their branches diverged and overlap in runners/workflows.

The integrated result must:

- implement the accepted production fixes from Workers 1 and 2;
- retain all three acceptance scenarios;
- resolve route-cost equivalence and relief double-counting;
- use one canonical tactical integration CI gate;
- avoid redundant permanent workflows and duplicate scenario execution;
- preserve all existing neighboring checks;
- update status documentation only after factual verification;
- remain outside `main` and keep visual QA manual-only.

## Required integrated verification

At minimum run and report the actual results of:

```bash
npm ci
npm run combat-tactical-integration:smoke
npm run reverse-slope-comparative:smoke
npm run directional-terrain:smoke
npm run awareness-field:smoke
npm run navigation-profiles:smoke
npm run pathfinding:smoke
npm run navigation-overlay:smoke
npm run map-revision:smoke
npm run build
```

Also run any focused live-replan/routed-movement/runtime commands required by the final dependency graph and the repository documentation checks when status files are changed.

## Integration

Ready to start. The integrator must return one isolated branch or draft PR with an exact commit SHA, a complete changed-file list, checks actually run, checks not run, risks, conflicts resolved and temporary-branch cleanup recommendations.

## Final verification

Pending integrated result.

Stage 1 remains open after non-visual integration until separately approved browser/PNG visual QA is completed.