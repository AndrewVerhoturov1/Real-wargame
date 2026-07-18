---
name: vercel-deployment-playwright-e2e
description: "Use when the user requests visual, screenshot, browser, or Playwright verification of a deployed Real-Wargame Vercel Preview and the current Web Chat cannot directly control a real browser against that URL."
license: MIT
---

# Vercel Deployment Playwright E2E

## Overview

This is the mandatory CI-browser fallback for visual verification of the real deployed Vercel Preview.

The user does not need to name this skill. A request such as:

```text
проверь визуально
запусти визуальную проверку
сделай скриншоты
проверь через Playwright
проверь живой Vercel Preview
```

already triggers the visual-verification route. If no directly controlled browser can open the target deployment, **MUST read and use this skill**.

This skill tests the deployed URL, not a local reconstruction or locally served substitute.

Canonical surrounding workflow:

```text
feature branch implemented and pushed
→ branch-linked Vercel Preview exists
→ user explicitly requests visual verification
→ direct controlled browser unavailable
→ this skill
→ evidence inspection and report
→ same feature branch fixes when needed
→ separate explicit user GO before preview transfer
```

## Preconditions

Resolve these values before creating CI branches:

```text
repository: owner/repository
feature_branch: canonical feature branch
source_sha: exact product commit represented by the deployment
target_url: clean Vercel Preview URL
scenario_slug: short kebab-case scenario name
scenario: deterministic user behavior to verify
```

Stop and report a blocker when:

- no branch-linked Vercel Preview URL exists;
- the target deployment does not correspond to the feature branch being tested;
- the user has not approved visual execution;
- the exact source commit cannot be identified;
- repository write or Actions access required by this route is unavailable.

Do not ask the user to repeat the skill name. Ask only for missing operational data such as a protected deployment access mechanism when it is actually needed.

## Hard boundaries

1. Do not modify the canonical feature branch for CI harness files.
2. Do not modify `real-wargame-preview` or `main`.
3. Use temporary `ci/**` branches only.
4. Do not merge the temporary PR.
5. Test real behavior, not only DOM presence.
6. Save evidence after every important stage.
7. Classify failures before editing anything.
8. Do not reuse evidence after the product SHA changes.
9. Download and inspect artifacts; a green workflow alone is insufficient.
10. Show the user key screenshots, not only a ZIP link.
11. Visual success does not grant permission to transfer into `real-wargame-preview`.

## Direct-browser decision gate

Before using temporary CI infrastructure, determine whether the current Web Chat can directly control a real Chrome/Chromium browser against `target_url`.

```text
direct controlled browser available
→ use real-wargame-local-preview direct-browser path

direct controlled browser unavailable
→ use this skill
```

Do not use this skill merely because GitHub Actions exists. Use it because the requested deployed visual verification cannot be performed through a directly controlled browser in the current environment.

## Vercel Deployment Protection

Try the normal clean URL first.

If protection blocks the browser, use this order:

1. GitHub Actions secret `VERCEL_AUTOMATION_BYPASS_SECRET` with request header:

```text
x-vercel-protection-bypass: <secret>
x-vercel-set-bypass-cookie: true
```

2. If only a Vercel share URL is available, store the complete protected URL in a GitHub Actions secret such as `VERCEL_SHARE_URL` and read it only at runtime.

Never:

- commit a `_vercel_share` token to any branch;
- place a share token in workflow YAML;
- place it in a PR body, commit message, issue, log or final report;
- echo a protected URL containing a token;
- assume temporary branches are safe for secrets.

When protection cannot be automated without exposing a secret, stop and report `environment: deployment protection access unavailable`.

## Temporary CI architecture

Create two branches from the same exact `source_sha`:

```text
ci/<scenario>-base-<utc-timestamp>-<short-sha>
ci/<scenario>-head-<utc-timestamp>-<short-sha>
```

Example:

```text
ci/cover-overlay-base-20260719t183000z-a1b2c3d
ci/cover-overlay-head-20260719t183000z-a1b2c3d
```

### Base branch

Add only:

```text
.github/workflows/<scenario>.yml
```

The workflow triggers only for a PR targeting that exact temporary base branch.

### Head branch

Add only:

```text
ci/<scenario>.spec.ts
ci/playwright.<scenario>.config.ts
```

Add supporting CI-only files only when the scenario cannot be expressed without them. Never move product fixes into this branch.

### Temporary PR

Create:

```text
head: ci/<scenario>-head-...
base: ci/<scenario>-base-...
```

