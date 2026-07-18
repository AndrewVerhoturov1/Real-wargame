---
name: real-wargame-local-preview
description: "Use when a Real-Wargame task requires visual-QA preparation, terminal-free local launch, or approved visual verification that the current Web Chat can perform through a directly controlled real browser."
license: MIT
---

# Real-Wargame local preview and direct-browser visual workflow

## Overview

Use this skill for:

- preparing visual QA for user-visible changes;
- terminal-free launch instructions;
- direct visual verification when the current Web Chat can control a real browser against the target application.

The project is Vite + TypeScript + PixiJS 8, not Godot.

Canonical policy:

```text
docs/workflow/VISUAL_QA_APPROVAL_POLICY.md
```

## Mandatory routing boundary

The user does not need to name a visual skill.

When the user requests visual verification, screenshots, browser verification or Playwright, first decide:

```text
Can the current Web Chat directly control a real browser against target_url?
```

### Yes

Use this skill and run the direct-browser path.

### No, and the target is a branch-linked Vercel Preview

**REQUIRED SUB-SKILL:** Read and use `vercel-deployment-playwright-e2e`:

```text
.agents/skills/vercel-deployment-playwright-e2e/SKILL.md
```

Do not ask the user to repeat the skill name. Phrases such as `проверь визуально`, `сделай скриншоты`, `проверь через Playwright` or equivalent already trigger the route.

Do not use the old local-preview GitHub Actions workflow as a substitute for deployed-Vercel verification when the task is specifically to test the Vercel deployment.

## Canonical feature branch

All product preparation and fixes remain on:

```text
feature/YYYYMMDD-short-kebab-slug
```

created from the exact current `real-wargame-preview` head.

Never:

- implement directly on `real-wargame-preview`;
- put product fixes on temporary visual CI branches;
- modify `main` without explicit approval;
- create a fresh product branch for every visual defect.

## Two visual states

### Visual QA prepared

Means:

- implementation finished on the feature branch;
- relevant scenario exists or was updated;
- expected screenshots and assertions are defined;
- focused non-browser checks and build ran when available;
- remaining visual risks are listed.

No browser run is implied.

### Visual QA completed

Means:

- user approval exists;
- the real application ran in real Chrome/Chromium;
- requested behavior was exercised;
- fresh evidence belongs to the tested product commit;
- key screenshots were opened and inspected;
- result and limitations were reported honestly.

Never confuse prepared with completed.

## Approval gate

For user-visible changes, prepare visual QA but do not execute it automatically.

Ask once only when the user has not already approved:

```text
Визуальная проверка подготовлена. Запустить её сейчас?
```

Earlier clear intent already counts as approval. Do not ask again.

If approval is absent:

- do not run the browser;
- report `visual_qa_run: not run`;
- do not claim visual success;
- keep the feature branch ready for human live testing.

## No surrogate preview

Do not count any of these as visual verification:

- reading source only;
- rendering a reconstructed page;
- opening a hand-written mockup;
- using screenshots from another commit;
- checking only workflow status;
- claiming success because a Playwright test exists;
- testing a local build when the requested target is the Vercel deployment.

## Preparation workflow

Before execution:

1. identify visible behavior and exact feature commit;
2. identify the target URL and whether it is local or deployed;
3. prepare the narrowest deterministic scenario;
4. define key milestone PNGs and what each proves;
5. run focused smoke checks and one build when available;
6. list remaining visual risk;
7. resolve user approval;
8. apply the mandatory browser-capability routing decision.

## Direct-browser execution

Use this path only when the current Web Chat can control a real browser against the intended target.

Required evidence:

- exact target URL;
- expected product commit;
- real application loaded;
- state-changing interaction completed;
- screenshots of successful milestones;
- console/page/network error capture when possible;
- key screenshots opened and inspected.

When the app exposes build identity, compare it with the expected feature commit. If identity cannot be proven, report `product_sha_match: unproven`.

## User-PC launch

Canonical launcher:

```text
Run-Real-Wargame-Lab.bat
```

A user-facing launcher should:

1. run from repository root;
2. check Node/npm;
3. install missing dependencies safely;
4. start required services;
5. wait for health endpoints;
6. open the real route;
7. avoid manual terminal steps;
8. explain failures in plain language.

A GitHub push does not update the user's local folder automatically.

## Local GitHub Actions screenshot workflow

The existing workflow:

```text
.github/workflows/preview-screenshots.yml
```

is manual-only and may be used only when the requested verification target is the checked-out Vite application rather than an already deployed external Vercel URL.

A normal push or PR must not trigger it automatically.

For a deployed Vercel URL without direct browser access, route to `vercel-deployment-playwright-e2e` instead.

## Playwright design

Prefer observable state changes over arbitrary sleeps.

For canvas:

- calculate coordinates from current canvas bounds and current world/camera data;
- prefer an existing read-only world-to-screen test hook;
- recalculate after panel, viewport, zoom, origin or cell-size changes;
- verify both visible geometry and matching numeric state.

For soldier movement, confirm actual coordinate change after simulation continues. An order label alone is insufficient.

For overlays, confirm active control state, renderer diagnostics when available, screenshot output and persistence after bounded idle time.

## Failure diagnosis

Classify failures before editing:

- `environment`: browser/URL/protection/infrastructure;
- `test-harness`: selector, coordinate, timing or assertion defect;
- `application`: actual product behavior or runtime failure.

For direct-browser application failures, return to the same canonical feature branch. Add/update focused coverage, fix there, rerun non-browser checks, push and repeat against the updated Preview.

Never hide application instability with broad retries or long sleeps.

## Visual inspection checklist

Inspect, where relevant:

```text
controls are not covered or clipped;
active states are clear;
selected objects and handles are visible;
numeric state matches canvas geometry;
layers are distinguishable;
labels are readable;
panels restore layout correctly;
runtime status matches actual behavior;
no flicker or disappearing layer occurs after idle.
```

A green test proves execution, not visual correctness.

## User-facing evidence

After successful evidence collection:

1. verify filenames and image content;
2. open every changed/key frame;
3. show the most informative frames directly or through links;
4. create a contact sheet when useful;
5. provide full artifact/log when one exists;
6. state whether the run was direct browser, GitHub Actions or user PC.

## Reporting

```text
feature_branch:
commit_sha:
target_url:
visual_qa_prepared:
visual_qa_approval:
visual_qa_route: direct-browser / delegated-to-vercel-deployment-playwright-e2e
visual_qa_run:
run_type: direct browser / GitHub Actions / user PC / not run
expected_product_sha:
observed_product_sha:
product_sha_match: yes / no / unproven
scenario_result:
screenshots_inspected:
key_frames:
console_errors:
page_errors:
request_failures:
failure_class:
risks_not_checked:
preview_transfer_approval: not granted by visual QA
```

Keep the explanation simple and distinguish browser evidence from the human live test.