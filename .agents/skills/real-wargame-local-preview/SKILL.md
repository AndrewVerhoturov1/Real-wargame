---
name: real-wargame-local-preview
description: "Use when a Real-Wargame task requires visual-QA preparation, an approved real local or CI browser launch, screenshots, preview artifacts, Playwright diagnosis, or terminal-free launch instructions."
license: MIT
---

# Real-Wargame local preview and screenshot workflow

## Overview

Use this skill before preparing or running Real-Wargame visual verification.

The project is **Vite + TypeScript + PixiJS 8**, not Godot.

Canonical approval policy:

```text
docs/workflow/VISUAL_QA_APPROVAL_POLICY.md
```

## Two different states

### Visual QA prepared

This means:

- the implementation is finished;
- the relevant Playwright scenario exists or was updated;
- expected screenshots and assertions are defined;
- focused smoke checks and the production build were run;
- remaining visual risks are listed.

No real browser or screenshot workflow has run yet.

### Visual QA completed

This means:

- the user explicitly approved execution;
- the real application ran in Chrome/Chromium;
- fresh PNG files were created;
- artifact SHA matches the tested commit;
- Playwright result/log were checked;
- changed/key PNG files were opened and inspected.

Never confuse these states.

## Approval gate

For user-visible changes, always prepare visual QA.

Do **not** start a local browser run, Playwright screenshot run or GitHub screenshot workflow without explicit user approval.

After preparation ask once:

```text
Визуальная проверка подготовлена. Запустить её сейчас?
```

An earlier explicit request such as `проверь визуально`, `сделай скриншоты`, `запусти браузерную проверку` or equivalent already counts as approval. Do not ask again.

If approval is declined or absent:

- do not run the browser;
- do not run `.github/workflows/preview-screenshots.yml`;
- the change may still be delivered unless visual QA was an explicit release gate;
- report `visual_qa_run: not run`;
- do not claim the visual issue is fixed or visually verified.

## Hard rule: no surrogate preview

A surrogate preview is forbidden.

Do not count any of these as a successful visual run:

```text
reading HTML/CSS/TS files only;
rendering a reconstructed or simplified HTML page;
opening a hand-written mockup instead of the real Vite app;
inspecting code and claiming what the screen should look like;
using screenshots from an older commit after new UI changes;
checking only workflow status without downloading and inspecting PNGs;
claiming success because Playwright tests exist but were not run;
claiming success because a workflow is queued or in progress.
```

## Core rules

1. Work in `real-wargame-preview` first unless the user requests an isolated branch.
2. Never change `main` without explicit user approval.
3. Focused smoke checks and production build may run automatically.
4. Browser-based visual QA requires explicit approval.
5. A GitHub Actions browser run is not a local PC check.
6. Do not make the user type terminal commands when an agent, `.bat` file or artifact can do the job.
7. Never claim screenshots were captured until the PNG artifact exists.
8. Never claim visual success until changed/key PNGs were opened and inspected.
9. Verify that workflow and artifact `head_sha` match the reported commit.
10. Evidence before claims: read the result, log and actual PNGs.

## Preparation workflow

Before asking for approval:

1. identify the visible behavior that changed;
2. prepare/update the narrowest relevant Playwright scenario;
3. list the key PNGs to capture;
4. state what each PNG should prove;
5. run focused smoke checks;
6. run `npm run build`;
7. state remaining visual risks;
8. ask the approval question once.

Do not execute Playwright as part of preparation.

## Launch paths after approval

### User PC

Preferred launcher:

```text
Run-Real-Wargame-Lab.bat
```

Focused fallbacks:

```text
Run-Real-Wargame.bat
Run-AI-Node-Editor.bat
```

A user-facing launcher should:

1. run from the repository root;
2. check `node` and `npm`;
3. install dependencies when missing;
4. start required services;
5. wait for health endpoints;
6. open the real route;
7. avoid terminal steps for the user;
8. explain failures in plain language.

A GitHub push does not update the user's local folder automatically.

### GitHub Actions

Workflow:

```text
.github/workflows/preview-screenshots.yml
```

It is **manual-only** and must be started through `workflow_dispatch` after approval.

A normal push or pull request must not trigger screenshots.

Expected artifacts:

```text
real-wargame-preview-screenshots
real-wargame-preview-playwright-log
```

The workflow must:

