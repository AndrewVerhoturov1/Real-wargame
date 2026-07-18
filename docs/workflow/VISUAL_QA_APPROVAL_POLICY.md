# Visual QA Approval Policy

This is the canonical approval and routing gate for Real-Wargame browser-based visual verification.

## Position in the feature workflow

```text
Web Chat implements on feature branch
→ focused non-browser checks
→ branch push and readiness report
→ one-time Codex branch-linked Vercel Preview
→ human live test
→ same-branch fixes as needed
→ user requests visual verification
→ automatic visual skill selection
→ exact-product browser evidence and inspection
→ separate explicit user GO
→ transfer into real-wargame-preview
```

Visual verification is valuable but expensive. Prepare it for user-visible work, but run it only after explicit user intent.

## User intent is the trigger

The user does not need to name a skill.

These and equivalent requests count as approval:

```text
проверь визуально
запусти визуальную проверку
сделай скриншоты
проверь через Playwright
проверь живой Vercel Preview
```

Do not ask the user to repeat the skill name. Do not ask for approval again when intent was already explicit.

Do not infer approval merely because the change is visual, a test exists, a workflow exists, a Vercel Preview exists or a previous task used screenshots.

## Mandatory automatic skill selection

After approval, determine whether the current Web Chat can directly control a real browser against the intended target URL.

### Direct controlled browser available

Read and use:

```text
.agents/skills/real-wargame-local-preview/SKILL.md
```

### Direct controlled browser unavailable, target is branch-linked Vercel Preview

**MUST read and use:**

```text
.agents/skills/vercel-deployment-playwright-e2e/SKILL.md
```

This fallback is mandatory. The user does not need to request it by name.

The old local screenshot workflow is not a substitute when the requested object is the deployed Vercel URL.

## Default preparation rule

```text
prepare visual QA on canonical feature branch
→ run focused non-browser checks
→ report live-test checklist and remaining risk
→ wait for explicit user intent
→ apply direct-browser versus deployed-Vercel routing decision
```

A normal feature push, Vercel deployment or product PR must not automatically launch browser verification.

## When preparation is required

Prepare visual QA for changes affecting:

- game/editor UI;
- map, units, overlays, routes, camera or layers;
- node highlighting and runtime diagnostics;
- buttons, panels, layout or visible input;
- rendering or visual-performance regressions.

Pure internal logic, documentation and non-visual refactors may use focused non-browser checks unless the user specifically requests visual verification.

## What prepared means

Before execution, Web Chat must:

1. finish implementation on the canonical feature branch;
2. identify exact feature commit and target URL;
3. prepare/update deterministic scenario;
4. identify milestone screenshots and what each proves;
5. run focused non-browser checks and build when available;
6. report visual risks and manual live-test checklist;
7. resolve approval;
8. select the correct visual skill automatically.

Preparing is not running.

## Direct-browser route

A valid direct-browser check requires:

- intended real target application;
- real Chrome/Chromium;
- state-changing behavior, not only page/DOM presence;
- expected/observed product identity when available;
- fresh milestone screenshots;
- key screenshots opened and inspected;
- diagnostics and honest limitations.

## Deployed Vercel CI fallback

When direct browser is unavailable, the `vercel-deployment-playwright-e2e` skill governs the run.

Mandatory invariants:

- create temporary `ci/**` base/head branches from the same exact product SHA;
- base contains only temporary workflow;
- head contains only temporary Playwright harness;
- create temporary PR from head to base;
- never merge temporary PR;
- never place CI harness files in canonical feature branch, preview or main;
- never commit Vercel share tokens or bypass secrets;
- test the real deployed URL;
- save `evidence.json`, milestone PNGs, trace, video and diagnostics;
- download and inspect the artifact;
- show key screenshots and a contact sheet when useful;
- close PR without merge and clean temporary branches when supported.

## Product identity

Visual evidence belongs to one exact product SHA.

Record:

```text
expected_product_sha
observed_product_sha
product_sha_match: yes / no / unproven
```

When deployed build identity cannot be independently read, report `unproven`. Do not call the result exact-SHA acceptance.

Any new product commit invalidates previous visual evidence for acceptance. Create a new temporary CI pair and fresh evidence.

## Failure classification and ownership

Classify failures before edits:

### Environment

Browser install/start, deployment unavailable, protection access, Actions infrastructure.

Change only CI/environment configuration.

### Test harness

Selector, coordinate conversion, timeout or assertion defect.

Change only temporary CI head branch and rerun the same temporary PR.

### Application

Actual product behavior, runtime failure, missing state change, disappearing layer, application error.

Change only the canonical feature branch. Run focused checks, push, wait for updated branch-linked Vercel Preview, close old CI PR and create fresh CI branches from the new product SHA.

Never fix product code on temporary CI branches.

## Evidence standard

A completed visual check requires:

- real application opened in real Chrome/Chromium;
- requested user scenario executed;
- actual state change confirmed;
- `evidence.json` saved, including last stage on failure;
- fresh successful milestone PNGs;
- trace and failure video as configured;
- console/page/network diagnostics;
- workflow/run/artifact identity checked;
- artifact downloaded and extracted;
- key screenshots opened and inspected;
- failure class identified when applicable.

A green workflow alone is insufficient.

## User presentation

Do not report only that screenshots are inside ZIP.

Provide:

- contact sheet when useful;
- direct links to key full-size screenshots;
- short caption for each;
- full artifact link;
- workflow run link;
- exact limitations.

## Same-feature-branch loop

When application verification finds a defect:

1. return to same canonical feature branch;
2. add/update focused regression coverage when practical;
3. fix product code there;
4. rerun focused non-browser checks;
5. commit and push same feature branch;
6. wait for branch-linked Vercel Preview update;
7. create fresh CI branch pair from new SHA;
8. repeat verification under existing user approval.

Do not call Codex again and do not create a new product feature branch.

## Transfer independence

Visual success does not grant permission to transfer into `real-wargame-preview`.

Transfer requires separate explicit user GO for the exact accepted feature commit. `main` requires separate explicit approval.

## Reporting

```text
feature_branch:
current_commit:
visual_qa_prepared:
visual_qa_approval:
visual_qa_route: direct-browser / vercel-deployment-playwright-e2e
visual_qa_run:
target_url: clean URL without secrets
expected_product_sha:
observed_product_sha:
product_sha_match:
temporary_base_branch:
temporary_head_branch:
temporary_pr:
workflow_run:
workflow_conclusion:
artifact_id:
artifact_digest:
evidence_json_inspected:
screenshots_inspected:
key_frames:
trace_inspected:
failure_class:
temporary_pr_closed_without_merge:
ci_branch_cleanup:
live_test_status:
preview_transfer_approval:
preview_touched:
main_touched:
limitations:
```

Keep Web Chat checks, GitHub Actions, Vercel deployment, direct-browser evidence and human live testing separate.