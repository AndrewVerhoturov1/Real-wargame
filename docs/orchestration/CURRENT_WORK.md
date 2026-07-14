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
status: workers-in-progress
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

Status: `ready`

Prove that real subjective threat input changes the winning safe position, selects the protected side of cover, distinguishes precise and uncertain threats and weakens after decay.

### Worker 3 — reverse-slope comparative combat proof

Status: `ready`

Compare equivalent flat and reverse-slope scenes using subjective threat input and real route/position systems. Prove direction reversal, protected-route preference and bounded cache work.

### Worker 4 — CI contract and regression matrix

Status: `accepted`

Delivered draft PR `#108`, branch `agent/stage1-combat-tactical-ci`, commit `5be77b83588c73c07665e53755b2bd27cfdbbb9b`.

## Received results

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
- the artifact confirms both the 17-check tactical integration scenario and the source-direction regression scenario passed;
- the PR is not merged and `main` was not changed.

A separate `Preview Core Checks` job was red, but all substantive smoke and production-build steps passed; only its final status-publishing step failed. The Worker 4 patch does not modify that workflow.

Integration note: preserve the accepted gate and add exact filters for any separately named scenario files introduced by Workers 1–3, unless those scenarios are connected to the existing wrapper.

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

Worker 4: `ACCEPT`.

Workers 1–3 remain pending. No integrator prompt will be issued until their results are received and reviewed.

## Integration

Not started.

The designated integrator must re-read the then-current preview branch and reproduce or apply accepted changes semantically. PR `#108` must not be merged blindly.

## Final verification

Not started.

The campaign requires an integrated commit/PR and an honest non-visual verification report. Stage 1 also remains open until separately approved visual QA is completed.