1. check out the approved exact ref;
2. run `npm ci`;
3. serve the real Vite app;
4. open it in real Chrome/Chromium;
5. capture PNGs;
6. upload screenshots even after later failure;
7. upload the Playwright log;
8. publish a linked commit status.

## Browser choice

Prefer system-installed Google Chrome when available.

Do not install Chromium on every run unless the system browser is unavailable.

## Reading a workflow result

Use:

```text
get_commit_combined_status or fetch_commit_workflow_runs
fetch_workflow_run_jobs
fetch_workflow_job_steps
fetch_workflow_job_logs
fetch_workflow_run_artifacts
download_workflow_artifact
```

If a run is queued or in progress, it is not evidence. Continue checking until completion or failure.

## Required SHA verification

Before reporting visual success, compare:

```text
tested commit SHA;
workflow head_sha;
screenshot artifact workflow_run.head_sha;
Playwright log artifact workflow_run.head_sha.
```

They must identify the same tested version. Never reuse an older green artifact for a newer UI commit.

## Failure diagnosis order

When an approved screenshot run fails:

1. inspect job and step outcomes;
2. download the Playwright log;
3. download partial screenshots;
4. inspect the last useful PNG;
5. identify the exact failing selector/action/timeout;
6. decide whether the cause is application behavior, coordinates, Playwright or infrastructure;
7. change the smallest correct layer;
8. prepare the rerun;
9. because this is continuation of the same approved visual check, rerun without asking again;
10. inspect fresh PNGs.

Do not fix by guesswork when evidence exists.

## Playwright test design

Split major surfaces into independent scenarios:

```text
tactical board;
AI Node Editor;
integrated AI lab;
focused runtime/route state.
```

Prefer observable UI assertions over arbitrary sleeps.

Short waits are acceptable only for deliberate rendering settle time.

## Coordinate discipline

Do not rely on old hard-coded screen offsets after layout changes.

Calculate coordinates from current canvas bounds and current scene data.

Recalculate after:

```text
opening or closing a panel;
changing toolbar/dock/sidebar layout;
changing viewport, zoom or cell size;
moving units or fixtures.
```

After drag/input changes, verify both visible geometry and matching numeric fields.

## Stable DOM controls

If a visible control detaches during Playwright actions:

1. check for `replaceChildren`, `innerHTML` or full rerenders;
2. keep persistent controls long-lived;
3. update only dynamic values;
4. do not hide application instability with retries or long sleeps.

## Visual inspection checklist

Open changed/key PNGs and check, where relevant:

```text
important controls are not covered;
dock, toolbar and labels are not clipped;
active tools/tabs are clear;
selected objects and handles are visible;
numeric fields match map geometry;
layers are visually distinguishable;
labels are readable at 100%;
closing panels restores the normal layout;
no stale localStorage UI remains;
runtime statuses match the actual terminal/running state.
```

A green workflow proves the test ran, not that the screen is good.

If a PNG exposes a defect, fix it and continue the already-approved visual verification without requesting approval again.

## AI Node Editor notes

- Clear localStorage before deterministic Playwright scenarios when bundled graph data changed.
- Selectors must tolerate Russian and English labels.
- Open transient palettes through a bounded helper that verifies visibility.
- Use stable wrappers for range-slider hover.
- Do not let helper UI read graph storage before the editor bootstrap owns it.

## Sending screenshots to chat

After a successful approved capture:

1. download and extract the ZIP;
2. verify count and filenames;
3. open every changed/key frame;
4. show the most informative 3–6 frames when possible;
5. provide the full artifact and useful log;
6. say whether the run was GitHub Actions, local agent or the user's PC.

## Reporting format

```text
Branch: <branch>
Commit SHA: <tested sha or untested implementation sha>
Build: passed / failed / not run
Visual QA prepared: yes / no / not applicable
Visual QA approval: approved / declined / pending / not applicable
Visual QA run: passed / failed / not run / not applicable
Run type: local agent / GitHub Actions / user PC / not run
Run id or PR: <id/link or none>
Playwright scenarios: <passed>/<total> or not run
Screenshot artifact: <name/id or none>
Log artifact: <name/id or none>
Artifact SHA matches commit: yes/no/not applicable
Screenshots inspected: yes/no/not applicable
Key frames inspected:
- <file>: <what was verified>
Risks / not checked: <plain-language limits>
```

Keep the user-facing explanation simple.
