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
campaign: stage1-nonvisual-closure-proof-a
status: nonvisual-integrated-and-verified
target_branch: real-wargame-preview
integration_pr: 112
source_head_sha: ba2a411f420e030f7375fc87f136a707b432e8f2
final_preview_sha: 7d1f3b8dc73b413c0644bf4b9e090e5d2d620960
transfer_method: squash
post_transfer_workflow_runs: none (no push trigger; workflow_dispatch unavailable through the connected GitHub tool)
nonvisual_result: accepted
visual_qa: pending-separate-approval
main_touched: no
auto_merge_used: no
active_subproject: ai-single-unit-editor
```

`final_preview_sha` is the accepted Stage 1 integration/squash commit. Later status updates are separate direct docs-only bookkeeping commits permitted by the repository branch policy.

## Goal and result

The campaign closed the remaining non-visual Combat Tactical Integration Stage 1 evidence gaps:

1. live active-route replanning through normal `SimulationTick`;
2. safe-position winner and threat-relative protected wall-side selection;
3. comparative reverse-slope position and real A* route outcomes;
4. permanent CI enforcement of `combat-tactical-integration:smoke`.

The non-visual result is accepted and transferred to `real-wargame-preview`. Browser, Playwright and PNG visual QA remain outside this campaign and require separate explicit approval.

## Accepted inputs

- PR `#110`, branch `agent/live-navigation-replan-tick-20260715`, accepted head `7b2e50ebcd9c0d950ee18523c5a5a009145683be`;
- PR `#109`, branch `agent/safe-position-winner-executor-2`, accepted head `bc62a2fbd7ea445952fc3db8804c7da2ac2254ac`;
- PR `#111`, branch `agent/reverse-slope-comparative-stage1`, accepted head `67c2487da0b75281820d6d885b3db22842a8586b`;
- PR `#108`, branch `agent/stage1-combat-tactical-ci`, accepted head `5be77b83588c73c07665e53755b2bd27cfdbbb9b`;
- integration PR `#112`, branch `agent/stage1-nonvisual-integration`, transferred head `ba2a411f420e030f7375fc87f136a707b432e8f2`.

## Integrated architecture

- `GridPathfinder` exports the canonical route evaluator used by final A* route cost, active remaining-route evaluation and live-replan hysteresis.
- Planning and current-route evaluation are regression-checked for equal cost on the same route.
- Small-arms cover evaluation supports contribution filters while preserving the legacy all-contributions default.
- Directional-fire awareness combines object/forest threat-line cover with `DirectionalTacticalField` relief protection, preventing double counting of reverse slope, valley, crest and silhouette effects.
- `SimulationTick` remains the only physical movement owner.
- Live replacement preserves order ownership, requested target, movement and navigation profile metadata, player-command linkage and final facing.
- Search count, accepted replacement count, cooldown/revision gating, hysteresis and stale lifecycle guards remain enforced.

## Canonical acceptance runners

`combat-tactical-integration:smoke` executes exactly once each:

- the existing tactical integration suite;
- source-direction regression;
- live navigation replan;
- safe-position winner.

`directional-terrain:smoke` executes the reverse-slope comparative scenario exactly once.

The final preview has no separate permanent `Live Navigation Replan Core` workflow. `Directional Terrain Core` does not run the full combat integration suite, and the awareness runner does not duplicate the safe-position scenario.

## Verification evidence

### Latest accepted PR-head GitHub Actions

The following runs executed against integration head `ba2a411f420e030f7375fc87f136a707b432e8f2`:

- `Combat Foundation Core` run `29376088298`: success;
- `Directional Terrain Core` run `29376088277`: success;
- `Navigation Profiles Core` run `29376088308`: success;
- `Command Plan Route Core` run `29376088255`: success;
- `Compact Route Controls Core` run `29376088286`: success;
- `AI Events Core` run `29376088281`: success;
- `Agent Docs Integrity` run `29376088321`: success;
- `Preview Policy` run `29376088266`: success;
- `Preview Core Checks` run `29376088408`: aggregate failure only in the final status-publisher step; every substantive test and production-build step succeeded;
- `Directional Terrain Visual QA` run `29376088322`: skipped by policy.

Downloaded artifacts confirmed:

- `combat-tactical-integration-log`: existing tactical integration checks, source-direction regression, live navigation replan and all five safe-position scenarios passed;
- `directional-terrain-core-logs`: directional/reverse-slope, navigation profiles, pathfinding, navigation overlay, map revision, documentation check and production build passed.

### Post-transfer state

The squash transfer produced commit `7d1f3b8dc73b413c0644bf4b9e090e5d2d620960`, and `real-wargame-preview` was verified to point exactly to that commit before bookkeeping.

No GitHub Actions run was created automatically for that commit because the relevant workflows use `pull_request` and `workflow_dispatch`, not a push trigger. The connected GitHub tool does not expose workflow dispatch. This limitation is recorded rather than presenting pre-transfer runs as post-transfer runs.

The final preview tree was checked directly after transfer for all required production files, acceptance scenarios, canonical runners and permanent CI configuration.

## Commands substantively proven

The accepted integration evidence proves successful execution of:

```text
npm run combat-tactical-integration:smoke
npm run directional-terrain:smoke
npm run pathfinding:smoke
npm run build
```

Additional accepted checks included awareness, navigation profiles, navigation overlay, map revision, routed movement, route status, movement bridge, runtime, navigation profile switch and documentation checks.

## Known issues and risks

- `Preview Core Checks` remains red only because its final status publisher fails after all substantive steps pass.
- `npm ci` reported two existing audit findings: one moderate and one high severity. Dependency remediation was outside this campaign.
- Route-cost equality is regression-tested for the current live scenario; future tactical field components must continue to use the canonical evaluator.
- Browser/PNG visual acceptance is still pending, so Stage 1 is not fully closed.
- Post-transfer workflow dispatch could not be performed through the available GitHub tool; the exact transferred tree was instead verified directly against the accepted integration result.

## Cleanup status

Superseded PRs `#108`, `#109`, `#110` and `#111` are closed without merge. Each contains a closing comment identifying accepted integration PR `#112`, squash commit `7d1f3b8dc73b413c0644bf4b9e090e5d2d620960` and the subsequent bookkeeping head.

The following temporary branch refs were independently confirmed to remain present and require manual deletion because branch-ref deletion is unavailable through the connected GitHub tool:

```text
agent/live-navigation-replan-tick-20260715
agent/live-navigation-replan-test-blob-backup
agent/safe-position-winner-executor-2
agent/reverse-slope-comparative-stage1
agent/stage1-combat-tactical-ci
agent/stage1-nonvisual-integration
```

Their accepted content is already present in `real-wargame-preview`. Do not delete `real-wargame-preview` or `main`.

## Final statement

Stage 1 non-visual integration transferred and verified.

Full Stage 1 remains open pending separately approved visual QA.
