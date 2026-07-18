# Web Chat Feature Delivery Workflow

This is the canonical implementation and live-test workflow for `Real-Wargame`.

## 1. Start a task

The Web Chat reads the current remote head of:

```text
real-wargame-preview
```

It records the exact base commit and creates one temporary branch:

```text
feature/YYYYMMDD-short-kebab-slug
```

The feature branch must start from the current `real-wargame-preview` head. Do not implement directly on `real-wargame-preview` or `main`.

## 2. Implement in Web Chat

The Web Chat owns the complete implementation cycle:

- inspect the relevant repository context;
- implement the feature;
- add or update focused regression tests;
- prepare the visual scenario when the change is user-visible;
- commit and push the feature branch;
- keep all later fixes on the same branch.

Do not create a new branch for every defect found during live testing.

## 3. Run focused non-browser checks

Before the branch is declared ready for live testing, run the smallest sufficient matrix:

```text
TypeScript check
+ focused smoke tests for the changed subsystem
+ one production build
+ documentation checks when applicable
```

Typical commands:

```bash
npx tsc --noEmit
npm run <focused-smoke-script>
npm run build
```

For documentation or generated status changes:

```bash
npm run docs:smoke
npm run docs:generate
git diff --exit-code
npm run docs:check
```

Do not run Chromium, Playwright, broad integration matrices, performance workflows or Vercel deployment by default.

If the current Web Chat environment cannot execute Node commands, report that limitation honestly. A small GitHub Actions non-browser check is an optional fallback, not the canonical first choice.

## 4. Report readiness for live testing

The Web Chat reports:

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

For user-visible changes, the report must explain what the human should test in the live application and what visual risks remain unverified.

## 5. One-time Codex deployment step

The user gives Codex the repository, feature branch and exact commit.

Codex only:

1. verifies the branch and commit exist;
2. exposes the branch as a branch-linked Vercel Preview;
3. returns the branch Preview URL;
4. returns an immutable commit Preview URL when available;
5. reports the deployment status and tested commit.

Codex does not:

- change code;
- commit or push;
- create a replacement branch;
- fix bugs;
- merge or transfer branches;
- change `real-wargame-preview` or `main`.

The deployment must remain linked to the feature branch. A detached one-off deployment that requires Codex again after every feature push is not the canonical result.

Codex reports:

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

The user opens the Vercel Preview and checks the feature in the real application.

The Web Chat should provide a task-specific checklist. A common baseline is:

1. application loads;
2. canvas renders;
3. relevant unit or editor state can be selected;
4. the changed interaction works in real time;
5. pause and resume still work when relevant;
6. no new visible artifacts appear;
7. no new console errors appear;
8. the exact requested feature behavior is verified.

Do not require a full-project manual regression for every local change.

## 7. Same-branch correction loop

When the user reports a defect, the same Web Chat:

1. returns to the same feature branch;
2. reproduces the issue from the report;
3. adds or updates a focused regression test when practical;
4. fixes the code;
5. reruns focused non-browser checks;
6. commits and pushes the same branch;
7. reports the new exact commit.

The branch-linked Vercel Preview must update from the same branch without renewed Codex participation.

The loop continues until the user accepts the live result or requests visual GitHub Actions verification.

## 8. Optional visual GitHub Actions verification

Visual verification is manual-only and requires explicit user approval.

The Web Chat prepares the Playwright scenario before asking. After approval, Web Chat runs the relevant GitHub Actions workflow against the exact feature-branch commit.

A visual verification is valid only when:

- the tested commit SHA is exact;
- the real application ran in Chromium;
- fresh PNG files were created;
- workflow and artifact SHA match the feature commit;
- Playwright result and logs are available;
- changed and key PNG files were opened and inspected.

If the workflow reveals a problem, fix it on the same feature branch and repeat the cycle.

## 9. Transfer into real-wargame-preview

Transfer is forbidden until the user gives an explicit GO for the exact tested feature commit.

Before transfer, Web Chat:

1. confirms the approved commit;
2. checks whether the feature branch must be updated from current `real-wargame-preview`;
3. resolves conflicts on the feature branch;
4. reruns the focused non-browser checks required by the final diff;
5. transfers the accepted result into `real-wargame-preview`;
6. reports the resulting preview commit.

A Pull Request may be used only when the user explicitly requests PR review/transfer or repository protection requires it. PR-first development is not the canonical route.

After successful transfer, close or delete the feature branch unless the user explicitly asks to keep it.

## 10. Main branch

`main` is outside the normal feature workflow.

Never:

- write to `main` without separate explicit user GO;
- open or retarget a PR to `main` without `MAIN_GO_APPROVED_BY_USER: yes`;
- merge to `main` without explicit approval;
- enable auto-merge.

## 11. Final transfer report

```text
feature_branch:
approved_feature_commit:
preview_commit:
transfer_method:
checks_run:
visual_qa_run:
live_test_status:
remaining_risks:
branch_cleanup_status:
preview_touched: explicit approved transfer
main_touched: no
```

The report must distinguish Web Chat checks, GitHub Actions checks, Vercel deployment and the human live test. Never claim one as another.
