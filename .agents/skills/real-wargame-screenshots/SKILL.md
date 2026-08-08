---
name: real-wargame-screenshots
description: "MUST use for every Real-Wargame request to make, capture, inspect, download, open or show screenshots; visually inspect UI or layout; open the game, AI Editor or Combat Lab in a browser; or verify a local or deployed application through Chrome, Chromium or Playwright. Russian triggers include: скриншот, скриншоты, сделай скрины, покажи экран, открой игру, зайди на деплой, посмотри интерфейс, проверь верстку, проверь визуально, проверь глазами, открой в браузере, проверь Combat Lab, проверь редактор ИИ, можешь ли ты зайти на сайт."
license: MIT
---

# Real-Wargame screenshot and visual-QA router

## Purpose

This is the mandatory discoverability entry point for every Real-Wargame screenshot, browser and visual-inspection request.

Read this router **before answering, planning or claiming that browser access is unavailable**. The user does not need to name any skill.

This router does not duplicate browser implementation details. It selects one of the two canonical execution skills:

```text
.agents/skills/real-wargame-local-preview/SKILL.md
.agents/skills/vercel-deployment-playwright-e2e/SKILL.md
```

## Mandatory triggers

Use this router when the user asks for any equivalent of:

```text
screenshot / screenshots;
visual QA / visual verification;
show the screen;
open the game or editor;
inspect UI, layout or responsive behavior;
open or inspect a deployment;
run Chrome, Chromium or Playwright;
скриншот / скриншоты / сделай скрины;
покажи экран;
открой игру;
зайди на деплой;
посмотри интерфейс;
проверь верстку;
проверь визуально;
проверь глазами;
открой в браузере;
проверь Combat Lab;
проверь редактор ИИ;
можешь ли ты зайти на сайт.
```

These phrases grant visual-execution intent for the stated target. They do not grant deployment, transfer, merge or `main` permission.

## Routing decision

Resolve the exact target first:

```text
target branch or commit;
target URL when deployed;
requested routes, states and viewport sizes.
```

Then choose exactly one route.

### Direct controlled browser is available

Read and follow:

```text
.agents/skills/real-wargame-local-preview/SKILL.md
```

Use the real application in a real Chrome/Chromium browser. Capture fresh PNGs for the exact product SHA and inspect the important images before reporting success.

### Direct controlled browser is unavailable, but a suitable Vercel deployment exists

Read and follow:

```text
.agents/skills/vercel-deployment-playwright-e2e/SKILL.md
```

Use the temporary CI-only Playwright route defined there. Do not merge its temporary PR. Download the artifact and inspect the PNGs; a green workflow alone is not visual evidence.

### No suitable deployment exists

Do not deploy implicitly. State that visual verification of a deployed target requires a separate explicit deployment request.

For a local-check request, follow the local-launch preparation in `real-wargame-local-preview` and report honestly when the current environment cannot run the real browser.

## Non-negotiable evidence rules

Do not count any of the following as successful visual verification:

```text
reading source files only;
reconstructing or simplifying the UI;
opening a hand-written mockup instead of the real application;
using screenshots from another commit;
checking only build or workflow status;
creating a Playwright test without running it;
running a workflow without downloading its artifact;
downloading an artifact without opening the key PNGs.
```

Valid completion requires:

```text
exact target identity or an explicit `unproven` result;
real application execution;
real Chrome/Chromium interaction;
fresh screenshots;
inspection of key screenshots;
console/page/network error reporting when available;
cleanup of temporary CI resources when the fallback route was used.
```

## Required report

```text
visual_router_skill: real-wargame-screenshots
visual_execution_skill: real-wargame-local-preview / vercel-deployment-playwright-e2e
target_branch:
expected_product_sha:
target_url:
run_type: direct browser / GitHub Actions / user PC / not run
screenshot_capture: passed / failed / not run
artifact:
screenshots_inspected: yes / no
observed_product_sha:
product_sha_match: yes / no / unproven
console_errors:
page_errors:
visual_findings:
temporary_ci_cleanup:
deployment_created: false unless separately authorized
```
