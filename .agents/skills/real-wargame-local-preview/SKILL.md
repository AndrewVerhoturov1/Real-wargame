---
name: real-wargame-local-preview
description: "Use when a Real-Wargame task requires a real local or CI browser launch, screenshots, visual QA, preview artifacts, Playwright diagnosis, or terminal-free launch instructions."
license: MIT
---

# Real-Wargame local preview and screenshot workflow

## Overview

Use this skill before launching Real-Wargame, showing screenshots, checking a visible game/editor screen, diagnosing Playwright visual tests, or preparing a terminal-free launch for the user.

The project is **Vite + TypeScript + PixiJS**, not Godot.

**Core principle:** a visual check is complete only after the real application ran in a real browser and the resulting PNG files were downloaded and inspected.

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

A valid preview requires:

```text
real repository checkout/ref;
npm install or npm ci;
real Vite application served;
real Chrome/Chromium browser opened by Playwright or on the user's PC;
real route opened, for example / or /ai-node-editor.html;
PNG screenshots captured by that browser;
PNG artifact downloaded or otherwise made available;
changed/key PNGs opened and inspected.
```

## Core rules

1. Work in `real-wargame-preview` first. Never change `main` without explicit user approval.
2. Say whether the run happened on the user's PC, in a local checkout, or through GitHub Actions.
3. A GitHub Actions browser run is not a local PC check.
4. Do not make the user type terminal commands when a `.bat`, artifact, or agent-run command can do the job.
5. Never claim screenshots were captured until the PNG artifact exists and has been downloaded or inspected.
6. Never claim a visual issue is fixed until a fresh real-browser screenshot run completed after the fix.
7. If screenshots are not requested and the change is not visual, prefer smoke/build checks instead of creating extra visual-QA work.
8. If GitHub Actions is used only as a temporary visual harness, close temporary PRs/branches and delete trigger files after the needed artifact is captured.
9. Before accepting an artifact, verify that its `head_sha` belongs to the exact commit being reported.
10. Evidence before claims: read the run result, the Playwright log, and the actual PNGs.

## Read first

For local or visual preview tasks, read only the minimum required context:

```text
AGENTS.md
README.md
package.json
index.html
src/main.ts
.github/workflows/preview-screenshots.yml
playwright.config.ts
tests/preview-screenshots.spec.ts
docs/manual-test/PREVIEW_SCREENSHOTS.md
```

For tactical-board coordinate tests, also read the current scene data used by the same branch, especially:

```text
src/data/units/test_units.json
src/data/pressure_zones/test_pressure_zones.json
```

For AI Node Editor visual tasks, also read:

```text
ai-node-editor.html
src/ai-node-editor/main.ts
src/ai-node-editor/ai-node-editor.css
src/ai-node-editor/ai-node-editor-authoring.css
src/ai-node-editor/ai-node-editor-visual-fix.css
src/ai-node-editor/human-node-ui.ts
src/ai-node-editor/human-node-ui.css
scripts/local_ai_engine.mjs
scripts/ai_engine_core.mjs
Run-AI-Node-Editor.bat
docs/manual-test/AI_NODE_EDITOR_STAGE_4.md
```

For rendering issues, read the specific renderer involved, for example:

```text
src/rendering/PixiMapRenderer.ts
src/rendering/PixiUnitRenderer.ts
src/rendering/PixiOrderRenderer.ts
src/rendering/PixiOverlayRenderer.ts
src/rendering/PixiAwarenessHeatmapRenderer.ts
src/rendering/terrainStyle.ts
```

## Launch paths

### Path A — primary terminal-free launch on the user's PC

The preferred launcher is:

```text
Run-Real-Wargame-Lab.bat
```

It is the main entry point when the user wants one convenient launch for the game, AI Node Editor, local AI engine, and lab manager.

Use these as focused fallback launchers for isolated diagnosis:

```text
Run-Real-Wargame.bat
Run-AI-Node-Editor.bat
```

A user-facing launcher should:

1. run from the repository root;
2. check `node` and `npm`;
3. run `npm install` if `node_modules` is missing;
4. start the required services;
5. wait for health endpoints instead of opening the browser immediately;
6. open the real route in the browser;
7. avoid requiring Git or terminal commands from the user;
8. explain failures in plain language.

If the user's local preview folder may be stale, update/sync it from `origin/real-wargame-preview` through the repository's preview workflow. A GitHub push does not update the user's PC automatically.

### Path B — remote real-browser check through GitHub Actions

Use this when the user asks to show screenshots in chat, try the result, verify it visually, or when a CI browser check is sufficient.

Current workflow and test:

```text
.github/workflows/preview-screenshots.yml
tests/preview-screenshots.spec.ts
```

Expected artifacts include:

```text
real-wargame-preview-screenshots
real-wargame-preview-playwright-log
```

The workflow must:

