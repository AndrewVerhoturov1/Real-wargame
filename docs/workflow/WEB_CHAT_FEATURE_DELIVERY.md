# Web Chat Feature Delivery Workflow

This is the canonical implementation, live-test and optional visual-verification workflow for `Real-Wargame`.

## 1. Start a task

Resolve the exact current remote head of:

```text
real-wargame-preview
```

Record it as `base_commit` and create:

```text
feature/YYYYMMDD-short-kebab-slug
```

Do not implement directly on preview or main.

## 2. Implement in Web Chat

Web Chat owns the complete product cycle:

- inspect relevant repository context;
- implement feature;
- add/update focused regression tests;
- prepare visual scenario when user-visible;
- commit and push feature branch;
- keep all later product fixes on same feature branch.

Do not create a new product branch for each live-test defect.

## 3. Focused non-browser checks

Before declaring ready for live testing, run the smallest sufficient matrix:

```text
TypeScript check
+ focused subsystem smoke tests
+ one production build
+ docs checks when applicable
```

Typical commands:

```bash
npx tsc --noEmit
npm run <focused-smoke-script>
npm run build
```

For documentation/generated state:

```bash
npm run docs:smoke
npm run docs:generate
git diff --exit-code
npm run docs:check
```

Do not run Chromium, Playwright, broad integration matrices, unjustified performance workflows or Vercel deployment by default.

If Node commands are unavailable, report honestly. A small non-browser Actions check is an optional fallback.

## 4. Report readiness

```text
feature_branch:
base_branch: real-wargame-preview
base_commit:
current_commit:
changed_files:
checks_run:
not_checked:
manual_checks_needed:
visual_qa_prepared:
preview_touched: no
main_touched: no
```

For user-visible work, explain what the human should test and remaining visual risk.

## 5. One-time Codex deployment

The user gives Codex repository, feature branch and exact commit.

Codex only:

1. verifies branch/commit;
2. exposes branch as branch-linked Vercel Preview;
3. returns branch Preview URL;
4. returns immutable commit Preview URL when available;
5. reports deployment status and commit.

Codex does not change code, commit, push, create replacement branch, fix bugs, merge or transfer.

The deployment must follow later pushes to same feature branch without Codex re-entry.

Codex report:

```text
feature_branch:
current_commit:
vercel_branch_preview:
vercel_commit_preview:
deployment_status:
code_changed: no
preview_touched: no
main_touched: no
```

## 6. Human live test

User opens Vercel Preview and checks task-specific behavior in real time.

Common baseline:

1. application loads;
2. canvas renders;
3. relevant unit/editor state can be selected;
4. changed interaction works;
5. actual state changes, not only label;
6. pause/resume works when relevant;
7. no new visible artifacts;
8. no new console errors;
9. exact requested behavior is verified.

Do not require full-project manual regression for every local change.

## 7. Same-branch correction loop

When user reports product defect, Web Chat:

1. returns to same feature branch;
2. reproduces issue;
3. adds/updates focused regression test when practical;
4. fixes product code;
5. reruns focused checks;
6. commits and pushes same branch;
7. reports new exact commit.

Branch-linked Vercel Preview updates without Codex.

## 8. Optional visual verification

Visual execution is manual-only and requires explicit user intent. The user does not need to name a skill.

Examples:

```text
проверь визуально
запусти визуальную проверку
сделай скриншоты
проверь через Playwright
```

When intent is explicit, do not ask again. Automatically choose route:

### Direct controlled browser available

Read/use:

```text
.agents/skills/real-wargame-local-preview/SKILL.md
```

### Direct controlled browser unavailable and target is Vercel Preview

**MUST read/use:**

```text
.agents/skills/vercel-deployment-playwright-e2e/SKILL.md
```

Do not ask user to say skill name.

## 9. Deployed Vercel CI route

The mandatory fallback skill creates two temporary CI-only branches from the exact product SHA:

```text
ci/<scenario>-base-<timestamp>-<short-sha>
ci/<scenario>-head-<timestamp>-<short-sha>
```

Base contains only temporary PR workflow. Head contains only temporary Playwright config/scenario. Temporary PR runs head against base and is never merged.

Product branch, preview and main must not contain CI harness files.

Secrets:

- try clean public URL first;
- prefer `VERCEL_AUTOMATION_BYPASS_SECRET` from GitHub Actions secrets;
- if share URL is necessary, store complete protected URL in GitHub Actions secret;
- never commit token or protected URL to any branch, PR text, log or report.

Required scenario proves actual behavior/state change. For movement, verify coordinates change. For visual modes, verify control state, renderer diagnostics when available, screenshot and persistence after idle.

Required artifacts:

```text
evidence.json
successful milestone PNGs
failure screenshot when applicable
trace.zip
failure video when applicable
Playwright report
console/page/network diagnostics
```

Web Chat must download, extract, inspect and present evidence. A green workflow alone is insufficient.

## 10. Visual failure ownership

Classify before edits:

### Environment

Deployment/protection/browser/Actions infrastructure. Fix only CI/environment layer.

### Test harness

Selector/coordinates/timeout/assertion. Fix only temporary CI head branch and rerun same temporary PR.

### Application

Actual product behavior/runtime. Fix only canonical feature branch, rerun focused checks, push and wait for updated Vercel Preview.

New product SHA invalidates previous acceptance evidence. Close old temporary PR and create fresh CI branch pair from new exact SHA.

Never fix product code on CI branches.

## 11. Visual evidence presentation

After final run:

1. verify conclusion and jobs;
2. inspect failed logs when needed;
3. download artifact;
4. read `evidence.json`;
5. inspect key PNGs;
6. inspect trace when needed;
7. create contact sheet when useful;
8. provide direct screenshot links, full artifact and workflow run;
9. close temporary PR without merge;
10. delete CI branches when supported or report exact cleanup limitation.

Report exact run/artifact/product identity and whether deployed SHA was proven.

## 12. Transfer into real-wargame-preview

Transfer is forbidden until user gives explicit GO for exact tested feature commit.

Before transfer, Web Chat:

1. confirms approved commit;
2. checks whether feature branch must be updated from current preview;
3. resolves conflicts on feature branch;
4. reruns focused checks required by final diff;
5. transfers accepted result into preview;
6. reports resulting preview commit.

PR may be used only when explicitly requested or technically required. PR-first development is not canonical.

After successful transfer, close/delete feature branch unless user asks to keep it.

## 13. Main branch

`main` is outside normal feature workflow.

Never write, retarget PR, merge or enable auto-merge without separate explicit user approval and `MAIN_GO_APPROVED_BY_USER: yes` where applicable.

## 14. Final report

```text
feature_branch:
approved_feature_commit:
preview_commit:
transfer_method:
checks_run:
visual_qa_prepared:
visual_qa_approval:
visual_qa_route:
visual_qa_run:
target_url:
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
remaining_risks:
branch_cleanup_status:
preview_touched:
main_touched:
```

Distinguish Web Chat checks, Vercel deployment, human live test, direct browser and GitHub Actions evidence. Never claim one as another.