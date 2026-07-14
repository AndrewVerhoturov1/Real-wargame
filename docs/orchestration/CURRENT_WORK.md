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
status: integrated-in-draft-pr
base_branch: real-wargame-preview
base_commit: fb09a21d2fdec764973fba85154d8358c96754f5
integration_branch: agent/stage1-nonvisual-integration
draft_pr: 112
verified_implementation_sha: f7007c50f5ffb0808f7bd73d149d09dca3937cdf
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

Accepted inputs:

- PR `#110`, `agent/live-navigation-replan-tick-20260715`, `7b2e50ebcd9c0d950ee18523c5a5a009145683be`;
- PR `#109`, `agent/safe-position-winner-executor-2`, `bc62a2fbd7ea445952fc3db8804c7da2ac2254ac`;
- PR `#111`, `agent/reverse-slope-comparative-stage1`, `67c2487da0b75281820d6d885b3db22842a8586b`;
- PR `#108`, `agent/stage1-combat-tactical-ci`, `5be77b83588c73c07665e53755b2bd27cfdbbb9b`.

## Integrated result

Draft PR `#112` semantically combines the accepted behavior onto the latest preview base instead of merging the four diverged worker branches.

### Architecture decisions

- `GridPathfinder` exports the canonical route evaluator used by final A* route cost, active remaining-route evaluation and hysteresis comparison. The same edge calculation handles cardinal/diagonal distance, the minimum step clamp, all tactical field components, final rounding and non-finite cells.
- The live smoke asserts that planning and current-route evaluation return equal cost for the same path, including after an accepted replacement.
- Small-arms cover evaluation now accepts optional contribution filters while preserving the legacy all-contributions default for existing callers.
- Directional-fire awareness composes threat-line object/forest cover with `DirectionalTacticalField` relief protection, excluding relief from the line-cover calculation so reverse slope, valley, crest and silhouette are not counted twice.
- Area and pressure-zone threats retain their previous local-cover semantics.
- `SimulationTick` remains the only physical movement owner. The replanner preserves ownership, target, movement/profile metadata, player-command linkage and final facing while retaining search/replacement counters, cooldown/revision gating, hysteresis and stale lifecycle guards.

### Acceptance scenarios

The canonical `combat-tactical-integration:smoke` runner executes exactly once each:

- the existing 17 integration checks;
- source-direction regression;
- live navigation replan;
- safe-position winner.

The canonical `directional-terrain:smoke` runner executes the reverse-slope comparative scenario exactly once. The 13 × 17 corridor, flat/ridge comparison, threat reversal, hidden-position non-leakage, cache/revision bounds and actual A* route-side assertions are preserved.

### CI consolidation

- `Combat Foundation Core` permanently gates `combat-tactical-integration:smoke` with `set -o pipefail`, full `tee` output and `if: always()` artifact upload.
- Its path filters include the accepted scenario files and production dependency clusters.
- No separate permanent live-navigation workflow is retained.
- `Directional Terrain Core` does not duplicate the full combat integration runner and does not execute reverse-slope twice.
- The awareness runner does not duplicate the safe-position scenario.

## Verification

### Local checks actually run

All of the following passed against the integrated source corresponding to `f7007c50f5ffb0808f7bd73d149d09dca3937cdf`:

```text
npm ci
npm run combat-tactical-integration:smoke
npm run reverse-slope-comparative:smoke
npm run directional-terrain:smoke
npm run awareness-field:smoke
npm run navigation-profiles:smoke
npm run pathfinding:smoke
npm run navigation-overlay:smoke
npm run map-revision:smoke
npm run routed-move:smoke
npm run route-status:smoke
npm run move-bridge:smoke
npm run runtime:smoke
npm run navigation-profile-switch:smoke
npm run build
npm run docs:check
npm run docs:smoke
```

The workflow YAML files were also parsed successfully and static runner assertions confirmed that live replan, safe-position and reverse-slope are not duplicated in their canonical jobs.

`npm ci` reported two existing audit findings: one moderate and one high severity. Dependency remediation was outside this integration scope.

### GitHub Actions at the verified implementation SHA

- `Combat Foundation Core` run `29375983766`: success. Combat foundation, perception, runtime, reload, workspace, production build, permanent combat tactical integration gate and both log uploads passed.
- `Directional Terrain Core` run `29375983770`: success. Directional/reverse-slope, navigation profiles, pathfinding, overlay, map revision, build, docs and artifact upload passed.
- `Navigation Profiles Core` run `29375983736`: success.
- `Command Plan Route Core` run `29375983739`: success.
- `Compact Route Controls Core` run `29375983738`: success.
- `AI Events Core` run `29375983740`: success.
- `Agent Docs Integrity` run `29375983806`: success.
- `Preview Policy` run `29375983778`: success.
- `Preview Core Checks` run `29375983764`: all real test/build steps passed; only the final status-publisher step failed, so the aggregate run is red without a package regression.
- `Directional Terrain Visual QA` run `29375983765`: skipped by policy.

### Not run

- browser launch;
- Playwright;
- PNG generation or inspection;
- any visual QA workflow requiring explicit human approval.

## Remaining risks

- Browser/PNG visual acceptance remains open, so Stage 1 is not declared fully closed.
- Route-cost equality is now regression-tested for the live scenario, but future field components must continue to use the canonical evaluator rather than introduce another cost summation path.
- The existing npm audit findings remain unresolved.
- The final Preview Core status publisher is still an infrastructure-level red conclusion even when all substantive steps pass.

## Cleanup after acceptance

After PR `#112` is accepted and transferred into `real-wargame-preview`, close the superseded worker PRs and delete these temporary branches unless a specific follow-up still needs one:

```text
agent/live-navigation-replan-tick-20260715
agent/safe-position-winner-executor-2
agent/reverse-slope-comparative-stage1
agent/stage1-combat-tactical-ci
agent/stage1-nonvisual-integration
```

Do not delete the integration branch before transfer and human acceptance.

## Final verification status

The non-visual integration is implemented and verified in draft PR `#112`. `main` was not changed, no merge was performed, auto-merge was not enabled and the PR remains draft. Stage 1 remains open pending separately approved visual QA.