The PR body must include:

```text
Temporary CI-only PR.
Do not merge.
Product source SHA: <source_sha>
Canonical feature branch: <feature_branch>
Product branches must not be modified by this PR.
```

The PR exists only to make GitHub Actions execute the workflow that lives on the temporary base branch while testing the scenario files from the temporary head branch.

## Workflow contract

Use read-only permissions and a bounded timeout.

```yaml
name: External Vercel Deployment E2E

on:
  pull_request:
    branches:
      - ci/<scenario>-base-<timestamp>-<short-sha>

permissions:
  contents: read

jobs:
  browser-e2e:
    runs-on: ubuntu-latest
    timeout-minutes: 20

    env:
      TARGET_URL: ${{ secrets.VERCEL_SHARE_URL || vars.VERCEL_TARGET_URL }}
      VERCEL_AUTOMATION_BYPASS_SECRET: ${{ secrets.VERCEL_AUTOMATION_BYPASS_SECRET }}
      EXPECTED_PRODUCT_SHA: <source_sha>
      CANONICAL_FEATURE_BRANCH: <feature_branch>

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install Playwright
        run: npm install --no-save --package-lock=false @playwright/test@1.55.0

      - name: Install Chromium
        run: npx playwright install --with-deps chromium

      - name: Run deployed application scenario
        run: npx playwright test --config=ci/playwright.<scenario>.config.ts

      - name: Upload browser evidence
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: vercel-e2e-evidence-${{ github.run_id }}
          path: |
            artifacts/vercel-e2e/**
            test-results/**
            playwright-report/**
          if-no-files-found: warn
          retention-days: 14
```

If the GitHub expression for selecting a secret/variable is not accepted by workflow syntax, resolve the value in a shell step without printing it. Do not weaken secret handling to make the example easier.

The workflow must not:

- run on normal feature pushes;
- run on PRs to product branches;
- write commits or statuses back into the canonical feature branch;
- deploy the application;
- use `--prod`;
- expose protected URLs in logs.

## Playwright config

Use a separate config with one worker and deterministic desktop dimensions:

```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: '<scenario>.spec.ts',
  timeout: 150_000,
  expect: { timeout: 15_000 },
  workers: 1,
  reporter: [
    ['line'],
    ['html', { outputFolder: '../playwright-report', open: 'never' }],
  ],
  outputDir: '../test-results/vercel-e2e',

  use: {
    ...devices['Desktop Chrome'],
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    trace: 'on',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    launchOptions: {
      args: ['--use-gl=swiftshader', '--ignore-gpu-blocklist'],
    },
  },

  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
```

SwiftShader is required for the PixiJS/WebGL canvas on hosted runners unless current evidence proves another configuration is stable.

## Test the real deployment

Navigate only to `TARGET_URL`.

Initial acceptance requires all of:

- navigation response status below 400 when a response is available;
- real application canvas visible;
- main application panel or stable application marker visible;
- expected runtime UI loaded;
- no deployment-protection page remaining.

HTTP 200 alone is not success.

When a bypass secret is available, set headers before navigation:

```ts
await page.setExtraHTTPHeaders({
  'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET ?? '',
  'x-vercel-set-bypass-cookie': 'true',
});
```

Do not send an empty bypass header when the secret is absent; conditionally construct the header map.

## Exact deployed-product identity

Record `EXPECTED_PRODUCT_SHA` in `evidence.json`.

Read the application's existing build identity or debug surface when available and compare it with `EXPECTED_PRODUCT_SHA`.

```text
expectedProductSha
observedProductSha
productShaMatch
```

When the deployed app exposes no trustworthy build identity, use:

```text
observedProductSha: unavailable
productShaMatch: unproven
```

Do not describe the run as exact-SHA visual acceptance when deployment identity is unproven. The run may still provide useful behavioral evidence, but the limitation must be explicit.

## Deterministic state-changing scenario

Prefer creating a controlled object through the editor instead of depending on old map state or stale coordinates.

Typical flow:

1. load deployment;
2. open editor;
3. create a soldier;
4. capture soldier identifier;
5. return to simulation;
6. select the created soldier;
7. read initial position;
8. issue a movement order;
9. verify the order changed;
10. continue simulation;
11. verify actual position changed;
12. inspect task-specific visual modes;
13. verify important state persists after idle time.

An order label alone does not prove movement.

