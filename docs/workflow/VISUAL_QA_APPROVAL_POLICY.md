# Visual QA Approval Policy

This is the canonical approval gate for Real-Wargame browser-based visual verification.

## Purpose

Visual verification can be valuable but expensive. The agent must prepare it for user-visible changes, while the human decides whether the real browser run is worth executing now.

## Default rule

```text
prepare visual QA
→ run focused non-browser checks
→ ask the user once
→ execute browser/PNG verification only after explicit approval
```

The screenshot workflow is manual-only. A normal push or pull request must not launch it automatically.

## When visual QA preparation is required

Prepare visual QA when a change affects what the user can see or interact with, including:

- game or editor UI;
- map, units, overlays, routes, camera or layers;
- node highlighting and runtime diagnostics;
- buttons, forms, panels or layout;
- visible input behavior;
- visual performance or rendering regressions.

Pure internal logic, documentation and non-visual refactors may use focused smoke checks and the production build without preparing screenshots unless the task specifically requests them.

## What “prepared” means

Before asking for approval, the agent must:

1. finish the implementation;
2. prepare or update the relevant Playwright scenario;
3. identify the key screenshots to capture;
4. state what each screenshot should prove;
5. run focused smoke checks and the production build;
6. report known visual risks that remain unverified.

Preparing a test is not the same as running it.

## Approval

Ask once:

```text
Визуальная проверка подготовлена. Запустить её сейчас?
```

Explicit approval may be given earlier in the task. Phrases such as these count:

```text
проверь визуально
сделай скриншоты
запусти браузерную проверку
проверь через Playwright
```

When approval was already explicit, do not ask again.

Do not infer approval merely because:

- the change is visual;
- a Playwright test exists;
- a workflow is available;
- the task is important;
- previous tasks used screenshots.

## If approval is declined or absent

The agent may finish and deliver the change unless the user explicitly made visual QA a release or merge gate.

The report must say:

```text
visual_qa_prepared: yes
visual_qa_approval: declined or pending
visual_qa_run: not run
```

Do not say the visual issue is fixed or visually verified. Say that the implementation is complete and visual verification remains optional/pending.

## If approval is granted

A valid completed visual check requires:

- the real Vite application;
- a real Chrome/Chromium browser;
- fresh PNG files from the tested commit;
- matching workflow/artifact SHA;
- Playwright result and log;
- opened and inspected changed/key PNG files.

A green workflow alone is not enough.

## Workflow rule

`.github/workflows/preview-screenshots.yml` must use only:

```yaml
on:
  workflow_dispatch:
```

Do not restore `push` or `pull_request` triggers without a separate explicit policy change approved by the user.

## Reporting

Every implementation report uses:

```text
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