1. check out the exact ref;
2. run `npm ci`;
3. serve the real Vite app;
4. open it with Playwright in a real browser;
5. capture PNGs into `artifacts/screenshots/`;
6. upload screenshots even when a later test fails;
7. upload a separate Playwright log on both success and failure;
8. publish a status linked to the workflow run.

#### Browser choice in GitHub Actions

Prefer the system-installed Google Chrome:

```text
Playwright project channel: chrome
```

Do not install Chromium on every run unless system Chrome is unavailable. `npx playwright install --with-deps chromium` is a fallback, not the default path.

#### Triggering the workflow

Preferred triggers:

1. a real push to `real-wargame-preview` after a relevant change;
2. a PR whose base is `real-wargame-preview` when direct push is unavailable.

If only a smoke trigger is required:

1. create a temporary branch from `real-wargame-preview`;
2. verify that branch exists before writing files;
3. write any trigger file only to the temporary branch;
4. open a clearly marked do-not-merge PR into `real-wargame-preview`;
5. wait for the real screenshot workflow;
6. download and inspect artifacts;
7. close the PR without merging;
8. delete the temporary branch/trigger file.

Never leave an obsolete smoke PR open without explanation.

## Reading a GitHub Actions result

Use the available GitHub tools in this order:

```text
get_commit_combined_status or fetch_commit_workflow_runs
fetch_workflow_run_jobs
fetch_workflow_job_steps
fetch_workflow_job_logs
fetch_workflow_run_artifacts
download_workflow_artifact
```

If the workflow is queued or in progress, keep checking until it completes or fails. A queued run is not evidence.

### Required SHA verification

Before reporting visual success, compare:

```text
current preview branch commit SHA;
workflow head_sha;
screenshot artifact workflow_run.head_sha;
Playwright log artifact workflow_run.head_sha.
```

They must identify the same tested version. Never use an older green artifact for a newer UI commit.

If direct-push workflow runs are not returned by one connector action, use commit statuses and the linked run URL. Do not infer success from an empty result.

## Failure diagnosis order

When screenshot capture fails, do not immediately patch the application.

Follow this order:

1. inspect job and step outcomes;
2. download the separate Playwright log artifact;
3. download the screenshot artifact even if only partial PNGs were produced;
4. inspect the last successfully created PNG;
5. identify the exact failing selector/action/timeout;
6. decide whether the cause is application behavior, test coordinates, Playwright behavior, or workflow infrastructure;
7. change the smallest correct layer;
8. rerun the full relevant scenario;
9. inspect fresh PNGs again.

Do not fix by guesswork when logs or partial screenshots can identify the actual cause.

## Playwright test design

### Split long visual coverage into independent scenarios

Keep major surfaces in separate tests, for example:

```text
scenario 1 — tactical board;
scenario 2 — AI Node Editor;
scenario 3 — integrated AI lab and awareness maps.
```

This preserves useful screenshots when one later scenario fails.

### Timeouts

A long scenario that starts Vite, renders PixiJS, interacts with the UI, and saves several PNGs may need up to 90 seconds.

Increase timeout only after logs prove that the scenario is making progress. Never increase a timeout to hide a frozen application or detached control.

### Stable waits

Prefer assertions on observable UI state over arbitrary sleeps:

```ts
await expect(page.locator('.ai-lab-dock')).toBeVisible();
await expect(page.locator('.palette-panel')).toBeVisible();
```

Short waits are acceptable only for deliberate animation/render settling before a screenshot.

## Coordinate discipline

Do not rely on old hard-coded screen offsets after layout changes.

Prefer calculating screen coordinates from the real current layout:

```ts
const canvasBox = await page.locator('canvas').boundingBox();
if (!canvasBox) throw new Error('Canvas bounds unavailable');
const point = {
  x: canvasBox.x + gridX * cellSize,
  y: canvasBox.y + gridY * cellSize,
};
```

Use current scene data for world positions. Recalculate after:

```text
opening or closing the AI lab;
adding a top toolbar;
opening a dock/sidebar;
changing viewport size;
changing zoom or cell size;
moving the unit or threat in fixture data.
```

After a drag, verify both:

```text
visible geometry changed on the map;
corresponding numeric fields changed in the property panel.
```

## Stable DOM controls

A visible Playwright locator can still fail if the application destroys and recreates the element during the click.

Symptoms:

```text
locator is visible but click times out;
element becomes detached during action;
button repeatedly disappears/reappears;
fixed dock controls cannot be scrolled into a stable position.
```

Diagnosis and fix:

1. check whether a timer or live-state update calls `replaceChildren`, `innerHTML`, or a full rerender;
2. fix the application so persistent buttons are not recreated for changing stress, morale, suppression, counters, or clocks;
3. update dynamic values inside existing elements;
4. use `force: true` only for a confirmed overlay/input issue;
5. use direct DOM `evaluate(click)` only after proving that the application element is stable and the remaining issue is Playwright's scrolling/actionability behavior.

Do not hide a real unstable-DOM bug with retries or long sleeps.