```ts
const initialPosition = await position.textContent();
const initialOrder = await order.textContent();

await page.mouse.click(target.x, target.y, { button: 'right' });

await expect.poll(async () => order.textContent(), {
  timeout: 10_000,
}).not.toBe(initialOrder);

await continueButton.click();

await expect.poll(async () => position.textContent(), {
  timeout: 15_000,
}).not.toBe(initialPosition);
```

## Canvas coordinate discipline

Never rely on old absolute screen coordinates without validating current canvas geometry.

Prefer an existing read-only application test hook that converts world coordinates to screen coordinates. Otherwise derive coordinates from current canvas bounds and current board/camera data.

```ts
async function worldPoint(
  canvas: Locator,
  gridX: number,
  gridY: number,
): Promise<{ x: number; y: number }> {
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas bounds unavailable.');

  return {
    x: box.x + BOARD_ORIGIN.x + gridX * CELL_SIZE,
    y: box.y + BOARD_ORIGIN.y + gridY * CELL_SIZE,
  };
}
```

Recalculate after layout, panel, viewport, zoom, map-origin or cell-size changes.

## Visual modes and persistence

For every task-relevant mode such as `danger`, `cover` or `combined`:

1. click the control;
2. verify active UI state;
3. verify internal read-only renderer diagnostics when available;
4. save a successful milestone screenshot;
5. wait a bounded idle interval;
6. verify the mode remains active and visible.

```ts
for (const mode of ['danger', 'cover', 'combined'] as const) {
  await sidebar.locator(`[data-overlay-mode="${mode}"]`).click();

  await expect.poll(async () => {
    const diagnostics = await readAwareness(page);
    return { mode: diagnostics?.mode, visible: diagnostics?.visible };
  }).toEqual({ mode, visible: true });

  await page.screenshot({
    path: `artifacts/vercel-e2e/overlay-${mode}.png`,
  });
}
```

A debug API may support assertions but must not replace visible screenshot inspection. Report when verification depends on debug instrumentation.

## Evidence JSON

Create `artifacts/vercel-e2e/evidence.json` at the beginning and update it after every stage, including failures.

Recommended stages:

```text
started
deployment-loaded
product-identity-read
soldier-created
simulation-opened
soldier-selected
order-issued
soldier-moved
danger-verified
cover-verified
combined-verified
persistence-verified
completed
```

Recommended structure:

```json
{
  "targetUrl": "<clean URL without secret query>",
  "canonicalFeatureBranch": "feature/...",
  "expectedProductSha": "<sha>",
  "observedProductSha": "<sha or unavailable>",
  "productShaMatch": true,
  "stage": "completed",
  "selectionMethod": "editor-created",
  "unitId": "editor_unit_1",
  "initialPosition": "95.7, 43.9",
  "orderAfterCommand": "92.8, 51.9 · planned",
  "movedPosition": "92.8, 51.9",
  "overlay": {
    "danger": { "visible": true, "mode": "danger" },
    "cover": { "visible": true, "mode": "cover" },
    "combined": { "visible": true, "mode": "combined" }
  },
  "consoleErrors": [],
  "pageErrors": [],
  "requestFailures": [],
  "ignoredServiceFailures": []
}
```

Write the current evidence in `finally` so a failed test still shows the last completed stage.

## Error collection

Always record:

```ts
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});

page.on('pageerror', (error) => {
  pageErrors.push(error.message);
});

page.on('requestfailed', (request) => {
  requestFailures.push(
    `${request.method()} ${request.url()} :: ${request.failure()?.errorText ?? 'unknown'}`,
  );
});
```

Separate:

- uncaught JavaScript errors;
- `console.error` messages;
- application network failures;
- known Vercel service/telemetry failures;
- Playwright scenario errors.

Do not classify an interrupted Vercel service request as an application defect when the application loads and the user scenario succeeds. Record the ignored request and the reason.

## Artifact contract

Minimum evidence:

```text
artifacts/vercel-e2e/
  evidence.json
  01-deployment-loaded.png
  02-soldier-created.png
  03-soldier-selected.png
  04-order-issued.png
  05-soldier-moved.png
  06-overlay-danger.png
  07-overlay-cover.png
  08-overlay-combined.png
  09-combined-after-idle.png

test-results/
  trace.zip
  video.webm
  test-failed-1.png
  error-context.md

playwright-report/
```

Successful milestone screenshots are always captured, not only on failure.

## Failure classification and ownership

After every failed run, classify exactly one primary category:

### `environment`

Examples:

- Playwright installation failed;
- Chromium did not start;
- Vercel URL unavailable;
- protection bypass invalid;
- GitHub Actions infrastructure failure.

