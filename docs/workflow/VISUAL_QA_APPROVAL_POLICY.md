# Visual QA Approval Policy

This is the canonical approval gate for Real-Wargame browser-based visual verification.

## Position in the feature workflow

Visual QA belongs after the Web Chat has implemented and pushed the feature branch and after the branch is available through a branch-linked Vercel Preview.

Canonical route:

```text
Web Chat implements on feature branch
→ focused non-browser checks
→ branch push and readiness report
→ one-time Codex branch-linked Vercel Preview
→ human live test
→ same-branch fixes as needed
→ explicit user request for visual GitHub Actions verification
→ exact-SHA Playwright run and artifact inspection
→ explicit user GO
→ transfer into real-wargame-preview
```

Visual verification is valuable but expensive. It must be prepared for user-visible changes, while the human decides whether the real browser workflow should run.

## Default rule

```text
prepare visual QA on the feature branch
→ run focused non-browser checks
→ report the live-test checklist and remaining visual risk
→ wait for explicit user request
→ execute browser/PNG verification through GitHub Actions
```

The screenshot workflow is manual-only. A normal branch push, Vercel deployment or Pull Request must not launch it automatically.

## When preparation is required

Prepare visual QA when a change affects what the user can see or interact with, including:

- game or editor UI;
- map, units, overlays, routes, camera or layers;
- node highlighting and runtime diagnostics;
- buttons, forms, panels or layout;
- visible input behavior;
- visual performance or rendering regressions.

Pure internal logic, documentation and non-visual refactors may use focused smoke checks and the production build without preparing screenshots unless the task specifically requests them.

## What “prepared” means

Before asking for approval, the Web Chat must:

1. finish the implementation on the canonical feature branch;
2. prepare or update the relevant Playwright scenario;
3. identify the exact feature commit to test;
4. identify key screenshots to capture;
5. state what each screenshot should prove;
6. run focused non-browser checks and the production build;
7. report known visual risks that remain unverified;
8. provide the human live-test checklist.

Preparing a test is not the same as running it.

## Approval

Ask once:

```text
Визуальная проверка подготовлена. Запустить её через GitHub Actions?
```

Explicit approval may be given earlier in the task. Phrases such as these count:

```text
проверь визуально
сделай скриншоты
запусти браузерную проверку
проверь через Playwright
запусти визуальную проверку этой ветки
```

When approval was already explicit, do not ask again.

Do not infer approval merely because:

- the change is visual;
- a Playwright test exists;
- a workflow is available;
- the branch has a Vercel Preview;
- the task is important;
- previous tasks used screenshots.

## If approval is declined or absent

The Web Chat may keep the branch ready for human live testing. Do not transfer it into `real-wargame-preview` without the user's separate explicit transfer GO.

The report must say:

```text
visual_qa_prepared: yes
visual_qa_approval: declined or pending
visual_qa_run: not run
```

Do not say the visual issue is fixed or visually verified. Say that the implementation is ready for live testing and visual GitHub Actions verification remains pending or declined.

## If approval is granted

Run the relevant manual GitHub Actions workflow against the exact canonical feature-branch commit.

A valid completed visual check requires:

- exact tested feature commit SHA;
- the real Vite application;
- a real Chrome/Chromium browser;
- fresh PNG files created after the change;
- workflow and artifact SHA matching the feature commit;
- Playwright result and logs;
- opened and inspected changed/key PNG files.

A green workflow alone is not enough.

## Same-branch failure loop

When visual verification finds a problem:

1. return to the same canonical feature branch;
2. add or update a regression scenario when practical;
3. fix the code;
4. rerun focused non-browser checks;
5. commit and push the same branch;
6. let the branch-linked Vercel Preview update;
7. repeat the visual workflow only when the user still wants it.

Do not create a fresh branch or call Codex again for each visual defect.

## Workflow rule

`.github/workflows/preview-screenshots.yml` must use only:

```yaml
on:
  workflow_dispatch:
```

Do not restore `push` or `pull_request` triggers without a separate explicit policy change approved by the user.

The workflow input or dispatch context must identify the exact feature branch or commit under test. Results from another SHA are not acceptance evidence.

## Reporting

Every implementation report uses:

```text
feature_branch
current_commit
visual_qa_prepared: yes / no / not applicable
visual_qa_approval: approved / declined / pending / not applicable
visual_qa_run: passed / failed / not run / not applicable
```

When visual QA was run, also report:

```text
tested_sha
workflow_run
playwright_result
artifact_sha_match
screenshots_inspected
key_frames
```

Keep human live-test status separate:

```text
live_test_status: pending / passed / failed / not run
live_tested_commit:
```

Visual GitHub Actions verification does not grant permission to transfer into preview. Transfer still requires explicit user GO for the exact accepted feature commit.