## Expected visual coverage

The exact list may evolve. The current screenshot suite should cover these groups.

### Tactical board

```text
01-initial.png
02-real-relief-overlay.png
03-selected-unit.png
04-layers-tab-knowledge-overlay.png
05-alt-line-of-sight.png
06-move-order.png
07-editor-mode.png
```

### AI Node Editor

```text
08-ai-editor-clean-canvas.png
09-ai-editor-clean-palette.png
10-numeric-threshold-added.png
11-numeric-threshold-below.png
12-distance-threshold-selectors.png
13-clean-canvas-drag-link.png
14-clean-canvas-auto-check-result.png
```

### Integrated AI lab

```text
15-ai-lab-integrated-layout.png
16-ai-lab-threat-handles.png
17-ai-lab-threat-reshaped.png
18-ai-lab-soldier-state.png
19-ai-lab-awareness-danger.png
20-ai-lab-awareness-safe.png
```

When extending the workflow, prefer generating a small `visual-qa-summary.json` containing:

```text
commit SHA;
workflow run id;
number of passed scenarios;
list of created PNGs;
list of missing PNGs;
build outcome;
capture outcome.
```

If the workflow does not generate this manifest, verify those fields manually before reporting.

## Visual inspection checklist

A green workflow proves the browser test ran. It does not prove the screen is good.

Open the changed/key PNGs and check:

```text
no panel covers important map controls;
no dock or toolbar is clipped;
active tools and tabs are visibly highlighted;
cursor/tool state is understandable where relevant;
selected threat handles are visible and distinguishable;
threat direction, range, width and radius change after dragging;
numeric property fields agree with map geometry;
a fighter can still be selected when threat graphics overlap it;
permanent, initial and current soldier values are visually separated;
danger and safe-map modes are visibly different;
neutral open ground is not painted as equal to strong cover;
forest, terrain folds and physical cover are distinguishable;
labels are readable at 100% scale;
closing the lab removes lab-only controls and restores the normal layout;
no stale UI from localStorage or a previous test remains.
```

If a PNG exposes a real defect, fix the application and rerun the real browser workflow. Do not stop because the workflow itself was green.

## AI Node Editor-specific failure modes

### Stale localStorage

The browser may keep an old graph even after bundled graph data changes.

```text
manual: press Reset in AI Node Editor;
Playwright: clear localStorage before page.goto('/ai-node-editor.html');
bootstrap bundled graph storage before helper UI modules read it when required.
```

Always mention this risk when changing bundled graph data or node types.

### Language-dependent selectors

The editor may show Russian or English labels. Selectors must handle both:

```ts
page.getByRole('button', { name: /\+ Add node|\+ Добавить ноду/ });
page.getByRole('heading', { name: /Soldier AI Node Editor|Редактор ИИ/ });
```

### Palette opening

Do not assume one click always opens a transient palette. Use a helper that:

1. checks whether the palette is already visible;
2. clicks the add-node button;
3. verifies visibility;
4. retries only a small bounded number of times;
5. fails with an assertion if it still does not open.

### Range sliders and hover

Hover a stable wrapper instead of the browser thumb of `<input type="range">`.

For value changes, set the value and dispatch an input event:

```ts
await page.locator('.human-threshold-slider').evaluate((element) => {
  const input = element as HTMLInputElement;
  input.value = '45';
  input.dispatchEvent(new Event('input', { bubbles: true }));
});
```

### Helper reads storage too early

If `human-node-ui.ts` reads graph storage before `main.ts` populates it, bootstrap `real-wargame.ai-node-editor.graph.v5` from the bundled graph in `ai-node-editor.html` before loading the helper module. `main.ts` remains the owner of actual editor state.

## Sending screenshots to the chat

After a successful capture:

1. download the screenshot ZIP;
2. extract it;
3. verify count and filenames;
4. open every changed/key frame;
5. show the user the 3–6 most informative frames when possible;
6. provide a link to the complete ZIP;
7. provide the Playwright log when it helped diagnose or verify the run;
8. clearly state whether this was GitHub Actions, a local agent checkout, or the user's PC.

Do not make the user hunt through twenty files just to understand the result.

## Reporting format

Use this structure:

```text
Branch: <branch>
Commit SHA: <tested sha>
Run type: local agent / GitHub Actions / user PC
Run id or PR: <id/link>
Build: passed / failed / not run / continue-on-error failed
Screenshot capture: passed / failed / skipped by request
Playwright scenarios: <passed>/<total>
Screenshot artifact: <name/id>
Log artifact: <name/id>
Artifact SHA matches commit: yes/no
Screenshots inspected: yes/no
Key frames inspected:
- <file>: <what was verified>
- <file>: <what was verified>
Surrogate used: no
Risks / not checked: <plain-language limits>
```

Keep the user-facing explanation simple. Show key PNGs or provide the artifact link unless the user explicitly said screenshots are not needed.