Fix only CI/environment configuration. Do not edit product code.

### `test-harness`

Examples:

- strict-mode multiple match;
- stale selector;
- incorrect canvas coordinate conversion;
- insufficient timeout with evidence that the app is progressing;
- assertion does not represent intended behavior.

Fix only the temporary CI head branch and rerun the same temporary PR. Preserve previous run evidence and report the new run ID and head SHA.

### `application`

Examples:

- control does not respond;
- soldier cannot be created or selected;
- order does not appear;
- coordinates do not change after simulation resumes;
- renderer mode does not activate;
- layer disappears after idle;
- uncaught application error.

Do not fix application code on CI branches.

Return to the canonical feature branch, add/update focused regression coverage, fix the application, run focused non-browser checks, commit and push. Wait for the branch-linked Vercel Preview to update.

A new product commit invalidates the old temporary CI pair for acceptance. Close the old temporary PR and create a new base/head pair from the new exact product SHA. Never reuse old artifacts as evidence for the new commit.

## Workflow result analysis

After completion:

1. read workflow conclusion;
2. fetch jobs and step outcomes;
3. fetch full failed-job log when needed;
4. list and download artifacts;
5. verify run/head identity;
6. extract artifact;
7. read `evidence.json`;
8. open all changed/key screenshots;
9. inspect trace when needed to classify the failure;
10. record final run and artifact identity.

Required final identity:

```text
final_run_id
final_workflow_head_sha
expected_product_sha
observed_product_sha
workflow_conclusion
artifact_id
artifact_digest: value / unavailable
```

## User-visible screenshots

Never stop at “screenshots are in the ZIP”.

After downloading the artifact:

1. extract it;
2. verify filenames and image content;
3. open key PNGs;
4. create a contact sheet when there are many useful frames;
5. provide direct links to the contact sheet and key full-size images;
6. provide the complete artifact and workflow run link;
7. caption what each image proves.

Recommended set:

- deployment loaded;
- controlled soldier created/selected;
- soldier after actual movement;
- `danger` mode;
- `cover` mode;
- `combined` mode;
- `combined` after idle.

The contact sheet supplements rather than replaces the original PNGs.

## Cleanup

After the final run is analysed and user-visible evidence is available:

1. close the temporary PR without merge;
2. delete temporary CI branches when the available GitHub tooling supports deletion;
3. otherwise report the exact remaining branch names and cleanup limitation;
4. do not transfer the temporary workflow or tests into product branches without separate user instruction;
5. preserve the canonical feature branch for product fixes or explicit transfer;
6. do not delete local extracted evidence before links have been provided.

## Final report

```text
visual_route: vercel-deployment-playwright-e2e
feature_branch:
source_sha:
target_url: clean URL without secrets
scenario:
temporary_base_branch:
temporary_head_branch:
temporary_pr:
final_run_id:
final_workflow_head_sha:
workflow_conclusion:
artifact_id:
artifact_digest:
expected_product_sha:
observed_product_sha:
product_sha_match: yes / no / unproven
failure_class: none / environment / test-harness / application
application_result:
  application_load: passed / failed
  soldier_creation: passed / failed / not applicable
  soldier_selection: passed / failed / not applicable
  order_issue: passed / failed / not applicable
  actual_movement: passed / failed / not applicable
  danger: passed / failed / not applicable
  cover: passed / failed / not applicable
  combined: passed / failed / not applicable
  persistence: passed / failed / not applicable
console_errors:
page_errors:
request_failures:
ignored_service_failures:
evidence_json_inspected: yes / no
screenshots_inspected: yes / no
trace_inspected: yes / no / not needed
contact_sheet:
key_screenshot_links:
artifact_link:
workflow_run_link:
temporary_pr_closed_without_merge: yes / no
ci_branch_cleanup: deleted / pending with exact names
feature_branch_modified_by_ci_harness: no
preview_touched: no
main_touched: no
preview_transfer_approval: not granted by visual QA
limitations:
```

Keep human live-test status separate. Never describe GitHub Actions verification as a test on the user's PC.

## Success criteria

The skill is complete only when:

- the real external Vercel URL opened in Chromium;
- a real user scenario changed application state;
- `evidence.json` was saved;
- successful milestone screenshots were saved;
- trace was saved;
- workflow result and identity were checked;
- artifact was downloaded and inspected;
- key screenshots were shown conveniently to the user;
- temporary PR was closed without merge;
- product branches were not modified by CI harness files;
- remaining cleanup or evidence limitations were reported honestly.