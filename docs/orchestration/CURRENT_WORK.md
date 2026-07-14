# Current Chat-Orchestration Work

## System status

Chat-only orchestration v1 is active.

The delivery route is:

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
status: ready-for-workers
base_branch: real-wargame-preview
base_commit: a7e99a955fb4ea2e5d3628119cca29ebccbd832e
active_subproject: ai-single-unit-editor
```

### Goal

Close the remaining non-visual evidence gaps in Combat Tactical Integration Stage 1:

1. prove live active-route replanning through the normal `SimulationTick` flow;
2. prove that a real subjective threat changes the winning safe-position candidate and selects the protected side of cover;
3. prove that reverse-slope terrain changes position and route outcomes relative to a flat scene and that reversing the threat direction flips the preferred side;
4. make `combat-tactical-integration:smoke` a permanent required step of the relevant GitHub Actions workflow.

Final browser/PNG visual QA remains outside this campaign and still requires separate explicit user approval.

## Confirmed unfinished work

### Live route replan

The production path already calls `ensureNavigationRouteCurrent` from `SimulationTick`, but existing smoke coverage proves route costs and calls `evaluateNavigationReplan` directly. It does not yet prove replacement of the real active order after a real perception or fire event.

Required evidence:

- an active planned order is created through the normal planning path;
- a real contact or real shot changes subjective tactical knowledge;
- ordinary simulation ticks trigger route search and accepted replacement;
- `ownerToken`, requested target, movement/navigation profile, player-command linkage and final facing survive replacement;
- route revision, replan count, reason and route cells change as expected;
- cooldown and minimum improvement reject churn and insufficient candidates;
- A* is not executed every frame.

### Safe-position winner

Current combat integration coverage proves only that safe candidates exist after a threat. It does not compare the winning candidate before and after the event or prove that the winner is on the protected side of a wall.

Required evidence:

- baseline and post-threat winners are compared;
- the post-threat winner has lower danger than the original position;
- wall-side protection and threat-relative cover direction are explicit;
- an uncertain fire sector produces broader/less precise selection than a confirmed visual threat;
- preference decays when the threat becomes stale.

### Reverse-slope combat proof

Directional terrain unit coverage already proves slope classification and synthetic field values. It does not yet prove the Stage 1 acceptance scenario with equivalent flat/reverse-slope combat scenes and real subjective threat input.

Required evidence:

- equivalent flat and reverse-slope scenes use the same real threat and profile;
- position score, danger and route outcome differ for the protected side;
- crest/forward slope does not receive the same benefit;
- reversing threat direction flips the preferred side;
- cautious/retreat navigation prefers the protected route;
- existing cache and bounded-work invariants remain intact.

### Permanent CI

`combat-tactical-integration:smoke` exists in `package.json`, but `Combat Foundation Core` does not run it and does not include its scripts in the workflow path filter.

Required evidence:

- relevant tactical, navigation, knowledge and terrain paths trigger the workflow;
- the tactical integration smoke is a required failing step, not an informational step;
- existing combat, perception, runtime and production build checks remain;
- Playwright and visual QA remain manual-only.

## Parallel workers

### Worker 1 — live route-replan implementation and proof

Status: `ready`

Own the complete live replan slice. Inspect the real planning, order ownership, simulation tick, tactical revision and replanner lifecycle. Implement the smallest coherent production/test changes that prove accepted and rejected replans through ordinary simulation ticks.

### Worker 2 — safe-position winner and wall-side proof

Status: `ready`

Independently strengthen the safe-position contract using real perception/fire input. Prove before/after winner changes, protected-side selection, threat-relative cover direction, uncertainty behavior and decay. Production fixes are allowed when the current model cannot satisfy a defensible test.

### Worker 3 — reverse-slope comparative combat proof

Status: `ready`

Build a comparative flat-versus-reverse-slope Stage 1 scenario using subjective threat data and real route/position systems. Prove direction reversal, protected route preference and bounded cache behavior. Production fixes are allowed when required by the evidence.

### Worker 4 — CI contract and regression matrix

Status: `ready`

Add the tactical integration smoke to permanent CI, broaden path filters only as required by its real dependencies and verify workflow failure semantics. Also audit the focused non-visual command matrix expected from the later integrator. Do not make browser visual QA automatic.

## Worker delivery rules

Workers may inspect and change any relevant files, add tests and propose architecture corrections. They must not make unrelated improvements or independently combine their results into the shared preview branch.

Each result must be reproducible as complete files, an applicable patch, or an isolated branch/PR with an exact commit SHA, and must report checks actually run, checks not run, risks and integration notes.

Orchestrator decisions use exactly one of:

```text
ACCEPT
ACCEPT_WITH_CHANGES
CHANGES_REQUIRED
REJECT
BLOCKED
```

## Received results

None.

## Orchestrator decision

Pending worker results.

## Integration

Not started. One designated integrator will re-read the then-current preview branch, combine accepted parts, resolve semantic conflicts, run the available non-visual verification matrix and update project status only after factual integration.

## Final verification

Not started.

The campaign is not complete until the integrator reports the resulting commit/PR or reproducible package and lists every check actually run. Stage 1 itself also remains open until separately approved visual QA is completed.